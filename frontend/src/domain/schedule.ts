// Child vaccination (UIP) and pregnancy checkup (ANC) schedules worked out from a birth date or the last period.
// Dates are YYYY-MM-DD (local calendar days). Demo content, not clinically reviewed (content/immunization_schedule.json).

export type ScheduleItem = { id: string; label: Record<string, string>; due_days: number; from_days?: number }
export type Status = 'done' | 'overdue' | 'due' | 'upcoming'
export type Planned = { id: string; label: Record<string, string>; from: string; due: string; status: Status }

const DUE_SOON_DAYS = 14
const EDD_DAYS = 280
const PREGNANCY_MAX_DAYS = 294 // 42 weeks: past this the pregnancy is over, whether or not delivery was recorded

const toDay = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5
const fromDay = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => fromDay(toDay(d) + n)
export const daysBetween = (a: string, b: string) => toDay(b) - toDay(a)

/**
 * done: given; overdue: past its due day; due: its window is open or it falls due within 14 days; upcoming: later.
 * Sorted by due day, the order a health worker works through them.
 */
export function plan(start: string, items: ScheduleItem[], done: Set<string>, today: string): Planned[] {
  return items
    .map((it) => {
      const from = addDays(start, it.from_days ?? it.due_days)
      const due = addDays(start, it.due_days)
      const status: Status = done.has(it.id)
        ? 'done'
        : due < today
          ? 'overdue'
          : from <= today || daysBetween(today, due) <= DUE_SOON_DAYS
            ? 'due'
            : 'upcoming'
      return { id: it.id, label: it.label, from, due, status }
    })
    .sort((a, b) => a.due.localeCompare(b.due))
}

export const childSchedule = (dob: string, items: ScheduleItem[], done: Set<string>, today: string) => plan(dob, items, done, today)

/** Checkups and Td doses from the last menstrual period, with the expected delivery date; null once 42 weeks have passed. */
export function pregnancySchedule(lmp: string, items: ScheduleItem[], done: Set<string>, today: string) {
  const days = daysBetween(lmp, today)
  if (days < 0 || days > PREGNANCY_MAX_DAYS) return null
  return { edd: addDays(lmp, EDD_DAYS), week: Math.floor(days / 7), items: plan(lmp, items, done, today) }
}

/** What to show first: overdue and due items, then the next upcoming ones. */
export const actionable = (items: Planned[], upcoming = 2) => [
  ...items.filter((i) => i.status === 'overdue' || i.status === 'due'),
  ...items.filter((i) => i.status === 'upcoming').slice(0, upcoming),
]
