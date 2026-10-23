import { useEffect, useState } from 'react'
import { IdentificationCard, SealCheck } from '@phosphor-icons/react'
import { useApp } from '../app-context'
import { lookupKyc, markVerified, verifiedAt } from '../data/kyc'
import { todayLocal } from '../domain/dates'
import { compareIdentity, type Held, type Mismatch } from '../domain/identity'
import { useFormatDate, useT } from '../i18n'
import type { StringKey } from '../strings'
import { Button, Chip } from './components'

const FIELD: Record<Mismatch, StringKey> = { name: 'mismatchName', sex: 'mismatchSex', birth: 'mismatchBirth' }

/** Checks a person's ABHA number against DigiLocker's identity answer. Demo: the answer is bundled, nothing is sent. */
export function VerifyAbha({ personId, abha, held }: { personId: string; abha: string; held: Held }) {
  const t = useT()
  const fmt = useFormatDate()
  const { db } = useApp()
  const [at, setAt] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'consent' | 'none' | Mismatch[]>('idle')

  useEffect(() => {
    void verifiedAt(db, personId, abha).then(setAt)
  }, [db, personId, abha])

  async function share() {
    const kyc = lookupKyc(abha)
    if (!kyc) return setStep('none')
    const today = todayLocal()
    const off = compareIdentity(held, kyc, today)
    if (off.length) return setStep(off)
    await markVerified(db, personId, abha, today)
    setAt(today)
    setStep('idle')
  }

  if (at)
    return (
      <Chip tone="ok" icon={<SealCheck size={16} weight="fill" aria-hidden />}>
        {t('verifiedDemo', { date: fmt(at) })}
      </Chip>
    )

  return (
    <div className="flex flex-col gap-2">
      {step === 'consent' ? (
        <div role="group" aria-label={t('verifyDigilocker')} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <p className="font-semibold">{t('verifyDemoTitle')}</p>
          <p className="text-sm text-muted">{t('verifyDemoNote')}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void share()}>{t('verifyShare')}</Button>
            <Button variant="ghost" onClick={() => setStep('idle')}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setStep('consent')} className="self-start">
          <IdentificationCard size={20} aria-hidden />
          {t('verifyDigilocker')}
        </Button>
      )}
      {step === 'none' && <p role="alert" className="text-sm text-danger">{t('verifyNoRecord')}</p>}
      {Array.isArray(step) && (
        <p role="alert" className="text-sm text-danger">
          {t('verifyMismatch', { fields: step.map((f) => t(FIELD[f])).join(', ') })}
        </p>
      )}
    </div>
  )
}
