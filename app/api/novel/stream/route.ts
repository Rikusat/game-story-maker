import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { streamNovel } from '@/lib/novel/stream'
import { buildStoryPrompt } from '@/lib/claude/prompts'
import { tallyAndAdvance } from '@/lib/game/tally'
import { MBTI_SCENES } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  const { sessionId, sceneNumber, previousChoiceText } = await request.json()

  const { data: session } = await supabase
    .from('novel_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session) return new Response('Session not found', { status: 404 })

  const isLastScene = sceneNumber >= 3
  const prompt = buildStoryPrompt({
    previousText: session.full_text,
    sceneNumber,
    isLastScene,
    previousChoiceText,
  })

  const encoder = new TextEncoder()
  let rawBuffer  = ''
  let storyBuffer = ''
  let choicesStarted = false
  let lastDbUpdate = Date.now()

  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        await streamNovel({
          system: 'あなたは日本語のインタラクティブノベルゲームのシナリオライターです。指示に従い、指定フォーマットで出力してください。',
          user: prompt,
          maxTokens: 700,
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

                // 1秒ごとにDBへ中間保存（他プレイヤーのリアルタイム表示用）
                if (Date.now() - lastDbUpdate > 1000) {
                  lastDbUpdate = Date.now()
                  const accumulated =
                    (session.full_text ? session.full_text + '\n\n' : '') + storyBuffer
                  await supabase
                    .from('novel_sessions')
                    .update({ full_text: accumulated })
                    .eq('id', sessionId)
                }
              }
            }
          },
        })

        const newFullText =
          (session.full_text ? session.full_text + '\n\n' : '') + storyBuffer

        if (isLastScene) {
          await supabase
            .from('novel_sessions')
            .update({ full_text: newFullText, status: 'completed' })
            .eq('id', sessionId)

          await supabase
            .from('rooms')
            .update({ status: 'finished' })
            .eq('id', session.room_id)

          send({ type: 'done', completed: true })
        } else {
          const choicesIdx = rawBuffer.indexOf('===CHOICES===')
          let parsedChoices: { choice_a: string; choice_b: string } | null = null

          if (choicesIdx !== -1) {
            const jsonStr = rawBuffer
              .substring(choicesIdx + 13)
              .replace(/===END===/g, '')
              .trim()
            try {
              parsedChoices = JSON.parse(jsonStr)
            } catch {
              parsedChoices = { choice_a: '前に進む', choice_b: '立ち止まって考える' }
            }
          }

          const sceneConfig = MBTI_SCENES[sceneNumber]
          const deadline = new Date(Date.now() + 30_000).toISOString()

          const { data: sceneChoice } = await supabase
            .from('scene_choices')
            .insert({
              novel_session_id: sessionId,
              scene_number: sceneNumber,
              story_segment: storyBuffer,
              choice_a: parsedChoices?.choice_a ?? '前に進む',
              choice_b: parsedChoices?.choice_b ?? '立ち止まる',
              mbti_dimension: sceneConfig.dimension,
              choice_a_type: sceneConfig.typeA,
              choice_b_type: sceneConfig.typeB,
              vote_deadline: deadline,
            })
            .select()
            .single()

          await supabase
            .from('novel_sessions')
            .update({ full_text: newFullText, status: 'choice' })
            .eq('id', sessionId)

          // ボットが存在する場合は自動投票
          if (sceneChoice) {
            const { data: allPlayers } = await supabase
              .from('room_players')
              .select('*, profiles(*)')
              .eq('room_id', session.room_id)
              .eq('is_active', true)

            const bots = (allPlayers ?? []).filter(
              (p: any) => p.profiles?.username?.startsWith('🤖')
            )

            for (const bot of bots) {
              await supabase.from('votes').insert({
                scene_choice_id: sceneChoice.id,
                room_id: session.room_id,
                user_id: bot.user_id,
                choice: Math.random() < 0.5 ? 'A' : 'B',
              })
            }

            const humanCount = (allPlayers ?? []).length - bots.length
            if (humanCount === 0) {
              await tallyAndAdvance(supabase, sceneChoice.id, session.room_id)
            }
          }

          send({ type: 'done', sceneChoiceId: sceneChoice?.id, deadline })
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
