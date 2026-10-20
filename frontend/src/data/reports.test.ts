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
    const saved = await getReport(db, worker, r.id)
    expect(saved?.fields).toEqual([field])
    expect(saved?.ocr_text).toBe('Hb 9.8')
    const [{ n }] = await db.query<{ n: number }>("SELECT count(*) AS n FROM sync_operations WHERE entity_type = 'medical_report'")
    expect(n).toBe(1)
  })

  it('stores reviewed corrections as a new version and marks the report verified', async () => {
    const db = await openTestDb()
    const r = await saveReport(db, worker, { file_name: 'cbc.png', file_hash: 'abc', ocr_text: '', fields: [field], language: 'eng' })
    await updateReportFields(db, r.id, [{ ...field, value: '9.6' }])
    const saved = await getReport(db, worker, r.id)
    expect(saved?.fields[0].value).toBe('9.6')
    expect(saved?.ocr_status).toBe('verified')
    expect(saved?.record_version).toBe(2)
  })

  it('links a report to a patient when the reviewer picks one', async () => {
    const db = await openTestDb()
    const r = await saveReport(db, worker, { file_name: 'cbc.png', file_hash: 'abc', ocr_text: '', fields: [field], language: 'eng' })
    await db.batch([{ sql: "INSERT INTO patients (id, display_name, scope_id, created_by) VALUES ('p-1', 'Kamla', 'village-a', 'u1')" }])
    await updateReportFields(db, r.id, [field], 'p-1')
    expect((await getReport(db, worker, r.id))?.patient_id).toBe('p-1')
  })

  it('lists reports newest first', async () => {
    const db = await openTestDb()
    await saveReport(db, worker, { file_name: 'a.png', file_hash: 'a', ocr_text: '', fields: [], language: 'eng' })
    await new Promise((r) => setTimeout(r, 5))
    await saveReport(db, worker, { file_name: 'b.png', file_hash: 'b', ocr_text: '', fields: [], language: 'eng' })
    expect((await listReports(db, worker)).map((r) => r.file_name)).toEqual(['b.png', 'a.png'])
  })

  it("never shows a report linked to a patient outside the viewer's scope (a citizen has none)", async () => {
    const db = await openTestDb()
    await db.batch([{ sql: "INSERT INTO patients (id, display_name, scope_id, created_by) VALUES ('p-1', 'Kamla', 'village-a', 'u1')" }])
    const citizen = { id: 'u-ramesh', assigned_scope: [] }
    const own = await saveReport(db, citizen, { file_name: 'mine.png', file_hash: 'm', ocr_text: '', fields: [], language: 'eng' })
    const patients = await saveReport(db, worker, { file_name: 'kamla.png', file_hash: 'k', ocr_text: 'Kamla Hb 9.8', fields: [field], language: 'eng' })
    await updateReportFields(db, patients.id, [field], 'p-1')

    expect((await listReports(db, citizen)).map((r) => r.file_name)).toEqual(['mine.png'])
    expect(await getReport(db, citizen, patients.id)).toBeUndefined()
    expect((await getReport(db, citizen, own.id))?.file_name).toBe('mine.png')
    expect((await listReports(db, worker)).map((r) => r.file_name)).toEqual(['kamla.png'])
  })

  it('links a report to a family member, whose sex then picks the ranges, and lists it on their page', async () => {
    const db = await openTestDb()
    await db.batch([{ sql: "INSERT INTO profiles (id, name, relation, sex) VALUES ('f-1', 'Asha', 'mother', 'F')" }])
    const r = await saveReport(db, worker, { file_name: 'cbc.png', file_hash: 'abc', ocr_text: '', fields: [field], language: 'eng' })
    await saveReport(db, worker, { file_name: 'other.png', file_hash: 'o', ocr_text: '', fields: [], language: 'eng' })
    await updateReportFields(db, r.id, [field], null, 'f-1')

    const saved = await getReport(db, worker, r.id)
    expect(saved).toMatchObject({ profile_id: 'f-1', profile_name: 'Asha', profile_sex: 'F', patient_id: null })
    expect((await listReports(db, worker, { profileId: 'f-1' })).map((x) => x.file_name)).toEqual(['cbc.png'])
  })

  it("keeps a personal report to the account that read it; a patient's report is shared with the team in scope", async () => {
    const db = await openTestDb()
    const colleague = { id: 'u2', assigned_scope: ['village-a'] }
    const citizen = { id: 'u-ramesh', assigned_scope: [] }
    await db.batch([{ sql: "INSERT INTO patients (id, display_name, scope_id, created_by) VALUES ('p-1', 'Kamla', 'village-a', 'u1')" }])
    const mine = await saveReport(db, citizen, { file_name: 'mine.png', file_hash: 'm', ocr_text: '', fields: [], language: 'eng' })
    const patients = await saveReport(db, worker, { file_name: 'kamla.png', file_hash: 'k', ocr_text: '', fields: [], language: 'eng' })
    await updateReportFields(db, patients.id, [], 'p-1')

    expect((await listReports(db, citizen)).map((r) => r.file_name)).toEqual(['mine.png'])
    expect(await getReport(db, worker, mine.id)).toBeUndefined()
    expect((await listReports(db, colleague)).map((r) => r.file_name)).toEqual(['kamla.png'])
  })
})
