'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowClockwise, Check, Drop, HandHeart, Info, X } from '@phosphor-icons/react'
import { answerRequest, incomingRequests, myDonor, registerDonor, withdrawDonor, type IncomingRequest, type MyDonor } from '@/data/blood'
import { useFormatDate, useT } from '@/i18n'
import type { StringKey } from '@/strings'
import { Banner, Button, Card, Chip, Field, PageHeader, cx, inputClass } from '@/ui/components'
import { errorKey, GroupAndPlace, placeById } from '../shared'

export default function Give() {
  const t = useT()
  const [me, setMe] = useState<MyDonor | null | undefined>(undefined)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount: the page is prerendered without localStorage
  useEffect(() => setMe(myDonor()), [])

  return (
    <>
      <PageHeader title={t('becomeDonor')} back={{ href: '/donors/', label: t('donorsTitle') }} />
      {me === undefined ? null : me ? <DonorHome me={me} onGone={() => setMe(null)} /> : <Join onJoined={() => setMe(myDonor())} />}
    </>
  )
}

function Join({ onJoined }: { onJoined: () => void }) {
  const t = useT()
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
      await registerDonor({ blood_group: group, locality_label: place.name, latitude: place.lat, longitude: place.lng, contact: phone.trim(), consent: true })
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
          <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--color-neel)]" aria-invalid={tried && !consent} />
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
  const fmt = useFormatDate()
  const [requests, setRequests] = useState<IncomingRequest[] | null>(null)
  const [error, setError] = useState<StringKey | null>(null)
  const [busy, setBusy] = useState(true)
  const [confirmStop, setConfirmStop] = useState(false)

  const fail = (e: unknown) => (errorKey(e) === 'donorRemoved' ? onGone() : setError(errorKey(e)))
  // State is set only when the calls settle, so the first load is safe to start from an effect.
  const fetchRequests = (action: () => Promise<unknown> = async () => {}) =>
    action()
      .then(incomingRequests)
      .then((rs) => (setRequests(rs), setError(null)), fail)
      .finally(() => setBusy(false))
  useEffect(() => void fetchRequests(), []) // eslint-disable-line react-hooks/exhaustive-deps
  const run = (action?: () => Promise<unknown>) => (setBusy(true), fetchRequests(action))

  async function stop() {
    setBusy(true)
    await withdrawDonor().then(onGone, (e) => (fail(e), setBusy(false)))
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
                <Button onClick={() => void run(() => answerRequest(r.id, true))} disabled={busy}>{t('acceptRequest')}</Button>
                <Button variant="secondary" onClick={() => void run(() => answerRequest(r.id, false))} disabled={busy}>{t('declineRequest')}</Button>
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
