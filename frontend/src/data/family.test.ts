import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { addEntry, getProfile, listEntries, listProfiles, saveProfile, upcomingFollowUps, voidEntry } from './family'

const ME = 'u-ramesh'
const OTHER = 'u-sunita'

describe('family profiles', () => {
  it('adds and edits people, the user first', async () => {
    const db = await openTestDb()
    const mother = await saveProfile(db, ME, { name: 'Sunita', relation: 'mother', birth_year: 1968, sex: 'F', blood_group: 'B+', conditions: 'Diabetes', allergies: '' })
    const me = await saveProfile(db, ME, { name: 'Ravi', relation: 'self', birth_year: 1995, sex: 'M', blood_group: '', conditions: '', allergies: 'Penicillin' })
    expect((await listProfiles(db, ME)).map((p) => p.name)).toEqual(['Ravi', 'Sunita'])

    await saveProfile(db, ME, { id: mother, name: 'Sunita Devi', relation: 'mother', birth_year: 1968, sex: 'F', blood_group: 'B+', conditions: 'Diabetes, BP', allergies: '' })
    expect(await getProfile(db, ME, mother)).toMatchObject({ name: 'Sunita Devi', conditions: 'Diabetes, BP' })
    expect(await getProfile(db, ME, me)).toMatchObject({ allergies: 'Penicillin', birth_year: 1995 })
  })
})

describe('health entries', () => {
  it('lists a person’s entries newest first, and a removed entry stays out', async () => {
    const db = await openTestDb()
    const p = await saveProfile(db, ME, { name: 'Ravi', relation: 'self', birth_year: null, sex: '', blood_group: '', conditions: '', allergies: '' })
    const a = await addEntry(db, ME, p, { kind: 'reading', text: 'BP 130/85', entry_time: '2026-10-01T09:00:00.000Z' })
    await addEntry(db, ME, p, { kind: 'medicine', text: 'Metformin 500 morning', entry_time: '2026-10-05T09:00:00.000Z' })
    expect((await listEntries(db, ME, p)).map((e) => e.text)).toEqual(['Metformin 500 morning', 'BP 130/85'])

    await voidEntry(db, ME, a)
    expect((await listEntries(db, ME, p)).map((e) => e.text)).toEqual(['Metformin 500 morning'])
  })

  it('shows follow-ups from today for the coming week, soonest first, with whose they are', async () => {
    const db = await openTestDb()
    const ravi = await saveProfile(db, ME, { name: 'Ravi', relation: 'self', birth_year: null, sex: '', blood_group: '', conditions: '', allergies: '' })
    const ma = await saveProfile(db, ME, { name: 'Sunita', relation: 'mother', birth_year: null, sex: '', blood_group: '', conditions: '', allergies: '' })
    await addEntry(db, ME, ma, { kind: 'visit', text: 'Sugar test again', follow_up_at: '2026-10-25' })
    await addEntry(db, ME, ravi, { kind: 'visit', text: 'Dentist', follow_up_at: '2026-10-20' })
    await addEntry(db, ME, ravi, { kind: 'visit', text: 'Past', follow_up_at: '2026-10-19' })
    await addEntry(db, ME, ravi, { kind: 'visit', text: 'Far away', follow_up_at: '2026-11-30' })
    const removed = await addEntry(db, ME, ravi, { kind: 'visit', text: 'Cancelled', follow_up_at: '2026-10-21' })
    await voidEntry(db, ME, removed)

    expect(await upcomingFollowUps(db, ME, '2026-10-20')).toEqual([
      expect.objectContaining({ text: 'Dentist', follow_up_at: '2026-10-20', profile_name: 'Ravi' }),
      expect.objectContaining({ text: 'Sugar test again', follow_up_at: '2026-10-25', profile_name: 'Sunita' }),
    ])
  })
})

describe('accounts on one device', () => {
  it("never shows one account's family, notes or follow-ups to another", async () => {
    const db = await openTestDb()
    const ma = await saveProfile(db, ME, { name: 'Sunita', relation: 'mother', birth_year: null, sex: '', blood_group: '', conditions: '', allergies: '' })
    const note = await addEntry(db, ME, ma, { kind: 'visit', text: 'Sugar test', follow_up_at: '2026-10-21' })

    expect(await listProfiles(db, OTHER)).toEqual([])
    expect(await getProfile(db, OTHER, ma)).toBeUndefined()
    expect(await listEntries(db, OTHER, ma)).toEqual([])
    expect(await upcomingFollowUps(db, OTHER, '2026-10-20')).toEqual([])

    // Writing through someone else's ids changes nothing
    await saveProfile(db, OTHER, { id: ma, name: 'Taken', relation: 'self', birth_year: null, sex: '', blood_group: '', conditions: '', allergies: '' })
    await addEntry(db, OTHER, ma, { kind: 'note', text: 'Planted' })
    await voidEntry(db, OTHER, note)
    expect(await getProfile(db, ME, ma)).toMatchObject({ name: 'Sunita' })
    expect((await listEntries(db, ME, ma)).map((e) => e.text)).toEqual(['Sugar test'])
  })
})
