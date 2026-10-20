'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, CaretRight, FileArrowUp, FileText, Info } from '@phosphor-icons/react'
import { useApp } from '@/app-context'
import { listReports, saveReport } from '@/data/reports'
import { parseReport } from '@/domain/labs'
import { useFormatDate, useT } from '@/i18n'
import { labCatalogue } from '@/labCatalogue'
import { ACCEPT, isSafeType, saveFile, sha256 } from '@/platform/files'
import type { StringKey } from '@/strings'
import { Banner, Button, Chip, EmptyState, PageHeader } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'

type Busy = { key: StringKey; vars: Record<string, number> }

export default function Reports() {
  const t = useT()
  const fmt = useFormatDate()
  const router = useRouter()
  const { db, whenReady } = useApp()
  const { data: reports } = useAsync((d) => listReports(d), [])
  const [busy, setBusy] = useState<Busy | null>(null)
  const [error, setError] = useState<StringKey | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    if (!isSafeType(file.type)) return setError('unsupportedFile')
    setBusy({ key: 'preparingOcr', vars: { pct: 0 } })
    try {
      // Loaded on demand: the OCR and PDF code is large and only needed here.
      const { extractText } = await import('@/platform/ocr')
      const lines = await extractText(file, (p) =>
        setBusy(
          p.stage === 'reading'
            ? { key: 'readingPage', vars: { page: p.page, pages: p.pages, pct: Math.round(p.fraction * 100) } }
            : { key: 'preparingOcr', vars: { pct: Math.round(p.fraction * 100) } },
        ),
      )
      await whenReady
      const id = await saveReport(db, {
        file_name: file.name,
        file_hash: await sha256(file),
        ocr_text: lines.map((l) => l.text).join('\n'),
        fields: parseReport(lines, labCatalogue),
      })
      await saveFile(id, file)
      router.push(`/reports/review/?id=${id}`)
    } catch (err) {
      console.error('Report import failed', err instanceof Error ? err.message : err)
      setError('ocrFailed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title={t('reportsTitle')} back={{ href: '/records/', label: t('navRecords') }} />
      <div className="flex flex-col gap-6">
        <Banner tone="info" icon={<Info size={20} />}>{t('scanDisclaimer')}</Banner>

        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-5">
          <p className="text-muted">{t('importHint')}</p>
          {busy ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <p className="font-medium">{t(busy.key, busy.vars)}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                <div className="h-full origin-left bg-neel transition-transform" style={{ transform: `scaleX(${(busy.vars.pct ?? 0) / 100})` }} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button onClick={() => camera.current?.click()}>
                <Camera size={22} aria-hidden />
                {t('takePhoto')}
              </Button>
              <Button variant="secondary" onClick={() => picker.current?.click()}>
                <FileArrowUp size={22} aria-hidden />
                {t('chooseFile')}
              </Button>
            </div>
          )}
          <input ref={camera} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={onFile} className="hidden" aria-hidden tabIndex={-1} />
          <input ref={picker} type="file" accept={ACCEPT} onChange={onFile} className="hidden" aria-label={t('chooseFile')} tabIndex={-1} />
          {error && <Banner tone="danger">{t(error)}</Banner>}
        </section>

        <section aria-labelledby="saved">
          <h2 id="saved" className="mb-3 text-xl font-semibold">{t('savedReports')}</h2>
          {reports && reports.length === 0 ? (
            <EmptyState icon={<FileText size={32} />} title={t('noReports')} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {reports?.map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/${r.ocr_status === 'verified' ? 'view' : 'review'}/?id=${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-canvas">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.file_name}</p>
                      <p className="text-sm text-muted">
                        {[r.profile_name, fmt(r.created_at), t('testsFound', { n: r.fields.length })].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    <Chip tone={r.ocr_status === 'verified' ? 'ok' : 'caution'}>{t(r.ocr_status === 'verified' ? 'verified' : 'needsReview')}</Chip>
                    <CaretRight size={18} className="text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
