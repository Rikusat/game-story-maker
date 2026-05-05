import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { buildStoryPrompt, getSystemPrompt, type PageType } from '@/lib/claude/prompts'
import OpenAI from 'openai'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

function getPageType(pageNumber: number): PageType {
  if (pageNumber === 0)  return 'op'
  if (pageNumber === 16) return 'ending'
  if (pageNumber === 15) return 'summary'
  if (pageNumber % 2 === 0 && pageNumber >= 2 && pageNumber <= 14) return 'choice'
  return 'text'
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const { sessionId, pageNumber } = await request.json()

  // セッション取得と前ページ選択肢取得を並列実行
  const [sessionResult, prevChoiceResult] = await Promise.all([
    supabase.from('novel_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('scene_choices')
      .select('winning_choice, choice_a, choice_b')
      .eq('novel_session_id', sessionId)
      .not('winning_choice', 'is', null)
      .lt('page_number', pageNumber)
      .order('page_number', { ascending: false })
      .limit(1),
  ])

  const session = sessionResult.data
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const prev = prevChoiceResult.data?.[0] ?? null
  const previousChoiceText = prev
    ? (prev.winning_choice === 'A' ? prev.choice_a : prev.choice_b) ?? ''
    : ''

  const pageType = getPageType(pageNumber)
  const prompt = buildStoryPrompt({
    previousText: session.full_text,
    pageNumber,
    pageType,
    previousChoiceText,
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        const completion = await openai.chat.completions.create({
          model,
          max_tokens: 900,
          temperature: 0.85,
          messages: [
            { role: 'system', content: getSystemPrompt() },
            { role: 'user', content: prompt },
          ],
          stream: true,
        })

        let fullText = ''
        let visibleDone = false

        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (!text) continue
          fullText += text
          if (!visibleDone) {
            send({ type: 'chunk', text })
            if (fullText.includes('===')) visibleDone = true
          }
        }

        const delimIdx = fullText.indexOf('===')
        const storyText = delimIdx !== -1
          ? fullText.substring(0, delimIdx).trim()
          : fullText.trim()

        const newFullText = (session.full_text ? session.full_text + '\n\n' : '') + storyText
        const deadline = new Date(Date.now() + 60_000).toISOString()

        if (pageType === 'ending') {
          await Promise.all([
            supabase.from('scene_choices').insert({
              novel_session_id: sessionId,
              scene_number:     pageNumber,
              page_number:      pageNumber,
              story_segment:    storyText,
              choice_a:         null,
              choice_b:         null,
              vote_deadline:    deadline,
            }),
            supabase.from('novel_sessions')
              .update({ full_text: newFullText, status: 'completed' })
              .eq('id', sessionId),
            supabase.from('rooms').update({ status: 'finished' }).eq('id', session.room_id),
          ])
          send({ type: 'done', completed: true })

        } else if (pageType === 'choice') {
          let parsedChoices = { choice_a: '前に進む', choice_b: '立ち止まって考える' }
          const choicesIdx = fullText.indexOf('===CHOICES===')
          if (choicesIdx !== -1) {
            const jsonStr = fullText.substring(choicesIdx + 13).replace(/===END===/g, '').trim()
            try { parsedChoices = JSON.parse(jsonStr) } catch { /* フォールバック使用 */ }
          }

          const [sceneResult] = await Promise.all([
            supabase.from('scene_choices').insert({
              novel_session_id: sessionId,
              scene_number:     pageNumber,
              page_number:      pageNumber,
              story_segment:    storyText,
              choice_a:         parsedChoices.choice_a,
              choice_b:         parsedChoices.choice_b,
              vote_deadline:    deadline,
            }).select().single(),
            supabase.from('novel_sessions')
              .update({ full_text: newFullText, status: 'choice' })
              .eq('id', sessionId),
          ])

          send({
            type:          'done',
            choices:       { a: parsedChoices.choice_a, b: parsedChoices.choice_b },
            sceneChoiceId: sceneResult.data?.id,
            deadline,
          })

        } else {
          // OP / TEXT / SUMMARY
          const { data: allPlayers } = await supabase
            .from('room_players')
            .select('id, user_id, is_bot')
            .eq('room_id', session.room_id)
            .eq('is_active', true)

          const botUpdates = (allPlayers ?? [])
            .filter((p: any) => p.is_bot)
            .map((p: any) =>
              supabase.from('room_players').update({ ready_page: pageNumber }).eq('id', p.id)
            )

          await Promise.all([
            supabase.from('scene_choices').insert({
              novel_session_id: sessionId,
              scene_number:     pageNumber,
              page_number:      pageNumber,
              story_segment:    storyText,
              choice_a:         null,
              choice_b:         null,
              vote_deadline:    deadline,
            }),
            supabase.from('novel_sessions')
              .update({ full_text: newFullText, status: 'reading' })
              .eq('id', sessionId),
            ...botUpdates,
          ])

          send({ type: 'done', deadline })
        }
      } catch (err: any) {
        const msg = String(err)
        if (msg.includes('429')) {
          send({ type: 'error', error: 'APIのクレジットが不足しています。' })
        } else {
          send({ type: 'error', error: msg })
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
