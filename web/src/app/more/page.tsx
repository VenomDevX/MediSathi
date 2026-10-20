'use client'
import { useEffect, useState } from 'react'
import { ArrowClockwise, Cpu, Info, Translate } from '@phosphor-icons/react'
import { chooseModel, getModelChoice, ollamaStatus, setModelChoice, GEMMA_MODELS, type ModelChoice } from '@/assistant/ollama'
import { useLang, useT } from '@/i18n'
import { Card, PageHeader, cx } from '@/ui/components'

export default function More() {
  const t = useT()
  const { lang, setLang } = useLang()

  return (
    <>
      <PageHeader title={t('moreTitle')} />
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Translate size={22} className="text-neel" aria-hidden />
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
                className={cx('min-h-12 rounded-[var(--radius-control)] border font-semibold', lang === l ? 'border-neel bg-neel-soft text-neel' : 'border-line')}
              >
                {l === 'hi' ? 'हिंदी' : 'English'}
              </button>
            ))}
          </div>
        </Card>
        <ModelCard />
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info size={22} className="text-neel" aria-hidden />
            {t('moreAbout')}
          </h2>
          <p className="text-muted">{t('moreAboutText')}</p>
        </Card>
      </div>
    </>
  )
}

const choices: ModelChoice[] = ['auto', ...GEMMA_MODELS, 'off']

function ModelCard() {
  const t = useT()
  const [status, setStatus] = useState<Awaited<ReturnType<typeof ollamaStatus>> | null>(null)
  const [choice, setChoice] = useState<ModelChoice>('auto')
  const check = () => {
    setStatus(null)
    void ollamaStatus().then(setStatus)
  }
  useEffect(() => {
    setChoice(getModelChoice())
    check()
  }, [])

  const active = status && chooseModel(choice, status.models)
  const size = (m: string) => m.slice('gemma3n:'.length).toUpperCase()
  const label = (c: ModelChoice) => (c === 'auto' ? t('aiAuto') : c === 'off' ? t('aiOff') : `Gemma ${size(c)}`)

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Cpu size={22} className="text-neel" aria-hidden />
          {t('aiTitle')}
        </h2>
        <p className="text-muted">{t('aiIntro')}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className={cx('size-2.5 rounded-full', !status ? 'bg-line' : active ? 'bg-ok' : 'bg-caution')} />
          {!status ? t('aiChecking') : active ? t('aiReady', { model: `Gemma 3n ${size(active)}` }) : choice === 'off' ? t('aiOff') : status.running ? t('aiNoModel') : t('aiNotRunning')}
        </p>
        <button type="button" onClick={check} className="-mx-3 flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-3 font-semibold text-neel hover:bg-neel-soft">
          <ArrowClockwise size={18} aria-hidden />
          {t('aiCheckAgain')}
        </button>
      </div>

      <div role="radiogroup" aria-label={t('aiUse')} className="grid grid-cols-2 gap-2">
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
            className={cx('min-h-12 rounded-[var(--radius-control)] border px-3 font-semibold', choice === c ? 'border-neel bg-neel-soft text-neel' : 'border-line')}
          >
            {label(c)}
          </button>
        ))}
      </div>

      <details open={!!status && !status.models.length} className="group rounded-[var(--radius-control)] bg-canvas px-4 py-3">
        <summary className="min-h-8 cursor-pointer font-semibold">{t('aiSetup')}</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-[15px]">
          <li>{t('aiStep1')}</li>
          <li>
            {t('aiStep2')}
            <code className="mt-1 block w-fit rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm" translate="no">ollama pull gemma3n:e2b</code>
          </li>
          <li>
            {t('aiStep3')}
            <code className="mt-1 block w-fit rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm" translate="no">ollama pull gemma3n:e4b</code>
          </li>
        </ol>
      </details>
    </Card>
  )
}
