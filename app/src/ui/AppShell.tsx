import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { CalendarCheck, CloudArrowUp, Drop, FileText, FirstAidKit, Translate, Users, WifiSlash, Warning } from '@phosphor-icons/react'
import { useApp } from '../app-context'
import { followUpsDue } from '../data/records'
import { reminderSchedule } from '../domain/reminders'
import { scheduleReminders } from '../platform/notify'
import { useSync } from '../sync/useSync'
import { useLang, useT } from '../i18n'
import type { StringKey } from '../strings'
import { Banner } from './components'

const nav: { to: string; label: StringKey; icon: typeof Users }[] = [
  { to: '/', label: 'navToday', icon: CalendarCheck },
  { to: '/patients', label: 'navPatients', icon: Users },
  { to: '/scan', label: 'navScan', icon: FileText },
  { to: '/guidance', label: 'navGuidance', icon: FirstAidKit },
  { to: '/donors', label: 'navDonors', icon: Drop },
]

export function AppShell() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { db, user, online, storage } = useApp()
  const { pending } = useSync()

  // Reschedule reminders on open and whenever the app goes to the background, so they match the latest visits.
  useEffect(() => {
    const reschedule = () =>
      followUpsDue(db, user, '9999-12-31')
        .then((f) => scheduleReminders(reminderSchedule(f.map((x) => x.follow_up_at), new Date()), (n) => ({ title: t('reminderTitle'), body: t('reminderBody', { n }) })))
        .catch(() => {}) // a reminder failure must never break the app
    void reschedule()
    const onHide = () => document.visibilityState === 'hidden' && void reschedule()
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [db, user, t])
  const badge = pending > 0 && (
    <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-caution px-1 text-xs font-bold text-surface tabular-nums">
      {pending > 99 ? '99+' : pending}
    </span>
  )

  return (
    <div className="min-h-[100dvh] lg:flex">
      <a href="#main" className="sr-only z-20 rounded-[var(--radius-control)] bg-neem px-4 py-3 font-semibold text-on-neem focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t('skipToContent')}
      </a>
      {/* Laptop: left rail */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 py-5 lg:flex">
        <p translate="no" className="mb-4 px-3 text-xl font-bold text-neem">{t('appName')}</p>
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] px-3 font-medium ${isActive ? 'bg-canvas text-neem' : 'text-muted hover:text-ink'}`
            }
          >
            <Icon size={22} aria-hidden />
            {t(label)}
          </NavLink>
        ))}
        <NavLink to="/sync" className="mt-auto flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] px-3 font-medium text-muted hover:text-ink">
          <span className="relative">
            <CloudArrowUp size={22} aria-hidden />
            {badge}
          </span>
          {t('navSync')}
          {pending > 0 && <span className="sr-only">{t('pendingCount', { n: pending })}</span>}
        </NavLink>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center pt-[env(safe-area-inset-top)] justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur lg:px-8">
          <span translate="no" className="text-lg font-bold text-neem lg:invisible">{t('appName')}</span>
          <div className="flex items-center gap-1">
            <NavLink to="/emergency" className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-3 font-semibold text-danger">
              <Warning size={20} weight="bold" aria-hidden />
              {t('emergency')}
            </NavLink>
            <button
              type="button"
              onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
              className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-muted hover:text-ink"
            >
              <Translate size={20} aria-hidden />
              {t('language')}
            </button>
            <NavLink to="/sync" aria-label={pending ? `${t('navSync')}: ${t('pendingCount', { n: pending })}` : t('navSync')} className="relative flex min-h-11 min-w-11 items-center justify-center text-muted lg:hidden">
              <CloudArrowUp size={22} aria-hidden />
              {badge}
            </NavLink>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-[760px] flex-1 px-4 pt-5 pb-28 lg:px-8 lg:pb-12">
          <div className="mb-4 flex flex-col gap-2 empty:hidden">
            {!online && (
              <Banner tone="info" icon={<WifiSlash size={20} />}>
                {t('offline')}
              </Banner>
            )}
            {storage !== 'persistent' && (
              <Banner tone="caution" icon={<Warning size={20} />}>
                {t(storage === 'memory' ? 'storageInMemory' : 'storageNotPersistent')}
              </Banner>
            )}
          </div>
          <Outlet />
        </main>
      </div>

      {/* Phone: bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 text-[13px] ${isActive ? 'font-semibold text-neem' : 'text-muted'}`}
          >
            {({ isActive }) => (
              <>
                <Icon size={24} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                {t(label)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
