import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { getReport, listReports, saveReport, updateReportFields } from './reports'
import type { ReportField } from '../domain/labs'

const worker = { id: 'u1', assigned_scope: ['village-a'] }
const field: ReportField = { test_id: 'haemoglobin', name: 'Hb', value: '9.8', unit: 'g/dL', range_low: '12', range_high: '15.5', uncertain: false, raw: 'Hb 9.8 g/dL 12 - 15.5' }

describe('reports', () => {
  it('saves a report with its OCR text and fields and queues a sync operation', async () => {
    const db = await openTestDb()
    const r = await saveReport(db, worker, { file_name: 'cbc.png', file_hash: 'abc', ocr_text: 'Hb 9.8', fields: [field], language: 'eng+hin' })
    const saved = await getReport(db, r.id)
    expect(saved?.fields).toEqual([field])
    expect(saved?.ocr_text).toBe('Hb 9.8')
    const [{ n }] = await db.query<{ n: number }>("SELECT count(*) AS n FROM sync_operations WHERE entity_type = 'medical_report'")
    expect(n).toBe(1)
  })

  it('stores reviewed corrections as a new version and marks the report verified', async () => {
    const db = await openTestDb()
    const r = await saveReport(db, worker, { file_name: 'cbc.png', file_hash: 'abc', ocr_text: '', fields: [field], language: 'eng' })
    await updateReportFields(db, r.id, [{ ...field, value: '9.6' }])
    const saved = await getReport(db, r.id)
    expect(saved?.fields[0].value).toBe('9.6')
    expect(saved?.ocr_status).toBe('verified')
    expect(saved?.record_version).toBe(2)
  })

  it('links a report to a patient when the reviewer picks one', async () => {
    const db = await openTestDb()
    const r = await saveReport(db, worker, { file_name: 'cbc.png', file_hash: 'abc', ocr_text: '', fields: [field], language: 'eng' })
    await db.batch([{ sql: "INSERT INTO patients (id, display_name, scope_id, created_by) VALUES ('p-1', 'Kamla', 'village-a', 'u1')" }])
    await updateReportFields(db, r.id, [field], 'p-1')
    expect((await getReport(db, r.id))?.patient_id).toBe('p-1')
  })

  it('lists reports newest first', async () => {
    const db = await openTestDb()
    await saveReport(db, worker, { file_name: 'a.png', file_hash: 'a', ocr_text: '', fields: [], language: 'eng' })
    await new Promise((r) => setTimeout(r, 5))
    await saveReport(db, worker, { file_name: 'b.png', file_hash: 'b', ocr_text: '', fields: [], language: 'eng' })
    expect((await listReports(db)).map((r) => r.file_name)).toEqual(['b.png', 'a.png'])
  })
})
