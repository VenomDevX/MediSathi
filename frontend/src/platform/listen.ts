// Voice input. Android: native SpeechRecognizer (android/.../SpeechPlugin.kt), on-device when the phone has it,
// because the WebView's own recognition does not work. Browsers: Web Speech, on-device when the language pack is
// installed (works offline, audio stays on the device); otherwise the browser's online service. Typing always works.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { LANG_META, type Lang } from '../i18n'

export type ListenError = 'no-speech' | 'offline' | 'denied' | 'unavailable'

type Recognition = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  processLocally?: boolean
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onend: () => void
  onerror: (e: { error: string }) => void
  start: () => void
  stop: () => void
}
type Pack = { langs: string[]; processLocally: true }
type RecognitionCtor = (new () => Recognition) & {
  available?: (o: Pack) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
  install?: (o: Pack) => Promise<boolean>
}

type SpeechPlugin = {
  start(o: { lang: string }): Promise<{ text: string }>
  stop(): Promise<void>
  addListener(event: 'partial', fn: (e: { text: string }) => void): Promise<PluginListenerHandle>
}
const Speech = registerPlugin<SpeechPlugin>('Speech')

const native = () => Capacitor.isNativePlatform()
const Ctor = (): RecognitionCtor | undefined => {
  const g = globalThis as unknown as Record<string, RecognitionCtor | undefined>
  return g.SpeechRecognition ?? g.webkitSpeechRecognition
}

export const canListen = () => native() || !!Ctor()

const WEB_ERRORS: Record<string, ListenError | undefined> = {
  'no-speech': 'no-speech',
  'not-allowed': 'denied',
  'service-not-allowed': 'denied',
  network: 'offline',
  aborted: undefined,
}
const NATIVE_ERRORS: Record<string, ListenError> = { 'no-speech': 'no-speech', 'not-allowed': 'denied', network: 'offline' }

// Locales whose on-device pack is known to be installed, so later taps skip the check.
const localReady = new Set<string>()

/** True when this browser can recognise the locale on the device. Starts a background pack download when it could. */
export async function onDevice(R: RecognitionCtor, locale: string): Promise<boolean> {
  if (localReady.has(locale)) return true
  if (!R.available) return false
  const pack: Pack = { langs: [locale], processLocally: true }
  try {
    const state = await R.available(pack)
    if (state === 'available') {
      localReady.add(locale)
      return true
    }
    // Ready for next time, including offline; this time the online service answers.
    if (state === 'downloadable' && navigator.onLine) void R.install?.(pack).catch(() => {})
  } catch {
    // Blocked by permissions policy or an unknown tag: fall back to the online service.
  }
  return false
}

/**
 * Starts listening; onText gets the running transcript, onEnd fires once (with a reason if it failed).
 * Returns stop(), which ends listening and keeps what was heard.
 */
export function listen(lang: Lang, onText: (text: string) => void, onEnd: (error?: ListenError) => void): () => void {
  const locale = LANG_META[lang].locale
  let ended = false
  const end = (error?: ListenError) => {
    if (ended) return
    ended = true
    onEnd(error)
  }
  return native() ? listenNative(locale, onText, end) : listenWeb(locale, onText, end)
}

function listenNative(locale: string, onText: (t: string) => void, end: (e?: ListenError) => void) {
  let handle: PluginListenerHandle | undefined
  void (async () => {
    let error: ListenError | undefined
    try {
      handle = await Speech.addListener('partial', ({ text }) => onText(text))
      const { text } = await Speech.start({ lang: locale })
      if (text) onText(text)
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e as Error).message
      error = code === 'aborted' ? undefined : (NATIVE_ERRORS[code] ?? 'unavailable')
    }
    void handle?.remove()
    end(error)
  })()
  return () => void Speech.stop().catch(() => {})
}

function listenWeb(locale: string, onText: (t: string) => void, end: (e?: ListenError) => void) {
  const R = Ctor()
  if (!R) {
    end('unavailable')
    return () => {}
  }
  let stopped = false
  let r: Recognition | undefined
  void onDevice(R, locale).then((local) => {
    if (stopped) return end()
    if (!local && !navigator.onLine) return end('offline')
    r = new R()
    r.lang = locale
    r.interimResults = true
    r.maxAlternatives = 1
    if (local) r.processLocally = true
    r.onresult = (e) => onText(Array.from(e.results, (res) => res[0].transcript).join(''))
    r.onerror = (e) => end(e.error in WEB_ERRORS ? WEB_ERRORS[e.error] : 'unavailable')
    r.onend = () => end()
    r.start()
  })
  return () => {
    stopped = true
    r?.stop()
  }
}
