'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CalendarCheck, CaretRight, Drop, FileText, FirstAidKit, Microphone, UsersThree } from '@phosphor-icons/react'
import { useApp } from '@/app-context'
import { upcomingFollowUps } from '@/data/family'
import { todayLocal } from '@/domain/dates'
import { useFormatDate, useT } from '@/i18n'
import { refreshReminders } from '@/platform/notify'
import type { StringKey } from '@/strings'
import { AssistantMark } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'

const tiles: { href: string; label: StringKey; icon: typeof FileText }[] = [
  { href: '/reports/', label: 'tileReport', icon: FileText },
  { href: '/records/', label: 'tileFamily', icon: UsersThree },
  { href: '/first-aid/', label: 'tileFirstAid', icon: FirstAidKit },
  { href: '/donors/', label: 'tileDonors', icon: Drop },
]

function greetingKey(hour: number): StringKey {
  return hour < 12 ? 'goodMorning' : hour < 17 ? 'goodAfternoon' : 'goodEvening'
}

export default function Home() {
  const t = useT()
  // The page is prerendered at build time, so the hour is read after mount.
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => setHour(new Date().getHours()), [])
  const fmt = useFormatDate()
  const { db } = useApp()
  const today = todayLocal()
  const { data: due } = useAsync((d) => upcomingFollowUps(d, today), [today])
  // Device reminders are rebuilt whenever the app opens, so they never point at removed or past follow-ups.
  useEffect(() => {
    if (due) void refreshReminders(db, (n) => ({ title: t('reminderTitle'), body: t('reminderBody', { n }) }))
  }, [due, db, t])

  return (
    <div className="flex flex-col gap-8">
      <h1 className="display min-h-[1.15em] text-[32px]">{hour !== null && t(greetingKey(hour))}</h1>

      {/* The hero: looks like a question box, opens the assistant. */}
      <Link href="/chat/" className="flex flex-col gap-3 rounded-[var(--radius-card)] border-2 border-neel bg-surface p-5 hover:bg-neel-soft">
        <span className="flex items-start gap-3">
          <AssistantMark className="mt-2.5" />
          <span className="display flex-1 text-[22px]">{t('homeAsk')}</span>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-neel text-on-neel" aria-hidden>
            <Microphone size={22} weight="fill" />
          </span>
        </span>
        <span className="pl-6 text-muted">{t('homeAskExample')}</span>
        <span className="pl-6 text-sm font-medium text-neel">{t('homeAskHint')}</span>
      </Link>

      {!!due?.length && (
        <section aria-labelledby="coming-up" className="flex flex-col gap-3">
          <h2 id="coming-up" className="text-xl font-semibold">{t('comingUp')}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {due.map((d) => (
              <li key={d.id}>
                <Link href={`/records/person/?id=${d.profile_id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-canvas">
                  <CalendarCheck size={24} className="shrink-0 text-neel" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{d.text}</p>
                    <p className="text-sm text-muted">{d.profile_name}, {d.follow_up_at === today ? t('today') : fmt(d.follow_up_at!)}</p>
                  </div>
                  <CaretRight size={18} className="text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-28 flex-col justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-neel">
              <Icon size={28} className="text-neel" aria-hidden />
              <span className="text-lg leading-snug font-semibold">{t(label)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted">{t('notADoctor')}</p>
    </div>
  )
}
