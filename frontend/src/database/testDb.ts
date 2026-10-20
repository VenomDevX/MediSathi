// Test helper: real SQLite (in-memory, Node build) with the app schema applied.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { wrapSqlite } from './sqlite'
import schema from './schema.sql?raw'
import type { Database } from './types'

export async function openTestDb(withSchema: string = schema): Promise<Database> {
  const sqlite3 = await sqlite3InitModule()
  const db = wrapSqlite(new sqlite3.oo1.DB(':memory:', 'c'))
  await db.exec(withSchema)
  return db
}
