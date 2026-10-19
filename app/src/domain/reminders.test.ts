import { describe, expect, it } from 'vitest'
import { reminderSchedule } from './reminders'

const now = new Date(2026, 9, 20, 10, 0) // 20 Oct 2026, 10:00 local

describe('reminderSchedule', () => {
  it('groups follow-ups by date, one 9:00 reminder per future date, with a count only', () => {
    const r = reminderSchedule(['2026-10-22', '2026-10-21', '2026-10-22'], now)
    expect(r).toEqual([
      { id: 20261021, at: new Date(2026, 9, 21, 9, 0), count: 1 },
      { id: 20261022, at: new Date(2026, 9, 22, 9, 0), count: 2 },
    ])
  })

  it('skips dates whose 9:00 has already passed (overdue ones live in the Today list)', () => {
    expect(reminderSchedule(['2026-10-19', '2026-10-20'], now)).toEqual([])
    expect(reminderSchedule(['2026-10-20'], new Date(2026, 9, 20, 8, 0))).toHaveLength(1)
  })

  it('caps at 7 reminders', () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)
    expect(reminderSchedule(dates, now).map((r) => r.id)).toEqual([20261101, 20261102, 20261103, 20261104, 20261105, 20261106, 20261107])
  })
})
