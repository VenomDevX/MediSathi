import { useState, type ReactNode } from 'react'
import { BabyCarriage, Check, Syringe } from '@phosphor-icons/react'
import { todayLocal } from '../domain/dates'
import { ruleText } from '../domain/emergency'
import { actionable, childSchedule, pregnancySchedule, type Planned } from '../domain/schedule'
import { useFormatDate, useLang, useT } from '../i18n'
import { CHILD, PREGNANCY } from '../schedules'
import type { StringKey } from '../strings'
import { Card, Chip } from './components'

const CHILD_MAX_DAYS = 17 * 365 // the last dose (Td) is at 16 years

const statusChip: Record<Exclude<Planned['status'], 'done'>, ['danger' | 'caution' | 'info', StringKey]> = {
  overdue: ['danger', 'statusOverdue'],
  due: ['caution', 'statusDue'],
  upcoming: ['info', 'statusUpcoming'],
}

/** A child's vaccines from the date of birth; hidden once the schedule is over. `onGive` records a dose given today. */
export function VaccineCard({ dob, given, onGive }: { dob: string | null; given: Set<string>; onGive: (id: string, label: string) => Promise<void> }) {
  const t = useT()
  const today = todayLocal()
  if (!dob || dob > today || (Date.parse(today) - Date.parse(dob)) / 864e5 > CHILD_MAX_DAYS) return null
  const items = childSchedule(dob, CHILD, given, today)
  return (
    <ScheduleCard icon={<Syringe size={22} aria-hidden />} title={t('vaccinesTitle')} items={items} action="markGiven" onGive={onGive}>
      <p className="text-sm text-muted">{t('vaccinesDoneCount', { n: items.filter((i) => i.status === 'done').length })}</p>
    </ScheduleCard>
  )
}

/** Checkups and Td doses from the last period date; hidden when there is no current pregnancy. */
export function PregnancyCard({ lmp, done, onGive }: { lmp: string | null; done: Set<string>; onGive: (id: string, label: string) => Promise<void> }) {
  const t = useT()
  const fmt = useFormatDate()
  const p = lmp ? pregnancySchedule(lmp, PREGNANCY, done, todayLocal()) : null
  if (!p) return null
  return (
    <ScheduleCard icon={<BabyCarriage size={22} aria-hidden />} title={t('pregnancyTitle')} items={p.items} action="markDone" onGive={onGive}>
      <p className="font-semibold">{t('pregnancyWeek', { n: p.week, date: fmt(p.edd) })}</p>
    </ScheduleCard>
  )
}

function ScheduleCard({ icon, title, items, action, onGive, children }: {
  icon: ReactNode
  title: string
  items: Planned[]
  action: StringKey
  onGive: (id: string, label: string) => Promise<void>
  children: ReactNode
}) {
  const t = useT()
  const fmt = useFormatDate()
  const { lang } = useLang()
  const [busy, setBusy] = useState<string | null>(null)
  const shown = actionable(items)

  async function give(it: Planned) {
    setBusy(it.id)
    try {
      await onGive(it.id, ruleText(it.label, lang))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className="text-neem">{icon}</span>
        {title}
      </h2>
      {children}
      {shown.length === 0 ? (
        <p className="text-muted">{t('vaccinesAllDone')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {shown.map((it) => {
            const [tone, key] = statusChip[it.status as Exclude<Planned['status'], 'done'>]
            return (
              <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{ruleText(it.label, lang)}</p>
                  <Chip tone={tone}>{t(key, { date: fmt(it.status === 'upcoming' ? it.from : it.due) })}</Chip>
                </div>
                {it.status !== 'upcoming' && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void give(it)}
                    aria-label={`${t(action)}: ${ruleText(it.label, lang)}`}
                    className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-neem px-3 font-semibold text-neem hover:bg-neem-soft disabled:opacity-40"
                  >
                    <Check size={18} weight="bold" aria-hidden />
                    {t(action)}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted">{t('scheduleSource')}</p>
    </Card>
  )
}
