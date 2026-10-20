'use client'
import { BloodApiError } from '@/data/blood'
import { localities } from '@/content'
import { useT } from '@/i18n'
import type { StringKey } from '@/strings'
import { Field, inputClass } from '@/ui/components'
import { bloodGroups } from '../records/people'

export const placeById = (id: string) => localities.find((l) => l.id === id)

export const errorKey = (e: unknown): StringKey =>
  !(e instanceof BloodApiError) ? 'serverFailed' : ({ offline: 'needsInternet', 'not-found': 'requestGone', unauthorized: 'donorRemoved', failed: 'serverFailed' } as const)[e.kind]

/** Blood group and place pickers shared by the request and donor forms. */
export function GroupAndPlace({ group, place, onGroup, onPlace, errors }: {
  group: string
  place: string
  onGroup: (g: string) => void
  onPlace: (p: string) => void
  errors?: { group?: boolean; place?: boolean }
}) {
  const t = useT()
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t('bloodGroup')} error={errors?.group ? t('groupRequired') : undefined}>
        <select name="blood_group" value={group} onChange={(e) => onGroup(e.target.value)} className={inputClass} aria-invalid={errors?.group}>
          <option value="">{t('chooseOne')}</option>
          {bloodGroups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </Field>
      <Field label={t('nearPlace')} error={errors?.place ? t('placeRequired') : undefined}>
        <select name="place" value={place} onChange={(e) => onPlace(e.target.value)} className={inputClass} aria-invalid={errors?.place}>
          <option value="">{t('chooseOne')}</option>
          {localities.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </Field>
    </div>
  )
}
