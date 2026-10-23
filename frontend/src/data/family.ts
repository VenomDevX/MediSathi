// The people whose health an account keeps (the user and their family) and their notes, medicines and visits.
// Everything here belongs to one account (`owner`, the signed-in user id): other accounts on the device never see it.
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
  date_of_birth: string | null
  /** Last menstrual period, while pregnant. */
  lmp_date: string | null
  abha_id: string | null
}

export type EntryKind = 'note' | 'medicine' | 'reading' | 'visit'
export type Entry = { id: string; profile_id: string; kind: EntryKind; text: string; entry_time: string; follow_up_at: string | null }
export type FollowUp = Entry & { profile_name: string }

const profileCols = 'id, name, relation, birth_year, sex, blood_group, conditions, allergies, date_of_birth, lmp_date, abha_id'

/** Creates a person, or updates one of `owner`'s when `id` is given (someone else's id changes nothing). Returns the id. */
type Later = 'date_of_birth' | 'lmp_date' | 'abha_id' // added after the first release; optional when saving

export async function saveProfile(db: Database, owner: string, p: Omit<Profile, 'id' | Later> & Partial<Pick<Profile, Later>> & { id?: string }): Promise<string> {
  const id = p.id ?? crypto.randomUUID()
  await db.batch([
    {
      sql: `INSERT INTO profiles (id, owner_id, name, relation, birth_year, sex, blood_group, conditions, allergies, date_of_birth, lmp_date, abha_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET name = excluded.name, relation = excluded.relation, birth_year = excluded.birth_year, sex = excluded.sex,
              blood_group = excluded.blood_group, conditions = excluded.conditions, allergies = excluded.allergies,
              date_of_birth = excluded.date_of_birth, lmp_date = excluded.lmp_date, abha_id = excluded.abha_id,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE profiles.owner_id = excluded.owner_id`,
      bind: [id, owner, p.name.trim(), p.relation, p.birth_year, p.sex, p.blood_group, p.conditions.trim(), p.allergies.trim(),
        p.date_of_birth || null, p.lmp_date || null, p.abha_id || null],
    },
  ])
  return id
}

/** The user first, then everyone else by name. */
export const listProfiles = (db: Database, owner: string) =>
  db.query<Profile>(`SELECT ${profileCols} FROM profiles WHERE owner_id = ? AND deleted_at IS NULL ORDER BY relation != 'self', name COLLATE NOCASE`, [owner])

export async function getProfile(db: Database, owner: string, id: string): Promise<Profile | undefined> {
  return (await db.query<Profile>(`SELECT ${profileCols} FROM profiles WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`, [id, owner]))[0]
}

const owned = 'SELECT id FROM profiles WHERE owner_id = ? AND deleted_at IS NULL'

export async function addEntry(
  db: Database,
  owner: string,
  profileId: string,
  e: { kind: EntryKind; text: string; entry_time?: string; follow_up_at?: string | null; data?: { vaccines?: string[]; anc?: string[] } },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.batch([
    {
      sql: `INSERT INTO health_entries (id, profile_id, kind, text, entry_time, follow_up_at, data_json) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ? IN (${owned})`,
      bind: [id, profileId, e.kind, e.text.trim(), e.entry_time ?? new Date().toISOString(), e.follow_up_at || null, JSON.stringify(e.data ?? {}), profileId, owner],
    },
  ])
  return id
}

const entryCols = 'e.id, e.profile_id, e.kind, e.text, e.entry_time, e.follow_up_at'

export const listEntries = (db: Database, owner: string, profileId: string) =>
  db.query<Entry>(
    `SELECT ${entryCols} FROM health_entries e WHERE e.profile_id = ? AND e.profile_id IN (${owned}) AND e.voided_at IS NULL ORDER BY e.entry_time DESC, e.rowid DESC`,
    [profileId, owner],
  )

/** Vaccine doses and pregnancy checkups recorded for a person (ids from content/immunization_schedule.json). */
export async function givenIds(db: Database, owner: string, profileId: string): Promise<Set<string>> {
  const rows = await db.query<{ data_json: string }>(
    `SELECT data_json FROM health_entries WHERE profile_id = ? AND profile_id IN (${owned}) AND voided_at IS NULL`,
    [profileId, owner],
  )
  return new Set(rows.flatMap((r) => { const d = JSON.parse(r.data_json); return [...(d.vaccines ?? []), ...(d.anc ?? [])] }))
}

/** Entries are kept, not deleted: a removed one is marked and hidden. */
export async function voidEntry(db: Database, owner: string, id: string) {
  await db.batch([{ sql: `UPDATE health_entries SET voided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND profile_id IN (${owned})`, bind: [id, owner] }])
}

/** Follow-ups from `today` (YYYY-MM-DD, local) for the next `days` days, soonest first. */
export function upcomingFollowUps(db: Database, owner: string, today: string, days = 7) {
  return db.query<FollowUp>(
    `SELECT ${entryCols}, p.name AS profile_name FROM health_entries e JOIN profiles p ON p.id = e.profile_id
     WHERE p.owner_id = ? AND e.voided_at IS NULL AND p.deleted_at IS NULL AND e.follow_up_at >= ? AND e.follow_up_at <= date(?, '+' || ? || ' days')
     ORDER BY e.follow_up_at, e.rowid`,
    [owner, today, today, days],
  )
}

export const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
