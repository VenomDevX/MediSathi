// The people whose health this device keeps (the user and their family) and their notes, medicines and visits.
import type { Database } from '../database/types'

export type Profile = {
  id: string
  name: string
  relation: string
  birth_year: number | null
  sex: '' | 'F' | 'M'
  blood_group: string
  conditions: string
  allergies: string
}

export type EntryKind = 'note' | 'medicine' | 'reading' | 'visit'
export type Entry = { id: string; profile_id: string; kind: EntryKind; text: string; entry_time: string; follow_up_at: string | null }
export type FollowUp = Entry & { profile_name: string }

const profileCols = 'id, name, relation, birth_year, sex, blood_group, conditions, allergies'

/** Creates a person, or updates one when `id` is given. Returns the id. */
export async function saveProfile(db: Database, p: Omit<Profile, 'id'> & { id?: string }): Promise<string> {
  const id = p.id ?? crypto.randomUUID()
  await db.batch([
    {
      sql: `INSERT INTO profiles (id, name, relation, birth_year, sex, blood_group, conditions, allergies) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET name = excluded.name, relation = excluded.relation, birth_year = excluded.birth_year, sex = excluded.sex,
              blood_group = excluded.blood_group, conditions = excluded.conditions, allergies = excluded.allergies,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      bind: [id, p.name.trim(), p.relation, p.birth_year, p.sex, p.blood_group, p.conditions.trim(), p.allergies.trim()],
    },
  ])
  return id
}

/** The user first, then everyone else by name. */
export const listProfiles = (db: Database) =>
  db.query<Profile>(`SELECT ${profileCols} FROM profiles WHERE deleted_at IS NULL ORDER BY relation != 'self', name COLLATE NOCASE`)

export async function getProfile(db: Database, id: string): Promise<Profile | undefined> {
  return (await db.query<Profile>(`SELECT ${profileCols} FROM profiles WHERE id = ? AND deleted_at IS NULL`, [id]))[0]
}

export async function addEntry(
  db: Database,
  profileId: string,
  e: { kind: EntryKind; text: string; entry_time?: string; follow_up_at?: string | null },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.batch([
    {
      sql: 'INSERT INTO health_entries (id, profile_id, kind, text, entry_time, follow_up_at) VALUES (?, ?, ?, ?, ?, ?)',
      bind: [id, profileId, e.kind, e.text.trim(), e.entry_time ?? new Date().toISOString(), e.follow_up_at || null],
    },
  ])
  return id
}

const entryCols = 'e.id, e.profile_id, e.kind, e.text, e.entry_time, e.follow_up_at'

export const listEntries = (db: Database, profileId: string) =>
  db.query<Entry>(`SELECT ${entryCols} FROM health_entries e WHERE e.profile_id = ? AND e.voided_at IS NULL ORDER BY e.entry_time DESC, e.rowid DESC`, [profileId])

/** Entries are kept, not deleted: a removed one is marked and hidden. */
export async function voidEntry(db: Database, id: string) {
  await db.batch([{ sql: `UPDATE health_entries SET voided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, bind: [id] }])
}

/** Follow-ups from `today` (YYYY-MM-DD, local) for the next `days` days, soonest first. */
export function upcomingFollowUps(db: Database, today: string, days = 7) {
  return db.query<FollowUp>(
    `SELECT ${entryCols}, p.name AS profile_name FROM health_entries e JOIN profiles p ON p.id = e.profile_id
     WHERE e.voided_at IS NULL AND p.deleted_at IS NULL AND e.follow_up_at >= ? AND e.follow_up_at <= date(?, '+' || ? || ' days')
     ORDER BY e.follow_up_at, e.rowid`,
    [today, today, days],
  )
}
