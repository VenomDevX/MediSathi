'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'
import { useApp } from '@/app-context'
import { getProfile, saveProfile, type Profile } from '@/data/family'
import { useT } from '@/i18n'
import { Button, Field, LinkButton, PageHeader, cx, inputClass } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'
import { bloodGroups, relations } from '../people'

const blank: Omit<Profile, 'id'> = { name: '', relation: 'self', birth_year: null, sex: '', blood_group: '', conditions: '', allergies: '' }

function Edit() {
  const id = useSearchParams().get('id')
  const { data, loading } = useAsync(async (db) => (id ? await getProfile(db, id) : undefined), [id])
  if (loading) return null
  return <PersonForm key={id ?? 'new'} id={id} initial={data ?? blank} />
}

function PersonForm({ id, initial }: { id: string | null; initial: Omit<Profile, 'id'> }) {
  const t = useT()
  const router = useRouter()
  const { db, whenReady } = useApp()
  const [p, setP] = useState(initial)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP({ ...p, [k]: v })
  const thisYear = new Date().getFullYear()
  const back = id ? `/records/person/?id=${id}` : '/records/'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!p.name.trim()) return setError(true)
    setBusy(true)
    await whenReady
    const saved = await saveProfile(db, { ...p, id: id ?? undefined })
    router.replace(`/records/person/?id=${saved}`)
  }

  return (
    <>
      <PageHeader title={id ? initial.name : t('addPerson')} back={{ href: back, label: t('back') }} />
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
              <label key={v} className={cx('flex min-h-12 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border px-2 text-center font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neel', p.sex === v ? 'border-neel bg-neel-soft text-neel' : 'border-line')}>
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
          <LinkButton href={back} variant="ghost">{t('cancel')}</LinkButton>
        </div>
      </form>
    </>
  )
}

export default function EditPage() {
  return (
    <Suspense>
      <Edit />
    </Suspense>
  )
}
