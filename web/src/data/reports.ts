// Lab reports read on this device. The original photo/PDF is kept separately (platform/files), never in the database.
import type { Database } from '../database/types'
import { checkRange, type RangeResult, type ReportField } from '../domain/labs'
import type { Lang } from '../i18n'
import { labTest } from '../labCatalogue'

export type Report = {
  id: string
  profile_id: string | null
  profile_name: string | null
  profile_sex: string | null
  file_name: string
  ocr_text: string
  fields: ReportField[]
  /** 'extracted': read by OCR, not yet checked by a person. 'verified': checked; only then is it explained. */
  ocr_status: 'extracted' | 'verified'
  created_at: string
}

type Row = Omit<Report, 'fields'> & { extracted_fields_json: string }
const fromRow = ({ extracted_fields_json, ...r }: Row): Report => ({ ...r, fields: JSON.parse(extracted_fields_json) })
const select = `SELECT r.id, r.profile_id, p.name AS profile_name, p.sex AS profile_sex, r.file_name, r.ocr_text, r.extracted_fields_json, r.ocr_status, r.created_at
  FROM reports r LEFT JOIN profiles p ON p.id = r.profile_id WHERE r.deleted_at IS NULL`

export async function saveReport(db: Database, r: { file_name: string; file_hash: string; ocr_text: string; fields: ReportField[] }): Promise<string> {
  const id = crypto.randomUUID()
  await db.batch([
    {
      sql: `INSERT INTO reports (id, file_reference, file_hash, file_name, ocr_text, extracted_fields_json, ocr_status) VALUES (?, ?, ?, ?, ?, ?, 'extracted')`,
      bind: [id, id, r.file_hash, r.file_name, r.ocr_text, JSON.stringify(r.fields)],
    },
  ])
  return id
}

export async function getReport(db: Database, id: string): Promise<Report | undefined> {
  const [row] = await db.query<Row>(`${select} AND r.id = ?`, [id])
  return row && fromRow(row)
}

export async function listReports(db: Database, { profileId }: { profileId?: string } = {}): Promise<Report[]> {
  const rows = profileId
    ? await db.query<Row>(`${select} AND r.profile_id = ? ORDER BY r.created_at DESC, r.rowid DESC`, [profileId])
    : await db.query<Row>(`${select} ORDER BY r.created_at DESC, r.rowid DESC`)
  return rows.map(fromRow)
}

/** Saves the values a person checked against the original. Flagged values never get here unchecked (the review screen blocks it). */
export async function confirmReport(db: Database, id: string, fields: ReportField[], profileId: string | null) {
  await db.batch([
    {
      sql: `UPDATE reports SET extracted_fields_json = ?, profile_id = ?, ocr_status = 'verified', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      bind: [JSON.stringify(fields), profileId, id],
    },
  ])
}

export async function deleteReport(db: Database, id: string) {
  await db.batch([{ sql: `UPDATE reports SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ocr_text = '', extracted_fields_json = '[]' WHERE id = ?`, bind: [id] }])
}

export type ResultRow = { field: ReportField; name: string; result: RangeResult; explanation: string | null }

/** Each checked value against its range, with the library's plain-words explanation. Null explanation: nothing reliable to say. */
export function readResults(fields: ReportField[], sex: string | null, lang: Lang): ResultRow[] {
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
