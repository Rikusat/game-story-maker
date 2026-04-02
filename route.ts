// ============================================================
// app/api/novel/stream/route.ts  (provider-agnostic 版)
//
// AI プロバイダーは lib/novel/stream.ts で切り替える。
// .env.local の AI_PROVIDER=openai で OpenAI に、
// AI_PROVIDER=anthropic（省略可）で Claude に戻る。
// ============================================================

import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { streamNovel } from '@/lib/novel/stream'
import {
  buildSystemPrompt,
  buildNovelPrompt,
  buildContinuePrompt,
  extractChoicesFromText,
  shouldShowRareChoice,
  generateRareChoice,
} from '@/lib/novel/prompt'
import type { ChoiceLogEntry } from '@/types/novel'

const MAX_TOKENS_PER_SEGMENT = 600
const NOVEL_MAX_STEPS        = 8
const DB_FLUSH_INTERVAL      = 10

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let body: { roomId: string; step: number; choices?: ChoiceLogEntry[]; isFirst?: boolean }
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }) }

  const { roomId, step, choices = [], isFirst = false } = body

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*, category:categories(id, name, parent_id, parent:categories(name))')
    .eq('id', roomId).single()
  if (roomError || !room)
    return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404 })

  const { data: member } = await supabase
    .from('room_members').select('id')
    .eq('room_id', roomId).eq('user_id', user.id).eq('is_active', true).single()
  if (!member)
    return new Response(JSON.stringify({ error: 'Not a member' }), { status: 403 })

  // novel 取得 or 作成
  let novelId: string
  let existingContent = ''
  if (room.novel_id) {
    const { data: novel } = await supabase
      .from('novels').select('id, content').eq('id', room.novel_id).single()
    if (!novel) return new Response(JSON.stringify({ error: 'Novel not found' }), { status: 404 })
    novelId = novel.id; existingContent = novel.content
  } else {
    const { data: novel, error: ne } = await supabase
      .from('novels')
      .insert({ room_id: roomId, category_id: room.category_id, content: '', choices_log: [] })
      .select('id').single()
    if (ne || !novel)
      return new Response(JSON.stringify({ error: 'Failed to create novel' }), { status: 500 })
    novelId = novel.id
    await supabase.from('rooms').update({ novel_id: novelId, status: 'playing' }).eq('id', roomId)
  }

  const isRare      = !isFirst && step < NOVEL_MAX_STEPS && shouldShowRareChoice()
  const choiceCount = isRare ? 3 : 2
  const categoryName = (room.category as any)?.parent?.name
    ? `${(room.category as any).parent.name} / ${(room.category as any).name}`
    : ((room.category as any)?.name ?? '指定なし')

  const encoder    = new TextEncoder()
  let chunkCount   = 0
  let accumulated  = ''   // onChunk で積み上げるテキスト

  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        const fullNewText = await streamNovel({
          system:    buildSystemPrompt(categoryName),
          user:      isFirst
            ? buildNovelPrompt(categoryName)
            : buildContinuePrompt(existingContent, choices, step, choiceCount),
          maxTokens: MAX_TOKENS_PER_SEGMENT,
          onChunk: async (text) => {
            accumulated += text
            chunkCount++
            send({ type: 'chunk', text })

            if (chunkCount % DB_FLUSH_INTERVAL === 0) {
              await supabase.from('novels').update({
                content:    existingContent + accumulated,
                word_count: [...(existingContent + accumulated)].length,
              }).eq('id', novelId)
            }
          },
        })

        const options    = extractChoicesFromText(fullNewText, choiceCount)
        if (isRare && options.length === 2) options.push(generateRareChoice(options))

        const isLastStep = step >= NOVEL_MAX_STEPS - 1
        const newContent = existingContent + fullNewText
        const wordCount  = [...newContent].length

        await supabase.from('novels')
          .update({ content: newContent, word_count: wordCount }).eq('id', novelId)

        if (isLastStep) {
          await supabase.from('rooms').update({ status: 'ending' }).eq('id', roomId)
          send({ type: 'done', wordCount, isEnding: true })
        } else {
          await supabase.from('rooms').update({ status: 'voting' }).eq('id', roomId)
          send({ type: 'choices', options, isRare, step, wordCount })
        }
        controller.close()
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
        controller.close()
        await supabase.from('rooms').update({ status: 'playing' }).eq('id', roomId)
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
