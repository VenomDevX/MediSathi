'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'
import { CalendarCheck, CaretRight, FileText, Note, PencilSimple, Pill, Stethoscope, Thermometer, Trash, UserCircle } from '@phosphor-icons/react'
import { useApp } from '@/app-context'
import { addEntry, getProfile, listEntries, voidEntry, type EntryKind } from '@/data/family'
import { listReports } from '@/data/reports'
import { todayLocal } from '@/domain/dates'
import { useFormatDate, useT } from '@/i18n'
import { askReminderPermission, refreshReminders } from '@/platform/notify'
import type { StringKey } from '@/strings'
import { Button, Card, EmptyState, Field, LinkButton, PageHeader, cx, inputClass } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'
import { ageOf, relations } from '../people'

const kinds: Record<EntryKind, { label: StringKey; icon: typeof Note }> = {
  medicine: { label: 'kindMedicine', icon: Pill },
  reading: { label: 'kindReading', icon: Thermometer },
  visit: { label: 'kindVisit', icon: Stethoscope },
  note: { label: 'kindNote', icon: Note },
}

function Person() {
  const t = useT()
  const fmt = useFormatDate()
  const { db } = useApp()
  const id = useSearchParams().get('id') ?? ''
  const { data, loading, reload } = useAsync(
    async (d) => ({ person: await getProfile(d, id), entries: await listEntries(d, id), reports: await listReports(d, { profileId: id }) }),
    [id],
  )
  const [kind, setKind] = useState<EntryKind>('medicine')
  const [text, setText] = useState('')
  const [followUp, setFollowUp] = useState('')
  const reminderText = (n: number) => ({ title: t('reminderTitle'), body: t('reminderBody', { n }) })

  if (loading) return null
  if (!data?.person) return <EmptyState icon={<UserCircle size={32} />} title={t('noEntries')} action={<LinkButton href="/records/" variant="secondary">{t('back')}</LinkButton>} />
  const { person, entries, reports } = data
  const age = ageOf(person.birth_year)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await addEntry(db, id, { kind, text, follow_up_at: followUp || null })
    if (followUp) await askReminderPermission()
    setText('')
    setFollowUp('')
    reload()
    void refreshReminders(db, reminderText)
  }

  async function remove(entryId: string) {
    await voidEntry(db, entryId)
    reload()
    void refreshReminders(db, reminderText)
  }

  const details: [StringKey, string][] = [
    ['bloodGroup', person.blood_group],
    ['conditions', person.conditions],
    ['allergies', person.allergies],
  ]

  return (
    <>
      <PageHeader
        title={person.name}
        back={{ href: '/records/', label: t('familyTitle') }}
        action={
          <LinkButton href={`/records/edit/?id=${person.id}`} variant="ghost" className="-mr-3 px-3">
            <PencilSimple size={18} aria-hidden />
            {t('editPerson')}
          </LinkButton>
        }
      />
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-muted">
            {[t(relations[person.relation] ?? 'relOther'), age !== null && t('ageYears', { n: age }), person.sex && t(person.sex === 'F' ? 'sexF' : 'sexM')].filter(Boolean).join(', ')}
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-muted">{t(k)}</dt>
                <dd className="font-semibold">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <form onSubmit={add} className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <fieldset>
            <legend className="mb-2 font-medium">{t('entryKind')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(kinds) as EntryKind[]).map((k) => {
                const { label, icon: Icon } = kinds[k]
                return (
                  <label key={k} className={cx('flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neel', kind === k ? 'border-neel bg-neel-soft text-neel' : 'border-line')}>
                    <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                    <Icon size={20} aria-hidden />
                    {t(label)}
                  </label>
                )
              })}
            </div>
          </fieldset>
          <Field label={t('entryText')} hint={t('entryTextHint')}>
            <textarea name="text" rows={2} value={text} onChange={(e) => setText(e.target.value)} className={cx(inputClass, 'py-3 [field-sizing:content]')} />
          </Field>
          <Field label={t('followUp')}>
            <input type="date" name="follow_up" min={todayLocal()} value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={cx(inputClass, 'w-fit')} />
          </Field>
          <Button type="submit" disabled={!text.trim()} className="w-fit">{t('addEntry')}</Button>
        </form>

        <section aria-labelledby="history" className="flex flex-col gap-3">
          <h2 id="history" className="text-xl font-semibold">{t('history')}</h2>
          {entries.length === 0 ? (
            <p className="text-muted">{t('noEntries')}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {entries.map((e) => {
                const { label, icon: Icon } = kinds[e.kind]
                return (
                  <li key={e.id} className="flex items-start gap-3 py-3 pl-4">
                    <Icon size={22} className="mt-0.5 shrink-0 text-neel" aria-label={t(label)} />
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-line">{e.text}</p>
                      <p className="text-sm text-muted">{fmt(e.entry_time)}</p>
                      {e.follow_up_at && (
                        <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-neel">
                          <CalendarCheck size={16} aria-hidden />
                          {t('dueOn', { date: fmt(e.follow_up_at) })}
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => void remove(e.id)} aria-label={`${t('removeEntry')}: ${e.text}`} className="flex size-12 shrink-0 items-center justify-center text-muted hover:text-danger">
                      <Trash size={20} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {reports.length > 0 && (
          <section aria-labelledby="reports" className="flex flex-col gap-3">
            <h2 id="reports" className="text-xl font-semibold">{t('reportsTitle')}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/view/?id=${r.id}`} className="flex min-h-14 items-center gap-3 px-4 hover:bg-canvas">
                    <FileText size={22} className="shrink-0 text-neel" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.file_name}</span>
                    <span className="text-sm text-muted">{fmt(r.created_at)}</span>
                    <CaretRight size={18} className="text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

export default function PersonPage() {
  return (
    <Suspense>
      <Person />
    </Suspense>
  )
}
