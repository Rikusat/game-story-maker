export interface StreamNovelParams {
  system: string
  user: string
  maxTokens?: number
  onChunk: (text: string) => Promise<void> | void
}

export async function streamNovel({
  system,
  user,
  maxTokens = 600,
  onChunk,
}: StreamNovelParams): Promise<string> {
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o'

  let fullText = ''

  const completion = await openai.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature: 0.85,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    stream: true,
  })

  for await (const chunk of completion) {
    const text = chunk.choices[0]?.delta?.content ?? ''
    if (!text) continue
    fullText += text
    await onChunk(text)
  }

  return fullText
}
