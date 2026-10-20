'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { FirstAidKit, SpeakerHigh, Stop } from '@phosphor-icons/react'
import { getGuidance } from '@/data/guidance'
import { useT } from '@/i18n'
import { canSpeak, speak, stopSpeaking } from '@/platform/speech'
import { Button, EmptyState, LinkButton, PageHeader } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'

function GuidanceView() {
  const t = useT()
  const id = useSearchParams().get('id') ?? ''
  const [speaking, setSpeaking] = useState(false)
  const [speech, setSpeech] = useState(false)
  useEffect(() => setSpeech(canSpeak()), [])
  const { data: g, loading } = useAsync((db) => getGuidance(db, id), [id])

  if (loading) return null
  if (!g) return <EmptyState icon={<FirstAidKit size={32} />} title={t('notFound')} action={<LinkButton href="/first-aid/" variant="secondary">{t('back')}</LinkButton>} />
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
      <PageHeader title={g.title} back={{ href: '/first-aid/', label: t('firstAidTitle') }} />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted">{g.summary}</p>
          {speech && (
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neel-soft font-semibold text-neel tabular-nums" aria-hidden>{i + 1}</span>
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
            <dd>{g.reviewed ? g.reviewed_at : t('notReviewed')}</dd>
          </dl>
        </section>
      </div>
    </article>
  )
}

export default function GuidancePage() {
  return (
    <Suspense>
      <GuidanceView />
    </Suspense>
  )
}
