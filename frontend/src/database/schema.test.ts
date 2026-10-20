import { describe, expect, it } from 'vitest'
import { openTestDb } from './testDb'

describe('local schema', () => {
  it('creates every table from TRD §6.1', async () => {
    const db = await openTestDb()
    const rows = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    const names = rows.map((r) => r.name)
    for (const t of [
      'users',
      'patients',
      'patient_visits',
      'medical_reports',
      'lab_test_catalogue',
      'donors',
      'guidance_documents',
      'guidance_fts',
      'sync_operations',
      'audit_events',
    ]) {
      expect(names).toContain(t)
    }
  })

  it('finds Hindi guidance through FTS5', async () => {
    const db = await openTestDb()
    await db.batch([
      {
        sql: `INSERT INTO guidance_documents (id, title, language, topic, content, keywords, source_name, version, status)
              VALUES ('g1', 'बुखार में क्या करें', 'hi', 'fever', 'बुखार होने पर पानी पिएं', 'ताप', 'demo', '1', 'active')`,
      },
    ])
    const hits = await db.query<{ id: string }>(
      'SELECT id FROM guidance_fts WHERE guidance_fts MATCH ?',
      ['बुखार'],
    )
    expect(hits.map((h) => h.id)).toEqual(['g1'])
  })

  it('rolls back a whole batch when one statement fails', async () => {
    const db = await openTestDb()
    await expect(
      db.batch([
        { sql: "INSERT INTO patients (id, display_name, scope_id, created_by) VALUES ('p1', 'Asha', 's1', 'u1')" },
        { sql: 'INSERT INTO no_such_table VALUES (1)' },
      ]),
    ).rejects.toThrow()
    const rows = await db.query('SELECT id FROM patients')
    expect(rows).toHaveLength(0)
  })
})
