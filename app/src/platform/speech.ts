// Read-aloud for low-literacy users (PRD MS-13). Web Speech API; Capacitor TTS replaces this on Android (Phase 7).

export const canSpeak = () => typeof speechSynthesis !== 'undefined'

export function speak(text: string, lang: 'hi' | 'en', onEnd?: () => void) {
  if (!canSpeak()) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').startsWith(u.lang.slice(0, 2)))
  if (voice) u.voice = voice
  u.rate = 0.9
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel()
}
