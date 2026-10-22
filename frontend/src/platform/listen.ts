// Voice input via the browser's speech recognition (Chrome, Edge, Safari). In Chrome this needs internet;
// typing always works. The Android app gets on-device recognition in the Android phase.
import { LANG_META, type Lang } from '../i18n'

type Recognition = {
  lang: string
  interimResults: boolean
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void
  onend: () => void
  onerror: () => void
  start: () => void
  stop: () => void
}

const Ctor = () =>
  (window as unknown as Record<string, new () => Recognition>).SpeechRecognition ?? (window as unknown as Record<string, new () => Recognition>).webkitSpeechRecognition

export const canListen = () => !!Ctor()

/** Starts listening; calls onText with the running transcript. Returns stop(). */
export function listen(lang: Lang, onText: (text: string) => void, onEnd: () => void): () => void {
  const R = Ctor()
  if (!R) {
    onEnd()
    return () => {}
  }
  const r = new R()
  r.lang = LANG_META[lang].locale
  r.interimResults = true
  r.onresult = (e) => onText(Array.from(e.results, (res) => res[0].transcript).join(''))
  r.onend = onEnd
  r.onerror = onEnd
  r.start()
  return () => r.stop()
}

