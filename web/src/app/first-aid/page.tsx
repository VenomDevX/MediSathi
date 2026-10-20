'use client'
import Link from 'next/link'
import { useState } from 'react'
import { CaretRight, FirstAidKit, MagnifyingGlass } from '@phosphor-icons/react'
import { searchGuidance } from '@/data/guidance'
import { matchEmergency } from '@/domain/emergency'
import { emergencyRules } from '@/emergencyRules'
import { useLang, useT } from '@/i18n'
import { EmergencyCard } from '@/ui/EmergencyCard'
import { EmptyState, PageHeader, inputClass } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'

export default function FirstAid() {
  const t = useT()
  const { lang } = useLang()
  const [query, setQuery] = useState('')
  const { data: items } = useAsync((db) => searchGuidance(db, query, lang), [query, lang])
  // Red-flag check runs on every query, before any result is shown.
  const emergency = matchEmergency(emergencyRules, query)

  return (
    <>
      <PageHeader title={t('firstAidTitle')} />
      <div className="relative mb-4">
        <MagnifyingGlass size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          name="search"
          autoComplete="off"
          aria-label={t('searchFirstAid')}
          placeholder={t('searchFirstAid')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputClass} pl-11`}
        />
      </div>

      {emergency && <EmergencyCard rule={emergency} className="mb-4" />}

      {items && items.length === 0 ? (
        <EmptyState icon={<FirstAidKit size={32} />} title={t('noFirstAid')} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {items?.map((g) => (
            <li key={g.id}>
              <Link href={`/first-aid/view/?id=${g.id}`} lang={g.language} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{g.title}</p>
                  <p className="line-clamp-2 text-sm text-muted">{g.summary}</p>
                </div>
                <CaretRight size={18} className="shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-muted">{t('demoContent')}</p>
    </>
  )
}
