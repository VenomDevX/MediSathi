import type { Database } from '../database/types'
import type { Donor } from '../domain/donors'
import { syncOp } from './syncOps'

export async function listDonors(db: Database): Promise<Donor[]> {
  return db.query<Donor>(
    `SELECT id, blood_group, approx_latitude, approx_longitude, locality_label, consent_status, registration_status, last_verified_at, deleted_at
     FROM donors WHERE deleted_at IS NULL`,
  )
}

export async function directoryUpdatedAt(db: Database): Promise<string | null> {
  const [r] = await db.query<{ at: string | null }>('SELECT max(last_synced_at) AS at FROM donors')
  return r?.at ?? null
}

/**
 * Coordinator-only contact reveal (PRD BL-05). Every attempt, allowed or not, is written to the
 * audit log and queued for sync, so reveals made offline are still reported.
 */
export async function revealContact(db: Database, user: { id: string; role: string }, donorId: string): Promise<string> {
  const [d] = await db.query<{ contact_encrypted: string | null }>(
    "SELECT contact_encrypted FROM donors WHERE id = ? AND deleted_at IS NULL AND consent_status = 'granted' AND registration_status = 'active'",
    [donorId],
  )
  const isCoordinator = user.role === 'coordinator'
  const allowed = isCoordinator && !!d
  const event = {
    id: crypto.randomUUID(),
    actor_id: user.id,
    action: 'donor_contact_reveal',
    entity_type: 'donor',
    entity_id: donorId,
    timestamp: new Date().toISOString(),
    result: allowed ? 'ok' : 'denied',
  }
  await db.batch([
    {
      sql: 'INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, timestamp, result) VALUES (?, ?, ?, ?, ?, ?, ?)',
      bind: [event.id, event.actor_id, event.action, event.entity_type, event.entity_id, event.timestamp, event.result],
    },
    syncOp('audit_event', event.id, 'create', event),
  ])
  if (!isCoordinator) throw new Error('Only a coordinator can see donor contact details')
  if (!d) throw new Error('Donor has not given consent or is not active')
  if (!d.contact_encrypted) throw new Error('No contact on this device for this donor')
  return d.contact_encrypted
}
