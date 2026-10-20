'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ChatCircleText, Check, FileText, Info, PencilSimple, Question, SpeakerHigh, Stop, Trash } from '@phosphor-icons/react'
import { useApp } from '@/app-context'
import { deleteReport, getReport, readResults } from '@/data/reports'
import type { RangeResult } from '@/domain/labs'
import { useLang, useT } from '@/i18n'
import { removeFile } from '@/platform/files'
import { canSpeak, speak, stopSpeaking } from '@/platform/speech'
import { Banner, Button, Card, Chip, EmptyState, LinkButton, PageHeader, type Tone } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'

const resultUi: Record<RangeResult['status'], { tone: Tone; icon: typeof Check; key: 'low' | 'normal' | 'high' | 'unknownResult' }> = {
  low: { tone: 'caution', icon: ArrowDown, key: 'low' },
  normal: { tone: 'ok', icon: Check, key: 'normal' },
  high: { tone: 'danger', icon: ArrowUp, key: 'high' },
  unknown: { tone: 'info', icon: Question, key: 'unknownResult' },
}

const rangeText = (r: Extract<RangeResult, { low: number | null }>) => (r.low !== null && r.high !== null ? `${r.low} - ${r.high}` : r.high !== null ? `< ${r.high}` : `> ${r.low}`)

function Results() {
  const t = useT()
  const { lang } = useLang()
  const router = useRouter()
  const { db } = useApp()
  const id = useSearchParams().get('id') ?? ''
  const [speaking, setSpeaking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [can, setCan] = useState(false)
  useEffect(() => {
    setCan(canSpeak())
    return () => void stopSpeaking()
  }, [])
  const { data: report, loading } = useAsync((d) => getReport(d, id), [id])

  if (loading) return null
  if (!report) return <EmptyState icon={<FileText size={32} />} title={t('ocrFailed')} action={<LinkButton href="/reports/" variant="secondary">{t('back')}</LinkButton>} />

  const rows = readResults(report.fields, report.profile_sex, lang).map((r) => ({
    ...r,
    explanation: r.explanation ?? (!r.field.test_id ? t('unknownTest') : r.result.status === 'unknown' && r.result.reason === 'value' ? t('unknownValue') : t('unknownUnit')),
  }))
  const outside = rows.filter((r) => r.result.status === 'low' || r.result.status === 'high').length
  const summary = outside ? t('needAttention', { n: outside }) : t('allNormal')

  function toggleSpeak() {
    if (speaking) {
      stopSpeaking()
      return setSpeaking(false)
    }
    setSpeaking(true)
    speak([summary, ...rows.map((r) => `${r.name}: ${r.field.value} ${r.field.unit}. ${r.explanation}`)].join('\n'), lang, () => setSpeaking(false))
  }

  async function remove() {
    await deleteReport(db, report!.id)
    await removeFile(report!.id)
    router.replace('/reports/')
  }

  return (
    <>
      <PageHeader
        title={t('resultsTitle')}
        back={{ href: '/reports/', label: t('reportsTitle') }}
        action={
          <LinkButton href={`/reports/review/?id=${report.id}`} variant="ghost" className="-mr-3 px-3">
            <PencilSimple size={18} aria-hidden />
            {t('editValues')}
          </LinkButton>
        }
      />
      <div className="flex flex-col gap-5">
        {report.profile_name && <p className="-mt-4 text-muted">{t('reportOf', { name: report.profile_name })}</p>}
        <Banner tone="info" icon={<Info size={20} />}>{t('scanDisclaimer')}</Banner>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xl font-semibold">{summary}</p>
          {can && (
            <Button variant="secondary" onClick={toggleSpeak} aria-pressed={speaking}>
              {speaking ? <Stop size={20} aria-hidden /> : <SpeakerHigh size={20} aria-hidden />}
              {t(speaking ? 'stop' : 'readAloud')}
            </Button>
          )}
        </div>

        <ol className="flex flex-col gap-3">
          {rows.map(({ field: f, name, result, explanation }, i) => {
            const ui = resultUi[result.status]
            return (
              <li key={i}>
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{name}</p>
                    <Chip tone={ui.tone} icon={<ui.icon size={14} weight="bold" />}>{t(ui.key)}</Chip>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">
                    {f.value} <span className="text-base font-medium text-muted">{f.unit}</span>
                  </p>
                  {'low' in result && (
                    <p className="text-sm text-muted">
                      {t('usualRange', { range: rangeText(result) })}, {t(result.rangeSource === 'report' ? 'rangeFromReport' : 'rangeFromTable')}
                    </p>
                  )}
                  <p>{explanation}</p>
                </Card>
              </li>
            )
          })}
        </ol>

        <LinkButton href={`/chat/?report=${report.id}`}>
          <ChatCircleText size={20} aria-hidden />
          {t('askAboutReport')}
        </LinkButton>
        <p className="text-sm text-muted">{t('demoContent')}</p>

        <div className="border-t border-line pt-4">
          {confirmDelete ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => void remove()}>
                <Trash size={18} aria-hidden />
                {t('deleteReport')}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t('cancel')}</Button>
            </div>
          ) : (
            <Button variant="ghost" className="-ml-3 px-3 text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash size={18} aria-hidden />
              {t('deleteReport')}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

export default function ResultsPage() {
  return (
    <Suspense>
      <Results />
    </Suspense>
  )
}
