import { describe, expect, it, vi } from 'vitest'
import { nativeModel, type GemmaPlugin } from './native'

const prompt = [
  { role: 'system' as const, content: 'rules' },
  { role: 'user' as const, content: 'question' },
]

/** A plugin double that streams the given pieces through the 'text' listener, then resolves. */
function fakePlugin(pieces: string[], { fail }: { fail?: Error } = {}) {
  let listener: ((e: { delta: string }) => void) | undefined
  let cancelled = false
  const plugin = {
    addListener: vi.fn(async (_: 'text', fn: (e: { delta: string }) => void) => {
      listener = fn
      return { remove: async () => void (listener = undefined) }
    }),
    generate: vi.fn(async () => {
      for (const delta of pieces) {
        if (cancelled) break
        await Promise.resolve()
        listener?.({ delta })
      }
      if (fail) throw fail
    }),
    cancel: vi.fn(async () => void (cancelled = true)),
  }
  return { plugin: plugin as unknown as GemmaPlugin, calls: plugin, listening: () => !!listener }
}

describe('nativeModel', () => {
  it('joins streamed pieces and sends the system rules and the question separately', async () => {
    const { plugin, calls } = fakePlugin(['Rest ', 'well [1]'])
    const seen: string[] = []
    const text = await nativeModel(plugin, 'model.litertlm').stream(prompt, (t) => void seen.push(t))
    expect(text).toBe('Rest well [1]')
    expect(seen).toEqual(['Rest ', 'Rest well [1]'])
    expect(calls.generate).toHaveBeenCalledWith(expect.objectContaining({ file: 'model.litertlm', system: 'rules', prompt: 'question' }))
  })

  it('cancels when onText returns false', async () => {
    const { plugin, calls } = fakePlugin(['a', 'b', 'c'])
    const text = await nativeModel(plugin, 'm').stream(prompt, () => false)
    expect(text).toBe('a')
    expect(calls.cancel).toHaveBeenCalled()
  })

  it('cancels on abort', async () => {
    const { plugin, calls } = fakePlugin(['a', 'b'])
    const stop = new AbortController()
    stop.abort()
    await nativeModel(plugin, 'm').stream(prompt, () => {}, stop.signal)
    expect(calls.cancel).toHaveBeenCalled()
  })

  it('passes engine errors on, so the assistant falls back to the library, and stops listening', async () => {
    const { plugin, listening } = fakePlugin(['a'], { fail: new Error('engine failed') })
    await expect(nativeModel(plugin, 'm').stream(prompt, () => {})).rejects.toThrow('engine failed')
    expect(listening()).toBe(false)
  })
})
