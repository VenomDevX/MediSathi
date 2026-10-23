import { describe, expect, it } from 'vitest'
import schedule from '../../../content/immunization_schedule.json'
import { actionable, addDays, childSchedule, pregnancySchedule, type ScheduleItem } from './schedule'

const child = schedule.child as ScheduleItem[]
const anc = schedule.pregnancy as ScheduleItem[]
const today = '2026-10-23'

describe('childSchedule', () => {
  it('marks birth and 6-week doses overdue and 10-week doses due for a 9-week-old', () => {
    const dob = addDays(today, -63)
    const s = childSchedule(dob, child, new Set(['bcg']), today)
    const status = Object.fromEntries(s.map((i) => [i.id, i.status]))
    expect(status).toMatchObject({ bcg: 'done', opv0: 'overdue', penta1: 'overdue', penta2: 'due', penta3: 'upcoming', mr1: 'upcoming' })
    expect(s.find((i) => i.id === 'penta2')?.due).toBe(addDays(dob, 70))
  })

  it('counts a dose due today as due, not overdue, and 15 days ahead as upcoming', () => {
    const s = childSchedule(addDays(today, -42), child, new Set(), today)
    expect(s.find((i) => i.id === 'penta1')?.status).toBe('due')
    const later = childSchedule(addDays(today, -27), child, new Set(), today)
    expect(later.find((i) => i.id === 'penta1')?.status).toBe('upcoming')
  })

  it('lists what needs doing first', () => {
    const s = childSchedule(addDays(today, -63), child, new Set(['bcg', 'opv0', 'hepb0', 'opv1', 'penta1', 'rvv1', 'fipv1', 'pcv1']), today)
    expect(actionable(s).map((i) => i.id)).toEqual(['opv2', 'penta2', 'rvv2', 'opv3', 'penta3'])
  })
})

describe('pregnancySchedule', () => {
  it('gives the week, the delivery date and open checkup windows', () => {
    const lmp = addDays(today, -15 * 7)
    const p = pregnancySchedule(lmp, anc, new Set(['anc1', 'td1']), today)!
    expect(p.week).toBe(15)
    expect(p.edd).toBe(addDays(lmp, 280))
    const status = Object.fromEntries(p.items.map((i) => [i.id, i.status]))
    expect(status).toMatchObject({ anc1: 'done', td1: 'done', td2: 'upcoming', anc2: 'due', anc3: 'upcoming' })
  })

  it('ends after 42 weeks and ignores a future date', () => {
    expect(pregnancySchedule(addDays(today, -294), anc, new Set(), today)).not.toBeNull()
    expect(pregnancySchedule(addDays(today, -295), anc, new Set(), today)).toBeNull()
    expect(pregnancySchedule(addDays(today, 3), anc, new Set(), today)).toBeNull()
  })
})
