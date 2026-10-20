import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { directoryUpdatedAt, listDonors, revealContact } from './donors'

async function setup() {
  const db = await openTestDb()
  await db.batch([
    {
      sql: `INSERT INTO donors (id, blood_group, approx_latitude, approx_longitude, locality_label, contact_encrypted, consent_status, last_verified_at, last_synced_at, registration_status)
            VALUES ('d1', 'O+', 27.57, 80.68, 'Sitapur', 'Demo contact 01', 'granted', '2026-09-01T00:00:00Z', '2026-10-18T00:00:00Z', 'active')`,
    },
  ])
  return db
}

const coordinator = { id: 'u-rakesh', role: 'coordinator' }
const asha = { id: 'u-sunita', role: 'asha_worker' }

describe('donor directory', () => {
  it('lists donors without their contact details', async () => {
    const db = await setup()
    const [d] = await listDonors(db)
    expect(d.id).toBe('d1')
    expect(d).not.toHaveProperty('contact_encrypted')
  })

  it('reports when the directory was last synced', async () => {
    expect(await directoryUpdatedAt(await setup())).toBe('2026-10-18T00:00:00Z')
  })

  it('reveals a contact to a coordinator and records an audit event', async () => {
    const db = await setup()
    expect(await revealContact(db, coordinator, 'd1')).toBe('Demo contact 01')
    const events = await db.query<{ actor_id: string; action: string; entity_id: string; result: string }>('SELECT * FROM audit_events')
    expect(events).toEqual([expect.objectContaining({ actor_id: 'u-rakesh', action: 'donor_contact_reveal', entity_id: 'd1', result: 'ok' })])
    const [{ n }] = await db.query<{ n: number }>("SELECT count(*) AS n FROM sync_operations WHERE entity_type = 'audit_event'")
    expect(n).toBe(1)
  })

  it('refuses to reveal a donor who withdrew consent, and records the refusal', async () => {
    const db = await setup()
    await db.batch([{ sql: "UPDATE donors SET consent_status = 'withdrawn'" }])
    await expect(revealContact(db, coordinator, 'd1')).rejects.toThrow(/consent/)
    const [e] = await db.query<{ result: string }>('SELECT result FROM audit_events')
    expect(e.result).toBe('denied')
  })

  it('refuses other roles and records the refusal', async () => {
    const db = await setup()
    await expect(revealContact(db, asha, 'd1')).rejects.toThrow(/coordinator/)
    const [e] = await db.query<{ result: string }>('SELECT result FROM audit_events')
    expect(e.result).toBe('denied')
  })
})
