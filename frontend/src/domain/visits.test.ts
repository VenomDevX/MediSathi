import { describe, expect, it } from 'vitest'
import { readObservations, resolveChains, type VisitRow } from './visits'

const v = (id: string, created_at: string, extra: Partial<VisitRow> = {}): VisitRow => ({
  id,
  patient_id: 'p1',
  worker_id: 'u1',
  amends_visit_id: null,
  amendment_reason: null,
  visit_time: '2026-10-01T09:00:00Z',
  notes: id,
  observations_json: '{}',
  follow_up_at: null,
  created_at,
  sync_status: 'pending',
  voided_at: null,
  ...extra,
})

describe('resolveChains', () => {
  it('returns one entry per original visit with no history when never amended', () => {
    const [chain] = resolveChains([v('a', '2026-10-01T09:00:00Z')])
    expect(chain.current.id).toBe('a')
    expect(chain.history).toEqual([])
  })

  it('shows the latest amendment as current and keeps earlier versions as history', () => {
    const chains = resolveChains([
      v('a', '2026-10-01T09:00:00Z'),
      v('b', '2026-10-01T10:00:00Z', { amends_visit_id: 'a' }),
      v('c', '2026-10-01T11:00:00Z', { amends_visit_id: 'b' }),
    ])
    expect(chains).toHaveLength(1)
    expect(chains[0].rootId).toBe('a')
    expect(chains[0].current.id).toBe('c')
    expect(chains[0].history.map((h) => h.id)).toEqual(['b', 'a'])
  })

  it('treats an amendment as newer than what it amends even when created in the same millisecond', () => {
    const t = '2026-10-01T09:00:00.000Z'
    const [chain] = resolveChains([v('a', t), v('b', t, { amends_visit_id: 'a' })])
    expect(chain.current.id).toBe('b')
  })

  it('marks a chain voided when its latest version is a void', () => {
    const [chain] = resolveChains([
      v('a', '2026-10-01T09:00:00Z'),
      v('b', '2026-10-01T10:00:00Z', { amends_visit_id: 'a', voided_at: '2026-10-01T10:00:00Z' }),
    ])
    expect(chain.voided).toBe(true)
  })

  it('orders chains newest visit first', () => {
    const chains = resolveChains([
      v('old', '2026-09-01T09:00:00Z', { visit_time: '2026-09-01T09:00:00Z' }),
      v('new', '2026-10-05T09:00:00Z', { visit_time: '2026-10-05T09:00:00Z' }),
    ])
    expect(chains.map((c) => c.rootId)).toEqual(['new', 'old'])
  })

  it('treats two amendments of the same version from different devices as both kept, newest current', () => {
    const chains = resolveChains([
      v('a', '2026-10-01T09:00:00Z'),
      v('b1', '2026-10-01T10:00:00Z', { amends_visit_id: 'a' }),
      v('b2', '2026-10-01T10:30:00Z', { amends_visit_id: 'a' }),
    ])
    expect(chains).toHaveLength(1)
    expect(chains[0].current.id).toBe('b2')
    expect(chains[0].history.map((h) => h.id)).toEqual(['b1', 'a'])
  })
})

describe('readObservations', () => {
  it('keeps good fields and drops bad JSON or wrong types instead of throwing', () => {
    expect(readObservations('{"symptoms":["fever"],"vaccines":["bcg",5],"lmp":"2026-06-01","bp":"120/80"}')).toMatchObject({ symptoms: ['fever'], vaccines: ['bcg'], anc: [], lmp: '2026-06-01', bp: '120/80' })
    for (const bad of ['not json', 'null', '[]', '{"vaccines":5,"anc":"x","lmp":"soon","bp":7}'])
      expect(readObservations(bad)).toEqual({ symptoms: [], vaccines: [], anc: [], bp: undefined, weight: undefined, temp: undefined, lmp: undefined })
  })
})
