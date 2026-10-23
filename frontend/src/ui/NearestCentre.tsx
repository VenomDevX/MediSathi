import { useState } from 'react'
import { Crosshair, FirstAid, MapPin, NavigationArrow, Phone } from '@phosphor-icons/react'
import { nearestCentres, type Centre } from '../domain/centres'
import { healthCentres } from '../healthCentres'
import { useT } from '../i18n'
import { localities } from '../localities'
import { locate } from '../platform/locate'
import type { StringKey } from '../strings'
import { inputClass } from './components'
import { usePlace } from './usePlace'

const TYPE: Record<Centre['type'], StringKey> = {
  subcentre: 'centreSubcentre',
  phc: 'centrePhc',
  chc: 'centreChc',
  district: 'centreDistrict',
  'medical-college': 'centreMedicalCollege',
}

/**
 * "Nearest: Rampur PHC, 1.1 km" from the remembered place, with directions and (unless the page already has one) Call 108.
 * Works offline except directions.
 */
export function NearestCentre({ call108 = true }: { call108?: boolean }) {
  const t = useT()
  const { point, placeId, save } = usePlace()
  const [choosing, setChoosing] = useState(!point)
  const [locating, setLocating] = useState(false)
  const near = point ? nearestCentres(point, healthCentres) : []

  function useGps() {
    setLocating(true)
    locate().then(
      (p) => (save(p), setChoosing(false)),
      () => {},
    ).finally(() => setLocating(false))
  }

  return (
    <section aria-label={t('nearestTitle')} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      {near.map((c, i) => (
        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <FirstAid size={22} className="shrink-0 text-neem" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="text-sm text-muted">{t(i === 0 ? 'nearestCentre' : 'nearest24h')} </span>
            <span className="font-semibold">{c.name}</span>
            <span className="text-muted"> · {t(TYPE[c.type])} · {t('kmAway', { n: c.km })}{c.open24h ? ` · ${t('open24h')}` : ''}</span>
          </p>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`${t('directions')}: ${c.name}`}
            className="flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-2 text-sm font-semibold text-neem hover:bg-neem-soft"
          >
            <NavigationArrow size={18} aria-hidden />
            {t('directions')}
          </a>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {call108 && (
          <a href="tel:108" className="flex min-h-11 items-center gap-1.5 font-semibold text-danger">
            <Phone size={18} weight="fill" aria-hidden />
            {t('call', { n: 108 })}
          </a>
        )}
        {!choosing && (
          <button type="button" onClick={() => setChoosing(true)} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
            <MapPin size={18} aria-hidden />
            {t('changePlace')}
          </button>
        )}
      </div>
      {choosing && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">{t('yourVillage')}</span>
            <select
              name="my-place"
              value={placeId === 'gps' ? '' : placeId}
              onChange={(e) => {
                if (!e.target.value) return
                save({ id: e.target.value })
                setChoosing(false)
              }}
              className={inputClass}
            >
              <option value="">{t('placeNotChosen')}</option>
              {localities.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={useGps} disabled={locating} className="flex min-h-12 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 font-semibold hover:border-neem">
            <Crosshair size={18} aria-hidden />
            {t(locating ? 'locating' : 'useMyLocation')}
          </button>
        </div>
      )}
    </section>
  )
}
