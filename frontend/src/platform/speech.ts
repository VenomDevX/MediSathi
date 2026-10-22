// Read-aloud for low-literacy users (PRD MS-13). Web Speech API in browsers; native TTS on Android,
// because the Android WebView has no speechSynthesis.
import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { LANG_META, type Lang } from '../i18n'

const native = Capacitor.isNativePlatform()

export const canSpeak = () => native || typeof speechSynthesis !== 'undefined'

export function speak(text: string, lang: Lang, onEnd?: () => void) {
  const locale = LANG_META[lang].locale
  if (native) {
    TextToSpeech.speak({ text, lang: locale, rate: 0.9 }).finally(() => onEnd?.())
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
  if (native) void TextToSpeech.stop()
  else if (canSpeak()) speechSynthesis.cancel()
}

