import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { MAX_ATTEMPTS, hasPin, resetBuiltInDemoPins, setPin, storeSecret, unlock } from './pin'

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
    expect(await unlock(db, 'u1', '4826')).toEqual({ status: 'ok' })
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

  it('keeps the refresh token encrypted under the PIN and returns it only on unlock', async () => {
    const db = await setup()
    await setPin(db, 'u1', '4826', 'refresh-token-abc')
    const [row] = await db.query<{ wrapped_secret: string }>('SELECT wrapped_secret FROM users')
    expect(row.wrapped_secret).toBeTruthy()
    expect(row.wrapped_secret).not.toContain('refresh-token-abc')
    expect(await unlock(db, 'u1', '4826')).toEqual({ status: 'ok', secret: 'refresh-token-abc' })
  })

  it('can replace the stored secret after a token refresh without changing the PIN', async () => {
    const db = await setup()
    await setPin(db, 'u1', '4826', 'old')
    const key = (await unlock(db, 'u1', '4826')) as { status: 'ok' }
    expect(key.status).toBe('ok')
    await storeSecret(db, 'u1', '4826', 'new')
    expect(await unlock(db, 'u1', '4826')).toEqual({ status: 'ok', secret: 'new' })
  })
})

describe('built-in demo PIN', () => {
  it('makes offline demo accounts still on the old built-in 1234 choose their own PIN, once', async () => {
    const db = await setup()
    await db.batch([
      { sql: "INSERT INTO users (id, display_name, role) VALUES ('u2', 'Ramesh', 'citizen')" },
      { sql: "INSERT INTO users (id, server_user_id, display_name, role) VALUES ('u3', 'u3', 'Signed in', 'asha_worker')" },
    ])
    await setPin(db, 'u1', '1234')
    await setPin(db, 'u2', '5678')
    await setPin(db, 'u3', '1234', 'refresh-token')

    await resetBuiltInDemoPins(db)
    expect(await hasPin(db, 'u1')).toBe(false) // demo account on the built-in PIN: must create one
    expect(await hasPin(db, 'u2')).toBe(true) // chose their own
    expect(await unlock(db, 'u3', '1234')).toEqual({ status: 'ok', secret: 'refresh-token' }) // a real account's choice is theirs

    await setPin(db, 'u1', '1234') // chosen deliberately after the reset: kept
    await resetBuiltInDemoPins(db)
    expect(await hasPin(db, 'u1')).toBe(true)
    expect((await db.query<{ failed_pin_attempts: number }>("SELECT failed_pin_attempts FROM users WHERE id = 'u2'"))[0].failed_pin_attempts).toBe(0)
  })

  it('survives two start-ups at once (React runs start-up twice in development)', async () => {
    const db = await setup()
    await expect(Promise.all([resetBuiltInDemoPins(db), resetBuiltInDemoPins(db)])).resolves.toBeDefined()
  })
})
