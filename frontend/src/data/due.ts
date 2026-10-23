// Vaccine doses and pregnancy checkups due now, for the people this account looks after (Today screen).
import type { Database } from '../database/types'
import { childSchedule, pregnancySchedule, type Planned } from '../domain/schedule'
import { resolveChains, type VisitRow } from '../domain/visits'
import { CHILD, PREGNANCY } from '../schedules'
import { givenIds, listProfiles } from './family'
import { inScope, type Worker } from './records'

export type Due = { to: string; name: string; items: Planned[] }

function dueItems(dob: string | null, lmp: string | null, done: Set<string>, today: string): Planned[] {
  const child = dob && dob <= today ? childSchedule(dob, CHILD, done, today) : []
  const pregnancy = lmp ? (pregnancySchedule(lmp, PREGNANCY, done, today)?.items ?? []) : []
  return [...child, ...pregnancy].filter((i) => i.status === 'overdue' || i.status === 'due')
}

export async function dueSchedules(db: Database, w: Worker, isWorker: boolean, today: string): Promise<Due[]> {
  const due: Due[] = []
  for (const p of await listProfiles(db, w.id)) {
    const items = dueItems(p.date_of_birth, p.lmp_date, await givenIds(db, w.id, p.id), today)
    if (items.length) due.push({ to: `/family/${p.id}`, name: p.name, items })
  }
  if (!isWorker) return due

  const s = inScope(w)
  const patients = await db.query<{ id: string; display_name: string; date_of_birth: string | null }>(
    `SELECT id, display_name, date_of_birth FROM patients WHERE deleted_at IS NULL AND ${s.sql}`,
    s.bind,
  )
  const visits = await db.query<VisitRow>(`SELECT v.* FROM patient_visits v JOIN patients p ON p.id = v.patient_id WHERE p.${s.sql}`, s.bind)
  const byPatient = new Map<string, { done: Set<string>; lmp: string | null; lmpAt: string }>()
  for (const { current: v, voided } of resolveChains(visits)) {
    if (voided) continue
    const o = JSON.parse(v.observations_json)
    const e = byPatient.get(v.patient_id) ?? { done: new Set<string>(), lmp: null, lmpAt: '' }
    for (const id of [...(o.vaccines ?? []), ...(o.anc ?? [])]) e.done.add(id)
    if (o.lmp && v.visit_time > e.lmpAt) Object.assign(e, { lmp: o.lmp, lmpAt: v.visit_time }) // the latest recorded period counts
    byPatient.set(v.patient_id, e)
  }
  for (const p of patients) {
    const e = byPatient.get(p.id)
    const items = dueItems(p.date_of_birth, e?.lmp ?? null, e?.done ?? new Set(), today)
    if (items.length) due.push({ to: `/patients/${p.id}`, name: p.display_name, items })
  }
  return due.sort((a, b) => a.items[0].due.localeCompare(b.items[0].due))
}
