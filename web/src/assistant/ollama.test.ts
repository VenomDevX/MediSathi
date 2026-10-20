import { describe, expect, it } from 'vitest'
import { chooseModel, ollamaModel, ollamaStatus } from './ollama'

// A response body that arrives in awkward pieces: lines split mid-JSON, several lines in one chunk.
function ndjson(chunks: string[]): Response {
  const enc = new TextEncoder()
  return new Response(new ReadableStream({ start(c) { chunks.forEach((s) => c.enqueue(enc.encode(s))); c.close() } }))
}
const line = (content: string, done = false) => JSON.stringify({ message: { role: 'assistant', content }, done }) + '\n'

describe('ollamaModel', () => {
  it('joins streamed pieces, even when a line is split across chunks', async () => {
    const all = line('Drink ') + line('water [1].') + line('', true)
    const fetchFn = async () => ndjson([all.slice(0, 10), all.slice(10, 50), all.slice(50)])
    const seen: string[] = []
    const text = await ollamaModel('gemma3n:e2b', 'http://x', fetchFn).stream([], (s) => void seen.push(s))
    expect(text).toBe('Drink water [1].')
    expect(seen).toEqual(['Drink ', 'Drink water [1].'])
  })

  it('stops reading when onText returns false', async () => {
    const fetchFn = async () => ndjson([line('a'), line('b'), line('c', true)])
    const text = await ollamaModel('m', 'http://x', fetchFn).stream([], () => false)
    expect(text).toBe('a')
  })

  it('sends the model, the messages and stream:true', async () => {
    let body: { model: string; stream: boolean; messages: unknown[] } | undefined
    const fetchFn = async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return ndjson([line('', true)])
    }
    await ollamaModel('gemma3n:e4b', 'http://x', fetchFn).stream([{ role: 'user', content: 'hi' }], () => {})
    expect(body).toMatchObject({ model: 'gemma3n:e4b', stream: true, messages: [{ role: 'user', content: 'hi' }] })
  })

  it('throws on an HTTP error so the caller falls back', async () => {
    const fetchFn = async () => new Response('model not found', { status: 404 })
    await expect(ollamaModel('m', 'http://x', fetchFn).stream([], () => {})).rejects.toThrow()
  })
})

describe('ollamaStatus', () => {
  it('lists the installed Gemma 3n models', async () => {
    const fetchFn = async () => Response.json({ models: [{ name: 'llama3:8b' }, { name: 'gemma3n:e2b' }] })
    expect(await ollamaStatus('http://x', fetchFn)).toEqual({ running: true, models: ['gemma3n:e2b'] })
  })

  it('reports not running when Ollama cannot be reached', async () => {
    const fetchFn = async () => { throw new TypeError('Failed to fetch') }
    expect(await ollamaStatus('http://x', fetchFn)).toEqual({ running: false, models: [] })
  })
})

describe('chooseModel', () => {
  it('uses the chosen model when it is installed', () => expect(chooseModel('gemma3n:e4b', ['gemma3n:e2b', 'gemma3n:e4b'])).toBe('gemma3n:e4b'))
  it('on auto, prefers the small E2B model', () => expect(chooseModel('auto', ['gemma3n:e4b', 'gemma3n:e2b'])).toBe('gemma3n:e2b'))
  it('falls back to whatever Gemma 3n is installed', () => expect(chooseModel('gemma3n:e2b', ['gemma3n:e4b'])).toBe('gemma3n:e4b'))
  it('uses no model when turned off or none is installed', () => {
    expect(chooseModel('off', ['gemma3n:e2b'])).toBeUndefined()
    expect(chooseModel('auto', [])).toBeUndefined()
  })
})
