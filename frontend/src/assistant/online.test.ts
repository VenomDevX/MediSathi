import { describe, expect, it, vi } from 'vitest'
import { onlineModel } from './online'

const prompt = [
  { role: 'system' as const, content: 'Use only the sources.' },
  { role: 'user' as const, content: 'Sources: [1] Fever card\n\nQuestion: fever?' },
]
const grounding = { question: 'fever?', lang: 'en' as const, sourceIds: ['fever-en'] }

describe('onlineModel', () => {
  it('sends only the question, language and library card ids to our server, never the prompt text', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ text: 'Rest [1].' })))
    const seen: string[] = []
    const model = onlineModel(fetchFn)
    expect(model.online).toBe(true)
    expect(await model.stream(prompt, (s) => void seen.push(s), undefined, grounding)).toBe('Rest [1].')
    expect(seen).toEqual(['Rest [1].'])
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/assist$/)
    expect(JSON.parse(init.body as string)).toEqual({ question: 'fever?', lang: 'en', sources: ['fever-en'] })
  })

  it('rejects when the server says no, so the caller falls back to the library', async () => {
    const model = onlineModel(async () => new Response('{"detail":"online_ai_off"}', { status: 503 }))
    await expect(model.stream(prompt, () => {}, undefined, grounding)).rejects.toThrow('503')
  })
})
