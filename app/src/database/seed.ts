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
  users: { id: string; display_name: string; role: string; assigned_scope: string[] }[]
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
  patients: {
    id: string
    display_name: string
    age_years?: number
    sex?: string
    village?: string
    local_identifier?: string
    scope_id: string
    created_by: string
  }[]
}

/**
 * Loads bundled demo content. Reference content (guidance, lab catalogue, donors) is replaced
 * whenever the content version changes; users and patients are only inserted if missing,
 * so a worker's own records are never overwritten.
 */
export async function seedIfNeeded(db: Database, c: SeedContent): Promise<void> {
  const [meta] = await db.query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'content_version'")
  if (meta?.value === c.version) return

  const s: Statement[] = [
    { sql: 'DELETE FROM guidance_documents' },
    { sql: 'DELETE FROM lab_test_catalogue' },
    { sql: 'DELETE FROM donors' },
  ]
  for (const u of c.users) {
    s.push({
      sql: 'INSERT OR IGNORE INTO users (id, display_name, role, assigned_scope_json) VALUES (?, ?, ?, ?)',
      bind: [u.id, u.display_name, u.role, JSON.stringify(u.assigned_scope)],
    })
  }
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
      sql: `INSERT INTO donors (id, blood_group, approx_latitude, approx_longitude, locality_label, contact_encrypted,
              consent_status, last_verified_at, last_synced_at, registration_status)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      // Contacts are never bundled: they come only from the server, and only to coordinator devices.
      bind: [
        d.id, d.blood_group, d.approx_latitude, d.approx_longitude, d.locality_label,
        d.consent_status, d.last_verified_at, d.last_verified_at, d.registration_status,
      ],
    })
  }
  for (const p of c.patients) {
    s.push({
      sql: `INSERT OR IGNORE INTO patients (id, display_name, age_years, sex, village, local_identifier, scope_id, created_by, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      bind: [p.id, p.display_name, p.age_years ?? null, p.sex ?? null, p.village ?? null, p.local_identifier ?? null, p.scope_id, p.created_by],
    })
  }
  s.push({ sql: "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('content_version', ?)", bind: [c.version] })
  await db.batch(s)
}
