import { useEffect, useRef, useState } from 'react'
import { Microphone, Phone, Stop } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { ask } from '../../assistant/ask'
import { pickModel } from '../../assistant/litert'
import type { Reply } from '../../assistant/respond'
import { ruleText } from '../../domain/emergency'
import { emergencyRules } from '../../emergencyRules'
import { useLang, useT } from '../../i18n'
import { canListen, listen, type ListenError } from '../../platform/listen'
import { speak, stopSpeaking } from '../../platform/speech'
import type { StringKey } from '../../strings'
import { AssistantMark, PageHeader } from '../components'
import { cx } from '../styles'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'
const VOICE_ERRORS: Record<ListenError, StringKey> = { 'no-speech': 'voiceNoSpeech', offline: 'voiceOffline', denied: 'voiceDenied', unavailable: 'voiceUnavailable' }
const PHASE_TEXT: Record<Phase, StringKey> = { idle: 'saathiIdle', listening: 'chatListening', thinking: 'chatThinking', speaking: 'saathiSpeaking' }

/**
 * Hands-free conversation for people who cannot read or type: listen, answer aloud, listen again.
 * Stops on a tap, after two silent turns, after an emergency reply (the person must act, not talk), or on leaving.
 */
export function Saathi() {
  const t = useT()
  const { lang } = useLang()
  const { db, user } = useApp()
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [error, setError] = useState<ListenError | null>(null)
  const active = useRef(false)
  const stopListening = useRef<(() => void) | null>(null)
  const chatId = useRef<string | null>(null)

  const emergency = reply?.kind === 'emergency' ? emergencyRules.find((r) => r.id === reply.sources[0]?.id) : undefined
  const spoken = (r: Reply) => {
    if (r.kind === 'unknown') return t('chatUnknown')
    const rule = r.kind === 'emergency' ? emergencyRules.find((x) => x.id === r.sources[0]?.id) : undefined
    return rule ? `${ruleText(rule.title, lang)}. ${ruleText(rule.instruction, lang)}. ${t('call', { n: 108 })}.` : r.content
  }

  function stop() {
    active.current = false
    stopListening.current?.()
    stopListening.current = null
    stopSpeaking()
    setPhase('idle')
  }

  function turn(silentTurns = 0) {
    if (!active.current) return
    let text = ''
    setPhase('listening')
    setHeard('')
    stopListening.current = listen(
      lang,
      (s) => setHeard((text = s)),
      (err) => {
        stopListening.current = null
        if (!active.current) return
        if (err === 'no-speech' || (!err && !text.trim())) return silentTurns >= 1 ? (stop(), setError('no-speech')) : turn(silentTurns + 1)
        if (err) return stop(), setError(err)
        void answer(text.trim())
      },
    )
  }

  async function answer(question: string) {
    setPhase('thinking')
    const res = await ask({ db, owner: user.id, chatId: chatId.current, question, lang, rules: emergencyRules, model: pickModel(), unknownText: t('chatUnknown') })
    chatId.current = res.chatId
    if (!active.current) return
    setReply(res.reply)
    setPhase('speaking')
    speak(spoken(res.reply), lang, () => {
      if (res.reply.kind === 'emergency') stop()
      else turn()
    })
  }

  function toggle() {
    if (active.current) return stop()
    setError(null)
    setReply(null)
    active.current = true
    turn()
  }

  useEffect(
    () => () => {
      active.current = false
      stopListening.current?.()
      stopSpeaking()
    },
    [],
  )

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t('saathiTitle')} back={{ to: '/chat', label: t('chatTitle') }} />
      <p className="-mt-3 mb-6 text-muted">{t('saathiHint')}</p>

      <div className="flex flex-1 flex-col items-center gap-6 text-center">
        <button
          type="button"
          onClick={toggle}
          disabled={!canListen()}
          aria-pressed={phase !== 'idle'}
          aria-label={t(phase === 'idle' ? 'saathiStart' : 'saathiStop')}
          className={cx(
            'relative flex size-40 items-center justify-center rounded-full text-on-neem shadow-lg disabled:opacity-40',
            phase === 'listening' ? 'bg-danger' : 'bg-neem',
          )}
        >
          {phase === 'listening' && <span aria-hidden className="absolute inset-0 rounded-full bg-danger/40 motion-safe:animate-ping" />}
          {phase === 'idle' ? <Microphone size={64} weight="fill" aria-hidden /> : <Stop size={56} weight="fill" aria-hidden />}
        </button>

        <p role="status" aria-live="polite" className="flex items-center gap-2 text-xl font-semibold">
          {phase !== 'idle' && <AssistantMark busy={phase === 'thinking'} />}
          {t(PHASE_TEXT[phase])}
        </p>
        {error && <p className="text-danger">{t(VOICE_ERRORS[error])}</p>}

        {heard && (
          <p className="w-full rounded-[var(--radius-card)] bg-neem-soft px-4 py-3 text-left text-lg">
            <span className="block text-sm font-semibold text-muted">{t('saathiYouSaid')}</span>
            {heard}
          </p>
        )}
        {reply && (
          <div className="flex w-full flex-col gap-3 text-left">
            {emergency && (
              <a href="tel:108" className="flex min-h-16 items-center justify-center gap-3 rounded-[var(--radius-card)] bg-danger text-2xl font-bold text-surface">
                <Phone size={28} weight="fill" aria-hidden />
                {t('call', { n: 108 })}
              </a>
            )}
            <p className="text-lg whitespace-pre-line">{spoken(reply)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
