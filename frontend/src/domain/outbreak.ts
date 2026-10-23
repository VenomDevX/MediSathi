// Early warning of disease clusters from ASHA visit records (in the spirit of IDSP's syndromic surveillance).
// Runs on the device over the visits the worker or coordinator already has; nothing extra is sent anywhere.
import type { StringKey } from '../strings'

export const SYMPTOMS = ['fever', 'diarrhoea', 'vomiting', 'cough', 'rash', 'jaundice'] as const
export type Symptom = (typeof SYMPTOMS)[number]
export const SYMPTOM_LABEL: Record<Symptom, StringKey> = { fever: 'symFever', diarrhoea: 'symDiarrhoea', vomiting: 'symVomiting', cough: 'symCough', rash: 'symRash', jaundice: 'symJaundice' }

export type SymptomVisit = { patient_id: string; village: string | null; visit_time: string; symptoms: string[] }
export type Cluster = { village: string; symptom: Symptom; cases: number; previous: number; alert: boolean }

const DAY = 864e5

/**
 * Patients with each symptom in each village over the last `windowDays`, against the window before it.
 * An alert needs at least `min` patients and at least double the previous window.
 * ponytail: fixed threshold; switch to IDSP's statistical baseline (mean + 2 SD over past weeks) once real data exists.
 */
export function detectClusters(visits: SymptomVisit[], now: Date, { windowDays = 7, min = 3 } = {}): Cluster[] {
  const start = now.getTime() - windowDays * DAY
  const prevStart = start - windowDays * DAY
  const current = new Map<string, Set<string>>()
  const previous = new Map<string, Set<string>>()
  for (const v of visits) {
    const at = Date.parse(v.visit_time)
    const bucket = at > now.getTime() ? undefined : at >= start ? current : at >= prevStart ? previous : undefined
    if (!bucket || !v.village) continue
    for (const s of v.symptoms) {
      if (!(SYMPTOMS as readonly string[]).includes(s)) continue
      const key = `${v.village}\u0000${s}`
      bucket.set(key, (bucket.get(key) ?? new Set()).add(v.patient_id))
    }
  }
  return [...current]
    .map(([key, patients]) => {
      const [village, symptom] = key.split('\u0000') as [string, Symptom]
      const prev = previous.get(key)?.size ?? 0
      return { village, symptom, cases: patients.size, previous: prev, alert: patients.size >= min && patients.size >= 2 * prev }
    })
    .sort((a, b) => Number(b.alert) - Number(a.alert) || b.cases - a.cases || a.village.localeCompare(b.village))
}
