import { useEffect, useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Link } from 'react-router-dom'
import { ArrowSquareOut, CheckCircle, Cpu, DownloadSimple, FolderOpen, Info, LockKey, Pill, Pulse, Translate, Trash, UserCircle, Warning, Waveform } from '@phosphor-icons/react'
import { canRunModels, getModelChoice, setModelChoice, unloadModel, type ModelChoice } from '../../assistant/litert'
import { installedModels, MODEL_IDS, MODELS, removeModel, saveModel, type ModelId } from '../../assistant/modelFiles'
import { useBoot } from '../../app-context'
import { ALL_LANGS, LANG_META, useLang, useT } from '../../i18n'
import { useSync } from '../../sync/useSync'
import type { StringKey } from '../../strings'
import { Banner, Button, Card, Field, PageHeader, inputClass } from '../components'
import { buttonClass, cx } from '../styles'
import { DEMO_CITIZEN_ID, DEMO_WORKER_ID } from '../LockGate'

export function Settings() {
  const t = useT()
  const { lang, setLang } = useLang()

  return (
    <>
      <PageHeader title={t('moreTitle')} />
      <div className="flex flex-col gap-4">
        <AccountCard />
        <ToolsCard />
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Translate size={22} className="text-neem" aria-hidden />
            {t('moreLanguage')}
          </h2>
          <div role="radiogroup" aria-label={t('moreLanguage')} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ALL_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                lang={l}
                onClick={() => setLang(l)}
                className={cx('min-h-12 rounded-[var(--radius-control)] border px-2 font-semibold text-sm', lang === l ? 'border-neem bg-neem-soft text-neem' : 'border-line')}
              >
                {LANG_META[l].label}
              </button>
            ))}
          </div>
        </Card>
        <PinCard />
        <ModelCard />
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info size={22} className="text-neem" aria-hidden />
            {t('moreAbout')}
          </h2>
          <p className="text-muted">{t('moreAboutText')}</p>
        </Card>
      </div>
    </>
  )
}

function ToolsCard() {
  const t = useT()
  const { user } = useBoot()
  const isWorker = !!user?.role && ['asha_worker', 'coordinator', 'supervisor', 'admin'].includes(user.role)
  const tools: { to: string; label: StringKey; icon: typeof Waveform }[] = [
    { to: '/saathi', label: 'saathiTitle', icon: Waveform },
    { to: '/scan/medicine', label: 'scanMedicine', icon: Pill },
    ...(isWorker ? [{ to: '/outbreak', label: 'outbreakTitle' as StringKey, icon: Pulse }] : []),
  ]
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {tools.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="flex min-h-14 items-center gap-3 px-5 font-semibold hover:bg-canvas">
              <Icon size={22} className="text-neem" aria-hidden />
              {t(label)}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function AccountCard() {
  const t = useT()
  const { user, setUserId } = useBoot()
  const { canSync } = useSync() // a signed-in account never switches to the offline demo accounts
  const isWorker = !!user?.role && ['asha_worker', 'coordinator', 'supervisor', 'admin'].includes(user.role)

  const switchAccount = async (targetId: string) => {
    if (user?.id === targetId) return
    await setUserId(targetId)
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UserCircle size={22} className="text-neem" aria-hidden />
          {user?.display_name || t('navMore')}
        </h2>
        <span
          className={cx(
            'rounded-[4px] border px-2 py-0.5 text-xs font-semibold',
            isWorker ? 'border-neem/30 bg-neem-soft text-neem' : 'border-amber-200 bg-amber-50 text-amber-900',
          )}
        >
          {isWorker ? t('role_asha_worker') : t('role_citizen')}
        </span>
      </div>
      <p className="text-sm text-muted">
        {isWorker ? t('demoWorkerDesc') : t('demoCitizenDesc')}
      </p>

      {!canSync && <div className="mt-1 flex flex-col gap-2">
        <p className="text-sm font-semibold text-muted">{t('switchAccount')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => switchAccount(DEMO_WORKER_ID)}
            className={cx(
              'flex items-center justify-between rounded-[var(--radius-control)] border p-3 text-left transition-colors',
              user?.id === DEMO_WORKER_ID
                ? 'border-neem bg-neem-soft text-neem font-semibold'
                : 'border-line bg-canvas hover:border-neem/40',
            )}
          >
            <div>
              <p className="text-sm font-semibold">Sunita Devi</p>
              <p className="text-xs opacity-75">{t('role_asha_worker')}</p>
            </div>
            {user?.id === DEMO_WORKER_ID && <CheckCircle size={18} weight="fill" className="text-neem" />}
          </button>

          <button
            type="button"
            onClick={() => switchAccount(DEMO_CITIZEN_ID)}
            className={cx(
              'flex items-center justify-between rounded-[var(--radius-control)] border p-3 text-left transition-colors',
              user?.id === DEMO_CITIZEN_ID
                ? 'border-neem bg-neem-soft text-neem font-semibold'
                : 'border-line bg-canvas hover:border-neem/40',
            )}
          >
            <div>
              <p className="text-sm font-semibold">Ramesh Kumar</p>
              <p className="text-xs opacity-75">{t('role_citizen')}</p>
            </div>
            {user?.id === DEMO_CITIZEN_ID && <CheckCircle size={18} weight="fill" className="text-neem" />}
          </button>
        </div>
      </div>}
    </Card>
  )
}

const choices: ModelChoice[] = ['auto', ...MODEL_IDS, 'online', 'off']
type Saving = { id: ModelId; fraction: number; stop: AbortController }

function ModelCard() {
  const t = useT()
  const [canRun, setCanRun] = useState<boolean | null>(null)
  const [installed, setInstalled] = useState<ModelId[]>([])
  const [choice, setChoice] = useState<ModelChoice>(getModelChoice)
  const [saving, setSaving] = useState<Saving | null>(null)
  const [error, setError] = useState<{ id: ModelId; key: StringKey } | null>(null)
  const refresh = () => void installedModels().then(setInstalled)

  useEffect(() => {
    void canRunModels().then(setCanRun)
    refresh()
  }, [])

  async function save(id: ModelId, from: 'download' | 'pick' | File) {
    const stop = new AbortController()
    setError(null)
    setSaving({ id, fraction: 0, stop })
    try {
      await saveModel(id, from, (fraction) => setSaving({ id, fraction, stop }), stop.signal)
    } catch (e) {
      if (!stop.signal.aborted) setError({ id, key: (e as Error).message === 'not-enough-space' ? 'aiNoSpace' : 'aiFailed' })
    } finally {
      setSaving(null)
      refresh()
    }
  }

  async function remove(id: ModelId) {
    await unloadModel(id)
    await removeModel(id)
    refresh()
  }

  const label = (c: ModelChoice) => (c === 'auto' ? t('aiAuto') : c === 'off' ? t('aiOff') : c === 'online' ? t('aiOnline') : MODELS[c].name.replace(' E2B', ''))

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Cpu size={22} className="text-neem" aria-hidden />
          {t('aiTitle')}
        </h2>
        <p className="text-muted">{t('aiIntro')}</p>
      </div>
      {canRun === false && <Banner tone="caution" icon={<Warning size={20} />}>{t('aiNoWebGpu')}</Banner>}

      <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line">
        {MODEL_IDS.map((id) => {
          const m = MODELS[id]
          const busy = saving?.id === id
          const has = installed.includes(id)
          return (
            <li key={id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="font-semibold">{m.name}</h3>
                {has ? (
                  <span className="flex items-center gap-1 text-sm font-semibold text-ok">
                    <CheckCircle size={18} weight="fill" aria-hidden />
                    {t('aiOnDevice')}
                  </span>
                ) : (
                  <span className="text-sm text-muted tabular-nums">{t('aiSize', { size: (m.bytes / 1e9).toFixed(1) })}</span>
                )}
              </div>
              {busy ? (
                <div className="flex items-center gap-3">
                  <progress value={saving.fraction} aria-label={m.name} className="h-2 flex-1 accent-neem" />
                  <span className="text-sm tabular-nums" role="status">{t('aiProgress', { n: Math.floor(saving.fraction * 100) })}</span>
                  <Button variant="ghost" onClick={() => saving.stop.abort()}>{t('aiCancel')}</Button>
                </div>
              ) : has ? (
                <Button variant="ghost" className="w-fit" onClick={() => void remove(id)} aria-label={`${t('aiDelete')}: ${m.name}`}>
                  <Trash size={18} aria-hidden />
                  {t('aiDelete')}
                </Button>
              ) : (
                <>
                  {!m.url && <p className="text-[15px] text-muted">{t('aiGated')}</p>}
                  <div className="flex flex-wrap gap-2">
                    {m.url ? (
                      <Button disabled={!!saving} onClick={() => void save(id, 'download')}>
                        <DownloadSimple size={18} aria-hidden />
                        {t('aiDownload')}
                      </Button>
                    ) : (
                      <a href={m.page} target="_blank" rel="noreferrer" className={buttonClass('secondary')}>
                        <ArrowSquareOut size={18} aria-hidden />
                        {t('aiOpenHf')}
                      </a>
                    )}
                    <label
                      className={cx(
                        m.url ? 'flex min-h-11 w-full items-center gap-1.5 text-sm font-semibold text-neem' : buttonClass('primary'),
                        'cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neem',
                        saving && 'pointer-events-none opacity-40',
                      )}
                    >
                      <FolderOpen size={18} aria-hidden />
                      {t(m.url ? 'aiHaveFile' : 'aiChooseFile')}
                      <input
                        type="file"
                        accept=".litertlm"
                        className="sr-only"
                        aria-label={`${t('aiChooseFile')}: ${m.name}`}
                        disabled={!!saving}
                        onClick={(e) => {
                          if (!Capacitor.isNativePlatform()) return
                          e.preventDefault()
                          void save(id, 'pick')
                        }}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.target.value = ''
                          if (f) void save(id, f)
                        }}
                      />
                    </label>
                  </div>
                </>
              )}
              {error?.id === id && <p role="alert" className="text-sm text-danger">{t(error.key)}</p>}
            </li>
          )
        })}
      </ul>

      <div role="radiogroup" aria-label={t('aiUse')} className="flex flex-col gap-2">
        <p className="font-semibold">{t('aiUse')}</p>
        <div className="grid grid-cols-2 gap-2">
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={choice === c}
              onClick={() => {
                setChoice(c)
                setModelChoice(c)
              }}
              className={cx('min-h-12 rounded-[var(--radius-control)] border px-3 font-semibold', choice === c ? 'border-neem bg-neem-soft text-neem' : 'border-line')}
            >
              {label(c)}
            </button>
          ))}
        </div>
        {choice === 'online' && <p className="text-sm text-muted">{t('aiOnlineNote')}</p>}
      </div>
    </Card>
  )
}

function PinCard() {
  const t = useT()
  const { changePin } = useSync()
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{4,6}$/.test(newPin)) {
      setStatus({ kind: 'error', message: t('pinInvalid') })
      return
    }
    if (newPin !== confirmPin) {
      setStatus({ kind: 'error', message: t('pinMismatch') })
      return
    }
    setBusy(true)
    try {
      await changePin(newPin)
      setStatus({ kind: 'success', message: t('pinSaved') })
      setNewPin('')
      setConfirmPin('')
    } catch {
      setStatus({ kind: 'error', message: t('pinInvalid') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <LockKey size={22} className="text-neem" aria-hidden />
        {t('securityTitle')}
      </h2>
      <p className="text-sm text-muted">{t('pinCreateHint')}</p>
      {status && (
        <Banner tone={status.kind === 'error' ? 'danger' : 'ok'}>
          {status.message}
        </Banner>
      )}
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <Field label={t('pin')}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={newPin}
            onChange={(e) => {
              setNewPin(e.target.value.replace(/\D/g, ''))
              setStatus(null)
            }}
            className={inputClass}
          />
        </Field>
        <Field label={t('pinConfirm')}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmPin}
            onChange={(e) => {
              setConfirmPin(e.target.value.replace(/\D/g, ''))
              setStatus(null)
            }}
            className={inputClass}
          />
        </Field>
        <Button type="submit" disabled={busy || !newPin || !confirmPin} className="self-start">
          {t('changePin')}
        </Button>
      </form>
    </Card>
  )
}
