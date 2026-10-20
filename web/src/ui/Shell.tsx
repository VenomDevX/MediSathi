'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ChatCircleText, DotsThreeCircle, FolderSimpleUser, House, Phone, Translate, WarningCircle, WifiSlash } from '@phosphor-icons/react'
import { useApp } from '@/app-context'
import { useLang, useT } from '@/i18n'
import type { StringKey } from '@/strings'
import { AssistantMark, Banner, cx } from './components'

const nav: { href: string; label: StringKey; icon: typeof House }[] = [
  { href: '/', label: 'navHome', icon: House },
  { href: '/chat/', label: 'navChat', icon: ChatCircleText },
  { href: '/records/', label: 'navRecords', icon: FolderSimpleUser },
  { href: '/more/', label: 'navMore', icon: DotsThreeCircle },
]

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

export function Shell({ children }: { children: ReactNode }) {
  const t = useT()
  const { lang, setLang } = useLang()
  const { boot, online } = useApp()
  const pathname = usePathname()

  return (
    <div className="min-h-[100dvh] lg:flex">
      <a href="#main" className="sr-only z-30 rounded-[var(--radius-control)] bg-neel px-4 py-3 font-semibold text-on-neel focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t('skipToContent')}
      </a>

      {/* Laptop: left rail */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3 text-xl font-bold" translate="no">
          <AssistantMark />
          {t('appName')}
        </Link>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cx('flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] px-3 font-medium', active ? 'bg-neel-soft text-neel' : 'text-muted hover:text-ink')}
            >
              <Icon size={22} weight={active ? 'fill' : 'regular'} aria-hidden />
              {t(label)}
            </Link>
          )
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[calc(3.75rem+env(safe-area-inset-top))] items-center justify-between gap-2 border-b border-line bg-canvas/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:px-8">
          <Link href="/" className="flex min-h-11 items-center gap-2 text-lg font-bold lg:invisible" translate="no">
            <AssistantMark />
            {t('appName')}
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
              aria-label={t('languageLabel')}
              className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-muted hover:text-ink"
            >
              <Translate size={20} aria-hidden />
              <span lang={lang === 'hi' ? 'en' : 'hi'}>{t('language')}</span>
            </button>
            <Link
              href="/emergency/"
              aria-label={t('sosLabel')}
              className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-danger px-4 pt-0.5 leading-none font-bold text-danger hover:bg-danger-bg"
            >
              <Phone size={18} weight="fill" aria-hidden />
              {t('sos')}
            </Link>
          </div>
        </header>

        <main id="main" className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-4 px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:pb-12">
          {!online && <Banner tone="info" icon={<WifiSlash size={20} />}>{t('offline')}</Banner>}
          {boot.status === 'ready' && !boot.persistent && <Banner tone="caution" icon={<WarningCircle size={20} />}>{t('storageInMemory')}</Banner>}
          {boot.status === 'error' && <Banner tone="danger" icon={<WarningCircle size={20} />}>{t('loadFailed')}</Banner>}
          {children}
        </main>
      </div>

      {/* Phone: bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(4.25rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cx('flex flex-col items-center justify-center gap-0.5 text-sm', active ? 'font-semibold text-neel' : 'text-muted')}
            >
              <Icon size={24} weight={active ? 'fill' : 'regular'} aria-hidden />
              {t(label)}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
