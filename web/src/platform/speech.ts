// Read-aloud for low-literacy users (PRD MS-13). Web Speech API in browsers; native TTS on Android,
// because the Android WebView has no speechSynthesis.
// The native plugin touches `window` when imported, so it is loaded only inside the app (never at prerender).
import { Capacitor } from '@capacitor/core'

const tts = () => import('@capacitor-community/text-to-speech').then((m) => m.TextToSpeech)

const native = Capacitor.isNativePlatform()

export const canSpeak = () => native || typeof speechSynthesis !== 'undefined'

export function speak(text: string, lang: 'hi' | 'en', onEnd?: () => void) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN'
  if (native) {
    tts().then((t) => t.speak({ text, lang: locale, rate: 0.9 })).finally(() => onEnd?.())
    return
  }
  if (!canSpeak()) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = locale
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').startsWith(locale.slice(0, 2)))
  if (voice) u.voice = voice
  u.rate = 0.9
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (native) void tts().then((t) => t.stop())
  else if (canSpeak()) speechSynthesis.cancel()
}
