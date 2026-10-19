import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { MAX_ATTEMPTS, hasPin, setPin, unlock } from './pin'

async function setup() {
  const db = await openTestDb()
  await db.batch([{ sql: "INSERT INTO users (id, display_name, role) VALUES ('u1', 'Sunita', 'asha_worker')" }])
  return db
}

describe('PIN unlock', () => {
  it('reports no PIN until one is set', async () => {
    const db = await setup()
    expect(await hasPin(db, 'u1')).toBe(false)
    expect((await unlock(db, 'u1', '1234')).status).toBe('no-pin')
  })

  it('unlocks with the right PIN and never stores the PIN itself', async () => {
    const db = await setup()
    await setPin(db, 'u1', '4826')
    expect((await unlock(db, 'u1', '4826')).status).toBe('ok')
    const [row] = await db.query<{ pin_verifier: string }>('SELECT pin_verifier FROM users')
    expect(row.pin_verifier).not.toContain('4826')
  })

  it('rejects PINs that are not 4 to 6 digits', async () => {
    const db = await setup()
    await expect(setPin(db, 'u1', '12a4')).rejects.toThrow()
    await expect(setPin(db, 'u1', '123')).rejects.toThrow()
  })

  it('counts down remaining attempts and locks after the limit, even for the right PIN', async () => {
    const db = await setup()
    await setPin(db, 'u1', '4826')
    const first = await unlock(db, 'u1', '0000')
    expect(first).toEqual({ status: 'wrong', remaining: MAX_ATTEMPTS - 1 })
    for (let i = 1; i < MAX_ATTEMPTS; i++) await unlock(db, 'u1', '0000')
    expect((await unlock(db, 'u1', '4826')).status).toBe('locked')
  })

  it('resets the attempt counter after a successful unlock', async () => {
    const db = await setup()
    await setPin(db, 'u1', '4826')
    await unlock(db, 'u1', '0000')
    await unlock(db, 'u1', '4826')
    expect(await unlock(db, 'u1', '0000')).toEqual({ status: 'wrong', remaining: MAX_ATTEMPTS - 1 })
  })

  it('expires offline access 7 days after the last server contact', async () => {
    const db = await setup()
    await setPin(db, 'u1', '4826')
    await db.batch([{ sql: "UPDATE users SET last_server_contact_at = '2026-10-01T00:00:00Z'" }])
    expect((await unlock(db, 'u1', '4826', new Date('2026-10-07T23:00:00Z'))).status).toBe('ok')
    expect((await unlock(db, 'u1', '4826', new Date('2026-10-08T01:00:00Z'))).status).toBe('expired')
  })
})
