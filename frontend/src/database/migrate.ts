// Brings an existing device's database up to the current schema.sql. Runs after schema.sql on every start; each step is idempotent.
import schema from './schema.sql?raw'
import type { Database } from './types'

/**
 * SQLite cannot change a CHECK constraint in place, so a `users` table from before the citizen role is rebuilt from
 * schema.sql: copy by column name (never SELECT *) and swap, in one transaction, so a failure leaves the old table as
 * it was. No other table references users.
 */
export async function migrate(db: Database) {
  // Reports can belong to a family member (not only a patient) since the web and worker apps merged.
  const reportCols = await db.query<{ name: string }>("SELECT name FROM pragma_table_info('medical_reports')")
  if (!reportCols.some((c) => c.name === 'profile_id')) await db.exec('ALTER TABLE medical_reports ADD COLUMN profile_id TEXT REFERENCES profiles (id)')

  // Personal records belong to one account. What a device already had goes to the account signed in when it updates.
  for (const table of ['profiles', 'chats', 'medical_reports']) {
    const cols = await db.query<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
    if (cols.some((c) => c.name === 'owner_id')) continue
    await db.batch([
      { sql: `ALTER TABLE ${table} ADD COLUMN owner_id TEXT` },
      { sql: `UPDATE ${table} SET owner_id = (SELECT value FROM app_meta WHERE key = 'current_user_id')` },
    ])
  }

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
