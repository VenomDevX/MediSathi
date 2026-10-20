import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { ArrowSquareOut, CheckCircle, Cpu, DownloadSimple, FolderOpen, Info, Translate, Trash, Warning } from '@phosphor-icons/react'
import { canRunModels, getModelChoice, setModelChoice, unloadModel, type ModelChoice } from '../../assistant/litert'
import { installedModels, MODEL_IDS, MODELS, removeModel, saveModel, type ModelId } from '../../assistant/modelFiles'
import { useLang, useT } from '../../i18n'
import type { StringKey } from '../../strings'
import { Banner, Button, Card, PageHeader, buttonClass, cx } from '../components'

export function Settings() {
  const t = useT()
  const { lang, setLang } = useLang()

  return (
    <>
      <PageHeader title={t('moreTitle')} />
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Translate size={22} className="text-neem" aria-hidden />
            {t('moreLanguage')}
          </h2>
          <div role="radiogroup" aria-label={t('moreLanguage')} className="grid grid-cols-2 gap-2">
            {(['hi', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                lang={l}
                onClick={() => setLang(l)}
                className={cx('min-h-12 rounded-[var(--radius-control)] border font-semibold', lang === l ? 'border-neem bg-neem-soft text-neem' : 'border-line')}
              >
                {l === 'hi' ? 'हिंदी' : 'English'}
              </button>
            ))}
          </div>
        </Card>
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

const choices: ModelChoice[] = ['auto', ...MODEL_IDS, 'off']
type Saving = { id: ModelId; fraction: number; stop: AbortController }

function ModelCard() {
  const t = useT()
  const [canRun, setCanRun] = useState<boolean | null>(null)
  const [installed, setInstalled] = useState<ModelId[]>([])
  const [choice, setChoice] = useState<ModelChoice>('auto')
  const [saving, setSaving] = useState<Saving | null>(null)
  const [error, setError] = useState<{ id: ModelId; key: StringKey } | null>(null)
  const refresh = () => void installedModels().then(setInstalled)

  useEffect(() => {
    setChoice(getModelChoice())
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

  const label = (c: ModelChoice) => (c === 'auto' ? t('aiAuto') : c === 'off' ? t('aiOff') : MODELS[c].name.replace(' E2B', ''))

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
      </div>
    </Card>
  )
}
