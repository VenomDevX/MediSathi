// Client side of the sync protocol (TRD §8.1, §8.5): push the persistent queue, then pull scoped changes.
import type { Database, SqlValue, Statement } from '../database/types'

export class NetworkError extends Error {}
export class AuthError extends Error {}

type OpResult = { operation_id: string; status: 'accepted' | 'conflict' | 'rejected'; entity_id: string; record_version: number | null; error_code: string | null }
type PushOp = { operation_id: string; entity_type: string; entity_id: string; operation: string; base_version: number | null; payload: Record<string, unknown> }
type Change = { entity_type: string; entity: Record<string, unknown> }
type DirectoryDonor = {
  id: string
  blood_group: string
  approx_latitude: number | null
  approx_longitude: number | null
  locality_label: string | null
  consent_status: string
  registration_status: string
  last_verified_at: string | null
  contact: string | null
}

export interface SyncApi {
  push(ops: PushOp[]): Promise<OpResult[]>
  pull(cursor: number): Promise<{ changes: Change[]; cursor: number; has_more: boolean }>
  directory(): Promise<{ synced_at: string; donors: DirectoryDonor[] }>
}

export type SyncSummary = { pushed: number; failed: number; conflicts: number; pulled: number; offline: boolean }

const BATCH = 100
const tableFor: Record<string, string | undefined> = { patient: 'patients', patient_visit: 'patient_visits', medical_report: 'medical_reports' }
const backoffMs = (attempt: number) => Math.min(2 ** attempt * 30_000, 60 * 60_000)

async function push(db: Database, api: SyncApi, now: Date, s: SyncSummary) {
  type Row = { operation_id: string; entity_type: string; entity_id: string; operation_type: string; base_version: number | null; payload_json: string; attempt_count: number }
  const ops = await db.query<Row>(
    `SELECT * FROM sync_operations WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at, rowid LIMIT ${BATCH}`,
    [now.toISOString()],
  )
  if (!ops.length) return
  let results: OpResult[]
  try {
    results = await api.push(
      ops.map((o) => ({ operation_id: o.operation_id, entity_type: o.entity_type, entity_id: o.entity_id, operation: o.operation_type, base_version: o.base_version, payload: JSON.parse(o.payload_json) })),
    )
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e
    s.offline = true
    await db.batch(
      ops.map((o) => ({
        sql: 'UPDATE sync_operations SET attempt_count = ?, next_attempt_at = ? WHERE operation_id = ?',
        bind: [o.attempt_count + 1, new Date(now.getTime() + backoffMs(o.attempt_count + 1)).toISOString(), o.operation_id],
      })),
    )
    return
  }

  const byId = new Map(ops.map((o) => [o.operation_id, o]))
  const statements: Statement[] = []
  for (const r of results) {
    const op = byId.get(r.operation_id)
    if (!op) continue
    const table = tableFor[op.entity_type]
    const opStatus = r.status === 'accepted' ? 'done' : r.status === 'conflict' ? 'conflict' : 'failed'
    statements.push({ sql: 'UPDATE sync_operations SET status = ?, last_error_code = ? WHERE operation_id = ?', bind: [opStatus, r.error_code, r.operation_id] })
    if (r.status === 'accepted') s.pushed++
    else if (r.status === 'conflict') s.conflicts++
    else s.failed++
    if (!table) continue
    if (r.status === 'accepted') {
      // Synced only when nothing else for this record is still waiting.
      statements.push({
        sql: `UPDATE ${table} SET sync_status = 'synced' WHERE id = ? AND NOT EXISTS
                (SELECT 1 FROM sync_operations WHERE entity_id = ? AND status IN ('pending', 'conflict', 'failed'))`,
        bind: [op.entity_id, op.entity_id],
      })
      if (table !== 'patient_visits' && r.record_version) statements.push({ sql: `UPDATE ${table} SET record_version = ? WHERE id = ?`, bind: [r.record_version, op.entity_id] })
    } else {
      // A server rejection never deletes the local record (PRD SY acceptance).
      statements.push({ sql: `UPDATE ${table} SET sync_status = ? WHERE id = ?`, bind: [r.status === 'conflict' ? 'conflict' : 'failed', op.entity_id] })
    }
  }
  await db.batch(statements)
}

const hasLocalChanges = async (db: Database, id: string) =>
  (await db.query("SELECT 1 FROM sync_operations WHERE entity_id = ? AND status IN ('pending', 'conflict', 'failed') LIMIT 1", [id])).length > 0

function upsert(table: string, row: Record<string, SqlValue>): Statement {
  const cols = Object.keys(row)
  return {
    sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
          ON CONFLICT(id) DO UPDATE SET ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`,
    bind: cols.map((c) => row[c]),
  }
}

async function pull(db: Database, api: SyncApi, s: SyncSummary) {
  const [meta] = await db.query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'pull_cursor'")
  let cursor = Number(meta?.value ?? 0)
  for (;;) {
    const page = await api.pull(cursor)
    const statements: Statement[] = []
    for (const { entity_type, entity: e } of page.changes) {
      const id = String(e.id)
      if (await hasLocalChanges(db, id)) continue // local edits win until the server has acknowledged them
      s.pulled++
      if (entity_type === 'patient') {
        statements.push(
          upsert('patients', {
            id, display_name: e.display_name as string, age_years: (e.age_years as number) ?? null, sex: (e.sex as string) ?? null,
            village: (e.village as string) ?? null, phone: (e.phone as string) ?? null, local_identifier: (e.local_identifier as string) ?? null,
            scope_id: e.scope_id as string, created_by: e.created_by as string, created_at: e.created_at as string, updated_at: e.updated_at as string,
            record_version: e.record_version as number, sync_status: e.needs_review ? 'conflict' : 'synced', deleted_at: (e.deleted_at as string) ?? null,
          }),
        )
      } else if (entity_type === 'patient_visit') {
        statements.push({
          sql: `INSERT OR IGNORE INTO patient_visits (id, patient_id, worker_id, amends_visit_id, amendment_reason, visit_time, notes, observations_json, follow_up_at, created_at, voided_at, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
          bind: [id, e.patient_id as string, e.worker_id as string, (e.amends_visit_id as string) ?? null, (e.amendment_reason as string) ?? null, e.visit_time as string,
            (e.notes as string) ?? '', (e.observations_json as string) ?? '{}', (e.follow_up_at as string) ?? null, e.created_at as string, (e.voided_at as string) ?? null],
        })
      } else if (entity_type === 'medical_report') {
        statements.push(
          upsert('medical_reports', {
            id, patient_id: (e.patient_id as string) ?? null, file_hash: e.file_hash as string, extracted_fields_json: JSON.stringify(e.fields ?? []),
            record_version: e.record_version as number, ocr_status: 'verified', sync_status: 'synced', created_at: e.created_at as string,
          }),
        )
      }
    }
    statements.push({ sql: "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('pull_cursor', ?)", bind: [String(page.cursor)] })
    await db.batch(statements)
    cursor = page.cursor
    if (!page.has_more) break
  }
}

async function pullDirectory(db: Database, api: SyncApi) {
  const { synced_at, donors } = await api.directory()
  // Full snapshot: donors who withdrew consent disappear from the device on the next sync (PRD BL acceptance).
  await db.batch([
    { sql: 'DELETE FROM donors' },
    ...donors.map((d) => ({
      sql: `INSERT INTO donors (id, blood_group, approx_latitude, approx_longitude, locality_label, contact_encrypted, consent_status, last_verified_at, last_synced_at, registration_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [d.id, d.blood_group, d.approx_latitude, d.approx_longitude, d.locality_label, d.contact, d.consent_status, d.last_verified_at, synced_at, d.registration_status],
    })),
  ])
}

export async function runSync(db: Database, api: SyncApi, userId: string, now = new Date()): Promise<SyncSummary> {
  const s: SyncSummary = { pushed: 0, failed: 0, conflicts: 0, pulled: 0, offline: false }
  await push(db, api, now, s)
  if (s.offline) return s
  try {
    await pull(db, api, s)
    await pullDirectory(db, api)
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e
    s.offline = true
    return s
  }
  await db.batch([{ sql: 'UPDATE users SET last_server_contact_at = ? WHERE id = ?', bind: [now.toISOString(), userId] }])
  return s
}
