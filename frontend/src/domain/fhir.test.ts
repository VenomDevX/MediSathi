import { describe, expect, it } from 'vitest'
import { toFhirBundle } from './fhir'

const now = new Date('2026-10-23T10:00:00Z')
const bundle = toFhirBundle({
  person: { id: 'p1', name: 'Kamla Yadav', sex: 'F', birthDate: '1999-04-02', birthYear: 1999, abha: '12345678901234' },
  labs: [
    { id: 'o1', name: 'Haemoglobin', value: '9.8', unit: 'g/dL', low: 12, high: 15.5, status: 'low', date: '2026-10-01' },
    { id: 'o2', name: 'Urine sugar', value: 'Nil', unit: '', low: null, high: null, status: 'unknown', date: '2026-10-01' },
  ],
  doses: [{ id: 'i1', label: 'Td-1 injection', date: '2026-09-10' }],
  visits: [{ id: 'e1', date: '2026-09-10T09:00:00Z', text: 'ANC registration' }],
  now,
  bundleId: 'b1',
})
const resources = bundle.entry.map((e) => e.resource as Record<string, unknown>)

describe('toFhirBundle', () => {
  it('holds one resource per item, of the right types', () => {
    expect(bundle).toMatchObject({ resourceType: 'Bundle', type: 'collection', timestamp: now.toISOString() })
    expect(resources.map((r) => r.resourceType)).toEqual(['Patient', 'Observation', 'Observation', 'Immunization', 'Encounter'])
  })

  it('identifies the patient by ABHA number the ABDM way', () => {
    expect(resources[0]).toMatchObject({
      identifier: [{ system: 'https://healthid.ndhm.gov.in', value: '12-3456-7890-1234' }],
      gender: 'female',
      birthDate: '1999-04-02',
    })
  })

  it('writes lab values with ranges and a low/normal/high flag, and text values as text', () => {
    expect(resources[1]).toMatchObject({
      valueQuantity: { value: 9.8, unit: 'g/dL' },
      referenceRange: [{ low: { value: 12 }, high: { value: 15.5 } }],
      interpretation: [{ coding: [{ code: 'L' }] }],
    })
    expect(resources[2]).toMatchObject({ valueString: 'Nil' })
    expect(resources[2]).not.toHaveProperty('interpretation')
  })

  it('resolves every reference inside the bundle', () => {
    const urls = new Set(bundle.entry.map((e) => e.fullUrl))
    const refs = JSON.stringify(bundle).match(/"reference":"([^"]+)"/g)!.map((m) => m.slice(13, -1))
    expect(refs.length).toBe(4)
    for (const r of refs) expect(urls.has(r)).toBe(true)
  })

  it('leaves out what is not known', () => {
    const b = toFhirBundle({ person: { id: 'p2', name: 'X', sex: null, birthDate: null, birthYear: null, abha: null }, labs: [], doses: [], visits: [], now, bundleId: 'b2' })
    expect(b.entry[0].resource).toEqual({ id: 'p2', resourceType: 'Patient', meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient'] }, name: [{ text: 'X' }] })
  })
})
