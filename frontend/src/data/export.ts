// Gathers one person's record (a family member or a health worker's patient) for the FHIR export.
import type { Database } from '../database/types'
import type { FhirDose, FhirLab, FhirPerson, FhirVisit } from '../domain/fhir'
import { resolveChains, type VisitRow } from '../domain/visits'
import { CHILD, PREGNANCY } from '../schedules'
import { getProfile } from './family'
import { getPatient, type Worker } from './records'
import { listReports, readResults, type Report } from './reports'

export type HealthRecord = { person: FhirPerson; labs: FhirLab[]; doses: FhirDose[]; visits: FhirVisit[] }

const items = new Map([...CHILD, ...PREGNANCY].map((i) => [i.id, i.label.en])) // English: the record goes to clinics and hospitals
const isCheckup = (id: string) => id.startsWith('anc') // checkups are visits; everything else on the schedule is a vaccine

function labs(reports: Report[], sex: string | null): FhirLab[] {
  return reports
    .filter((r) => r.ocr_status === 'verified')
    .flatMap((r) =>
      readResults(r.fields, sex, 'en').map(({ field, name, result }) => ({
        id: crypto.randomUUID(),
        name,
        value: field.value,
        unit: field.unit,
        low: result.status === 'unknown' ? null : result.low,
        high: result.status === 'unknown' ? null : result.high,
        status: result.status,
        date: r.created_at,
      })),
    )
}

function doses(ids: string[], date: string): FhirDose[] {
  return ids.filter((id) => !isCheckup(id) && items.has(id)).map((id) => ({ id: crypto.randomUUID(), label: items.get(id)!, date }))
}

export async function profileRecord(db: Database, w: Worker, profileId: string): Promise<HealthRecord | undefined> {
  const p = await getProfile(db, w.id, profileId)
  if (!p) return undefined
  const entries = await db.query<{ id: string; kind: string; text: string; entry_time: string; data_json: string }>(
    'SELECT id, kind, text, entry_time, data_json FROM health_entries WHERE profile_id = ? AND voided_at IS NULL ORDER BY entry_time',
    [profileId],
  )
  return {
    person: { id: p.id, name: p.name, sex: p.sex || null, birthDate: p.date_of_birth, birthYear: p.birth_year, abha: p.abha_id },
    labs: labs(await listReports(db, w, { profileId }), p.sex || null),
    doses: entries.flatMap((e) => {
      const d = JSON.parse(e.data_json)
      return doses([...(d.vaccines ?? []), ...(d.anc ?? [])], e.entry_time)
    }),
    visits: entries.filter((e) => e.kind === 'visit').map((e) => ({ id: e.id, date: e.entry_time, text: e.text })),
  }
}

export async function patientRecord(db: Database, w: Worker, patientId: string): Promise<HealthRecord | undefined> {
  const p = await getPatient(db, w, patientId)
  if (!p) return undefined
  const chains = resolveChains(await db.query<VisitRow>('SELECT * FROM patient_visits WHERE patient_id = ?', [patientId])).filter((c) => !c.voided)
  const visits = chains.map((c) => c.current).sort((a, b) => a.visit_time.localeCompare(b.visit_time))
  return {
    person: { id: p.id, name: p.display_name, sex: p.sex, birthDate: p.date_of_birth, birthYear: null, abha: p.abha_id },
    labs: labs((await listReports(db, w)).filter((r) => r.patient_id === patientId), p.sex),
    doses: visits.flatMap((v) => {
      const o = JSON.parse(v.observations_json)
      return doses([...(o.vaccines ?? []), ...(o.anc ?? [])], v.visit_time)
    }),
    visits: visits.map((v) => ({ id: v.id, date: v.visit_time, text: v.notes })),
  }
}
