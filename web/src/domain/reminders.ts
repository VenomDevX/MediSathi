// Follow-up reminders (TRD §8.3): one per day at 9:00 local, carrying only a count,
// never a patient name or medical text, because Android shows it on the lock screen.
export type Reminder = { id: number; at: Date; count: number }

const MAX = 7 // ponytail: a week ahead; reminders are rescheduled every time the app opens or goes to the background

export function reminderSchedule(followUpDates: string[], now: Date, hour = 9): Reminder[] {
  const counts = new Map<string, number>()
  for (const d of followUpDates) counts.set(d, (counts.get(d) ?? 0) + 1)
  return [...counts]
    .map(([d, count]) => {
      const [y, m, day] = d.split('-').map(Number)
      return { id: Number(d.replaceAll('-', '')), at: new Date(y, m - 1, day, hour, 0), count }
    })
    .filter((r) => r.at > now)
    .sort((a, b) => a.id - b.id)
    .slice(0, MAX)
}
