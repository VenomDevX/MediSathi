'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Check, FileText, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import { useApp } from '@/app-context'
import { listProfiles, type Profile } from '@/data/family'
import { confirmReport, getReport, type Report } from '@/data/reports'
import type { ReportField } from '@/domain/labs'
import { useLang, useT } from '@/i18n'
import { labCatalogue, labTest } from '@/labCatalogue'
import { readFile, safeTypeFor } from '@/platform/files'
import { Banner, Button, Card, Chip, EmptyState, Field, LinkButton, PageHeader, cx, inputClass } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'

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
    void readFile(id).then((f) => f && type && setUrl((u = URL.createObjectURL(new Blob([f], { type })))))
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [id, fileName])
  return url
}

function Review() {
  const t = useT()
  const id = useSearchParams().get('id') ?? ''
  const { data, loading } = useAsync(async (db) => ({ report: await getReport(db, id), people: await listProfiles(db) }), [id])
  if (loading) return null
  if (!data?.report)
    return <EmptyState icon={<FileText size={32} />} title={t('ocrFailed')} action={<LinkButton href="/reports/" variant="secondary">{t('back')}</LinkButton>} />
  return <ReviewForm key={data.report.id} report={data.report} people={data.people} />
}

function ReviewForm({ report, people }: { report: Report; people: Profile[] }) {
  const t = useT()
  const { lang } = useLang()
  const router = useRouter()
  const { db } = useApp()
  const original = useOriginalUrl(report.id, report.file_name)
  const [fields, setFields] = useState(report.fields)
  const [profileId, setProfileId] = useState(report.profile_id ?? '')
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [triedConfirm, setTriedConfirm] = useState(false)
  const list = useRef<HTMLOListElement>(null)
  const flagged = fields.filter((f) => f.uncertain).length

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
    // Flagged values are never treated as checked until a person looks at them.
    setTriedConfirm(true)
    if (flagged) {
      const i = fields.findIndex((f) => f.uncertain)
      return list.current?.querySelector<HTMLInputElement>(`input[name="value-${i}"]`)?.focus()
    }
    setBusy(true)
    await confirmReport(db, report.id, fields.filter((f) => f.value.trim()), profileId || null)
    router.replace(`/reports/view/?id=${report.id}`)
  }

  return (
    <>
      <PageHeader title={t('reviewTitle')} back={{ href: '/reports/', label: t('reportsTitle') }} />
      <div className="flex flex-col gap-5">
        <p className="text-muted">{t('reviewHint')}</p>
        {original && (
          <details className="rounded-[var(--radius-card)] border border-line bg-surface">
            <summary className="min-h-12 cursor-pointer px-4 py-3 font-medium">{t('originalFile')}</summary>
            {report.file_name.toLowerCase().endsWith('.pdf') ? (
              <a href={original} target="_blank" rel="noreferrer" className="block px-4 pb-4 text-neel underline">{report.file_name}</a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob, not an optimisable asset
              <img src={original} alt={report.file_name} className="w-full rounded-b-[var(--radius-card)]" />
            )}
          </details>
        )}

        {fields.length === 0 && <Banner tone="caution" icon={<WarningCircle size={20} />}>{t('noTestsFound')}</Banner>}

        <ol ref={list} className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={i}>
              <Card className={cx('flex flex-col gap-3 p-4', f.uncertain && 'outline-2 outline-caution')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{testName(f, lang)}</p>
                    {f.raw && <p className="truncate text-sm text-muted" translate="no">{f.raw}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setFields(fields.filter((_, j) => j !== i))}
                    className="-my-2 -mr-3 min-h-11 px-3 text-danger"
                    aria-label={`${t('removeTest')}: ${testName(f, lang)}`}
                  >
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
                    <input name={`value-${i}`} autoComplete="off" inputMode="decimal" value={f.value} onChange={(e) => update(i, 'value', e.target.value)} className={cx(inputClass, 'tabular-nums')} />
                  </Field>
                  <Field label={t('unit')}>
                    <input name={`unit-${i}`} autoComplete="off" spellCheck={false} value={f.unit} onChange={(e) => update(i, 'unit', e.target.value)} className={inputClass} />
                  </Field>
                  <Field label={t('rangeLow')}>
                    <input name={`low-${i}`} autoComplete="off" inputMode="decimal" value={f.range_low} onChange={(e) => update(i, 'range_low', e.target.value)} className={cx(inputClass, 'tabular-nums')} />
                  </Field>
                  <Field label={t('rangeHigh')}>
                    <input name={`high-${i}`} autoComplete="off" inputMode="decimal" value={f.range_high} onChange={(e) => update(i, 'range_high', e.target.value)} className={cx(inputClass, 'tabular-nums')} />
                  </Field>
                </div>
              </Card>
            </li>
          ))}
        </ol>

        <div className="flex gap-3">
          <select aria-label={t('chooseTest')} value={adding} onChange={(e) => setAdding(e.target.value)} className={cx(inputClass, 'flex-1')}>
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
          <select name="person" value={profileId} onChange={(e) => setProfileId(e.target.value)} className={inputClass}>
            <option value="">{t('notLinked')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        {report.ocr_text && (
          <details className="text-sm text-muted">
            <summary className="min-h-11 cursor-pointer py-2.5">{t('extractedText')}</summary>
            <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-surface p-3 font-sans whitespace-pre-wrap" translate="no">{report.ocr_text}</pre>
          </details>
        )}

        {triedConfirm && flagged > 0 && <Banner tone="caution" icon={<WarningCircle size={20} />}>{t('stillUnchecked', { n: flagged })}</Banner>}
        <Button onClick={() => void confirm()} disabled={busy || fields.every((f) => !f.value.trim())}>
          <Check size={20} aria-hidden />
          {t('confirmValues')}
        </Button>
      </div>
    </>
  )
}

export default function ReviewPage() {
  return (
    <Suspense>
      <Review />
    </Suspense>
  )
}
