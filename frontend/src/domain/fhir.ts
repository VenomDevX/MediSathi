// A person's record as a FHIR R4 Bundle following the ABDM (NRCeS) profiles' conventions, so it can be shared with a
// hospital or an ABDM health locker. Built on the device; nothing is sent anywhere by this module.
import { formatAbha } from './abha'

export type FhirPerson = { id: string; name: string; sex: string | null; birthDate: string | null; birthYear: number | null; abha: string | null }
export type FhirLab = { id: string; name: string; value: string; unit: string; low: number | null; high: number | null; status: 'low' | 'normal' | 'high' | 'unknown'; date: string }
export type FhirDose = { id: string; label: string; date: string }
export type FhirVisit = { id: string; date: string; text: string }

const ABHA_SYSTEM = 'https://healthid.ndhm.gov.in' // as in the NRCeS ABDM Patient examples
const PROFILE = 'https://nrces.in/ndhm/fhir/r4/StructureDefinition/'
const GENDER: Record<string, string> = { F: 'female', M: 'male', O: 'other' }
const INTERPRETATION = { low: ['L', 'Low'], normal: ['N', 'Normal'], high: ['H', 'High'] } as const

const urn = (id: string) => `urn:uuid:${id}`
const quantity = (n: number | null, unit: string) => (n === null ? undefined : { value: n, unit })

export function toFhirBundle(o: { person: FhirPerson; labs: FhirLab[]; doses: FhirDose[]; visits: FhirVisit[]; now: Date; bundleId: string }) {
  const patient = { reference: urn(o.person.id), display: o.person.name }
  const entry = (id: string, resource: Record<string, unknown>) => ({ fullUrl: urn(id), resource: { id, ...resource } })

  return {
    resourceType: 'Bundle',
    id: o.bundleId,
    meta: { lastUpdated: o.now.toISOString() },
    identifier: { system: 'https://medisaathi.in/export', value: o.bundleId },
    type: 'collection',
    timestamp: o.now.toISOString(),
    entry: [
      entry(o.person.id, {
        resourceType: 'Patient',
        meta: { profile: [`${PROFILE}Patient`] },
        ...(o.person.abha && {
          identifier: [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR', display: 'Medical record number' }] }, system: ABHA_SYSTEM, value: formatAbha(o.person.abha) }],
        }),
        name: [{ text: o.person.name }],
        ...(o.person.sex && GENDER[o.person.sex] && { gender: GENDER[o.person.sex] }),
        ...((o.person.birthDate ?? o.person.birthYear) && { birthDate: o.person.birthDate ?? String(o.person.birthYear) }),
      }),
      ...o.labs.map((l) =>
        entry(l.id, {
          resourceType: 'Observation',
          meta: { profile: [`${PROFILE}Observation`] },
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
          code: { text: l.name },
          subject: patient,
          effectiveDateTime: l.date,
          ...(Number.isFinite(Number(l.value)) ? { valueQuantity: { value: Number(l.value), unit: l.unit } } : { valueString: `${l.value} ${l.unit}`.trim() }),
          ...((l.low !== null || l.high !== null) && { referenceRange: [{ low: quantity(l.low, l.unit), high: quantity(l.high, l.unit) }] }),
          ...(l.status !== 'unknown' && {
            interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: INTERPRETATION[l.status][0], display: INTERPRETATION[l.status][1] }] }],
          }),
        }),
      ),
      ...o.doses.map((d) =>
        entry(d.id, {
          resourceType: 'Immunization',
          meta: { profile: [`${PROFILE}Immunization`] },
          status: 'completed',
          vaccineCode: { text: d.label },
          patient,
          occurrenceDateTime: d.date,
          primarySource: false, // recorded by the family or an ASHA worker, not by the vaccinator's system
        }),
      ),
      ...o.visits.map((v) =>
        entry(v.id, {
          resourceType: 'Encounter',
          status: 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'HH', display: 'home health' },
          subject: patient,
          period: { start: v.date },
          ...(v.text && { reasonCode: [{ text: v.text }] }),
        }),
      ),
    ],
  }
}
