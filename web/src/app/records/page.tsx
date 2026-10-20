'use client'
import Link from 'next/link'
import { CaretRight, FileText, Plus, UserCircle, UsersThree } from '@phosphor-icons/react'
import { listProfiles } from '@/data/family'
import { listReports } from '@/data/reports'
import { useT } from '@/i18n'
import { EmptyState, LinkButton, PageHeader } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'
import { ageOf, relations } from './people'

export default function Records() {
  const t = useT()
  const { data } = useAsync(async (db) => ({ people: await listProfiles(db), reports: (await listReports(db)).length }), [])

  return (
    <>
      <PageHeader
        title={t('familyTitle')}
        action={
          <LinkButton href="/records/edit/" variant="ghost" className="-mr-3 px-3">
            <Plus size={18} aria-hidden />
            {t('addPerson')}
          </LinkButton>
        }
      />
      <div className="flex flex-col gap-6">
        {data && data.people.length === 0 ? (
          <EmptyState icon={<UsersThree size={32} />} title={t('familyEmpty')} action={<LinkButton href="/records/edit/">{t('addPerson')}</LinkButton>} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {data?.people.map((p) => {
              const age = ageOf(p.birth_year)
              return (
                <li key={p.id}>
                  <Link href={`/records/person/?id=${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-canvas">
                    <UserCircle size={32} className="shrink-0 text-neel" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-sm text-muted">{[t(relations[p.relation] ?? 'relOther'), age !== null && t('ageYears', { n: age }), p.blood_group].filter(Boolean).join(', ')}</p>
                    </div>
                    <CaretRight size={18} className="text-muted" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <Link href="/reports/" className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 hover:border-neel">
          <FileText size={28} className="shrink-0 text-neel" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('reportsTitle')}</p>
            <p className="text-sm text-muted">{data && t('reportsSaved', { n: data.reports })}</p>
          </div>
          <CaretRight size={18} className="text-muted" aria-hidden />
        </Link>
      </div>
    </>
  )
}
