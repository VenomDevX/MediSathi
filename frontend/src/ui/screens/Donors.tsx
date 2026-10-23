import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChatText, Crosshair, Drop, HandHeart, MapPin, PaperPlaneTilt, Phone, Warning } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { directoryUpdatedAt, listDonors, revealContact, smsNumbers } from '../../data/donors'
import { BLOOD_GROUPS, findDonors, SMS_MAX, smsLink, type Point } from '../../domain/donors'
import { useFormatDate, useT } from '../../i18n'
import { localities } from '../../localities'
import { locate } from '../../platform/locate'
import { Banner, Button, Card, Chip, EmptyState, LinkButton, PageHeader, inputClass } from '../components'
import { useAsync } from '../useAsync'
import { buttonClass, cx } from '../styles'

const FRESH_DAYS = 180 // ponytail: fixed freshness window; make it server config once the blood-bank partner agrees a policy (TRD §7.3)

export function Donors() {
  const t = useT()
  const fmt = useFormatDate()
  const { db, user } = useApp()
  // Blood group and place live in the URL so a search can be reopened or shared on the device.
  const [params, setParams] = useSearchParams()
  const group = params.get('group') ?? ''
  const place = params.get('place') ?? ''
  const [gps, setGps] = useState<Point | null>(null)
  const [locating, setLocating] = useState<'idle' | 'busy' | 'failed'>('idle')
  const { data } = useAsync(async () => ({ donors: await listDonors(db), updated: await directoryUpdatedAt(db) }), [db])

  const set = (k: string, v: string) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const locality = localities.find((l) => l.id === place)
  const from: Point | null = place === 'gps' ? gps : locality ? { lat: locality.lat, lng: locality.lng } : null
  const results = data && group ? findDonors(data.donors, { group, from, now: new Date(), freshDays: FRESH_DAYS }) : null

  // TRD §7.2: ask for location only when the user taps; never block search if it is denied.
  function useMyLocation() {
    setLocating('busy')
    locate().then(
      (point) => {
        setGps(point)
        set('place', 'gps')
        setLocating('idle')
      },
      () => setLocating('failed'),
    )
  }

  return (
    <>
      <PageHeader title={t('donorsTitle')} />
      <div className="flex flex-col gap-6">
        <Banner tone="caution" icon={<Warning size={20} />}>
          <p>{t('donorsWarning')}</p>
          <p className="mt-1 text-sm">{data?.updated ? t('directoryUpdated', { date: fmt(data.updated) }) : t('directoryNever')}</p>
        </Banner>

        <fieldset>
          <legend className="mb-3 text-xl font-semibold">{t('bloodGroupNeeded')}</legend>
          <div className="grid grid-cols-4 gap-2">
            {BLOOD_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => set('group', g)}
                className={`min-h-14 rounded-[var(--radius-control)] border text-lg font-bold tabular-nums transition-colors ${group === g ? 'border-danger bg-danger-bg text-danger' : 'border-line bg-surface hover:border-muted'}`}
              >
                {g}
              </button>
            ))}
          </div>
        </fieldset>

        <section aria-labelledby="where" className="flex flex-col gap-3">
          <h2 id="where" className="text-xl font-semibold">{t('whereIsPatient')}</h2>
          <Button variant="secondary" onClick={useMyLocation} disabled={locating === 'busy'}>
            <Crosshair size={20} aria-hidden />
            {t(locating === 'busy' ? 'locating' : 'useMyLocation')}
          </Button>
          {locating === 'failed' && <Banner tone="info">{t('locationFailed')}</Banner>}
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t('orChoosePlace')}</span>
            <select name="place" value={place} onChange={(e) => set('place', e.target.value)} className={inputClass}>
              <option value="">{t('placeNotChosen')}</option>
              {gps && <option value="gps">{t('myLocation')}</option>}
              {localities.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
        </section>

        <section aria-labelledby="results" aria-live="polite">
          {!group ? (
            <EmptyState icon={<Drop size={32} />} title={t('pickGroup')} />
          ) : results && results.length === 0 ? (
            <EmptyState icon={<Drop size={32} />} title={t('noDonors')} action={<LinkButton to="/emergency" variant="secondary">{t('openEmergency')}</LinkButton>} />
          ) : (
            <>
              <h2 id="results" className="mb-3 text-xl font-semibold">{t('resultsCount', { n: results?.length ?? 0 })}</h2>
              {user.role === 'coordinator' && results && (
                <SmsDonors key={group + place} ids={results.map((d) => d.id)} group={group} place={locality?.name ?? results[0]?.locality_label ?? ''} />
              )}
              <ul className="flex flex-col gap-3">
                {results?.map((d) => (
                  <li key={d.id}>
                    <DonorCard id={d.id} group={d.blood_group} locality={d.locality_label} km={d.distance_km} verified={d.last_verified_at!} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        {/* Blood requests go through the server: a donor's number is shared only after they say yes to that request. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <LinkButton to="/blood" variant="secondary">
            <PaperPlaneTilt size={20} aria-hidden />
            {t('askForBlood')}
          </LinkButton>
          <LinkButton to="/blood/give" variant="secondary">
            <HandHeart size={20} aria-hidden />
            {t('becomeDonor')}
          </LinkButton>
        </div>
      </div>
    </>
  )
}

/** Coordinators text every matching donor at once through the phone's SMS app: works where there is signal but no data. */
function SmsDonors({ ids, group, place }: { ids: string[]; group: string; place: string }) {
  const t = useT()
  const { db, user } = useApp()
  const [numbers, setNumbers] = useState<string[] | null>(null)
  const body = t('smsDonorText', { group, place })

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      {numbers === null ? (
        <Button variant="secondary" onClick={() => void smsNumbers(db, user, ids).then(setNumbers)} className="self-start">
          <ChatText size={20} aria-hidden />
          {t('smsDonors')}
        </Button>
      ) : numbers.length === 0 ? (
        <p className="text-danger">{t('smsNoNumbers')}</p>
      ) : (
        <>
          <a href={smsLink(numbers, body)} className={cx(buttonClass(), 'self-start')}>
            <ChatText size={20} aria-hidden />
            {t('smsOpen', { n: Math.min(numbers.length, SMS_MAX) })}
          </a>
          <p className="rounded-[var(--radius-control)] bg-canvas px-3 py-2 text-sm">{body}</p>
        </>
      )}
      <p className="text-sm text-muted">{t('smsDonorsHint')}</p>
    </div>
  )
}

function DonorCard({ id, group, locality, km, verified }: { id: string; group: string; locality: string | null; km: number | null; verified: string }) {
  const t = useT()
  const fmt = useFormatDate()
  const { db, user } = useApp()
  const [contact, setContact] = useState<string | null>(null)
  const [contactError, setContactError] = useState(false)
  const isCoordinator = user.role === 'coordinator'

  async function reveal() {
    try {
      setContact(await revealContact(db, user, id))
    } catch {
      setContactError(true)
    }
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{t('potentialDonor')}</p>
          <p className="flex items-center gap-1.5 text-muted">
            <MapPin size={16} aria-hidden />
            {[locality, km !== null ? t('aboutKm', { n: km }) : t('distanceUnknown')].filter(Boolean).join(', ')}
          </p>
        </div>
        <Chip tone="danger">{group}</Chip>
      </div>
      <p className="text-sm text-muted">{t('verifiedOn', { date: fmt(verified) })}</p>
      {contact ? (
        <p className="flex items-center gap-2 font-semibold"><Phone size={18} aria-hidden />{contact}</p>
      ) : isCoordinator ? (
        <Button variant="secondary" onClick={reveal} className="self-start">
          <Phone size={18} aria-hidden />
          {t('showContact')}
        </Button>
      ) : (
        <p className="text-sm text-muted">{t('contactCoordinatorsOnly')}</p>
      )}
      {contactError && <p className="text-sm text-danger">{t('contactUnavailable')}</p>}
    </Card>
  )
}
