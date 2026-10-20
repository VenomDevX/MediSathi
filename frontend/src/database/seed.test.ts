import { describe, expect, it } from 'vitest'
import schema from './schema.sql?raw'
import { migrate } from './migrate'
import { openTestDb } from './testDb'
import { seedIfNeeded, type SeedContent } from './seed'

const content: SeedContent = {
  version: '1',
  users: [{ id: 'u1', display_name: 'Sunita Devi', role: 'asha_worker', assigned_scope: ['village-rampur'] }],
  guidance: [
    {
      id: 'g-fever-hi',
      title: 'बुखार',
      language: 'hi',
      topic: 'fever',
      category: 'first-aid',
      summary: 's',
      content: 'c',
      keywords: ['ताप'],
      source_name: 'demo',
      version: '1',
      reviewed: false,
      limitations: 'l',
      audience: 'all',
    },
  ],
  labCatalogue: [{ id: 'hb', canonical_name: 'Haemoglobin', aliases: ['Hb'], unit: 'g/dL' }],
  donors: [
    {
      id: 'd1',
      blood_group: 'O+',
      approx_latitude: 26.85,
      approx_longitude: 80.95,
      locality_label: 'Rampur',
      consent_status: 'granted',
      last_verified_at: '2026-09-01T00:00:00Z',
      registration_status: 'active',
    },
  ],
  patients: [],
}

describe('seedIfNeeded', () => {
  it('loads every content type on first run', async () => {
    const db = await openTestDb()
    await seedIfNeeded(db, content)
    const count = async (t: string) => (await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${t}`))[0].n
    expect(await count('users')).toBe(1)
    expect(await count('guidance_documents')).toBe(1)
    expect(await count('lab_test_catalogue')).toBe(1)
    expect(await count('donors')).toBe(1)
  })

  it('does not duplicate rows when run twice with the same version', async () => {
    const db = await openTestDb()
    await seedIfNeeded(db, content)
    await seedIfNeeded(db, content)
    const [{ n }] = await db.query<{ n: number }>('SELECT count(*) AS n FROM guidance_documents')
    expect(n).toBe(1)
  })

  it('refreshes guidance when the content version changes', async () => {
    const db = await openTestDb()
    await seedIfNeeded(db, content)
    await seedIfNeeded(db, {
      ...content,
      version: '2',
      guidance: [{ ...content.guidance[0], title: 'बुखार (नया)' }],
    })
    const rows = await db.query<{ title: string }>('SELECT title FROM guidance_documents')
    expect(rows.map((r) => r.title)).toEqual(['बुखार (नया)'])
  })
})

describe('demo accounts on an older device', () => {
  it('adds the citizen account that an older database silently refused, once the table allows it', async () => {
    const withCitizen = { ...content, users: [...content.users!, { id: 'u-ramesh', display_name: 'Ramesh Kumar', role: 'citizen', assigned_scope: [] }] }
    const db = await openTestDb(schema.replace(", 'citizen'", '')) // before the citizen role
    await seedIfNeeded(db, withCitizen) // OR IGNORE skips the row that breaks the role CHECK
    await migrate(db)
    await seedIfNeeded(db, withCitizen) // same content version: the next start-up
    expect(await db.query('SELECT id FROM users ORDER BY id')).toEqual([{ id: 'u-ramesh' }, { id: 'u1' }])
  })
})
