import type { Database } from '../database/types'
import type { SymptomVisit } from '../domain/outbreak'
import { resolveChains, type VisitChain, type VisitRow } from '../domain/visits'
import { syncOp } from './syncOps'

export type Worker = { id: string; assigned_scope: string[] }

export type Patient = {
  id: string
  display_name: string
  age_years: number | null
  sex: string | null
  village: string | null
  phone: string | null
  local_identifier: string | null
  date_of_birth: string | null
  abha_id: string | null
  scope_id: string
  created_at: string
  sync_status: string
}

export type NewPatient = {
  display_name: string
  scope_id: string
  age_years?: number | null
  sex?: string | null
  village?: string | null
  phone?: string | null
  local_identifier?: string | null
  date_of_birth?: string | null
  abha_id?: string | null
}

const now = () => new Date().toISOString()
export const inScope = (w: Worker) => ({ sql: `scope_id IN (${w.assigned_scope.map(() => '?').join(',') || 'NULL'})`, bind: w.assigned_scope })

export async function createPatient(db: Database, w: Worker, input: NewPatient): Promise<Patient> {
  const display_name = input.display_name.trim()
  if (!display_name) throw new Error('A name is required')
  if (!w.assigned_scope.includes(input.scope_id)) throw new Error('Patient is outside your assigned scope')
  const row = {
    id: crypto.randomUUID(),
    display_name,
    age_years: input.age_years ?? null,
    sex: input.sex ?? null,
    village: input.village?.trim() || null,
    phone: input.phone?.trim() || null,
    local_identifier: input.local_identifier?.trim() || null,
    date_of_birth: input.date_of_birth || null,
    abha_id: input.abha_id || null,
    scope_id: input.scope_id,
    created_by: w.id,
    created_at: now(),
  }
  await db.batch([
    {
      sql: `INSERT INTO patients (id, display_name, age_years, sex, village, phone, local_identifier, date_of_birth, abha_id, scope_id, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [row.id, row.display_name, row.age_years, row.sex, row.village, row.phone, row.local_identifier, row.date_of_birth, row.abha_id, row.scope_id, row.created_by, row.created_at, row.created_at],
    },
    syncOp('patient', row.id, 'create', row),
  ])
  return { ...row, sync_status: 'pending' }
}

const patientCols = 'id, display_name, age_years, sex, village, phone, local_identifier, date_of_birth, abha_id, scope_id, created_at, sync_status'

export async function listPatients(db: Database, w: Worker, search: string): Promise<Patient[]> {
  const s = inScope(w)
  const q = `%${search.trim().toLowerCase()}%`
  return db.query<Patient>(
    `SELECT ${patientCols} FROM patients
     WHERE deleted_at IS NULL AND ${s.sql}
       AND (lower(display_name) LIKE ? OR lower(coalesce(local_identifier, '')) LIKE ? OR lower(coalesce(village, '')) LIKE ?)
     ORDER BY display_name COLLATE NOCASE`,
    [...s.bind, q, q, q],
  )
}

export async function getPatient(db: Database, w: Worker, id: string): Promise<Patient | undefined> {
  const s = inScope(w)
  const [p] = await db.query<Patient>(`SELECT ${patientCols} FROM patients WHERE id = ? AND deleted_at IS NULL AND ${s.sql}`, [id, ...s.bind])
  return p
}

export type VisitInput = {
  visit_time: string
  notes: string
  /** bp, weight, temp as text; symptoms, vaccines and anc as id lists; lmp as YYYY-MM-DD. */
  observations?: Record<string, string | string[]>
  follow_up_at?: string | null
}

function visitStatements(row: Omit<VisitRow, 'sync_status'>) {
  return [
    {
      sql: `INSERT INTO patient_visits (id, patient_id, worker_id, amends_visit_id, amendment_reason, visit_time, notes,
              observations_json, follow_up_at, created_at, voided_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [row.id, row.patient_id, row.worker_id, row.amends_visit_id, row.amendment_reason, row.visit_time, row.notes,
        row.observations_json, row.follow_up_at, row.created_at, row.voided_at],
    },
    syncOp('patient_visit', row.id, 'create', row),
  ]
}

export async function addVisit(db: Database, w: Worker, patientId: string, input: VisitInput): Promise<VisitRow> {
  if (!(await getPatient(db, w, patientId))) throw new Error('Patient not found in your scope')
  const row = {
    id: crypto.randomUUID(),
    patient_id: patientId,
    worker_id: w.id,
    amends_visit_id: null,
    amendment_reason: null,
    visit_time: input.visit_time,
    notes: input.notes.trim(),
    observations_json: JSON.stringify(input.observations ?? {}),
    follow_up_at: input.follow_up_at || null,
    created_at: now(),
    voided_at: null,
  }
  await db.batch(visitStatements(row))
  return { ...row, sync_status: 'pending' }
}

/** Appends a corrected copy of a visit. Fields not given are carried over from the version being amended. */
export async function amendVisit(
  db: Database,
  w: Worker,
  visitId: string,
  change: Partial<VisitInput> & { reason: string; void?: boolean },
): Promise<VisitRow> {
  const [prev] = await db.query<VisitRow>('SELECT * FROM patient_visits WHERE id = ?', [visitId])
  if (!prev || !(await getPatient(db, w, prev.patient_id))) throw new Error('Visit not found in your scope')
  if (!change.reason.trim()) throw new Error('A reason for the correction is required')
  const at = now()
  const row = {
    ...prev,
    id: crypto.randomUUID(),
    worker_id: w.id,
    amends_visit_id: prev.id,
    amendment_reason: change.reason.trim(),
    visit_time: change.visit_time ?? prev.visit_time,
    notes: change.notes?.trim() ?? prev.notes,
    observations_json: change.observations ? JSON.stringify(change.observations) : prev.observations_json,
    follow_up_at: change.follow_up_at !== undefined ? change.follow_up_at || null : prev.follow_up_at,
    created_at: at,
    voided_at: change.void ? at : null,
  }
  const { sync_status: _ignored, ...insertable } = row
  await db.batch(visitStatements(insertable))
  return { ...row, sync_status: 'pending' }
}

export async function listVisits(db: Database, w: Worker, patientId: string): Promise<VisitChain[]> {
  if (!(await getPatient(db, w, patientId))) return []
  return resolveChains(await db.query<VisitRow>('SELECT * FROM patient_visits WHERE patient_id = ?', [patientId]))
}

export type FollowUp = { patient_id: string; display_name: string; village: string | null; follow_up_at: string; visit_id: string }

/**
 * Follow-ups whose date is on or before `date` (YYYY-MM-DD). A follow-up is cleared once the
 * patient has a later visit.
 */
export async function followUpsDue(db: Database, w: Worker, date: string): Promise<FollowUp[]> {
  const s = inScope(w)
  // ponytail: resolves every chain in scope in JS; fine for one worker's villages, move to SQL if scope grows large.
  const rows = await db.query<VisitRow & { display_name: string; village: string | null }>(
    `SELECT v.*, p.display_name, p.village FROM patient_visits v JOIN patients p ON p.id = v.patient_id
     WHERE p.deleted_at IS NULL AND p.${s.sql}`,
    s.bind,
  )
  const names = new Map(rows.map((r) => [r.patient_id, { display_name: r.display_name, village: r.village }]))
  const chains = resolveChains(rows).filter((c) => !c.voided)
  const latestVisit = new Map<string, string>()
  for (const c of chains) {
    const t = latestVisit.get(c.current.patient_id)
    if (!t || c.current.visit_time > t) latestVisit.set(c.current.patient_id, c.current.visit_time)
  }
  return chains
    .filter((c) => c.current.follow_up_at && c.current.follow_up_at <= date && latestVisit.get(c.current.patient_id) === c.current.visit_time)
    .map((c) => ({
      patient_id: c.current.patient_id,
      ...names.get(c.current.patient_id)!,
      follow_up_at: c.current.follow_up_at!,
      visit_id: c.current.id,
    }))
    .sort((a, b) => a.follow_up_at.localeCompare(b.follow_up_at))
}

/** Current (not voided, not superseded) visits in scope since `since` (ISO), with their village and symptoms. */
export async function recentSymptoms(db: Database, w: Worker, since: string): Promise<SymptomVisit[]> {
  const s = inScope(w)
  const rows = await db.query<VisitRow & { village: string | null }>(
    `SELECT v.*, p.village FROM patient_visits v JOIN patients p ON p.id = v.patient_id WHERE p.deleted_at IS NULL AND p.${s.sql}`,
    s.bind,
  )
  const village = new Map(rows.map((r) => [r.patient_id, r.village]))
  return resolveChains(rows)
    .filter((c) => !c.voided && c.current.visit_time >= since)
    .map(({ current: v }) => ({ patient_id: v.patient_id, village: village.get(v.patient_id) ?? null, visit_time: v.visit_time, symptoms: JSON.parse(v.observations_json).symptoms ?? [] }))
}
