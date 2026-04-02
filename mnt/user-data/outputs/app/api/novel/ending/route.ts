// ============================================================
// app/api/novel/ending/route.ts  (provider-agnostic 版)
// ============================================================

import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { streamNovel } from '@/lib/novel/stream'
import { buildSystemPrompt, buildEndingPrompt, extractStoryBody } from '@/lib/novel/prompt'

const MAX_TOKENS_ENDING = 800

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { roomId } = await req.json()

  const { data: room } = await supabase
    .from('rooms')
    .select('*, category:categories(name, parent:categories(name)), novel:novels(*)')
    .eq('id', roomId).single()

  if (!room?.novel)
    return new Response(JSON.stringify({ error: 'Room or novel not found' }), { status: 404 })

  const novel        = room.novel as any
  const categoryName = (room.category as any)?.parent?.name
    ? `${(room.category as any).parent.name} / ${(room.category as any).name}`
    : ((room.category as any)?.name ?? '指定なし')

  const encoder   = new TextEncoder()
  let accumulated = ''

  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        const endingText = await streamNovel({
          system:    buildSystemPrompt(categoryName),
          user:      buildEndingPrompt(novel.content, novel.choices_log ?? []),
          maxTokens: MAX_TOKENS_ENDING,
          onChunk: async (text) => {
            accumulated += text
            send({ type: 'chunk', text })
          },
        })

        const endingBody  = extractStoryBody(endingText)
        const fullContent = novel.content + '\n\n' + endingBody
        const wordCount   = [...fullContent].length

        await supabase.from('novels')
          .update({ content: fullContent, word_count: wordCount }).eq('id', novel.id)
        await supabase.from('rooms').update({ status: 'ending' }).eq('id', roomId)

        send({ type: 'done', wordCount })
        controller.close()
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
        controller.close()
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
