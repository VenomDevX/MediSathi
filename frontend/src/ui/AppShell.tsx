import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  ArrowsClockwise,
  CalendarCheck,
  ChatCircleDots,
  CloudArrowUp,
  DotsThreeCircle,
  Drop,
  FileText,
  FirstAidKit,
  Translate,
  Users,
  UsersThree,
  Warning,
  WifiSlash,
} from '@phosphor-icons/react'
import { useApp } from '../app-context'
import { followUpsDue } from '../data/records'
import { reminderSchedule } from '../domain/reminders'
import { scheduleReminders } from '../platform/notify'
import { useSync } from '../sync/useSync'
import { useLang, useT } from '../i18n'
import type { StringKey } from '../strings'
import { Banner, cx } from './components'

export function AppShell() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { db, user, online, storage, setUserId } = useApp()
  const { pending } = useSync()

  const isWorker = !!user?.role && ['asha_worker', 'coordinator', 'supervisor', 'admin'].includes(user.role)

  const switchDemoUser = async () => {
    const nextId = user?.id === 'u-ramesh' ? 'u-sunita' : 'u-ramesh'
    await setUserId(nextId)
  }

  // Reschedule reminders on open and whenever the app goes to the background
  useEffect(() => {
    const reschedule = () =>
      followUpsDue(db, user, '9999-12-31')
        .then((f) => scheduleReminders(reminderSchedule(f.map((x) => x.follow_up_at), new Date()), (n) => ({ title: t('reminderTitle'), body: t('reminderBody', { n }) })))
        .catch(() => {})
    void reschedule()
    const onHide = () => document.visibilityState === 'hidden' && void reschedule()
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [db, user, t])

  const badge = pending > 0 && (
    <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-[3px] bg-caution px-1 text-[10px] font-bold text-surface tabular-nums">
      {pending > 99 ? '99+' : pending}
    </span>
  )

  const desktopNavItems = [
    { to: '/', label: 'navToday' as StringKey, icon: CalendarCheck },
    { to: '/chat', label: 'navChat' as StringKey, icon: ChatCircleDots },
    { to: '/scan', label: 'navScan' as StringKey, icon: FileText },
    ...(isWorker ? [{ to: '/patients', label: 'navPatients' as StringKey, icon: Users }] : []),
    { to: '/family', label: 'navRecords' as StringKey, icon: UsersThree },
    { to: '/guidance', label: 'navGuidance' as StringKey, icon: FirstAidKit },
    { to: '/donors', label: 'navDonors' as StringKey, icon: Drop },
    { to: '/settings', label: 'navMore' as StringKey, icon: DotsThreeCircle },
  ]

  const mobileNav = [
    { to: '/', label: 'navToday' as StringKey, icon: CalendarCheck },
    { to: '/chat', label: 'navChat' as StringKey, icon: ChatCircleDots },
    { to: '/scan', label: 'navScan' as StringKey, icon: FileText },
    { to: isWorker ? '/patients' : '/family', label: (isWorker ? 'navPatients' : 'navRecords') as StringKey, icon: isWorker ? Users : UsersThree },
    { to: '/settings', label: 'navMore' as StringKey, icon: DotsThreeCircle },
  ]

  return (
    <div className="min-h-[100dvh] bg-surface text-ink lg:flex">
      <a href="#main" className="sr-only z-20 rounded-[var(--radius-control)] bg-neem px-4 py-3 font-semibold text-on-neem focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t('skipToContent')}
      </a>

      {/* Laptop / Web: refined minimal left rail */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="mb-5 px-3">
          <NavLink to="/" translate="no" className="text-xl font-bold tracking-tight text-neem">
            {t('appName')}
          </NavLink>
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider mt-0.5">Offline-first Health</p>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {desktopNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] font-medium transition-colors ${
                  isActive ? 'bg-neem-soft text-neem font-semibold' : 'text-muted hover:text-ink hover:bg-canvas'
                }`
              }
            >
              <Icon size={20} aria-hidden />
              {t(label)}
            </NavLink>
          ))}
        </div>

        {/* Current user card & demo switch button */}
        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-canvas p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-ink">{user?.display_name || 'User'}</p>
              <p className="truncate text-[11px] text-muted">{isWorker ? t('role_asha_worker') : t('role_citizen')}</p>
            </div>
            <button
              type="button"
              onClick={switchDemoUser}
              title={t('switchAccount')}
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-line bg-surface text-muted hover:text-neem hover:border-neem transition-colors"
            >
              <ArrowsClockwise size={15} />
            </button>
          </div>
          <NavLink to="/sync" className="flex min-h-9 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-xs font-medium text-muted hover:text-ink">
            <span className="relative">
              <CloudArrowUp size={18} aria-hidden />
              {badge}
            </span>
            {t('navSync')}
            {pending > 0 && <span className="sr-only">{t('pendingCount', { n: pending })}</span>}
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Minimal clean web top bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <NavLink to="/" translate="no" className="text-lg font-bold text-neem lg:hidden">
              {t('appName')}
            </NavLink>
            <div className="hidden lg:flex items-center gap-2">
              <span className={cx(
                'inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-0.5 text-xs font-semibold',
                isWorker ? 'bg-neem-soft text-neem' : 'bg-info-bg text-info'
              )}>
                <span className={cx('size-1.5 rounded-full', isWorker ? 'bg-neem' : 'bg-info')} />
                {isWorker ? t('role_asha_worker') : t('role_citizen')}
              </span>
              <button
                type="button"
                onClick={switchDemoUser}
                className="inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:border-neem hover:text-neem transition-colors"
              >
                <ArrowsClockwise size={12} />
                {t('switchAccount')}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NavLink to="/emergency" className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-xs font-semibold text-danger hover:bg-danger-bg/50">
              <Warning size={17} weight="bold" aria-hidden />
              {t('emergency')}
            </NavLink>
            <button
              type="button"
              onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
              className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs font-medium text-muted hover:text-ink"
            >
              <Translate size={17} aria-hidden />
              {t('language')}
            </button>
            <NavLink to="/sync" aria-label={pending ? `${t('navSync')}: ${t('pendingCount', { n: pending })}` : t('navSync')} className="relative flex min-h-9 min-w-9 items-center justify-center text-muted lg:hidden">
              <CloudArrowUp size={20} aria-hidden />
              {badge}
            </NavLink>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-4xl flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-12">
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
        {mobileNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 text-[12px] ${isActive ? 'font-semibold text-neem' : 'text-muted'}`}
          >
            {({ isActive }) => (
              <>
                <Icon size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                <span className="truncate max-w-[64px]">{t(label)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
