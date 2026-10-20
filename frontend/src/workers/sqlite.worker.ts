import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { wrapSqlite } from '../database/sqlite'
import schema from '../database/schema.sql?raw'
import type { Database } from '../database/types'

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg)

type Request = { id: number; method: keyof Database; args: unknown[] }

// opfs-sahpool persists in OPFS without COOP/COEP headers (TRD §2).
const ready: Promise<{ db: Database; persistent: boolean }> = (async () => {
  const sqlite3 = await sqlite3InitModule()
  let raw
  let persistent = true
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'medisaathi' })
    raw = new pool.OpfsSAHPoolDb('/medisaathi.sqlite3')
  } catch {
    // ponytail: in-memory fallback for browsers without OPFS; data is lost on reload, UI warns via `persistent`.
    persistent = false
    raw = new sqlite3.oo1.DB(':memory:', 'c')
  }
  const db = wrapSqlite(raw)
  await db.exec(schema)
  try {
    const [row] = await db.query<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
    if (row?.sql && !row.sql.includes('citizen')) {
      await db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE users_migrated (
          id TEXT PRIMARY KEY,
          server_user_id TEXT UNIQUE,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('asha_worker', 'coordinator', 'supervisor', 'admin', 'citizen')),
          assigned_scope_json TEXT NOT NULL DEFAULT '[]',
          last_server_contact_at TEXT,
          pin_verifier TEXT,
          pin_salt TEXT,
          failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT
        );
        INSERT OR IGNORE INTO users_migrated SELECT * FROM users;
        DROP TABLE users;
        ALTER TABLE users_migrated RENAME TO users;
        PRAGMA foreign_keys = ON;
      `)
    }
  } catch (err) {
    console.warn('Migration check failed:', err)
  }
  return { db, persistent }
})()

self.onmessage = async (e: MessageEvent<Request | { id: number; method: 'status' }>) => {
  const { id, method } = e.data
  try {
    const { db, persistent } = await ready
    const result =
      method === 'status'
        ? { persistent }
        : await (db[method] as (...a: unknown[]) => Promise<unknown>)(...(e.data as Request).args)
    post({ id, result })
  } catch (err) {
    post({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
