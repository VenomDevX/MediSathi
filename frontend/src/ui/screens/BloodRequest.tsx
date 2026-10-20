import { useEffect, useState, type FormEvent } from 'react'
import { ArrowClockwise, CaretRight, Check, Drop, HandHeart, Info, MapPin, Phone, X } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { localities, type Locality } from '../../localities'
import {
  BloodApiError,
  answerRequest,
  askForBlood,
  closeRequest,
  forgetRequest,
  incomingRequests,
  myDonor,
  myRequests,
  registerDonor,
  requestStatus,
  withdrawDonor,
  type IncomingRequest,
  type MyDonor,
  type MyRequest,
  type RequestStatus,
} from '../../data/blood'
import { bloodGroups } from '../../data/family'
import { findDonors, type Donor } from '../../domain/donors'
import { useFormatDate, useT } from '../../i18n'
import type { StringKey } from '../../strings'
import { Banner, Button, Card, Chip, Field, LinkButton, PageHeader, inputClass } from '../components'
import { buttonClass, cx } from '../styles'
import { useAsync } from '../useAsync'

const FRESH_DAYS = 365
const dialable = (contact: string) => /^\+?[\d\s-]{6,}$/.test(contact)
const placeById = (id: string) => localities.find((l: Locality) => l.id === id)

const errorKey = (e: unknown): StringKey =>
  !(e instanceof BloodApiError)
    ? 'serverFailed'
    : (({ offline: 'needsInternet', 'not-found': 'requestGone', unauthorized: 'donorRemoved', failed: 'serverFailed' } as const)[e.kind] ?? 'serverFailed')

function GroupAndPlace({
  group,
  place,
  onGroup,
  onPlace,
  errors,
}: {
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
          {localities.map((l: Locality) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </Field>
    </div>
  )
}

export function BloodRequest() {
  const t = useT()
  const fmt = useFormatDate()
  const { db, user } = useApp()
  const [group, setGroup] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<StringKey | null>(null)
  const [requests, setRequests] = useState(() => myRequests(user.id))

  const { data: directory } = useAsync(() => db.query<Donor>('SELECT * FROM donors'), [db])
  const place = placeById(placeId)
  const matches =
    group && directory ? findDonors(directory, { group, from: place ? { lat: place.lat, lng: place.lng } : null, now: new Date(), freshDays: FRESH_DAYS }) : null

  async function send(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (!group || !place) return
    setSending(true)
    setError(null)
    try {
      await askForBlood(user.id, { blood_group: group, locality_label: place.name, latitude: place.lat, longitude: place.lng, note: note.trim() })
      setNote('')
      setTried(false)
      setRequests(myRequests(user.id))
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHeader title={t('donorsTitle')} />
      <div className="flex flex-col gap-6">
        <Banner tone="info" icon={<Info size={20} />}>{t('donorsNote')}</Banner>

        <form onSubmit={send} noValidate className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">{t('findDonors')}</h2>
          <GroupAndPlace group={group} place={placeId} onGroup={setGroup} onPlace={setPlaceId} errors={tried ? { group: !group, place: !place } : undefined} />

          {matches && (
            <div aria-live="polite" className="flex flex-col gap-2">
              {matches.length === 0 ? (
                <p className="text-muted">{t('noDonorsFound')}</p>
              ) : (
                <>
                  <p className="font-semibold">{t('donorsFound', { n: matches.length })}</p>
                  <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-control)] border border-line">
                    {matches.slice(0, 5).map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Drop size={20} weight="fill" className="shrink-0 text-danger" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{d.blood_group}, {d.locality_label}</span>
                          <span className="text-sm text-muted">
                            {[d.distance_km !== null && (d.distance_km < 1 ? t('nearby') : t('kmAway', { n: d.distance_km })), d.last_verified_at && t('verifiedOn', { date: fmt(d.last_verified_at) })].filter(Boolean).join(', ')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="font-semibold">{t('askForBlood')}</h3>
            <p className="text-sm text-muted">{t('askHint')}</p>
            <Field label={t('requestNote')} hint={t('requestNoteHint')}>
              <textarea name="note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={cx(inputClass, 'py-3 [field-sizing:content]')} />
            </Field>
            {error && <Banner tone="danger">{t(error)}</Banner>}
            <Button type="submit" disabled={sending} className="w-fit">{t('sendRequest')}</Button>
          </div>
        </form>

        {requests.length > 0 && (
          <section aria-labelledby="your-requests" className="flex flex-col gap-3">
            <h2 id="your-requests" className="text-xl font-semibold">{t('yourRequests')}</h2>
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} onForget={() => (forgetRequest(user.id, r.id), setRequests(myRequests(user.id)))} />
            ))}
          </section>
        )}

        <LinkButton to="/blood/give" variant="secondary" className="justify-between">
          <span className="flex items-center gap-2">
            <HandHeart size={22} aria-hidden />
            {t('becomeDonor')}
          </span>
          <CaretRight size={18} aria-hidden />
        </LinkButton>
      </div>
    </>
  )
}

function RequestCard({ request: r, onForget }: { request: MyRequest; onForget: () => void }) {
  const t = useT()
  const fmt = useFormatDate()
  const [status, setStatus] = useState<RequestStatus | null>(null)
  const [error, setError] = useState<StringKey | null>(null)
  const [busy, setBusy] = useState(true)

  const fetchStatus = () =>
    requestStatus(r)
      .then((s) => (setStatus(s), setError(null)), (e) => setError(errorKey(e)))
      .finally(() => setBusy(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open; Refresh reloads
  useEffect(() => void fetchStatus(), [])
  const load = () => (setBusy(true), fetchStatus())

  async function close() {
    setBusy(true)
    try {
      await closeRequest(r)
      await fetchStatus()
    } catch (e) {
      setError(errorKey(e))
      setBusy(false)
    }
  }

  const open = status ? status.status === 'open' && status.expires_at > new Date().toISOString() : error !== 'requestGone'

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{t('requestFor', { group: r.blood_group, place: r.locality_label })}</p>
          <p className="text-sm text-muted">{open ? t('openUntil', { date: fmt(r.expires_at, true) }) : t('requestClosed')}</p>
          {r.note && <p className="mt-1 text-sm">{r.note}</p>}
        </div>
        <Button variant="ghost" onClick={() => void load()} disabled={busy} className="-my-2 -mr-3 min-h-11 px-3" aria-label={t('refresh')}>
          <ArrowClockwise size={20} className={cx(busy && 'motion-safe:animate-spin')} aria-hidden />
        </Button>
      </div>

      {error && <Banner tone={error === 'requestGone' ? 'caution' : 'danger'}>{t(error)}</Banner>}

      {status && (
        <div aria-live="polite">
          {status.donors.length === 0 ? (
            <p className="text-muted">{t('noYesYet')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <Chip tone="ok">{t('donorsSaidYes', { n: status.donors.length })}</Chip>
              <ul className="flex flex-col gap-2">
                {status.donors.map((d, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium" translate="no">{d.contact}</span>
                      {d.locality_label && (
                        <span className="flex items-center gap-1 text-sm text-muted">
                          <MapPin size={14} aria-hidden />
                          {d.locality_label}
                        </span>
                      )}
                    </span>
                    {dialable(d.contact) && (
                      <a href={`tel:${d.contact.replace(/[\s-]/g, '')}`} className={cx(buttonClass(), 'min-h-11 px-3')}>
                        <Phone size={18} aria-hidden />
                        {t('callDonor')}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {open && status && (
          <Button variant="secondary" onClick={() => void close()} disabled={busy} className="min-h-11 px-3 text-[15px]">
            {t('closeRequest')}
          </Button>
        )}
        {!open && (
          <Button variant="ghost" onClick={onForget} className="-ml-3 min-h-11 px-3 text-[15px]">
            <X size={18} aria-hidden />
            {t('removeFromList')}
          </Button>
        )}
      </div>
    </Card>
  )
}

export function BloodGive() {
  const t = useT()
  const { user } = useApp()
  const [me, setMe] = useState(() => myDonor(user.id))

  return (
    <>
      <PageHeader title={t('becomeDonor')} back={{ to: '/blood', label: t('donorsTitle') }} />
      {me ? <DonorHome me={me} onGone={() => setMe(null)} /> : <Join onJoined={() => setMe(myDonor(user.id))} />}
    </>
  )
}

function Join({ onJoined }: { onJoined: () => void }) {
  const t = useT()
  const { user } = useApp()
  const [group, setGroup] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<StringKey | null>(null)
  const place = placeById(placeId)
  const phoneOk = phone.replace(/\D/g, '').length >= 10

  async function join(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (!group || !place || !phoneOk || !consent) return
    setBusy(true)
    setError(null)
    try {
      await registerDonor(user.id, { blood_group: group, locality_label: place.name, latitude: place.lat, longitude: place.lng, contact: phone.trim(), consent: true })
      onJoined()
    } catch (err) {
      setError(errorKey(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={join} noValidate className="flex flex-col gap-5">
      <p className="text-muted">{t('becomeDonorHint')}</p>
      <GroupAndPlace group={group} place={placeId} onGroup={setGroup} onPlace={setPlaceId} errors={tried ? { group: !group, place: !place } : undefined} />
      <Field label={t('yourPhone')} hint={t('phoneHint')} error={tried && !phoneOk ? t('phoneRequired') : undefined}>
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" spellCheck={false} maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(inputClass, 'tabular-nums')} aria-invalid={tried && !phoneOk} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-line bg-surface p-4">
          <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--color-neem)]" aria-invalid={tried && !consent} />
          <span>{t('donorConsent')}</span>
        </label>
        <span aria-live="polite" className="text-sm text-danger empty:hidden">{tried && !consent ? t('consentRequired') : ''}</span>
      </div>
      {error && <Banner tone="danger">{t(error)}</Banner>}
      <Button type="submit" disabled={busy} className="w-fit">
        <HandHeart size={20} aria-hidden />
        {t('joinAsDonor')}
      </Button>
    </form>
  )
}

function DonorHome({ me, onGone }: { me: MyDonor; onGone: () => void }) {
  const t = useT()
  const { user } = useApp()
  const fmt = useFormatDate()
  const [requests, setRequests] = useState<IncomingRequest[] | null>(null)
  const [error, setError] = useState<StringKey | null>(null)
  const [busy, setBusy] = useState(true)
  const [confirmStop, setConfirmStop] = useState(false)

  const fail = (e: unknown) => (errorKey(e) === 'donorRemoved' ? onGone() : setError(errorKey(e)))
  const fetchRequests = (action: () => Promise<unknown> = async () => {}) =>
    action()
      .then(() => incomingRequests(user.id))
      .then((rs) => (setRequests(rs), setError(null)), fail)
      .finally(() => setBusy(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open; Refresh reloads
  useEffect(() => void fetchRequests(), [])
  const run = (action?: () => Promise<unknown>) => (setBusy(true), fetchRequests(action))

  async function stop() {
    setBusy(true)
    await withdrawDonor(user.id).then(onGone, (e) => (fail(e), setBusy(false)))
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-center gap-3 p-5">
        <Drop size={28} weight="fill" className="shrink-0 text-danger" aria-hidden />
        <p className="font-semibold">{t('youAreDonor', { group: me.blood_group, place: me.locality_label })}</p>
      </Card>

      <section aria-labelledby="for-you" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="for-you" className="text-xl font-semibold">{t('requestsForYou')}</h2>
          <Button variant="ghost" onClick={() => void run()} disabled={busy} className="-mr-3 min-h-11 px-3" aria-label={t('refresh')}>
            <ArrowClockwise size={20} className={cx(busy && 'motion-safe:animate-spin')} aria-hidden />
          </Button>
        </div>
        {error && <Banner tone="danger">{t(error)}</Banner>}
        {requests?.length === 0 && <p className="text-muted">{t('noRequestsForYou')}</p>}
        {requests?.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3 p-4">
            <div>
              <p className="font-semibold">{t('requestFor', { group: r.blood_group, place: r.locality_label })}</p>
              <p className="text-sm text-muted">{t('openUntil', { date: fmt(r.expires_at, true) })}</p>
              {r.note && <p className="mt-1">{r.note}</p>}
            </div>
            {r.my_answer ? (
              <Chip tone={r.my_answer === 'accepted' ? 'ok' : 'info'} icon={r.my_answer === 'accepted' ? <Check size={14} weight="bold" /> : <X size={14} weight="bold" />}>
                {t(r.my_answer === 'accepted' ? 'youAccepted' : 'youDeclined')}
              </Chip>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void run(() => answerRequest(user.id, r.id, true))} disabled={busy}>{t('acceptRequest')}</Button>
                <Button variant="secondary" onClick={() => void run(() => answerRequest(user.id, r.id, false))} disabled={busy}>{t('declineRequest')}</Button>
              </div>
            )}
          </Card>
        ))}
      </section>

      <Banner tone="info" icon={<Info size={20} />}>{t('phoneHint')}</Banner>

      <div className="border-t border-line pt-4">
        {confirmStop ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => void stop()} disabled={busy}>{t('stopDonorConfirm')}</Button>
            <Button variant="ghost" onClick={() => setConfirmStop(false)}>{t('cancel')}</Button>
          </div>
        ) : (
          <Button variant="ghost" className="-ml-3 px-3 text-danger" onClick={() => setConfirmStop(true)}>{t('stopDonor')}</Button>
        )}
      </div>
    </div>
  )
}
