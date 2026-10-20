import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { CalendarCheck, CaretRight, FileText, Note, PencilSimple, Pill, Plus, Stethoscope, Thermometer, Trash, UserCircle, UsersThree } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { addEntry, getProfile, listEntries, listProfiles, saveProfile, voidEntry, type EntryKind, type Profile } from '../../data/family'
import { listReports } from '../../data/reports'
import { todayLocal } from '../../domain/dates'
import { useFormatDate, useT } from '../../i18n'
import { askReminderPermission, refreshReminders } from '../../platform/notify'
import type { StringKey } from '../../strings'
import { Button, Card, EmptyState, Field, LinkButton, PageHeader, cx, inputClass } from '../components'
import { useAsync } from '../useAsync'

export const relations: Record<string, StringKey> = {
  self: 'relSelf',
  spouse: 'relSpouse',
  child: 'relChild',
  mother: 'relMother',
  father: 'relFather',
  other: 'relOther',
}

export const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
export const ageOf = (birthYear: number | null) => (birthYear ? new Date().getFullYear() - birthYear : null)

const kinds: Record<EntryKind, { label: StringKey; icon: typeof Note }> = {
  medicine: { label: 'kindMedicine', icon: Pill },
  reading: { label: 'kindReading', icon: Thermometer },
  visit: { label: 'kindVisit', icon: Stethoscope },
  note: { label: 'kindNote', icon: Note },
}

export function FamilyList() {
  const t = useT()
  const { db, user } = useApp()
  const { data } = useAsync(async () => ({ people: await listProfiles(db, user.id), reports: (await listReports(db, user)).length }), [db, user])

  return (
    <>
      <PageHeader
        title={t('familyTitle')}
        action={
          <LinkButton to="/family/new" variant="ghost" className="-mr-3 px-3">
            <Plus size={18} aria-hidden />
            {t('addPerson')}
          </LinkButton>
        }
      />
      <div className="flex flex-col gap-6">
        {data && data.people.length === 0 ? (
          <EmptyState icon={<UsersThree size={32} />} title={t('familyEmpty')} action={<LinkButton to="/family/new">{t('addPerson')}</LinkButton>} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {data?.people.map((p) => {
              const age = ageOf(p.birth_year)
              return (
                <li key={p.id}>
                  <Link to={`/family/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-canvas">
                    <UserCircle size={32} className="shrink-0 text-neem" aria-hidden />
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

        <Link to="/scan" className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 hover:border-neem">
          <FileText size={28} className="shrink-0 text-neem" aria-hidden />
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

const blank: Omit<Profile, 'id'> = { name: '', relation: 'self', birth_year: null, sex: '', blood_group: '', conditions: '', allergies: '' }

export function FamilyEdit() {
  const { id } = useParams()
  const { db, user } = useApp()
  const { data, loading } = useAsync(async () => (id ? await getProfile(db, user.id, id) : undefined), [db, user.id, id])
  if (loading) return null
  return <PersonForm key={id ?? 'new'} id={id ?? null} initial={data ?? blank} />
}

function PersonForm({ id, initial }: { id: string | null; initial: Omit<Profile, 'id'> }) {
  const t = useT()
  const navigate = useNavigate()
  const { db, user } = useApp()
  const [p, setP] = useState(initial)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP({ ...p, [k]: v })
  const thisYear = new Date().getFullYear()
  const back = id ? `/family/${id}` : '/family'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!p.name.trim()) return setError(true)
    setBusy(true)
    const saved = await saveProfile(db, user.id, { ...p, id: id ?? undefined })
    navigate(`/family/${saved}`, { replace: true })
  }

  return (
    <>
      <PageHeader title={id ? initial.name : t('addPerson')} back={{ to: back, label: t('back') }} />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label={t('personName')} error={error && !p.name.trim() ? t('nameRequired') : undefined}>
          <input name="name" autoComplete="off" value={p.name} onChange={(e) => set('name', e.target.value)} className={inputClass} aria-invalid={error && !p.name.trim()} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('relation')}>
            <select name="relation" value={p.relation} onChange={(e) => set('relation', e.target.value)} className={inputClass}>
              {Object.entries(relations).map(([v, k]) => (
                <option key={v} value={v}>{t(k)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('birthYear')}>
            <input
              name="birth_year"
              inputMode="numeric"
              autoComplete="off"
              placeholder={String(thisYear - 30)}
              value={p.birth_year ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, '').slice(0, 4))
                set('birth_year', n || null)
              }}
              className={cx(inputClass, 'tabular-nums')}
            />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 font-medium">{t('sex')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['F', 'M', ''] as const).map((v) => (
              <label key={v} className={cx('flex min-h-12 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border px-2 text-center font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neem', p.sex === v ? 'border-neem bg-neem-soft text-neem' : 'border-line')}>
                <input type="radio" name="sex" value={v} checked={p.sex === v} onChange={() => set('sex', v)} className="sr-only" />
                {t(v === 'F' ? 'sexF' : v === 'M' ? 'sexM' : 'sexNone')}
              </label>
            ))}
          </div>
          <span className="text-sm text-muted">{t('sexHint')}</span>
        </fieldset>
        <Field label={t('bloodGroup')}>
          <select name="blood_group" value={p.blood_group} onChange={(e) => set('blood_group', e.target.value)} className={inputClass}>
            <option value="">{t('unknown')}</option>
            {bloodGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label={t('conditions')} hint={t('conditionsHint')}>
          <input name="conditions" autoComplete="off" value={p.conditions} onChange={(e) => set('conditions', e.target.value)} className={inputClass} />
        </Field>
        <Field label={t('allergies')}>
          <input name="allergies" autoComplete="off" value={p.allergies} onChange={(e) => set('allergies', e.target.value)} className={inputClass} />
        </Field>
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>{t('save')}</Button>
          <LinkButton to={back} variant="ghost">{t('cancel')}</LinkButton>
        </div>
      </form>
    </>
  )
}

export function FamilyDetail() {
  const t = useT()
  const fmt = useFormatDate()
  const { db, user } = useApp()
  const { id = '' } = useParams()
  const { data, loading, reload } = useAsync(
    async () => ({ person: await getProfile(db, user.id, id), entries: await listEntries(db, user.id, id), reports: await listReports(db, user, { profileId: id }) }),
    [db, user, id],
  )
  const [kind, setKind] = useState<EntryKind>('medicine')
  const [text, setText] = useState('')
  const [followUp, setFollowUp] = useState('')
  const reminderText = (n: number) => ({ title: t('reminderTitle'), body: t('reminderBody', { n }) })

  if (loading) return null
  if (!data?.person) return <EmptyState icon={<UserCircle size={32} />} title={t('noEntries')} action={<LinkButton to="/family" variant="secondary">{t('back')}</LinkButton>} />
  const { person, entries, reports } = data
  const age = ageOf(person.birth_year)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await addEntry(db, user.id, id, { kind, text, follow_up_at: followUp || null })
    if (followUp) await askReminderPermission()
    setText('')
    setFollowUp('')
    reload()
    void refreshReminders(db, user.id, reminderText)
  }

  async function remove(entryId: string) {
    await voidEntry(db, user.id, entryId)
    reload()
    void refreshReminders(db, user.id, reminderText)
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
        back={{ to: '/family', label: t('familyTitle') }}
        action={
          <LinkButton to={`/family/${person.id}/edit`} variant="ghost" className="-mr-3 px-3">
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
                  <label key={k} className={cx('flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neem', kind === k ? 'border-neem bg-neem-soft text-neem' : 'border-line')}>
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
          <h2 id="history" className="text-xl font-semibold">{t('entriesTitle')}</h2>
          {entries.length === 0 ? (
            <p className="text-muted">{t('noEntries')}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {entries.map((e) => {
                const { label, icon: Icon } = kinds[e.kind]
                return (
                  <li key={e.id} className="flex items-start gap-3 py-3 pl-4">
                    <Icon size={22} className="mt-0.5 shrink-0 text-neem" aria-label={t(label)} />
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-line">{e.text}</p>
                      <p className="text-sm text-muted">{fmt(e.entry_time)}</p>
                      {e.follow_up_at && (
                        <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-neem">
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
                  <Link to={`/scan/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 hover:bg-canvas">
                    <FileText size={22} className="shrink-0 text-neem" aria-hidden />
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
