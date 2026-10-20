'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowClockwise, CaretRight, Drop, HandHeart, Info, MapPin, Phone, X } from '@phosphor-icons/react'
import { askForBlood, closeRequest, forgetRequest, myRequests, requestStatus, type MyRequest, type RequestStatus } from '@/data/blood'
import { findDonors, type Donor } from '@/domain/donors'
import { useFormatDate, useT } from '@/i18n'
import type { StringKey } from '@/strings'
import { Banner, Button, Card, Chip, Field, LinkButton, PageHeader, buttonClass, cx, inputClass } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'
import { errorKey, GroupAndPlace, placeById } from './shared'

// ponytail: a year-old check still counts; tighten when the directory is refreshed from the server.
const FRESH_DAYS = 365
const dialable = (contact: string) => /^\+?[\d\s-]{6,}$/.test(contact)

export default function Donors() {
  const t = useT()
  const fmt = useFormatDate()
  const [group, setGroup] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<StringKey | null>(null)
  const [requests, setRequests] = useState<MyRequest[]>([])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount: the page is prerendered without localStorage
  useEffect(() => setRequests(myRequests()), [])

  const { data: directory } = useAsync((db) => db.query<Donor>('SELECT * FROM donors'), [])
  const place = placeById(placeId)
  const matches = group && directory ? findDonors(directory, { group, from: place ? { lat: place.lat, lng: place.lng } : null, now: new Date(), freshDays: FRESH_DAYS }) : null

  async function send(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (!group || !place) return
    setSending(true)
    setError(null)
    try {
      await askForBlood({ blood_group: group, locality_label: place.name, latitude: place.lat, longitude: place.lng, note: note.trim() })
      setNote('')
      setTried(false)
      setRequests(myRequests())
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
              <RequestCard key={r.id} request={r} onForget={() => (forgetRequest(r.id), setRequests(myRequests()))} />
            ))}
          </section>
        )}

        <LinkButton href="/donors/give/" variant="secondary" className="justify-between">
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

  // State is set only when the request settles, so this is safe to start from an effect.
  const fetchStatus = () =>
    requestStatus(r)
      .then((s) => (setStatus(s), setError(null)), (e) => setError(errorKey(e)))
      .finally(() => setBusy(false))
  useEffect(() => void fetchStatus(), []) // eslint-disable-line react-hooks/exhaustive-deps
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
