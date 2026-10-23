import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CaretRight, Drop, FileText, FirstAidKit, Microphone, UserPlus, Warning, Waveform, Pulse, Users, UsersThree } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { upcomingFollowUps } from '../../data/family'
import { followUpsDue } from '../../data/records'
import { todayLocal } from '../../domain/dates'
import { useFormatDate, useT } from '../../i18n'
import { refreshReminders } from '../../platform/notify'
import type { StringKey } from '../../strings'
import { AssistantMark, Chip } from '../components'
import { useClusters } from '../useClusters'
import { SYMPTOM_LABEL } from '../../domain/outbreak'
import { useAsync } from '../useAsync'

const tiles: { to: string; label: StringKey; icon: typeof FileText }[] = [
  { to: '/scan', label: 'tileReport', icon: FileText },
  { to: '/family', label: 'tileFamily', icon: UsersThree },
  { to: '/guidance', label: 'tileFirstAid', icon: FirstAidKit },
  { to: '/donors', label: 'tileDonors', icon: Drop },
]

function greetingKey(hour: number): StringKey {
  return hour < 12 ? 'goodMorning' : hour < 17 ? 'goodAfternoon' : 'goodEvening'
}

export function Today() {
  const t = useT()
  const fmt = useFormatDate()
  const { db, user } = useApp()
  const [hour] = useState(() => new Date().getHours())
  const today = todayLocal()

  const isWorker = !!user?.role && ['asha_worker', 'coordinator', 'supervisor', 'admin'].includes(user.role)
  const { data: familyDue } = useAsync(() => upcomingFollowUps(db, user.id, today), [db, user.id, today])
  const { data: patientDue } = useAsync(() => (isWorker ? followUpsDue(db, user, today) : Promise.resolve([])), [db, user, isWorker, today])

  // Keep reminders in sync
  useEffect(() => {
    if (familyDue) void refreshReminders(db, user.id, (n) => ({ title: t('reminderTitle'), body: t('reminderBody', { n }) }))
  }, [familyDue, db, user.id, t])

  const firstName = user?.display_name?.split(' ')[0]
  const greeting = user?.display_name ? t('greeting', { name: firstName ?? '' }) : t(greetingKey(hour))

  const { data: clusters } = useClusters()
  const alert = isWorker ? clusters?.find((c) => c.alert) : undefined

  const hasFollowUps = (familyDue && familyDue.length > 0) || (patientDue && patientDue.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="pt-2 text-[32px] leading-tight font-bold">{greeting}</h1>

      {alert && (
        <Link to="/outbreak" className="flex items-start gap-3 rounded-[var(--radius-card)] bg-danger-bg px-4 py-3 font-semibold text-danger hover:opacity-90">
          <Warning size={20} className="mt-0.5 shrink-0" aria-hidden />
          {t('outbreakAlert', { n: alert.cases, symptom: t(SYMPTOM_LABEL[alert.symptom]).toLowerCase(), village: alert.village })}
        </Link>
      )}

      {/* Hero card: Ask assistant */}
      <Link to="/chat" className="flex flex-col gap-3 rounded-[var(--radius-card)] border-2 border-neem bg-surface p-5 hover:bg-neem-soft transition-colors">
        <span className="flex items-start gap-3">
          <AssistantMark className="mt-2.5" />
          <span className="flex-1 text-[22px] font-bold">{t('homeAsk')}</span>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full lg:rounded-[var(--radius-control)] bg-neem text-on-neem" aria-hidden>
            <Microphone size={22} weight="fill" />
          </span>
        </span>
        <span className="pl-6 text-muted">{t('homeAskExample')}</span>
        <span className="pl-6 text-sm font-medium text-neem">{t('homeAskHint')}</span>
      </Link>
      <Link to="/saathi" className="-mt-3 flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-neem px-4 font-semibold text-on-neem hover:opacity-90">
        <Waveform size={22} weight="bold" aria-hidden />
        {t('handsFree')}: {t('saathiTitle')}
      </Link>

      {/* Follow-ups (Personal family + ASHA patient visits) */}
      {hasFollowUps && (
        <section aria-labelledby="followups" className="flex flex-col gap-3">
          <h2 id="followups" className="text-xl font-semibold">{t('todayFollowUps')}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {patientDue?.map((f) => (
              <li key={f.visit_id}>
                <Link to={`/patients/${f.patient_id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-canvas">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{f.display_name}</p>
                    <p className="truncate text-sm text-muted">{[f.village, fmt(f.follow_up_at)].filter(Boolean).join(', ')}</p>
                  </div>
                  <Chip tone={f.follow_up_at < today ? 'caution' : 'info'}>{t(f.follow_up_at < today ? 'overdue' : 'dueToday')}</Chip>
                  <CaretRight size={18} className="text-muted" aria-hidden />
                </Link>
              </li>
            ))}
            {familyDue?.map((d) => (
              <li key={d.id}>
                <Link to={`/family/${d.profile_id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-canvas">
                  <CalendarCheck size={24} className="shrink-0 text-neem" aria-hidden />
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

      {/* Quick tiles */}
      <section aria-labelledby="quick-tiles">
        <h2 id="quick-tiles" className="sr-only">{t('quickActions')}</h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-28 flex-col justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-neem transition-colors">
                <Icon size={28} className="text-neem" aria-hidden />
                <span className="text-lg leading-snug font-semibold">{t(label)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ASHA specific action shortcuts if in healthcare worker mode */}
      {isWorker && (
        <section aria-labelledby="asha-actions" className="flex flex-col gap-3">
          <h2 id="asha-actions" className="text-lg font-semibold text-muted">{t('quickActions')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/patients/new" className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 hover:border-neem">
              <UserPlus size={22} className="shrink-0 text-neem" />
              <span className="font-medium">{t('addPatient')}</span>
            </Link>
            <Link to="/patients" className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 hover:border-neem">
              <Users size={22} className="shrink-0 text-neem" />
              <span className="font-medium">{t('navPatients')}</span>
            </Link>
            <Link to="/outbreak" className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 hover:border-neem">
              <Pulse size={22} className="shrink-0 text-neem" />
              <span className="font-medium">{t('outbreakTitle')}</span>
            </Link>
          </div>
        </section>
      )}

      <p className="text-sm text-muted">{t('notADoctor')}</p>
    </div>
  )
}
