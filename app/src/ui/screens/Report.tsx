import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, FileText, Info, PencilSimple, Plus, Question, SpeakerHigh, Stop, Trash, WarningCircle } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { getPatient, listPatients } from '../../data/records'
import { getReport, updateReportFields } from '../../data/reports'
import { checkRange, type RangeResult, type ReportField } from '../../domain/labs'
import { useLang, useT } from '../../i18n'
import { labCatalogue, labTest } from '../../labCatalogue'
import { readFile, safeTypeFor } from '../../platform/files'
import { canSpeak, speak, stopSpeaking } from '../../platform/speech'
import { Banner, Button, Card, Chip, EmptyState, Field, LinkButton, PageHeader, inputClass, type Tone } from '../components'
import { useAsync } from '../useAsync'

const testName = (f: ReportField, lang: 'hi' | 'en') => {
  const test = labTest(f.test_id)
  return test ? (lang === 'hi' ? test.name_hi : test.canonical_name) : f.name
}

function useOriginalUrl(id: string, fileName: string) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let u: string | undefined
    const type = safeTypeFor(fileName)
    // Rebuild the blob with a fixed allowlisted type so the browser can never treat it as HTML or SVG.
    readFile(id).then((f) => f && type && setUrl((u = URL.createObjectURL(new Blob([f], { type })))))
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [id, fileName])
  return url
}

export function ReportReview() {
  const t = useT()
  const { id = '' } = useParams()
  const { db, user } = useApp()
  const { data, loading } = useAsync(async () => ({ report: await getReport(db, id), patients: await listPatients(db, user, '') }), [db, user, id])
  if (loading) return null
  if (!data?.report) return <EmptyState icon={<FileText size={32} />} title={t('ocrFailed')} action={<LinkButton to="/scan" variant="secondary">{t('back')}</LinkButton>} />
  return <ReviewForm key={data.report.id} report={data.report} patients={data.patients} />
}

function ReviewForm({ report, patients }: { report: NonNullable<Awaited<ReturnType<typeof getReport>>>; patients: Awaited<ReturnType<typeof listPatients>> }) {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const { db } = useApp()
  const original = useOriginalUrl(report.id, report.file_name)
  const [fields, setFields] = useState(report.fields)
  const [patientId, setPatientId] = useState(report.patient_id ?? '')
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [unchecked, setUnchecked] = useState(0)
  const list = useRef<HTMLOListElement>(null)

  // Editing a flagged value counts as checking it.
  const update = (i: number, k: keyof ReportField, v: string) => setFields(fields.map((f, j) => (j === i ? { ...f, [k]: v, uncertain: false } : f)))
  const markChecked = (i: number) => setFields(fields.map((f, j) => (j === i ? { ...f, uncertain: false } : f)))

  function addTest() {
    const test = labTest(adding)
    if (!test) return
    setFields([...fields, { test_id: test.id, name: test.canonical_name, value: '', unit: test.unit, range_low: '', range_high: '', uncertain: false, raw: '' }])
    setAdding('')
  }

  async function confirm() {
    // PRD MS-04/MS-08: flagged values are never treated as verified until a person checks them.
    const flagged = fields.filter((f) => f.uncertain).length
    setUnchecked(flagged)
    if (flagged) {
      const i = fields.findIndex((f) => f.uncertain)
      return list.current?.querySelector<HTMLInputElement>(`input[name="value-${i}"]`)?.focus()
    }
    setBusy(true)
    await updateReportFields(db, report.id, fields.filter((f) => f.value.trim()), patientId || null)
    nav(`/scan/${report.id}`, { replace: true })
  }

  return (
    <>
      <PageHeader title={t('reviewTitle')} back={{ to: '/scan', label: t('navScan') }} />
      <div className="flex flex-col gap-5">
        <p className="text-muted">{t('reviewHint')}</p>
        {original && (
          <details className="rounded-[var(--radius-card)] border border-line bg-surface">
            <summary className="min-h-12 cursor-pointer px-4 py-3 font-medium">{t('originalFile')}</summary>
            {report.file_name.toLowerCase().endsWith('.pdf') ? (
              <a href={original} target="_blank" rel="noreferrer" className="block px-4 pb-4 text-neem underline">{report.file_name}</a>
            ) : (
              <img src={original} alt={report.file_name} className="w-full rounded-b-[var(--radius-card)]" />
            )}
          </details>
        )}

        {fields.length === 0 && <Banner tone="caution" icon={<WarningCircle size={20} />}>{t('noTestsFound')}</Banner>}

        <ol ref={list} className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={i}>
              <Card className={`flex flex-col gap-3 p-4 ${f.uncertain ? 'border-caution' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{testName(f, lang)}</p>
                    {f.raw && <p className="truncate text-sm text-muted" translate="no">{f.raw}</p>}
                  </div>
                  <Button variant="ghost" onClick={() => setFields(fields.filter((_, j) => j !== i))} className="-my-2 -mr-3 min-h-11 px-3 text-[15px] text-danger" aria-label={`${t('removeTest')}: ${testName(f, lang)}`}>
                    <Trash size={18} aria-hidden />
                  </Button>
                </div>
                {f.uncertain && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Chip tone="caution" icon={<WarningCircle size={16} weight="bold" />}>{t('checkThis')}</Chip>
                    <Button variant="secondary" onClick={() => markChecked(i)} className="min-h-11 px-3 text-[15px]">
                      <Check size={18} aria-hidden />
                      {t('valueIsCorrect')}
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('value')}>
                    <input name={`value-${i}`} autoComplete="off" inputMode="decimal" value={f.value} onChange={(e) => update(i, 'value', e.target.value)} className={`${inputClass} tabular-nums`} />
                  </Field>
                  <Field label={t('unit')}>
                    <input name={`unit-${i}`} autoComplete="off" spellCheck={false} value={f.unit} onChange={(e) => update(i, 'unit', e.target.value)} className={inputClass} />
                  </Field>
                  <Field label={t('rangeLow')}>
                    <input name={`low-${i}`} autoComplete="off" inputMode="decimal" value={f.range_low} onChange={(e) => update(i, 'range_low', e.target.value)} className={`${inputClass} tabular-nums`} />
                  </Field>
                  <Field label={t('rangeHigh')}>
                    <input name={`high-${i}`} autoComplete="off" inputMode="decimal" value={f.range_high} onChange={(e) => update(i, 'range_high', e.target.value)} className={`${inputClass} tabular-nums`} />
                  </Field>
                </div>
              </Card>
            </li>
          ))}
        </ol>

        <div className="flex gap-3">
          <select aria-label={t('chooseTest')} value={adding} onChange={(e) => setAdding(e.target.value)} className={`${inputClass} flex-1`}>
            <option value="">{t('chooseTest')}</option>
            {labCatalogue.map((c) => (
              <option key={c.id} value={c.id}>{lang === 'hi' ? c.name_hi : c.canonical_name}</option>
            ))}
          </select>
          <Button variant="secondary" onClick={addTest} disabled={!adding}>
            <Plus size={20} aria-hidden />
            {t('addTest')}
          </Button>
        </div>

        <Field label={t('reportFor')} hint={t('reportForHint')}>
          <select name="patient" value={patientId} onChange={(e) => setPatientId(e.target.value)} className={inputClass}>
            <option value="">{t('notLinked')}</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}{p.village ? `, ${p.village}` : ''}</option>
            ))}
          </select>
        </Field>

        {report.ocr_text && (
          <details className="text-sm text-muted">
            <summary className="min-h-11 cursor-pointer py-2.5">{t('extractedText')}</summary>
            <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-surface p-3 font-sans whitespace-pre-wrap" translate="no">{report.ocr_text}</pre>
          </details>
        )}

        {unchecked > 0 && fields.some((f) => f.uncertain) && (
          <Banner tone="caution" icon={<WarningCircle size={20} />}>{t('stillUnchecked', { n: fields.filter((f) => f.uncertain).length })}</Banner>
        )}
        <Button onClick={confirm} disabled={busy || fields.every((f) => !f.value.trim())}>
          <Check size={20} aria-hidden />
          {t('confirmValues')}
        </Button>
      </div>
    </>
  )
}

const resultUi: Record<'low' | 'normal' | 'high' | 'unknown', { tone: Tone; icon: typeof Check; key: 'low' | 'normal' | 'high' | 'unknownResult' }> = {
  low: { tone: 'caution', icon: ArrowDown, key: 'low' },
  normal: { tone: 'ok', icon: Check, key: 'normal' },
  high: { tone: 'danger', icon: ArrowUp, key: 'high' },
  unknown: { tone: 'info', icon: Question, key: 'unknownResult' },
}

export function ReportResults() {
  const t = useT()
  const { lang } = useLang()
  const { id = '' } = useParams()
  const { db, user } = useApp()
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => () => void stopSpeaking(), [])
  const { data, loading } = useAsync(async () => {
    const report = await getReport(db, id)
    const patient = report?.patient_id ? await getPatient(db, user, report.patient_id) : undefined
    return { report, sex: patient?.sex ?? null }
  }, [db, user, id])

  if (loading) return null
  if (!data?.report) return <EmptyState icon={<FileText size={32} />} title={t('ocrFailed')} />
  const { report, sex } = data

  const rows = report.fields.map((f) => {
    const test = labTest(f.test_id)
    const result: RangeResult = test ? checkRange(test, f, sex) : { status: 'unknown', reason: 'unit' }
    const explanation =
      !test ? t('unknownTest')
      : result.status === 'unknown' ? t(result.reason === 'value' ? 'unknownValue' : 'unknownUnit')
      : test.explain[result.status][lang]
    return { f, test, result, explanation }
  })
  const outside = rows.filter((r) => r.result.status === 'low' || r.result.status === 'high').length
  const summary = outside ? t('needAttention', { n: outside }) : t('allNormal')

  function toggleSpeak() {
    if (speaking) {
      stopSpeaking()
      return setSpeaking(false)
    }
    const text = [summary, ...rows.map((r) => `${testName(r.f, lang)}: ${r.f.value} ${r.f.unit}. ${r.explanation}`)].join('\n')
    setSpeaking(true)
    speak(text, lang, () => setSpeaking(false))
  }

  const range = (r: Extract<RangeResult, { low: number | null }>) => (r.low !== null && r.high !== null ? `${r.low} - ${r.high}` : r.high !== null ? `< ${r.high}` : `> ${r.low}`)

  return (
    <>
      <PageHeader
        title={t('resultsTitle')}
        back={{ to: '/scan', label: t('navScan') }}
        action={
          <LinkButton to={`/scan/${report.id}/review`} variant="ghost" className="-mr-3 px-3">
            <PencilSimple size={18} aria-hidden />
            {t('editValues')}
          </LinkButton>
        }
      />
      <div className="flex flex-col gap-5">
        <Banner tone="info" icon={<Info size={20} />}>{t('scanDisclaimer')}</Banner>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xl font-semibold">{summary}</p>
          {canSpeak() && (
            <Button variant="secondary" onClick={toggleSpeak} aria-pressed={speaking}>
              {speaking ? <Stop size={20} aria-hidden /> : <SpeakerHigh size={20} aria-hidden />}
              {t(speaking ? 'stop' : 'readAloud')}
            </Button>
          )}
        </div>

        <ol className="flex flex-col gap-3">
          {rows.map(({ f, result, explanation }, i) => {
            const ui = resultUi[result.status]
            return (
              <li key={i}>
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{testName(f, lang)}</p>
                    <Chip tone={ui.tone} icon={<ui.icon size={14} weight="bold" />}>{t(ui.key)}</Chip>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">
                    {f.value} <span className="text-base font-medium text-muted">{f.unit}</span>
                  </p>
                  {'low' in result && (
                    <p className="text-sm text-muted">
                      {t('usualRange', { range: range(result) })}, {t(result.rangeSource === 'report' ? 'rangeFromReport' : 'rangeFromTable')}
                    </p>
                  )}
                  <p>{explanation}</p>
                </Card>
              </li>
            )
          })}
        </ol>
        <p className="text-sm text-muted">{t('demoContent')}</p>
      </div>
    </>
  )
}
