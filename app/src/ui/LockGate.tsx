import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { LockKey } from '@phosphor-icons/react'
import { useApp } from '../app-context'
import { hasPin, setPin, unlock } from '../auth/pin'
import { useT } from '../i18n'
import type { StringKey } from '../strings'
import { Banner, Button, Field, inputClass } from './components'

const IDLE_LOCK_MS = 10 * 60 * 1000

/** Requires the worker's PIN before showing records; re-locks after 10 idle minutes (TRD §8.0, §10). */
export function LockGate({ children }: { children: ReactNode }) {
  const { db, user } = useApp()
  const [mode, setMode] = useState<'checking' | 'create' | 'enter' | 'open'>('checking')

  useEffect(() => {
    hasPin(db, user.id).then((has) => setMode(has ? 'enter' : 'create'))
  }, [db, user.id])

  useEffect(() => {
    if (mode !== 'open') return
    let timer = setTimeout(() => setMode('enter'), IDLE_LOCK_MS)
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setMode('enter'), IDLE_LOCK_MS)
    }
    const events = ['pointerdown', 'keydown'] as const
    events.forEach((e) => addEventListener(e, reset))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => removeEventListener(e, reset))
    }
  }, [mode])

  if (mode === 'open') return children
  if (mode === 'checking') return null
  return <LockScreen create={mode === 'create'} onOpen={() => setMode('open')} />
}

function LockScreen({ create, onOpen }: { create: boolean; onOpen: () => void }) {
  const t = useT()
  const { db, user } = useApp()
  const [pin, setPinValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<{ key: StringKey; n?: number } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{4,6}$/.test(pin)) return setError({ key: 'pinInvalid' })
    setBusy(true)
    try {
      if (create) {
        if (pin !== confirm) return setError({ key: 'pinMismatch' })
        await setPin(db, user.id, pin)
        return onOpen()
      }
      const r = await unlock(db, user.id, pin)
      if (r.status === 'ok') return onOpen()
      setPinValue('')
      if (r.status === 'wrong') setError({ key: 'pinWrong', n: r.remaining })
      else if (r.status === 'expired') setError({ key: 'pinExpired' })
      else setError({ key: 'pinLocked' })
    } finally {
      setBusy(false)
    }
  }

  const digits = { type: 'password', inputMode: 'numeric', autoComplete: 'off', maxLength: 6, pattern: '[0-9]*' } as const

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-8 px-4">
      <div className="flex flex-col gap-3">
        <span className="flex size-14 items-center justify-center rounded-[var(--radius-card)] bg-ok-bg text-neem" aria-hidden>
          <LockKey size={30} />
        </span>
        <p className="text-muted">{t('appName')} · {user.display_name}</p>
        <h1 className="text-[28px] leading-tight font-bold">{t(create ? 'pinCreateTitle' : 'pinEnterTitle')}</h1>
        {create && <p className="text-muted">{t('pinCreateHint')}</p>}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={t('pin')}>
          <input {...digits} autoFocus value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} className={`${inputClass} text-center text-2xl tracking-[0.5em]`} />
        </Field>
        {create && (
          <Field label={t('pinConfirm')}>
            <input {...digits} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} className={`${inputClass} text-center text-2xl tracking-[0.5em]`} />
          </Field>
        )}
        {error && <Banner tone="danger">{t(error.key, { n: error.n ?? 0 })}</Banner>}
        <Button type="submit" disabled={busy}>{t(create ? 'savePin' : 'unlock')}</Button>
      </form>
    </main>
  )
}
