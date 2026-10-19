import { CaretRight, CalendarBlank, Drop, FileText, UserPlus } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app-context'
import { followUpsDue } from '../../data/records'
import { todayLocal } from '../../domain/dates'
import { useFormatDate, useT } from '../../i18n'
import type { StringKey } from '../../strings'
import { Chip, EmptyState } from '../components'
import { useAsync } from '../useAsync'

const actions: { to: string; label: StringKey; icon: typeof FileText }[] = [
  { to: '/patients/new', label: 'addPatient', icon: UserPlus },
  { to: '/scan', label: 'scanReport', icon: FileText },
  { to: '/donors', label: 'findDonor', icon: Drop },
]

export function Today() {
  const t = useT()
  const fmt = useFormatDate()
  const { db, user } = useApp()
  const today = todayLocal()
  const { data: due } = useAsync(() => followUpsDue(db, user, today), [db, user, today])
  const firstName = user.display_name.split(' ')[0]

  return (
    <div className="flex flex-col gap-8">
      <h1 className="pt-2 text-[32px] leading-tight font-bold">{t('greeting', { name: firstName })}</h1>

      <section aria-labelledby="followups">
        <h2 id="followups" className="mb-3 text-xl font-semibold">{t('todayFollowUps')}</h2>
        {due && due.length === 0 && <EmptyState icon={<CalendarBlank size={32} />} title={t('noFollowUps')} />}
        {due && due.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {due.map((f) => (
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
          </ul>
        )}
      </section>

      <section aria-labelledby="actions">
        <h2 id="actions" className="mb-3 text-xl font-semibold">{t('quickActions')}</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {actions.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-16 items-center gap-4 px-4 hover:bg-canvas">
                <span className="flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-ok-bg text-neem" aria-hidden>
                  <Icon size={22} />
                </span>
                <span className="flex-1 font-medium">{t(label)}</span>
                <CaretRight size={18} className="text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
