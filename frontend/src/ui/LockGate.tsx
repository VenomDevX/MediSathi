import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { GoogleLogo, LockKey, SignIn as SignInIcon, Translate, UserPlus, Warning } from '@phosphor-icons/react'
import { useBoot } from '../app-context'
import { GOOGLE_CLIENT_ID, nativeGoogle, nativeGoogleIdToken, renderGoogleButton } from '../auth/google'
import { hasPin, setPin, unlock } from '../auth/pin'
import { ALL_LANGS, LANG_META, useLang, useT } from '../i18n'
import { googleSignIn, login, signup, type LoginResult } from '../sync/api'
import { AuthError, NetworkError } from '../sync/engine'
import { SyncProvider } from '../sync/SyncProvider'
import type { Session } from '../sync/useSync'
import type { StringKey } from '../strings'
import { Banner, Button, Field, inputClass } from './components'
import { Emergency } from './screens/Emergency'

const IDLE_LOCK_MS = 10 * 60 * 1000
export const DEMO_WORKER_ID = 'u-sunita'
export const DEMO_CITIZEN_ID = 'u-ramesh'

type Mode = 'checking' | 'signin' | 'create' | 'enter' | 'open'

/**
 * Sign-in (online, first time), then a PIN that unlocks the app offline (TRD §8.0).
 * Re-locks after 10 idle minutes. Emergency numbers stay reachable while locked.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const t = useT()
  const { db, user, setUserId } = useBoot()
  const { pathname } = useLocation()
  const [mode, setMode] = useState<Mode>('checking')
  const [signedIn, setSignedIn] = useState<LoginResult | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [openFor, setOpenFor] = useState<string | null>(null)

  // Decide sign-in / create PIN / enter PIN only when the device's user changes,
  // never as a side effect of opening (which would immediately re-lock).
  const userId = user?.id
  useEffect(() => {
    if (!userId) return setMode('signin')
    if (signedIn) return setMode('create')
    hasPin(db, userId).then((has) => setMode(has ? 'enter' : 'create'))
  }, [db, userId]) // signedIn is read, not watched: it is set before userId changes


  useEffect(() => {
    if (mode !== 'open') return
    const lock = () => {
      setSession(null)
      setMode('enter')
    }
    let timer = setTimeout(lock, IDLE_LOCK_MS)
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(lock, IDLE_LOCK_MS)
    }
    const events = ['pointerdown', 'keydown'] as const
    events.forEach((e) => addEventListener(e, reset))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => removeEventListener(e, reset))
    }
  }, [mode])

  // Only the user who entered the PIN sees the app: switching accounts locks before the next account renders.
  if (mode === 'open' && session && openFor === user?.id) {
    return (
      <SyncProvider session={session} onSignOut={() => (setSession(null), setSignedIn(null), setMode('signin'))}>
        {children}
      </SyncProvider>
    )
  }
  if (mode === 'checking' || mode === 'open') return null
  // Emergency numbers never sit behind sign-in or the PIN: a bystander may be holding the phone. No patient data here.
  if (pathname === '/emergency') {
    return (
      <main className="mx-auto flex max-w-[760px] flex-col gap-2 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6">
        <Link to="/" className="flex min-h-11 w-fit items-center gap-2 text-muted hover:text-ink">
          <LockKey size={18} aria-hidden />
          {t('back')}
        </Link>
        <Emergency />
      </main>
    )
  }
  if (mode === 'signin' || !user) {
    return (
      <SignIn
        onSignedIn={async (r) => {
          await saveServerUser(db, r)
          setSignedIn(r)
          await setUserId(r.user.id)
          setMode('create') // a fresh sign-in always sets a new PIN that wraps the new refresh token
        }}
        onDemo={async (targetId = DEMO_WORKER_ID) => {
          setSignedIn(null)
          await setUserId(targetId)
          setMode((await hasPin(db, targetId)) ? 'enter' : 'create')
        }}
      />
    )
  }
  return (
    <LockScreen
      create={mode === 'create'}
      secret={signedIn?.refresh_token}
      onOpen={(s) => {
        setSession(s)
        setOpenFor(user.id)
        setSignedIn(null)
        setMode('open')
      }}
      onSignInAgain={() => setMode('signin')}
    />
  )
}

async function saveServerUser(db: ReturnType<typeof useBoot>['db'], r: LoginResult) {
  await db.batch([
    {
      sql: `INSERT INTO users (id, server_user_id, display_name, role, assigned_scope_json, last_server_contact_at, failed_pin_attempts)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET server_user_id = excluded.server_user_id, display_name = excluded.display_name, role = excluded.role,
              assigned_scope_json = excluded.assigned_scope_json, last_server_contact_at = excluded.last_server_contact_at, failed_pin_attempts = 0`,
      bind: [r.user.id, r.user.id, r.user.display_name, r.user.role, JSON.stringify(r.user.assigned_scope), new Date().toISOString()],
    },
  ])
}

function Shell({ children }: { children: ReactNode }) {
  const t = useT()
  const { lang, setLang } = useLang()
  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-8 px-4 pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      {/* Before sign-in too: the first screen must be readable for someone who reads only their language. */}
      <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 flex items-center gap-1.5">
        <Translate size={18} aria-hidden className="text-muted" />
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as typeof lang)}
          className="min-h-11 rounded-[var(--radius-control)] border border-line bg-surface px-2 font-medium text-muted"
          aria-label={t('language')}
        >
          {ALL_LANGS.map((l) => (
            <option key={l} value={l}>{LANG_META[l].label}</option>
          ))}
        </select>
      </div>
      {children}
      <Link to="/emergency" className="flex min-h-12 items-center justify-center gap-2 font-semibold text-danger">
        <Warning size={20} weight="bold" aria-hidden />
        {t('emergency')}
      </Link>
    </main>
  )
}

function SignIn({ onSignedIn, onDemo }: { onSignedIn: (r: LoginResult) => Promise<void>; onDemo: (id?: string) => Promise<void> }) {
  const t = useT()
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [form, setForm] = useState({ name: '', username: '', password: '' })
  const [error, setError] = useState<StringKey | null>(null)
  const [busy, setBusy] = useState(false)
  const signingUp = tab === 'signup'

  async function run(call: () => Promise<LoginResult>) {
    setError(null)
    setBusy(true)
    try {
      await onSignedIn(await call())
    } catch (err) {
      setError(err instanceof AuthError ? (err.message === 'username_taken' ? 'signUpTaken' : 'signInWrong') : err instanceof NetworkError ? 'signInOffline' : 'signInFailed')
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    run(() => (signingUp ? signup(form.name, form.username, form.password) : login(form.username, form.password)))
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const tabClass = (on: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-[calc(var(--radius-control)-4px)] font-semibold transition-colors ${on ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`

  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <span className="flex size-14 items-center justify-center rounded-[var(--radius-card)] bg-ok-bg text-neem" aria-hidden>
          {signingUp ? <UserPlus size={30} /> : <SignInIcon size={30} />}
        </span>
        <p translate="no" className="text-muted">{t('appName')}</p>
        <h1 className="text-[28px] leading-tight font-bold">{t(signingUp ? 'signUpTitle' : 'signInTitle')}</h1>
        <p className="text-muted">{t(signingUp ? 'signUpHint' : 'signInHint')}</p>
      </div>
      <div className="flex gap-1 rounded-[var(--radius-control)] border border-line bg-canvas p-1">
        {(['signin', 'signup'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => (setTab(k), setError(null))} className={tabClass(tab === k)}>
            {t(k === 'signin' ? 'signIn' : 'createAccount')}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {signingUp && (
          <Field label={t('fullName')}>
            <input name="name" autoComplete="name" required maxLength={80} value={form.name} onChange={set('name')} className={inputClass} />
          </Field>
        )}
        <Field label={t('username')} hint={signingUp ? t('usernameHint') : undefined}>
          <input
            name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={form.username} onChange={set('username')} className={inputClass}
            {...(signingUp && { minLength: 3, maxLength: 32, pattern: '[A-Za-z0-9._\\-]+' })}
          />
        </Field>
        <Field label={t('password')} hint={signingUp ? t('passwordHint') : undefined}>
          <input
            name="password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} required value={form.password} onChange={set('password')} className={inputClass}
            {...(signingUp && { minLength: 8, maxLength: 256 })}
          />
        </Field>
        {error && <Banner tone="danger">{t(error)}</Banner>}
        <Button type="submit" disabled={busy}>{t(busy ? (signingUp ? 'signingUp' : 'signingIn') : signingUp ? 'createAccount' : 'signIn')}</Button>
      </form>
      {GOOGLE_CLIENT_ID && <GoogleButton disabled={busy} onToken={(token) => run(() => googleSignIn(token))} onFail={() => setError('googleFailed')} />}
      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <p className="text-sm font-semibold text-muted">{t('demoHint')}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onDemo(DEMO_WORKER_ID)}
            className="flex flex-col items-start gap-1 rounded-[var(--radius-control)] border border-line bg-surface p-3 text-left hover:border-neem hover:bg-canvas transition-colors"
          >
            <span className="font-semibold text-ink flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-neem" aria-hidden />
              {t('demoWorker')}
            </span>
            <span className="text-xs text-muted">{t('demoWorkerDesc')}</span>
          </button>
          <button
            type="button"
            onClick={() => onDemo(DEMO_CITIZEN_ID)}
            className="flex flex-col items-start gap-1 rounded-[var(--radius-control)] border border-line bg-surface p-3 text-left hover:border-neem hover:bg-canvas transition-colors"
          >
            <span className="font-semibold text-ink flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-muted" aria-hidden />
              {t('demoCitizen')}
            </span>
            <span className="text-xs text-muted">{t('demoCitizenDesc')}</span>
          </button>
        </div>
      </div>
    </Shell>
  )
}

/** "or", then Google: Google's own button on the website, the system account picker in the Android app (auth/google.ts). */
function GoogleButton({ disabled, onToken, onFail }: { disabled: boolean; onToken: (idToken: string) => void; onFail: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const slot = useRef<HTMLDivElement>(null)
  const latest = useRef({ onToken, onFail })
  useEffect(() => {
    latest.current = { onToken, onFail }
  })

  useEffect(() => {
    if (nativeGoogle || !slot.current) return
    renderGoogleButton(slot.current, LANG_META[lang].locale, (token) => latest.current.onToken(token)).catch(() => latest.current.onFail())
  }, [lang])

  async function native() {
    let token: string
    try {
      token = await nativeGoogleIdToken()
    } catch {
      return onFail() // also when the person closes the picker
    }
    onToken(token)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        {t('orDivider')}
        <span className="h-px flex-1 bg-line" />
      </div>
      {nativeGoogle ? (
        <Button type="button" variant="secondary" disabled={disabled} onClick={native}>
          <GoogleLogo size={20} weight="bold" aria-hidden />
          {t('googleContinue')}
        </Button>
      ) : (
        <div ref={slot} className="flex min-h-11 justify-center" />
      )}
    </div>
  )
}

function LockScreen({ create, secret, onOpen, onSignInAgain }: { create: boolean; secret?: string; onOpen: (s: Session) => void; onSignInAgain: () => void }) {
  const t = useT()
  const { db, user } = useBoot()
  const [pin, setPinValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<{ key: StringKey; n?: number } | null>(null)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{4,6}$/.test(pin)) return setError({ key: 'pinInvalid' })
    setBusy(true)
    try {
      if (create) {
        if (pin !== confirm) return setError({ key: 'pinMismatch' })
        await setPin(db, user!.id, pin, secret)
        return onOpen({ pin, refreshToken: secret ?? null })
      }
      const r = await unlock(db, user!.id, pin)
      if (r.status === 'ok') return onOpen({ pin, refreshToken: r.secret ?? null })
      setPinValue('')
      if (r.status === 'wrong') setError({ key: 'pinWrong', n: r.remaining })
      else {
        setError({ key: r.status === 'expired' ? 'pinExpired' : 'pinLocked' })
        setNeedsSignIn(true)
      }
    } finally {
      setBusy(false)
    }
  }

  const digits = { type: 'password', inputMode: 'numeric', autoComplete: 'off', maxLength: 6, pattern: '[0-9]*' } as const

  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <span className="flex size-14 items-center justify-center rounded-[var(--radius-card)] bg-ok-bg text-neem" aria-hidden>
          <LockKey size={30} />
        </span>
        <p className="text-muted"><span translate="no">{t('appName')}</span> · {user!.display_name}</p>
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
        {needsSignIn ? (
          <Button type="button" onClick={onSignInAgain}>{t('signIn')}</Button>
        ) : (
          <Button type="submit" disabled={busy}>{t(create ? 'savePin' : 'unlock')}</Button>
        )}
      </form>
    </Shell>
  )
}
