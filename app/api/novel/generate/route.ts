import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { streamNovel } from '@/lib/novel/stream'
import { buildStoryPrompt, getSystemPrompt, type PageType } from '@/lib/claude/prompts'

export const maxDuration = 60

function getPageType(pageNumber: number): PageType {
  if (pageNumber === 0)  return 'op'
  if (pageNumber === 16) return 'ending'
  if (pageNumber === 15) return 'summary'
  if (pageNumber % 2 === 0 && pageNumber >= 2 && pageNumber <= 14) return 'choice'
  return 'text'
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const { sessionId, pageNumber, previousChoiceText } = await request.json()

  const { data: session } = await supabase
    .from('novel_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const pageType = getPageType(pageNumber)

  const prompt = buildStoryPrompt({
    previousText: session.full_text,
    pageNumber,
    pageType,
    previousChoiceText,
  })

  let fullText = ''
  try {
    fullText = await streamNovel({
      system: getSystemPrompt(),
      user: prompt,
      maxTokens: 900,
      onChunk: () => {},
    })
  } catch (err: any) {
    const msg = String(err)
    if (msg.includes('429')) {
      return NextResponse.json(
        { error: 'APIのクレジットが不足しています。' },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // ストーリー本文を分離（=== より前）
  const delimIdx = fullText.indexOf('===')
  const storyText = delimIdx !== -1
    ? fullText.substring(0, delimIdx).trim()
    : fullText.trim()

  const newFullText = (session.full_text ? session.full_text + '\n\n' : '') + storyText
  const deadline    = new Date(Date.now() + 60_000).toISOString()

  // ── ED（ページ16）─────────────────────────────────────
  if (pageType === 'ending') {
    await supabase.from('scene_choices').insert({
      novel_session_id: sessionId,
      scene_number:     pageNumber,
      page_number:      pageNumber,
      story_segment:    storyText,
      choice_a:         null,
      choice_b:         null,
      vote_deadline:    deadline,
    })

    await supabase
      .from('novel_sessions')
      .update({ full_text: newFullText, status: 'completed' })
      .eq('id', sessionId)

    await supabase.from('rooms').update({ status: 'finished' }).eq('id', session.room_id)

    return NextResponse.json({ text: storyText, completed: true })
  }

  // ── CHOICEページ ──────────────────────────────────────
  if (pageType === 'choice') {
    let parsedChoices = { choice_a: '前に進む', choice_b: '立ち止まって考える' }
    const choicesIdx = fullText.indexOf('===CHOICES===')
    if (choicesIdx !== -1) {
      const jsonStr = fullText.substring(choicesIdx + 13).replace(/===END===/g, '').trim()
      try {
        parsedChoices = JSON.parse(jsonStr)
      } catch { /* フォールバック使用 */ }
    }

    const { data: sceneChoice } = await supabase
      .from('scene_choices')
      .insert({
        novel_session_id: sessionId,
        scene_number:     pageNumber,
        page_number:      pageNumber,
        story_segment:    storyText,
        choice_a:         parsedChoices.choice_a,
        choice_b:         parsedChoices.choice_b,
        vote_deadline:    deadline,
      })
      .select()
      .single()

    await supabase
      .from('novel_sessions')
      .update({ full_text: newFullText, status: 'choice' })
      .eq('id', sessionId)

    return NextResponse.json({
      text:          storyText,
      choices:       { a: parsedChoices.choice_a, b: parsedChoices.choice_b },
      sceneChoiceId: sceneChoice?.id,
      deadline,
    })
  }

  // ── OP / TEXT / SUMMARY ──────────────────────────────
  await supabase.from('scene_choices').insert({
    novel_session_id: sessionId,
    scene_number:     pageNumber,
    page_number:      pageNumber,
    story_segment:    storyText,
    choice_a:         null,
    choice_b:         null,
    vote_deadline:    deadline,
  })

  // ボットを自動 ready（ready_page = pageNumber）
  const { data: allPlayers } = await supabase
    .from('room_players')
    .select('id, user_id, is_bot')
    .eq('room_id', session.room_id)
    .eq('is_active', true)

  for (const p of allPlayers ?? []) {
    if (p.is_bot) {
      await supabase
        .from('room_players')
        .update({ ready_page: pageNumber })
        .eq('id', p.id)
    }
  }

  await supabase
    .from('novel_sessions')
    .update({ full_text: newFullText, status: 'reading' })
    .eq('id', sessionId)

  return NextResponse.json({ text: storyText, deadline })
}
