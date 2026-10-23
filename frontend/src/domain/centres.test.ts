import { describe, expect, it } from 'vitest'
import centres from '../../../content/health_centres.json'
import { nearestCentres, type Centre } from './centres'

const all = centres as Centre[]

describe('nearestCentres', () => {
  it('adds the nearest 24-hour centre when the nearest one is not open all day', () => {
    const r = nearestCentres({ lat: 27.40, lng: 80.80 }, all) // Rampur
    expect(r.map((c) => c.id)).toEqual(['hc-rampur-phc', 'hc-sitapur-dh'])
    expect(r[0].km).toBeLessThan(2)
  })

  it('gives one centre when the nearest is open 24 hours', () => {
    expect(nearestCentres({ lat: 27.57, lng: 80.68 }, all).map((c) => c.id)).toEqual(['hc-sitapur-dh'])
  })

  it('handles an empty list', () => {
    expect(nearestCentres({ lat: 0, lng: 0 }, [])).toEqual([])
  })
})
