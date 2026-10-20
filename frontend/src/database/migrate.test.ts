import { describe, expect, it } from 'vitest'
import schema from './schema.sql?raw'
import { migrate } from './migrate'
import { openTestDb } from './testDb'

// The schema every device had before the citizen role (commit 25cf378).
const before = schema.replace(", 'citizen'", '')

describe('migrate', () => {
  it('lets an existing device store citizens, keeping every user column', async () => {
    const db = await openTestDb(before)
    await db.batch([
      {
        sql: `INSERT INTO users (id, server_user_id, display_name, role, assigned_scope_json, pin_verifier, pin_salt, wrapped_secret, failed_pin_attempts, last_server_contact_at)
              VALUES ('u-sunita', 'u-sunita', 'Sunita', 'asha_worker', '["village-rampur"]', 'VERIFIER', 'SALT', 'WRAPPED', 2, '2026-10-19T00:00:00Z')`,
      },
    ])
    await migrate(db)
    await db.batch([{ sql: "INSERT INTO users (id, display_name, role) VALUES ('u-ramesh', 'Ramesh', 'citizen')" }])
    const [sunita] = await db.query('SELECT * FROM users WHERE id = ?', ['u-sunita'])
    expect(sunita).toMatchObject({
      server_user_id: 'u-sunita', role: 'asha_worker', assigned_scope_json: '["village-rampur"]',
      pin_verifier: 'VERIFIER', pin_salt: 'SALT', wrapped_secret: 'WRAPPED', failed_pin_attempts: 2, last_server_contact_at: '2026-10-19T00:00:00Z',
    })
  })

  it('cleans up the table a failed earlier attempt left behind, and leaves foreign keys on', async () => {
    const db = await openTestDb(before)
    await db.exec('PRAGMA foreign_keys = ON; CREATE TABLE users_migrated (id TEXT)')
    await migrate(db)
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 'users_migrated'")).toEqual([])
    expect(await db.query('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }])
  })

  it('does nothing on a device that is already up to date', async () => {
    const db = await openTestDb()
    await db.batch([{ sql: "INSERT INTO users (id, display_name, role, pin_verifier) VALUES ('u-ramesh', 'Ramesh', 'citizen', 'V')" }])
    await migrate(db)
    await migrate(db)
    expect(await db.query('SELECT id, pin_verifier FROM users')).toEqual([{ id: 'u-ramesh', pin_verifier: 'V' }])
  })
})
