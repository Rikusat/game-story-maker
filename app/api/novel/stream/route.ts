import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { streamNovel } from '@/lib/novel/stream'
import { buildStoryPrompt, getSystemPrompt, type PageType } from '@/lib/claude/prompts'
import { tallyAndAdvance } from '@/lib/game/tally'

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

  if (!session) return new Response('Session not found', { status: 404 })

  const pageType = getPageType(pageNumber)
  const isEnding = pageType === 'ending'

  const prompt = buildStoryPrompt({
    previousText: session.full_text,
    pageNumber,
    pageType,
    previousChoiceText,
  })

  const encoder    = new TextEncoder()
  let rawBuffer    = ''
  let storyBuffer  = ''
  let choicesStarted = false
  let lastDbUpdate = Date.now()

  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        await streamNovel({
          system: getSystemPrompt(),
          user: prompt,
          maxTokens: 900,
          onChunk: async (text) => {
            rawBuffer += text

            if (!choicesStarted) {
              const delimIdx = rawBuffer.indexOf('===')
              if (delimIdx !== -1) {
                choicesStarted = true
                const newText = rawBuffer.substring(storyBuffer.length, delimIdx)
                if (newText) {
                  storyBuffer += newText
                  send({ type: 'chunk', content: newText })
                }
              } else {
                storyBuffer += text
                send({ type: 'chunk', content: text })

                if (Date.now() - lastDbUpdate > 1000) {
                  lastDbUpdate = Date.now()
                  const accumulated = (session.full_text ? session.full_text + '\n\n' : '') + storyBuffer
                  await supabase
                    .from('novel_sessions')
                    .update({ full_text: accumulated })
                    .eq('id', sessionId)
                }
              }
            }
          },
        })

        const newFullText = (session.full_text ? session.full_text + '\n\n' : '') + storyBuffer
        const deadline    = new Date(Date.now() + 60_000).toISOString()

        if (isEnding) {
          await supabase.from('scene_choices').insert({
            novel_session_id: sessionId, scene_number: pageNumber, page_number: pageNumber,
            story_segment: storyBuffer, choice_a: null, choice_b: null, vote_deadline: deadline,
          })
          await supabase.from('novel_sessions').update({ full_text: newFullText, status: 'completed' }).eq('id', sessionId)
          await supabase.from('rooms').update({ status: 'finished' }).eq('id', session.room_id)
          send({ type: 'done', completed: true })
        } else if (pageType === 'choice') {
          const choicesIdx = rawBuffer.indexOf('===CHOICES===')
          let parsedChoices: { choice_a: string; choice_b: string } | null = null

          if (choicesIdx !== -1) {
            const jsonStr = rawBuffer.substring(choicesIdx + 13).replace(/===END===/g, '').trim()
            try { parsedChoices = JSON.parse(jsonStr) } catch {
              parsedChoices = { choice_a: '前に進む', choice_b: '立ち止まって考える' }
            }
          }

          const { data: sceneChoice } = await supabase.from('scene_choices').insert({
            novel_session_id: sessionId, scene_number: pageNumber, page_number: pageNumber,
            story_segment: storyBuffer,
            choice_a: parsedChoices?.choice_a ?? '前に進む',
            choice_b: parsedChoices?.choice_b ?? '立ち止まる',
            vote_deadline: deadline,
          }).select().single()

          await supabase.from('novel_sessions').update({ full_text: newFullText, status: 'choice' }).eq('id', sessionId)

          if (sceneChoice) {
            const { data: allPlayers } = await supabase
              .from('room_players').select('*, profiles(*)').eq('room_id', session.room_id).eq('is_active', true)
            const bots = (allPlayers ?? []).filter((p: any) => p.profiles?.username?.startsWith('🤖'))
            for (const bot of bots) {
              await supabase.from('votes').insert({
                scene_choice_id: sceneChoice.id, room_id: session.room_id,
                user_id: bot.user_id, choice: Math.random() < 0.5 ? 'A' : 'B',
              })
            }
            const humanCount = (allPlayers ?? []).length - bots.length
            if (humanCount === 0) {
              await tallyAndAdvance(supabase, sceneChoice.id, session.room_id)
            }
          }

          send({ type: 'done', sceneChoiceId: sceneChoice?.id, deadline })
        } else {
          // OP / TEXT / SUMMARY
          await supabase.from('scene_choices').insert({
            novel_session_id: sessionId, scene_number: pageNumber, page_number: pageNumber,
            story_segment: storyBuffer, choice_a: null, choice_b: null, vote_deadline: deadline,
          })
          await supabase.from('novel_sessions').update({ full_text: newFullText, status: 'reading' }).eq('id', sessionId)
          send({ type: 'done', deadline })
        }
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
