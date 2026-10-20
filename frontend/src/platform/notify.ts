// Lock-screen-safe follow-up reminders on Android. Browsers get the in-app "Coming up" list on Home only.
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { upcomingFollowUps } from '../data/family'
import type { Database } from '../database/types'
import { todayLocal } from '../domain/dates'
import { reminderSchedule, type Reminder } from '../domain/reminders'

export async function scheduleReminders(reminders: Reminder[], text: (count: number) => { title: string; body: string }) {
  if (!Capacitor.isNativePlatform()) return
  const { notifications } = await LocalNotifications.getPending()
  if (notifications.length) await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) })
  // Only check here: this also runs as the app goes to the background, where Android silently denies a prompt.
  if (!reminders.length || (await LocalNotifications.checkPermissions()).display !== 'granted') return
  await LocalNotifications.schedule({
    notifications: reminders.map((r) => ({ id: r.id, schedule: { at: r.at }, ...text(r.count) })),
  })
}

/** Ask while the user is acting (saving a follow-up), so the prompt is in the foreground and makes sense. */
export async function askReminderPermission() {
  if (Capacitor.isNativePlatform()) await LocalNotifications.requestPermissions().catch(() => {})
}

/** Reschedules device reminders from `owner`'s follow-ups due this week. Call after any change to follow-ups, and when the app opens. */
export async function refreshReminders(db: Database, owner: string, text: (count: number) => { title: string; body: string }) {
  const due = await upcomingFollowUps(db, owner, todayLocal())
  await scheduleReminders(reminderSchedule(due.map((d) => d.follow_up_at!), new Date()), text)
}
