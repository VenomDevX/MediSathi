import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CaretRight, FirstAidKit, MagnifyingGlass, Phone, SpeakerHigh, Stop, Warning } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { getGuidance, searchGuidance } from '../../data/guidance'
import { matchEmergency } from '../../domain/emergency'
import { emergencyRules } from '../../emergencyRules'
import { useFormatDate, useLang, useT } from '../../i18n'
import { canSpeak, speak, stopSpeaking } from '../../platform/speech'
import { Button, EmptyState, LinkButton, PageHeader, inputClass } from '../components'
import { useAsync } from '../useAsync'

export function GuidanceList() {
  const t = useT()
  const { lang } = useLang()
  const { db } = useApp()
  const [query, setQuery] = useState('')
  const { data: items } = useAsync(() => searchGuidance(db, query, lang), [db, query, lang])
  // HG-06: deterministic red-flag check runs on every query, before any result is shown.
  const emergency = matchEmergency(emergencyRules, query)

  return (
    <>
      <PageHeader title={t('navGuidance')} />
      <div className="relative mb-4">
        <MagnifyingGlass size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          name="search"
          autoComplete="off"
          aria-label={t('searchGuidance')}
          placeholder={t('searchGuidance')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputClass} pl-11`}
        />
      </div>

      {emergency && (
        <section role="alert" className="mb-4 flex flex-col gap-3 rounded-[var(--radius-card)] border-2 border-danger bg-danger-bg p-4 text-danger">
          <p className="flex items-center gap-2 text-lg font-bold">
            <Warning size={24} weight="bold" aria-hidden />
            {t('emergencyDetected')}: {emergency.title[lang]}
          </p>
          <p className="text-ink">{emergency.instruction[lang]}</p>
          <div className="flex flex-wrap gap-3">
            <a href="tel:108" className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] bg-danger px-5 font-semibold text-surface hover:opacity-90">
              <Phone size={20} weight="fill" aria-hidden />
              {t('call', { n: 108 })}
            </a>
            <LinkButton to={`/emergency?rule=${emergency.id}`} variant="secondary">{t('openEmergency')}</LinkButton>
          </div>
        </section>
      )}

      {items && items.length === 0 ? (
        <EmptyState icon={<FirstAidKit size={32} />} title={t('noGuidance')} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {items?.map((g) => (
            <li key={g.id}>
              <Link to={`/guidance/${g.id}`} lang={g.language} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{g.title}</p>
                  <p className="line-clamp-2 text-sm text-muted">{g.summary}</p>
                </div>
                <CaretRight size={18} className="shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function GuidanceDetail() {
  const t = useT()
  const fmt = useFormatDate()
  const { id = '' } = useParams()
  const { db } = useApp()
  const [speaking, setSpeaking] = useState(false)
  const { data: g, loading } = useAsync(() => getGuidance(db, id), [db, id])

  if (loading) return null
  if (!g) return <EmptyState icon={<FirstAidKit size={32} />} title={t('guidanceNotFound')} action={<LinkButton to="/guidance" variant="secondary">{t('back')}</LinkButton>} />
  const steps = g.content.split('\n').filter(Boolean)

  function toggleSpeak() {
    if (speaking) {
      stopSpeaking()
      return setSpeaking(false)
    }
    setSpeaking(true)
    speak([g!.title, ...steps, g!.limitations].join('\n'), g!.language, () => setSpeaking(false))
  }

  return (
    <article lang={g.language}>
      <PageHeader title={g.title} back={{ to: '/guidance', label: t('navGuidance') }} />
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted">{g.summary}</p>
          {canSpeak() && (
            <Button variant="secondary" onClick={toggleSpeak} aria-pressed={speaking}>
              {speaking ? <Stop size={20} aria-hidden /> : <SpeakerHigh size={20} aria-hidden />}
              {t(speaking ? 'stop' : 'readAloud')}
            </Button>
          )}
        </div>

        <section aria-labelledby="steps">
          <h2 id="steps" className="mb-3 text-xl font-semibold">{t('whatToDo')}</h2>
          <ol className="flex flex-col gap-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ok-bg font-semibold text-neem tabular-nums" aria-hidden>{i + 1}</span>
                <p className="pt-0.5">{s}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="rounded-[var(--radius-card)] bg-caution-bg p-4 text-caution">
          <p className="font-semibold">{t('limitations')}</p>
          <p>{g.limitations}</p>
        </div>

        <section aria-labelledby="about" className="text-sm text-muted">
          <h2 id="about" className="mb-2 font-semibold text-ink">{t('aboutThisAdvice')}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt>{t('source')}</dt>
            <dd>{g.source_name}</dd>
            <dt>{t('reviewStatus')}</dt>
            <dd>{g.reviewed && g.reviewed_at ? t('reviewedOn', { date: fmt(g.reviewed_at) }) : t('notReviewed')}</dd>
            <dt>{t('version')}</dt>
            <dd>{g.version}</dd>
            <dt>{t('audience')}</dt>
            <dd>{g.audience}</dd>
          </dl>
        </section>
      </div>
    </article>
  )
}
