import { describe, expect, it } from 'vitest'
import { openTestDb } from './testDb'

describe('personal schema', () => {
  it('has the tables the app uses, and no health-worker tables', async () => {
    const db = await openTestDb()
    const tables = (await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")).map((t) => t.name)
    for (const t of ['app_meta', 'chats', 'donors', 'guidance_documents', 'guidance_fts', 'health_entries', 'lab_test_catalogue', 'messages', 'profiles', 'reports', 'users'])
      expect(tables).toContain(t)
    for (const t of ['patients', 'patient_visits', 'sync_operations']) expect(tables).not.toContain(t)
  })

  it('finds Hindi guidance through full-text search', async () => {
    const db = await openTestDb()
    await db.exec(`INSERT INTO guidance_documents (id, title, language, topic, content, source_name, version)
                   VALUES ('g1', 'बुखार में क्या करें', 'hi', 'fever', 'पानी पिलाएं', 'demo', '1')`)
    const rows = await db.query<{ id: string }>("SELECT id FROM guidance_fts WHERE guidance_fts MATCH 'बुखार'")
    expect(rows).toEqual([{ id: 'g1' }])
  })

  it('keeps messages with their chat and deletes them with it', async () => {
    const db = await openTestDb()
    await db.exec(`INSERT INTO chats (id, title) VALUES ('c1', 'Fever');
                   INSERT INTO messages (id, chat_id, role, content) VALUES ('m1', 'c1', 'user', 'bukhar hai');
                   DELETE FROM chats WHERE id = 'c1';`)
    expect(await db.query('SELECT id FROM messages')).toEqual([])
  })
})
