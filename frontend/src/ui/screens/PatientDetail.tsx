import { useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarPlus, ClipboardText, PencilSimple, UserCircle } from '@phosphor-icons/react'
import { useApp } from '../../app-context'
import { addVisit, amendVisit, getPatient, listVisits } from '../../data/records'
import { todayLocal } from '../../domain/dates'
import type { VisitChain, VisitRow } from '../../domain/visits'
import { useFormatDate, useT } from '../../i18n'
import { Button, Card, Chip, EmptyState, Field, LinkButton, PageHeader, SyncChip, inputClass } from '../components'
import { askReminderPermission } from '../../platform/notify'
import { useAsync } from '../useAsync'
import { cx } from '../styles'
import { SYMPTOM_LABEL, SYMPTOMS, type Symptom } from '../../domain/outbreak'

type Obs = { bp?: string; weight?: string; temp?: string; symptoms?: string[] }

export function PatientDetail() {
  const t = useT()
  const { id = '' } = useParams()
  const { db, user } = useApp()
  const { data, loading } = useAsync(async () => ({ patient: await getPatient(db, user, id), visits: await listVisits(db, user, id) }), [db, user, id])

  if (loading) return null
  if (!data?.patient) return <EmptyState icon={<UserCircle size={32} />} title={t('patientNotFound')} action={<LinkButton to="/patients" variant="secondary">{t('back')}</LinkButton>} />
  const p = data.patient

  return (
    <>
      <PageHeader title={p.display_name} back={{ to: '/patients', label: t('navPatients') }} />
      <p className="-mt-3 mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        {[p.village, p.age_years != null && t('years', { n: p.age_years }), p.sex && t(p.sex === 'F' ? 'female' : p.sex === 'M' ? 'male' : 'other'), p.local_identifier]
          .filter(Boolean)
          .join(', ')}
        {p.sync_status !== 'synced' && <SyncChip status={p.sync_status} label={t} />}
      </p>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t('visits')}</h2>
        <LinkButton to={`/patients/${p.id}/visit`}>
          <CalendarPlus size={20} aria-hidden />
          {t('addVisit')}
        </LinkButton>
      </div>

      {data.visits.length === 0 ? (
        <EmptyState icon={<ClipboardText size={32} />} title={t('noVisits')} />
      ) : (
        <ol className="flex flex-col gap-3">
          {data.visits.filter((c) => !c.voided).map((c) => <VisitCard key={c.rootId} chain={c} patientId={p.id} />)}
        </ol>
      )}
    </>
  )
}

function VisitCard({ chain, patientId }: { chain: VisitChain; patientId: string }) {
  const t = useT()
  const fmt = useFormatDate()
  const v = chain.current
  const obs: Obs = JSON.parse(v.observations_json)
  const obsText = [obs.bp && `${t('bp')} ${obs.bp}`, obs.weight && `${obs.weight} kg`, obs.temp && `${obs.temp} °F`].filter(Boolean)

  return (
    <li>
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold">{fmt(v.visit_time)}</p>
          <LinkButton to={`/patients/${patientId}/visit/${v.id}/correct`} variant="ghost" className="-my-2 -mr-3 min-h-11 px-3 text-[15px]">
            <PencilSimple size={18} aria-hidden />
            {t('correct')}
          </LinkButton>
        </div>
        {v.notes && <p className="whitespace-pre-line">{v.notes}</p>}
        {obsText.length > 0 && <p className="text-[15px] text-muted">{obsText.join(', ')}</p>}
        <div className="flex flex-wrap gap-2">
          {obs.symptoms?.filter((s): s is Symptom => s in SYMPTOM_LABEL).map((s) => <Chip key={s} tone="caution">{t(SYMPTOM_LABEL[s])}</Chip>)}
          {v.follow_up_at && <Chip tone="info">{t('followUpOn', { date: fmt(v.follow_up_at) })}</Chip>}
          {v.sync_status !== 'synced' && <SyncChip status={v.sync_status} label={t} />}
        </div>
        {v.amendment_reason && <p className="text-sm text-muted">{t('corrected', { reason: v.amendment_reason })}</p>}
        {chain.history.length > 0 && (
          <details className="text-sm text-muted">
            <summary className="min-h-11 cursor-pointer py-2.5">{t('history', { n: chain.history.length })}</summary>
            <ul className="flex flex-col gap-2 border-l-2 border-line pl-3">
              {chain.history.map((h) => (
                <li key={h.id}>
                  {fmt(h.created_at, true)}: {h.notes}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </li>
  )
}

/** New visit, or a correction of an existing one when `visitId` is in the route. */
export function VisitForm() {
  const nav = useNavigate()
  const { id = '', visitId } = useParams()
  const { db } = useApp()
  const { data: prev, loading } = useAsync(
    async () => (visitId ? (await db.query<VisitRow>('SELECT * FROM patient_visits WHERE id = ?', [visitId]))[0] : undefined),
    [db, visitId],
  )
  if (loading) return null
  return <VisitFormBody key={prev?.id ?? 'new'} prev={prev} patientId={id} onDone={() => nav(`/patients/${id}`, { replace: true })} />
}

function VisitFormBody({ prev, patientId, onDone }: { prev?: VisitRow; patientId: string; onDone: () => void }) {
  const t = useT()
  const { db, user } = useApp()
  const prevObs: Obs = prev ? JSON.parse(prev.observations_json) : {}
  const [form, setForm] = useState({
    date: prev ? todayLocal(new Date(prev.visit_time)) : todayLocal(),
    notes: prev?.notes ?? '',
    bp: prevObs.bp ?? '',
    weight: prevObs.weight ?? '',
    temp: prevObs.temp ?? '',
    follow_up_at: prev?.follow_up_at ?? '',
    reason: '',
  })
  const [symptoms, setSymptoms] = useState<string[]>(prevObs.symptoms ?? [])
  const toggleSymptom = (s: string) => setSymptoms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  const [reasonError, setReasonError] = useState(false)
  const reasonRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (prev && !form.reason.trim()) {
      setReasonError(true)
      return reasonRef.current?.focus()
    }
    setBusy(true)
    const observations: Record<string, string | string[]> = Object.fromEntries(Object.entries({ bp: form.bp, weight: form.weight, temp: form.temp }).filter(([, v]) => v.trim()))
    if (symptoms.length) observations.symptoms = symptoms
    const visit_time = form.date === todayLocal() ? new Date().toISOString() : new Date(`${form.date}T12:00:00`).toISOString()
    try {
      if (prev) await amendVisit(db, user, prev.id, { visit_time, notes: form.notes, observations, follow_up_at: form.follow_up_at, reason: form.reason })
      else await addVisit(db, user, patientId, { visit_time, notes: form.notes, observations, follow_up_at: form.follow_up_at })
      if (form.follow_up_at) await askReminderPermission()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t(prev ? 'correctVisit' : 'addVisit')} back={{ to: `/patients/${patientId}`, label: t('back') }} />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label={t('visitDate')}>
          <input type="date" name="visit-date" max={todayLocal()} value={form.date} onChange={set('date')} className={inputClass} required />
        </Field>
        <Field label={t('notes')} hint={t('notesHint')}>
          <textarea name="notes" autoComplete="off" rows={4} value={form.notes} onChange={set('notes')} className={`${inputClass} py-3`} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('bp')}>
            <input name="bp" autoComplete="off" inputMode="numeric" placeholder="120/80" value={form.bp} onChange={set('bp')} className={inputClass} />
          </Field>
          <Field label={t('weight')}>
            <input name="weight" autoComplete="off" inputMode="decimal" value={form.weight} onChange={set('weight')} className={inputClass} />
          </Field>
          <Field label={t('temperature')}>
            <input name="temperature" autoComplete="off" inputMode="decimal" value={form.temp} onChange={set('temp')} className={inputClass} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 font-semibold">{t('symptomsSeen')}</legend>
          <div className="flex flex-wrap gap-2">
            {SYMPTOMS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={symptoms.includes(s)}
                onClick={() => toggleSymptom(s)}
                className={cx('min-h-11 rounded-full border px-4', symptoms.includes(s) ? 'border-neem bg-neem text-on-neem' : 'border-line bg-surface hover:border-neem')}
              >
                {t(SYMPTOM_LABEL[s])}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label={t('followUpDate')}>
          <input type="date" name="follow-up" min={todayLocal()} value={form.follow_up_at} onChange={set('follow_up_at')} className={inputClass} />
        </Field>
        {prev && (
          <Field label={t('correctionReason')} hint={t('correctionReasonHint')} error={reasonError ? t('reasonRequired') : undefined}>
            <input ref={reasonRef} name="reason" autoComplete="off" value={form.reason} onChange={(e) => (setReasonError(false), set('reason')(e))} className={inputClass} aria-invalid={reasonError} />
          </Field>
        )}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={busy} className="flex-1">{t(prev ? 'saveCorrection' : 'saveVisit')}</Button>
          <LinkButton to={`/patients/${patientId}`} variant="secondary">{t('cancel')}</LinkButton>
        </div>
      </form>
    </>
  )
}
