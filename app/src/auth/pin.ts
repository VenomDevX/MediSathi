import type { Database } from '../database/types'

export const MAX_ATTEMPTS = 5
export const MAX_OFFLINE_DAYS = 7
const ITERATIONS = 310_000 // OWASP PBKDF2-SHA256 guidance

export type UnlockResult =
  | { status: 'ok' }
  | { status: 'wrong'; remaining: number }
  | { status: 'locked' }
  | { status: 'expired' }
  | { status: 'no-pin' }

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS }, key, 256)
  return b64(bits)
}

export async function hasPin(db: Database, userId: string): Promise<boolean> {
  const [u] = await db.query<{ pin_verifier: string | null }>('SELECT pin_verifier FROM users WHERE id = ?', [userId])
  return !!u?.pin_verifier
}

export async function setPin(db: Database, userId: string, pin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4 to 6 digits')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  await db.batch([
    {
      sql: 'UPDATE users SET pin_verifier = ?, pin_salt = ?, failed_pin_attempts = 0 WHERE id = ?',
      bind: [await derive(pin, salt), b64(salt), userId],
    },
  ])
}

export async function unlock(db: Database, userId: string, pin: string, now = new Date()): Promise<UnlockResult> {
  const [u] = await db.query<{ pin_verifier: string | null; pin_salt: string | null; failed_pin_attempts: number; last_server_contact_at: string | null }>(
    'SELECT pin_verifier, pin_salt, failed_pin_attempts, last_server_contact_at FROM users WHERE id = ?',
    [userId],
  )
  if (!u?.pin_verifier || !u.pin_salt) return { status: 'no-pin' }
  if (u.failed_pin_attempts >= MAX_ATTEMPTS) return { status: 'locked' }
  // ponytail: a user who has never reached the server (seeded demo user) has no offline window yet; Phase 6 login always sets it.
  if (u.last_server_contact_at && now.getTime() - Date.parse(u.last_server_contact_at) > MAX_OFFLINE_DAYS * 864e5) {
    return { status: 'expired' }
  }
  if ((await derive(pin, unb64(u.pin_salt))) === u.pin_verifier) {
    await db.batch([{ sql: 'UPDATE users SET failed_pin_attempts = 0 WHERE id = ?', bind: [userId] }])
    return { status: 'ok' }
  }
  const failed = u.failed_pin_attempts + 1
  await db.batch([{ sql: 'UPDATE users SET failed_pin_attempts = ? WHERE id = ?', bind: [failed, userId] }])
  return failed >= MAX_ATTEMPTS ? { status: 'locked' } : { status: 'wrong', remaining: MAX_ATTEMPTS - failed }
}
