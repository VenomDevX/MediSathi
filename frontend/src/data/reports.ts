import type { Database } from '../database/types'
import { checkRange, type RangeResult, type ReportField } from '../domain/labs'
import type { Lang } from '../i18n'
import { labTest } from '../labCatalogue'
import { inScope, type Worker } from './records'
import { syncOp } from './syncOps'

export type Report = {
  id: string
  patient_id: string | null
  /** The family member this report belongs to (personal use); `patient_id` is for a health worker's patient. */
  profile_id: string | null
  profile_name: string | null
  profile_sex: string | null
  file_name: string
  file_hash: string
  ocr_text: string
  fields: ReportField[]
  language?: string
  ocr_status: 'extracted' | 'verified'
  record_version?: number
  created_at: string
  sync_status?: string
}

type Row = Omit<Report, 'fields'> & { extracted_fields_json: string }
const fromRow = ({ extracted_fields_json, ...r }: Row): Report => ({ ...r, fields: JSON.parse(extracted_fields_json) })

/**
 * Saves report metadata, OCR text and parsed fields. The original file is stored separately
 * (platform/files) and is never sent to sync or logs (TRD §6.1).
 */
export async function saveReport(
  db: Database,
  w: Worker,
  r: { file_name: string; file_hash: string; ocr_text: string; fields: ReportField[]; language: string; patient_id?: string | null },
): Promise<Report> {
  const id = crypto.randomUUID()
  const created_at = new Date().toISOString()
  const fields_json = JSON.stringify(r.fields)
  await db.batch([
    {
      sql: `INSERT INTO medical_reports (id, owner_id, patient_id, file_reference, file_hash, file_name, ocr_text, extracted_fields_json, language, ocr_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'extracted', ?, ?)`,
      bind: [id, w.id, r.patient_id ?? null, id, r.file_hash, r.file_name, r.ocr_text, fields_json, r.language, created_at, created_at],
    },
    syncOp('medical_report', id, 'create', { id, patient_id: r.patient_id ?? null, file_hash: r.file_hash, fields: r.fields, created_by: w.id, created_at }),
  ])
  return (await getReport(db, w, id))!
}

/** Reports `w` may see: a patient's within the viewer's scope (shared with the team; a citizen has none); any other only its owner's. */
function visible(w: Worker) {
  const s = inScope(w)
  return {
    sql: `SELECT r.id, r.patient_id, r.profile_id, p.name AS profile_name, p.sex AS profile_sex, r.file_name, r.file_hash, r.ocr_text,
            r.extracted_fields_json, r.language, r.ocr_status, r.record_version, r.created_at, r.sync_status
          FROM medical_reports r LEFT JOIN profiles p ON p.id = r.profile_id
          WHERE r.deleted_at IS NULL AND CASE WHEN r.patient_id IS NULL THEN r.owner_id = ? ELSE r.patient_id IN (SELECT id FROM patients WHERE ${s.sql}) END`,
    bind: [w.id, ...s.bind],
  }
}

export async function getReport(db: Database, w: Worker, id: string): Promise<Report | undefined> {
  const v = visible(w)
  const [row] = await db.query<Row>(`${v.sql} AND r.id = ?`, [...v.bind, id])
  return row && fromRow(row)
}

export async function listReports(db: Database, w: Worker, { profileId }: { profileId?: string } = {}): Promise<Report[]> {
  const v = visible(w)
  const rows = profileId
    ? await db.query<Row>(`${v.sql} AND r.profile_id = ? ORDER BY r.created_at DESC, r.rowid DESC`, [...v.bind, profileId])
    : await db.query<Row>(`${v.sql} ORDER BY r.created_at DESC, r.rowid DESC`, v.bind)
  return rows.map(fromRow)
}

/** Saves the user's reviewed values (PRD MS-04): only verified values are explained. */
/** `profile_id` stays on this device: it is personal, so it is not in the sync payload. */
export async function updateReportFields(db: Database, id: string, fields: ReportField[], patient_id: string | null = null, profile_id: string | null = null): Promise<void> {
  const [cur] = await db.query<{ record_version: number }>('SELECT record_version FROM medical_reports WHERE id = ?', [id])
  if (!cur) throw new Error('Report not found')
  const version = (cur.record_version ?? 0) + 1
  await db.batch([
    {
      sql: `UPDATE medical_reports SET extracted_fields_json = ?, patient_id = ?, profile_id = ?, ocr_status = 'verified', record_version = ?, sync_status = 'pending',
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      bind: [JSON.stringify(fields), patient_id, profile_id, version, id],
    },
    syncOp('medical_report', id, 'update', { id, patient_id, fields }, cur.record_version ?? 0),
  ])
}

export type ResultRow = { field: ReportField; name: string; result: RangeResult; explanation: string | null }

/** Each checked value against its range, with the library's plain-words explanation. Null explanation: nothing reliable to say. */
export function readResults(fields: ReportField[], sex: string | null = null, lang: Lang = 'hi'): ResultRow[] {
  return fields.map((field) => {
    const test = labTest(field.test_id)
    const result: RangeResult = test ? checkRange(test, field, sex) : { status: 'unknown', reason: 'unit' }
    return {
      field,
      name: test ? (lang === 'hi' ? test.name_hi : test.canonical_name) : field.name,
      result,
      explanation: test && result.status !== 'unknown' ? test.explain[result.status][lang] : null,
    }
  })
}
