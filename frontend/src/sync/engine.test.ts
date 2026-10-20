import { describe, expect, it } from 'vitest'
import { openTestDb } from '../database/testDb'
import { addVisit, createPatient } from '../data/records'
import { NetworkError, runSync, type SyncApi } from './engine'

const worker = { id: 'u-sunita', assigned_scope: ['village-rampur'] }

type PushOp = Parameters<SyncApi['push']>[0][number]

function fakeApi(over: Partial<SyncApi> = {}): SyncApi & { pushed: PushOp[] } {
  const pushed: PushOp[] = []
  return {
    pushed,
    async push(ops) {
      pushed.push(...ops)
      return ops.map((o) => ({ operation_id: o.operation_id, status: 'accepted', entity_id: o.entity_id, record_version: 1, error_code: null }))
    },
    async pull(cursor) {
      return { changes: [], cursor, has_more: false }
    },
    async directory() {
      return { synced_at: '2026-10-20T08:00:00Z', donors: [] }
    },
    ...over,
  }
}

async function setup() {
  const db = await openTestDb()
  await db.batch([{ sql: "INSERT INTO users (id, display_name, role, assigned_scope_json) VALUES ('u-sunita', 'Sunita', 'asha_worker', '[\"village-rampur\"]')" }])
  const p = await createPatient(db, worker, { display_name: 'Meena', scope_id: 'village-rampur' })
  await addVisit(db, worker, p.id, { visit_time: '2026-10-20T08:00:00Z', notes: 'x' })
  return { db, p }
}

const now = new Date('2026-10-20T09:00:00Z')

describe('runSync', () => {
  it('pushes pending operations in order and marks records synced only after the server accepts them', async () => {
    const { db, p } = await setup()
    const api = fakeApi()
    const summary = await runSync(db, api, 'u-sunita', now)
    expect(api.pushed.map((o) => o.entity_type)).toEqual(['patient', 'patient_visit'])
    expect(api.pushed[0].payload).toMatchObject({ id: p.id, display_name: 'Meena' })
    expect(summary).toMatchObject({ pushed: 2, failed: 0, conflicts: 0 })
    const [pt] = await db.query<{ sync_status: string }>('SELECT sync_status FROM patients WHERE id = ?', [p.id])
    expect(pt.sync_status).toBe('synced')
    const pending = await db.query("SELECT * FROM sync_operations WHERE status = 'pending'")
    expect(pending).toHaveLength(0)
  })

  it('keeps operations queued with backoff when the network fails, and never loses the record', async () => {
    const { db, p } = await setup()
    const api = fakeApi({ push: async () => { throw new NetworkError() } })
    const summary = await runSync(db, api, 'u-sunita', now)
    expect(summary.offline).toBe(true)
    const ops = await db.query<{ status: string; attempt_count: number; next_attempt_at: string }>('SELECT * FROM sync_operations')
    expect(ops.every((o) => o.status === 'pending' && o.attempt_count === 1 && o.next_attempt_at > now.toISOString())).toBe(true)
    expect(await db.query('SELECT id FROM patients WHERE id = ?', [p.id])).toHaveLength(1)
  })

  it('does not retry before the backoff time', async () => {
    const { db } = await setup()
    await runSync(db, fakeApi({ push: async () => { throw new NetworkError() } }), 'u-sunita', now)
    const api = fakeApi()
    await runSync(db, api, 'u-sunita', new Date(now.getTime() + 1000))
    expect(api.pushed).toHaveLength(0)
  })

  it('marks rejected operations failed and conflicted ones as needing review, keeping the local record', async () => {
    const { db, p } = await setup()
    const api = fakeApi({
      push: async (ops) =>
        ops.map((o) =>
          o.entity_type === 'patient'
            ? { operation_id: o.operation_id, status: 'conflict', entity_id: o.entity_id, record_version: 3, error_code: null }
            : { operation_id: o.operation_id, status: 'rejected', entity_id: o.entity_id, record_version: null, error_code: 'out_of_scope' },
        ),
    })
    const summary = await runSync(db, api, 'u-sunita', now)
    expect(summary).toMatchObject({ failed: 1, conflicts: 1 })
    const [pt] = await db.query<{ sync_status: string }>('SELECT sync_status FROM patients WHERE id = ?', [p.id])
    expect(pt.sync_status).toBe('conflict')
    const [v] = await db.query<{ sync_status: string }>('SELECT sync_status FROM patient_visits')
    expect(v.sync_status).toBe('failed')
    const [op] = await db.query<{ last_error_code: string }>("SELECT last_error_code FROM sync_operations WHERE status = 'failed'")
    expect(op.last_error_code).toBe('out_of_scope')
  })

  it('pulls server changes, saves the cursor, and does not overwrite a record with unsent local changes', async () => {
    const { db, p } = await setup()
    const api = fakeApi({
      push: async () => [], // server has not acknowledged anything yet: local ops stay pending
      pull: async () => ({
        cursor: 42,
        has_more: false,
        changes: [
          { entity_type: 'patient', entity: { id: p.id, display_name: 'Server name', scope_id: 'village-rampur', record_version: 2, needs_review: false, created_by: 'u-x', created_at: 'x', updated_at: 'x' } },
          { entity_type: 'patient', entity: { id: 'p-new', display_name: 'Ramesh', scope_id: 'village-rampur', record_version: 1, needs_review: false, created_by: 'u-x', created_at: 'x', updated_at: 'x' } },
          { entity_type: 'patient_visit', entity: { id: 'v-new', patient_id: 'p-new', worker_id: 'u-x', visit_time: '2026-10-19T00:00:00Z', notes: 'n', observations_json: '{}', created_at: 'x' } },
        ],
      }),
    })
    await runSync(db, api, 'u-sunita', now)
    const names = await db.query<{ id: string; display_name: string; sync_status: string }>('SELECT id, display_name, sync_status FROM patients ORDER BY id')
    expect(names).toEqual(
      expect.arrayContaining([
        { id: p.id, display_name: 'Meena', sync_status: 'pending' },
        { id: 'p-new', display_name: 'Ramesh', sync_status: 'synced' },
      ]),
    )
    expect(await db.query("SELECT id FROM patient_visits WHERE id = 'v-new'")).toHaveLength(1)
    const [c] = await db.query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'pull_cursor'")
    expect(c.value).toBe('42')
  })

  it('replaces the donor directory with the server snapshot and records server contact time', async () => {
    const { db } = await setup()
    await db.batch([{ sql: "INSERT INTO donors (id, blood_group, consent_status) VALUES ('old', 'A+', 'granted')" }])
    const api = fakeApi({
      directory: async () => ({
        synced_at: '2026-10-20T08:00:00Z',
        donors: [{ id: 'd1', blood_group: 'O+', approx_latitude: 27.57, approx_longitude: 80.68, locality_label: 'Sitapur', consent_status: 'granted', registration_status: 'active', last_verified_at: '2026-10-01T00:00:00Z', contact: 'Demo 01' }],
      }),
    })
    await runSync(db, api, 'u-sunita', now)
    const donors = await db.query<{ id: string; contact_encrypted: string; last_synced_at: string }>('SELECT id, contact_encrypted, last_synced_at FROM donors')
    expect(donors).toEqual([{ id: 'd1', contact_encrypted: 'Demo 01', last_synced_at: '2026-10-20T08:00:00Z' }])
    const [u] = await db.query<{ last_server_contact_at: string }>("SELECT last_server_contact_at FROM users WHERE id = 'u-sunita'")
    expect(u.last_server_contact_at).toBe(now.toISOString())
  })
})
