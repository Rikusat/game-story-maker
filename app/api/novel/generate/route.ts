import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { streamNovel } from '@/lib/novel/stream'
import { buildStoryPrompt } from '@/lib/claude/prompts'
import { MBTI_SCENES } from '@/types'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const { sessionId, sceneNumber, previousChoiceText } = await request.json()

  const { data: session } = await supabase
    .from('novel_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const isLastScene = sceneNumber >= 3
  const prompt = buildStoryPrompt({
    previousText: session.full_text,
    sceneNumber,
    isLastScene,
    previousChoiceText,
  })

  let fullText = ''
  try {
    fullText = await streamNovel({
      system:
        'あなたは日本語のインタラクティブノベルゲームのシナリオライターです。指示に従い、指定フォーマットで出力してください。',
      user: prompt,
      maxTokens: 700,
      onChunk: () => {},
    })
  } catch (err: any) {
    const msg = String(err)
    if (msg.includes('429')) {
      return NextResponse.json(
        { error: 'OpenAI APIのクレジットが不足しています。https://platform.openai.com/billing でチャージしてください。' },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // ストーリー本文と選択肢を分離
  const delimIdx = fullText.indexOf('===')
  const storyText = delimIdx !== -1
    ? fullText.substring(0, delimIdx).trim()
    : fullText.trim()

  const newFullText = (session.full_text ? session.full_text + '\n\n' : '') + storyText

  if (isLastScene) {
    await supabase
      .from('novel_sessions')
      .update({ full_text: newFullText, status: 'completed' })
      .eq('id', sessionId)
    await supabase.from('rooms').update({ status: 'finished' }).eq('id', session.room_id)
    return NextResponse.json({ text: storyText, completed: true })
  }

  // 選択肢パース
  let parsedChoices = { choice_a: '前に進む', choice_b: '立ち止まって考える' }
  const choicesIdx = fullText.indexOf('===CHOICES===')
  if (choicesIdx !== -1) {
    const jsonStr = fullText.substring(choicesIdx + 13).replace(/===END===/g, '').trim()
    try {
      parsedChoices = JSON.parse(jsonStr)
    } catch { /* フォールバック使用 */ }
  }

  const sceneConfig = MBTI_SCENES[sceneNumber]

  const { data: sceneChoice } = await supabase
    .from('scene_choices')
    .insert({
      novel_session_id: sessionId,
      scene_number: sceneNumber,
      story_segment: storyText,
      choice_a: parsedChoices.choice_a,
      choice_b: parsedChoices.choice_b,
      mbti_dimension: sceneConfig.dimension,
      choice_a_type: sceneConfig.typeA,
      choice_b_type: sceneConfig.typeB,
      vote_deadline: new Date(Date.now() + 60_000).toISOString(),
    })
    .select()
    .single()

  await supabase
    .from('novel_sessions')
    .update({ full_text: newFullText, status: 'choice' })
    .eq('id', sessionId)

  return NextResponse.json({
    text: storyText,
    choices: { a: parsedChoices.choice_a, b: parsedChoices.choice_b },
    sceneChoiceId: sceneChoice?.id,
  })
}
