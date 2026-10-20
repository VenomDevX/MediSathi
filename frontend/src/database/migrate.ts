// Brings an existing device's database up to the current schema.sql. Runs after schema.sql on every start.
import schema from './schema.sql?raw'
import type { Database } from './types'

/**
 * SQLite cannot change a CHECK constraint in place, so a `users` table from before the citizen role is rebuilt from
 * schema.sql: copy by column name (never SELECT *) and swap, in one transaction, so a failure leaves the old table as
 * it was. No other table references users.
 */
export async function migrate(db: Database) {
  await db.exec('DROP TABLE IF EXISTS users_migrated') // left behind by a failed attempt in an earlier build
  const [users] = await db.query<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
  if (!users || users.sql.includes("'citizen'")) return

  const create = schema.match(/CREATE TABLE IF NOT EXISTS users \([\s\S]*?\n\);/)?.[0]
  if (!create) throw new Error('users table missing from schema.sql')
  const cols = (await db.query<{ name: string }>("SELECT name FROM pragma_table_info('users')")).map((c) => c.name).join(', ')
  await db.batch([
    { sql: 'DROP TABLE IF EXISTS users_new' },
    { sql: create.replace('IF NOT EXISTS users', 'users_new') },
    { sql: `INSERT INTO users_new (${cols}) SELECT ${cols} FROM users` },
    { sql: 'DROP TABLE users' },
    { sql: 'ALTER TABLE users_new RENAME TO users' },
  ])
}
