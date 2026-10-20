import { describe, expect, it } from 'vitest'
import { chooseModel, litertModel, type EngineLike } from './litert'

/** A LiteRT-LM engine double: each conversation streams `pieces` as chunks shaped like the real API's messages. */
function fakeEngine(pieces: string[], { fail = false } = {}) {
  const log = { preface: [] as unknown[], sent: [] as unknown[], cancelled: 0, deleted: 0 }
  const engine: EngineLike = {
    async createConversation(config) {
      if (fail) throw new Error('model failed to load')
      log.preface.push(config?.preface?.messages)
      let stop = false
      return {
        sendMessageStreaming(message) {
          log.sent.push(message)
          let i = 0
          return new ReadableStream({
            pull(c) {
              if (stop || i === pieces.length) return c.close()
              // Alternate the two content shapes the runtime uses: a string, and a list of parts.
              c.enqueue(i % 2 ? { role: 'model', content: pieces[i++] } : { role: 'model', content: [{ type: 'text', text: pieces[i++] }] })
            },
          })
        },
        cancel: () => void (log.cancelled++, (stop = true)),
        delete: async () => void log.deleted++,
      }
    },
  }
  return { engine: async () => engine, log }
}

const prompt = [
  { role: 'system' as const, content: 'Use only the sources.' },
  { role: 'user' as const, content: 'Sources: ... Question: fever?' },
]

describe('litertModel', () => {
  it('streams the pieces, with the system prompt as the preface and the question as the message', async () => {
    const { engine, log } = fakeEngine(['Drink ', 'water ', '[1].'])
    const seen: string[] = []
    const text = await litertModel('gemma-4-e2b', engine).stream(prompt, (s) => void seen.push(s))
    expect(text).toBe('Drink water [1].')
    expect(seen).toEqual(['Drink ', 'Drink water ', 'Drink water [1].'])
    expect(log.preface[0]).toEqual([{ role: 'system', content: 'Use only the sources.' }])
    expect(log.sent[0]).toBe('Sources: ... Question: fever?')
    expect(log.deleted).toBe(1) // each answer gets a fresh conversation, cleaned up after
  })

  it('cancels generation when onText returns false', async () => {
    const { engine, log } = fakeEngine(['a', 'b', 'c'])
    const text = await litertModel('m', engine).stream(prompt, () => false)
    expect(text).toBe('a')
    expect(log.cancelled).toBe(1)
  })

  it('cancels generation when the signal aborts', async () => {
    const { engine, log } = fakeEngine(['a', 'b', 'c'])
    const ac = new AbortController()
    const text = await litertModel('m', engine).stream(prompt, (s) => void (s === 'ab' && ac.abort()), ac.signal)
    expect(text).toBe('ab')
    expect(log.cancelled).toBe(1)
  })

  it('rejects when the model cannot run, so the caller falls back to the library', async () => {
    const { engine } = fakeEngine([], { fail: true })
    await expect(litertModel('m', engine).stream(prompt, () => {})).rejects.toThrow('model failed to load')
  })
})

describe('chooseModel', () => {
  it('uses the chosen model when it is on this device', () => expect(chooseModel('gemma-3n-e2b', ['gemma-4-e2b', 'gemma-3n-e2b'])).toBe('gemma-3n-e2b'))
  it('on auto, prefers Gemma 4 E2B', () => expect(chooseModel('auto', ['gemma-3n-e2b', 'gemma-4-e2b'])).toBe('gemma-4-e2b'))
  it('falls back to whichever model is on this device', () => expect(chooseModel('gemma-4-e2b', ['gemma-3n-e2b'])).toBe('gemma-3n-e2b'))
  it('uses no model when turned off or none is downloaded', () => {
    expect(chooseModel('off', ['gemma-4-e2b'])).toBeUndefined()
    expect(chooseModel('auto', [])).toBeUndefined()
  })
})
