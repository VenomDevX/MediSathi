import { describe, expect, it } from 'vitest'
import { distanceKm, findDonors, type Donor } from './donors'

const now = new Date('2026-10-20T00:00:00Z')
const d = (id: string, extra: Partial<Donor> = {}): Donor => ({
  id,
  blood_group: 'O+',
  approx_latitude: 26.85,
  approx_longitude: 80.95,
  locality_label: 'Lucknow',
  consent_status: 'granted',
  registration_status: 'active',
  last_verified_at: '2026-09-01T00:00:00Z',
  deleted_at: null,
  ...extra,
})

describe('distanceKm', () => {
  it('computes great-circle distance (Lucknow to Sitapur is about 78 km)', () => {
    expect(distanceKm({ lat: 26.85, lng: 80.95 }, { lat: 27.57, lng: 80.68 })).toBeCloseTo(84, -1)
  })

  it('is zero for the same point', () => {
    expect(distanceKm({ lat: 27, lng: 80 }, { lat: 27, lng: 80 })).toBe(0)
  })
})

describe('findDonors', () => {
  const opts = { group: 'O+', from: { lat: 27.57, lng: 80.68 }, now, freshDays: 180 }

  it('returns only the exact requested blood group', () => {
    const res = findDonors([d('a'), d('b', { blood_group: 'O-' }), d('c', { blood_group: 'A+' })], opts)
    expect(res.map((r) => r.id)).toEqual(['a'])
  })

  it('excludes donors without consent, inactive, deleted or not verified within the freshness window', () => {
    const res = findDonors(
      [
        d('ok'),
        d('withdrawn', { consent_status: 'withdrawn' }),
        d('inactive', { registration_status: 'deactivated' }),
        d('deleted', { deleted_at: '2026-10-01T00:00:00Z' }),
        d('stale', { last_verified_at: '2026-01-01T00:00:00Z' }),
        d('never', { last_verified_at: null }),
      ],
      opts,
    )
    expect(res.map((r) => r.id)).toEqual(['ok'])
  })

  it('sorts by distance, nearest first, and rounds to whole km', () => {
    const res = findDonors([d('far'), d('near', { approx_latitude: 27.56, approx_longitude: 80.69 })], opts)
    expect(res.map((r) => r.id)).toEqual(['near', 'far'])
    expect(Number.isInteger(res[0].distance_km)).toBe(true)
  })

  it('without a location, sorts by most recently verified and leaves distance empty', () => {
    const res = findDonors([d('old', { last_verified_at: '2026-06-01T00:00:00Z' }), d('new', { last_verified_at: '2026-10-01T00:00:00Z' })], { ...opts, from: null })
    expect(res.map((r) => r.id)).toEqual(['new', 'old'])
    expect(res[0].distance_km).toBeNull()
  })

  it('puts donors without coordinates after those with a distance', () => {
    const res = findDonors([d('nocoords', { approx_latitude: null, approx_longitude: null }), d('far')], opts)
    expect(res.map((r) => r.id)).toEqual(['far', 'nocoords'])
  })

  it('rejects an invalid blood group', () => {
    expect(() => findDonors([d('a')], { ...opts, group: 'X+' })).toThrow()
  })
})
