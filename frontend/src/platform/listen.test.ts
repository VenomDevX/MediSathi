import { afterEach, describe, expect, it, vi } from 'vitest'
import { listen } from './listen'

/** A stand-in for the browser's SpeechRecognition; `pack` is what available() reports for on-device use. */
function fakeRecognition(pack: string) {
  const made: Array<Record<string, unknown> & { onerror: (e: { error: string }) => void; onend: () => void; onresult: (e: unknown) => void }> = []
  const R = vi.fn(function (this: Record<string, unknown>) {
    this.start = vi.fn()
    this.stop = vi.fn(() => (this.onend as () => void)())
    made.push(this as never)
  }) as unknown as { available: ReturnType<typeof vi.fn>; install: ReturnType<typeof vi.fn> }
  R.available = vi.fn(async () => pack)
  R.install = vi.fn(async () => true)
  vi.stubGlobal('SpeechRecognition', R)
  return { R, made }
}
const tick = () => new Promise((r) => setTimeout(r))

afterEach(() => vi.unstubAllGlobals())

describe('voice input on the web', () => {
  it('recognises on the device when the language pack is installed, and remembers it', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { R, made } = fakeRecognition('available')
    const heard: string[] = []
    listen('hi', (t) => heard.push(t), () => {})
    await tick()
    expect(made[0].processLocally).toBe(true)
    expect(made[0].lang).toBe('hi-IN')
    made[0].onresult({ results: [[{ transcript: 'बुखार ' }], [{ transcript: 'है' }]] })
    expect(heard).toEqual(['बुखार है'])

    listen('hi', () => {}, () => {})
    await tick()
    expect(R.available).toHaveBeenCalledTimes(1)
  })

  it('downloads the pack for next time and uses the online service now', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const { R, made } = fakeRecognition('downloadable')
    listen('ta', () => {}, () => {})
    await tick()
    expect(R.install).toHaveBeenCalledWith({ langs: ['ta-IN'], processLocally: true })
    expect(made[0].processLocally).toBeUndefined()
  })

  it('says it needs internet instead of failing silently when offline without a pack', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { made } = fakeRecognition('downloadable')
    const onEnd = vi.fn()
    listen('te', () => {}, onEnd)
    await tick()
    expect(made).toHaveLength(0)
    expect(onEnd).toHaveBeenCalledWith('offline')
  })

  it('reports a blocked microphone once, even though the browser also fires end', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const { made } = fakeRecognition('unavailable')
    const onEnd = vi.fn()
    listen('bn', () => {}, onEnd)
    await tick()
    made[0].onerror({ error: 'not-allowed' })
    made[0].onend()
    expect(onEnd.mock.calls).toEqual([['denied']])
  })

  it('never opens the microphone when stopped before it started', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const { made } = fakeRecognition('unavailable')
    const onEnd = vi.fn()
    const stop = listen('mr', () => {}, onEnd)
    stop()
    await tick()
    expect(made).toHaveLength(0)
    expect(onEnd).toHaveBeenCalledExactlyOnceWith(undefined)
  })
})
