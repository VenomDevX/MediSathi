import { CaretRight, CalendarBlank, Drop, FileText, UserPlus } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app-context'
import { useT } from '../../i18n'
import type { StringKey } from '../../strings'
import { EmptyState } from '../components'

const actions: { to: string; label: StringKey; icon: typeof FileText }[] = [
  { to: '/patients/new', label: 'addPatient', icon: UserPlus },
  { to: '/scan', label: 'scanReport', icon: FileText },
  { to: '/donors', label: 'findDonor', icon: Drop },
]

export function Today() {
  const t = useT()
  const { user } = useApp()
  const firstName = user.display_name.split(' ')[0]

  return (
    <div className="flex flex-col gap-8">
      <h1 className="pt-2 text-[32px] leading-tight font-bold">{t('greeting', { name: firstName })}</h1>

      <section aria-labelledby="followups">
        <h2 id="followups" className="mb-3 text-xl font-semibold">{t('todayFollowUps')}</h2>
        <EmptyState icon={<CalendarBlank size={32} />} title={t('noFollowUps')} />
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
