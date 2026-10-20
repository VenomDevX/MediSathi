import type { Database, Statement } from './types'

export type SeedGuidance = {
  id: string
  title: string
  language: 'hi' | 'en'
  topic: string
  category: string
  summary: string
  content: string
  keywords: string[]
  source_name: string
  source_reference?: string
  version: string
  reviewed: boolean
  limitations: string
  audience: string
}

export type SeedContent = {
  version: string
  guidance: SeedGuidance[]
  labCatalogue: { id: string; canonical_name: string; [k: string]: unknown }[]
  donors: {
    id: string
    blood_group: string
    approx_latitude: number | null
    approx_longitude: number | null
    locality_label: string
    consent_status: string
    last_verified_at: string
    registration_status: string
  }[]
}

/**
 * Loads bundled reference content (guidance, lab catalogue, donor directory), replacing it whenever
 * the content version changes. The family's own data is never touched.
 */
export async function seedIfNeeded(db: Database, c: SeedContent): Promise<void> {
  const [meta] = await db.query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'content_version'")
  if (meta?.value === c.version) return

  const s: Statement[] = [
    { sql: 'DELETE FROM guidance_documents' },
    { sql: 'DELETE FROM lab_test_catalogue' },
    { sql: 'DELETE FROM donors' },
  ]
  for (const g of c.guidance) {
    s.push({
      sql: `INSERT INTO guidance_documents (id, title, language, topic, category, summary, content, keywords,
              source_name, source_reference, reviewed, limitations, audience, version, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      bind: [
        g.id, g.title, g.language, g.topic, g.category, g.summary, g.content, g.keywords.join(' '),
        g.source_name, g.source_reference ?? null, g.reviewed ? 1 : 0, g.limitations, g.audience, g.version,
      ],
    })
  }
  for (const t of c.labCatalogue) {
    s.push({
      sql: 'INSERT INTO lab_test_catalogue (id, canonical_name, data_json, version) VALUES (?, ?, ?, ?)',
      bind: [t.id, t.canonical_name, JSON.stringify(t), c.version],
    })
  }
  for (const d of c.donors) {
    s.push({
      sql: `INSERT INTO donors (id, blood_group, approx_latitude, approx_longitude, locality_label,
              consent_status, last_verified_at, last_synced_at, registration_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        d.id, d.blood_group, d.approx_latitude, d.approx_longitude, d.locality_label,
        d.consent_status, d.last_verified_at, d.last_verified_at, d.registration_status,
      ],
    })
  }
  s.push({ sql: "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('content_version', ?)", bind: [c.version] })
  await db.batch(s)
}
