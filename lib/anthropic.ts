// Claude (Anthropic) client via the Messages API. Server-only.
// Models: Sonnet 4.6 for interactive advisory chat; Opus 4.8 for the heavier
// monthly strategic briefs.
export const MODELS = {
  chat: 'claude-sonnet-4-6',
  brief: 'claude-opus-4-8',
} as const

type Msg = { role: 'user' | 'assistant'; content: string }

export async function askClaude(opts: {
  system: string
  messages: Msg[]
  model?: string
  maxTokens?: number
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? MODELS.chat,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Claude error ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim()
}
