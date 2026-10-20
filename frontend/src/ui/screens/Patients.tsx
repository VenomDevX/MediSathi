import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CaretRight, MagnifyingGlass, UserPlus, Users } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { createPatient, listPatients } from '../../data/records'
import { useT } from '../../i18n'
import { Button, Banner, EmptyState, Field, LinkButton, PageHeader, SyncChip, inputClass } from '../components'
import { useAsync } from '../useAsync'

export function PatientList() {
  const t = useT()
  const { db, user } = useApp()
  const [search, setSearch] = useState('')
  const isWorker = !!user?.role && ['asha_worker', 'coordinator', 'supervisor', 'admin'].includes(user.role)
  const { data: patients } = useAsync(() => (isWorker ? listPatients(db, user, search) : Promise.resolve([])), [db, user, isWorker, search])

  if (!isWorker) {
    return (
      <div className="flex flex-col gap-4 py-8">
        <PageHeader title={t('navPatients')} />
        <Banner tone="caution">
          {t('workerOnly')}
        </Banner>
        <LinkButton to="/family" className="self-start">
          {t('navRecords')}
        </LinkButton>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={t('navPatients')}
        action={
          <LinkButton to="/patients/new" className="px-4">
            <UserPlus size={20} aria-hidden />
            <span className="hidden sm:inline">{t('addPatient')}</span>
            <span className="sr-only sm:hidden">{t('addPatient')}</span>
          </LinkButton>
        }
      />
      <div className="relative mb-4">
        <MagnifyingGlass size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          name="search"
          autoComplete="off"
          aria-label={t('searchPatients')}
          placeholder={t('searchPatients')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-11`}
        />
      </div>

      {patients && patients.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title={t(search ? 'noMatches' : 'noPatients')}
          action={!search && <LinkButton to="/patients/new">{t('addPatient')}</LinkButton>}
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {patients?.map((p) => (
            <li key={p.id}>
              <Link to={`/patients/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.display_name}</p>
                  <p className="truncate text-sm text-muted">
                    {[p.village, p.age_years != null && t('years', { n: p.age_years }), p.local_identifier].filter(Boolean).join(', ')}
                  </p>
                </div>
                {p.sync_status !== 'synced' && <SyncChip status={p.sync_status} label={t} />}
                <CaretRight size={18} className="text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function PatientNew() {
  const t = useT()
  const nav = useNavigate()
  const { db, user } = useApp()
  const [form, setForm] = useState({ display_name: '', age_years: '', sex: '', village: '', phone: '', local_identifier: '', scope_id: user.assigned_scope[0] })
  const [nameError, setNameError] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const isWorker = !!user?.role && ['asha_worker', 'coordinator', 'supervisor', 'admin'].includes(user.role)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  if (!isWorker) {
    return (
      <div className="flex flex-col gap-4 py-8">
        <PageHeader title={t('addPatient')} />
        <Banner tone="caution">
          {t('workerOnly')}
        </Banner>
        <LinkButton to="/family" className="self-start">
          {t('navRecords')}
        </LinkButton>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.display_name.trim()) {
      setNameError(true)
      return nameRef.current?.focus()
    }
    setBusy(true)
    try {
      const p = await createPatient(db, user, { ...form, age_years: form.age_years ? Number(form.age_years) : null, sex: form.sex || null })
      nav(`/patients/${p.id}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('addPatient')} back={{ to: '/patients', label: t('navPatients') }} />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label={t('name')} error={nameError ? t('nameRequired') : undefined}>
          <input ref={nameRef} name="name" autoComplete="off" value={form.display_name} onChange={(e) => (setNameError(false), set('display_name')(e))} className={inputClass} aria-invalid={nameError} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('age')}>
            <input name="age" autoComplete="off" inputMode="numeric" value={form.age_years} onChange={(e) => setForm({ ...form, age_years: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={inputClass} />
          </Field>
          <Field label={t('village')}>
            <input name="village" autoComplete="off" value={form.village} onChange={set('village')} className={inputClass} />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 font-medium">{t('sex')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['F', 'M', 'O'] as const).map((s) => (
              <label key={s} className="flex min-h-12 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-line bg-surface has-[:checked]:border-neem has-[:checked]:bg-ok-bg has-[:checked]:font-semibold has-[:checked]:text-neem has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-neem">
                <input type="radio" name="sex" value={s} checked={form.sex === s} onChange={set('sex')} className="sr-only" />
                {t(s === 'F' ? 'female' : s === 'M' ? 'male' : 'other')}
              </label>
            ))}
          </div>
        </fieldset>
        {user.assigned_scope.length > 1 && (
          <Field label={t('area')}>
            <select name="area" value={form.scope_id} onChange={set('scope_id')} className={inputClass}>
              {user.assigned_scope.map((s) => (
                <option key={s} value={s}>{s.replace(/^village-/, '').replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t('phoneOptional')}>
          <input type="tel" name="phone" inputMode="tel" autoComplete="off" value={form.phone} onChange={set('phone')} className={inputClass} />
        </Field>
        <Field label={t('localId')}>
          <input name="local-id" autoComplete="off" spellCheck={false} value={form.local_identifier} onChange={set('local_identifier')} className={inputClass} />
        </Field>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={busy} className="flex-1">{t('savePatient')}</Button>
          <LinkButton to="/patients" variant="secondary">{t('cancel')}</LinkButton>
        </div>
      </form>
    </>
  )
}
