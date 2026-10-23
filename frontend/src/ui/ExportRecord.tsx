import { useState } from 'react'
import { Export } from '@phosphor-icons/react'
import type { HealthRecord } from '../data/export'
import { toFhirBundle } from '../domain/fhir'
import { useT } from '../i18n'
import { shareFile } from '../platform/share'
import { Button } from './components'

/** Builds the FHIR bundle on tap and hands it over (share sheet or download). */
export function ExportRecord({ load, hasAbha }: { load: () => Promise<HealthRecord | undefined>; hasAbha: boolean }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function run() {
    setBusy(true)
    setFailed(false)
    try {
      const record = await load()
      if (!record) throw new Error('Record not found')
      const now = new Date()
      const bundle = toFhirBundle({ ...record, now, bundleId: crypto.randomUUID() })
      const name = `${record.person.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-health-record-${now.toISOString().slice(0, 10)}.json`
      await shareFile(name, JSON.stringify(bundle, null, 2), 'application/fhir+json', t('exportRecord'))
    } catch (e) {
      if ((e as Error).message !== 'Share canceled') setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={() => void run()} disabled={busy} className="self-start">
        <Export size={20} aria-hidden />
        {t('exportRecord')}
      </Button>
      <p className="text-sm text-muted">{t('exportHint')}</p>
      {!hasAbha && <p className="text-sm text-muted">{t('exportNoAbha')}</p>}
      {failed && <p role="alert" className="text-sm text-danger">{t('exportFailed')}</p>}
    </div>
  )
}
