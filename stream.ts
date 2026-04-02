// ============================================================
// lib/novel/stream.ts
//
// AIプロバイダーを切り替え可能なストリーミング抽象層。
// 環境変数 AI_PROVIDER で "anthropic" | "openai" を選ぶ。
//
// .env.local:
//   AI_PROVIDER=openai          # openai を使う場合
//   OPENAI_API_KEY=sk-...
//   OPENAI_MODEL=gpt-4o         # 省略時は gpt-4o
//
//   AI_PROVIDER=anthropic       # Claude に戻す場合（デフォルト）
//   ANTHROPIC_API_KEY=sk-ant-...
// ============================================================

export type StreamChunkCallback = (text: string) => void | Promise<void>

export interface StreamNovelParams {
  system: string
  user: string
  maxTokens?: number
  onChunk: StreamChunkCallback
}

// ─────────────────────────────────────────
// プロバイダー判定
// ─────────────────────────────────────────
function getProvider(): 'anthropic' | 'openai' {
  const p = process.env.AI_PROVIDER ?? 'anthropic'
  if (p === 'openai') return 'openai'
  return 'anthropic'
}

// ─────────────────────────────────────────
// メイン：ストリーミング実行
// テキストを chunk 単位で onChunk に渡し、
// 完了後に fullText を返す。
// ─────────────────────────────────────────
export async function streamNovel({
  system,
  user,
  maxTokens = 600,
  onChunk,
}: StreamNovelParams): Promise<string> {
  const provider = getProvider()

  if (provider === 'openai') {
    return streamWithOpenAI({ system, user, maxTokens, onChunk })
  }
  return streamWithAnthropic({ system, user, maxTokens, onChunk })
}

// ─────────────────────────────────────────
// OpenAI 実装
// ─────────────────────────────────────────
async function streamWithOpenAI({
  system,
  user,
  maxTokens,
  onChunk,
}: StreamNovelParams): Promise<string> {
  // 動的 import（openai パッケージが未インストールでも他のコードが壊れない）
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o'

  let fullText = ''

  const stream = openai.chat.completions.stream({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    // ストリーミング有効
    stream: true,
  })

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? ''
    if (!text) continue
    fullText += text
    await onChunk(text)
  }

  return fullText
}

// ─────────────────────────────────────────
// Anthropic 実装
// ─────────────────────────────────────────
async function streamWithAnthropic({
  system,
  user,
  maxTokens,
  onChunk,
}: StreamNovelParams): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-5'

  let fullText = ''

  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      const text = event.delta.text
      fullText += text
      await onChunk(text)
    }
  }

  return fullText
}
