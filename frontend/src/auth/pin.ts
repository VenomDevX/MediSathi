import type { Database } from '../database/types'

export const MAX_ATTEMPTS = 5
export const MAX_OFFLINE_DAYS = 7
const ITERATIONS = 310_000 // OWASP PBKDF2-SHA256 guidance

export type UnlockResult =
  | { status: 'ok'; secret?: string }
  | { status: 'wrong'; remaining: number }
  | { status: 'locked' }
  | { status: 'expired' }
  | { status: 'no-pin' }

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** One PBKDF2 run gives two independent halves: a verifier to check the PIN, and an AES key to wrap the refresh token. */
async function derive(pin: string, salt: Uint8Array): Promise<{ verifier: string; key: CryptoKey }> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS }, base, 512))
  const key = await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { verifier: b64(bits.slice(0, 32)), key }
}

async function wrap(key: CryptoKey, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret)))
  return b64(new Uint8Array([...iv, ...ct]))
}

async function unwrap(key: CryptoKey, wrapped: string): Promise<string> {
  const bytes = unb64(wrapped)
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)))
}

export async function hasPin(db: Database, userId: string): Promise<boolean> {
  const [u] = await db.query<{ pin_verifier: string | null }>('SELECT pin_verifier FROM users WHERE id = ?', [userId])
  return !!u?.pin_verifier
}

export async function setPin(db: Database, userId: string, pin: string, secret?: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4 to 6 digits')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const { verifier, key } = await derive(pin, salt)
  await db.batch([
    {
      sql: 'UPDATE users SET pin_verifier = ?, pin_salt = ?, wrapped_secret = ?, failed_pin_attempts = 0 WHERE id = ?',
      bind: [verifier, b64(salt), secret ? await wrap(key, secret) : null, userId],
    },
  ])
}

/**
 * Earlier builds silently gave the offline demo accounts the PIN 1234. Once per device, any demo account still on it
 * must choose its own. Accounts signed in to a server (server_user_id set) keep whatever PIN they chose.
 */
export async function resetBuiltInDemoPins(db: Database): Promise<void> {
  if ((await db.query("SELECT 1 FROM app_meta WHERE key = 'demo_pin_reset'")).length) return
  const users = await db.query<{ id: string; pin_verifier: string; pin_salt: string }>(
    'SELECT id, pin_verifier, pin_salt FROM users WHERE server_user_id IS NULL AND pin_verifier IS NOT NULL AND pin_salt IS NOT NULL',
  )
  const stale: string[] = []
  for (const u of users) if ((await derive('1234', unb64(u.pin_salt))).verifier === u.pin_verifier) stale.push(u.id)
  await db.batch([
    ...stale.map((id) => ({ sql: 'UPDATE users SET pin_verifier = NULL, pin_salt = NULL, wrapped_secret = NULL, failed_pin_attempts = 0 WHERE id = ?', bind: [id] })),
    { sql: "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('demo_pin_reset', '1')" }, // start-up can run twice at once
  ])
}

/** Re-wraps a new refresh token (after rotation) under the same PIN. */
export async function storeSecret(db: Database, userId: string, pin: string, secret: string): Promise<void> {
  const [u] = await db.query<{ pin_salt: string }>('SELECT pin_salt FROM users WHERE id = ?', [userId])
  const { key } = await derive(pin, unb64(u.pin_salt))
  await db.batch([{ sql: 'UPDATE users SET wrapped_secret = ? WHERE id = ?', bind: [await wrap(key, secret), userId] }])
}

export async function unlock(db: Database, userId: string, pin: string, now = new Date()): Promise<UnlockResult> {
  const [u] = await db.query<{ pin_verifier: string | null; pin_salt: string | null; wrapped_secret: string | null; failed_pin_attempts: number; last_server_contact_at: string | null }>(
    'SELECT pin_verifier, pin_salt, wrapped_secret, failed_pin_attempts, last_server_contact_at FROM users WHERE id = ?',
    [userId],
  )
  if (!u?.pin_verifier || !u.pin_salt) return { status: 'no-pin' }
  if (u.failed_pin_attempts >= MAX_ATTEMPTS) return { status: 'locked' }
  // ponytail: a user who has never reached the server (seeded demo user) has no offline window yet; Phase 6 login always sets it.
  if (u.last_server_contact_at && now.getTime() - Date.parse(u.last_server_contact_at) > MAX_OFFLINE_DAYS * 864e5) {
    return { status: 'expired' }
  }
  const { verifier, key } = await derive(pin, unb64(u.pin_salt))
  if (verifier === u.pin_verifier) {
    await db.batch([{ sql: 'UPDATE users SET failed_pin_attempts = 0 WHERE id = ?', bind: [userId] }])
    return u.wrapped_secret ? { status: 'ok', secret: await unwrap(key, u.wrapped_secret) } : { status: 'ok' }
  }
  const failed = u.failed_pin_attempts + 1
  await db.batch([{ sql: 'UPDATE users SET failed_pin_attempts = ? WHERE id = ?', bind: [failed, userId] }])
  return failed >= MAX_ATTEMPTS ? { status: 'locked' } : { status: 'wrong', remaining: MAX_ATTEMPTS - failed }
}
