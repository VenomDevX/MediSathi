import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { addVisit, amendVisit, createPatient, followUpsDue, getPatient, listPatients, listVisits } from './records'

const worker = { id: 'u1', assigned_scope: ['village-a'] }

async function setup() {
  const db = await openTestDb()
  const p = await createPatient(db, worker, { display_name: 'Kamla Yadav', age_years: 27, sex: 'F', village: 'Rampur', scope_id: 'village-a' })
  return { db, p }
}

describe('patients', () => {
  it('creates a patient and queues exactly one sync operation for it', async () => {
    const { db, p } = await setup()
    expect((await getPatient(db, worker, p.id))?.display_name).toBe('Kamla Yadav')
    const ops = await db.query<{ entity_type: string; entity_id: string; status: string }>('SELECT * FROM sync_operations')
    expect(ops).toEqual([expect.objectContaining({ entity_type: 'patient', entity_id: p.id, status: 'pending' })])
  })

  it('rejects a patient outside the worker scope', async () => {
    const db = await openTestDb()
    await expect(createPatient(db, worker, { display_name: 'X', scope_id: 'village-b' })).rejects.toThrow(/scope/)
  })

  it('never lists or opens patients from another scope', async () => {
    const { db } = await setup()
    await db.batch([{ sql: "INSERT INTO patients (id, display_name, scope_id, created_by) VALUES ('other', 'Outsider', 'village-b', 'u9')" }])
    expect((await listPatients(db, worker, '')).map((r) => r.display_name)).toEqual(['Kamla Yadav'])
    expect(await getPatient(db, worker, 'other')).toBeUndefined()
  })

  it('searches by name or local id, case-insensitively', async () => {
    const { db } = await setup()
    expect(await listPatients(db, worker, 'kamla')).toHaveLength(1)
    expect(await listPatients(db, worker, 'zzz')).toHaveLength(0)
  })

  it('requires a name', async () => {
    const db = await openTestDb()
    await expect(createPatient(db, worker, { display_name: '  ', scope_id: 'village-a' })).rejects.toThrow(/name/)
  })
})

describe('visits', () => {
  it('adds a visit with a queued sync operation', async () => {
    const { db, p } = await setup()
    await addVisit(db, worker, p.id, { visit_time: '2026-10-19T09:00:00Z', notes: 'BP check', observations: { bp: '130/85' } })
    const chains = await listVisits(db, worker, p.id)
    expect(chains[0].current.notes).toBe('BP check')
    const [{ n }] = await db.query<{ n: number }>("SELECT count(*) AS n FROM sync_operations WHERE entity_type = 'patient_visit'")
    expect(n).toBe(1)
  })

  it('amends by appending a new row and leaves the original untouched', async () => {
    const { db, p } = await setup()
    const first = await addVisit(db, worker, p.id, { visit_time: '2026-10-19T09:00:00Z', notes: 'BP 130/85' })
    await amendVisit(db, worker, first.id, { notes: 'BP 135/85', reason: 'Typo' })
    const [chain] = await listVisits(db, worker, p.id)
    expect(chain.current.notes).toBe('BP 135/85')
    expect(chain.current.amendment_reason).toBe('Typo')
    expect(chain.history[0].notes).toBe('BP 130/85')
    const rows = await db.query('SELECT id FROM patient_visits')
    expect(rows).toHaveLength(2)
  })

  it('lists follow-ups due by a date, using only the current version of each visit', async () => {
    const { db, p } = await setup()
    const v = await addVisit(db, worker, p.id, { visit_time: '2026-10-10T09:00:00Z', notes: 'x', follow_up_at: '2026-10-19' })
    await amendVisit(db, worker, v.id, { follow_up_at: '2026-10-25', reason: 'Moved' })
    await addVisit(db, worker, p.id, { visit_time: '2026-10-11T09:00:00Z', notes: 'y', follow_up_at: '2026-10-18' })
    const due = await followUpsDue(db, worker, '2026-10-19')
    expect(due.map((d) => d.follow_up_at)).toEqual(['2026-10-18'])
    expect(due[0].display_name).toBe('Kamla Yadav')
  })

  it('clears a follow-up once a later visit is recorded for that patient', async () => {
    const { db, p } = await setup()
    await addVisit(db, worker, p.id, { visit_time: '2026-10-10T09:00:00Z', notes: 'x', follow_up_at: '2026-10-15' })
    await addVisit(db, worker, p.id, { visit_time: '2026-10-16T09:00:00Z', notes: 'came back' })
    expect(await followUpsDue(db, worker, '2026-10-19')).toEqual([])
  })
})
