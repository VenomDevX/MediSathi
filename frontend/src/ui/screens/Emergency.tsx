import { useSearchParams } from 'react-router-dom'
import { Phone, Warning } from '@phosphor-icons/react'
import { emergencyRules } from '../../emergencyRules'
import { ruleText } from '../../domain/emergency'
import { useLang, useT } from '../../i18n'
import type { StringKey } from '../../strings'
import { PageHeader } from '../components'
import { NearestCentre } from '../NearestCentre'

const numbers: { n: number; label: StringKey }[] = [
  { n: 108, label: 'ambulance' },
  { n: 102, label: 'maternalTransport' },
  { n: 112, label: 'nationalEmergency' },
]

/** Works with no model and no network: numbers and reviewed rule text only (PRD HG-06, TRD §11). */
export function Emergency() {
  const t = useT()
  const { lang } = useLang()
  const [params] = useSearchParams()
  const rule = emergencyRules.find((r) => r.id === params.get('rule'))

  return (
    <>
      <PageHeader title={t('emergencyTitle')} />
      <div className="flex flex-col gap-6">
        <p className="text-muted">{t('emergencyIntro')}</p>

        {rule && (
          <section role="alert" className="flex flex-col gap-2 rounded-[var(--radius-card)] border-2 border-danger bg-danger-bg p-4">
            <p className="flex items-center gap-2 text-lg font-bold text-danger">
              <Warning size={24} weight="bold" aria-hidden />
              {ruleText(rule.title, lang)}
            </p>
            <p>{ruleText(rule.instruction, lang)}</p>
          </section>
        )}

        <ul className="flex flex-col gap-3">
          {numbers.map(({ n, label }, i) => (
            <li key={n}>
              <a
                href={`tel:${n}`}
                className={`flex min-h-20 items-center gap-4 rounded-[var(--radius-card)] px-5 py-3 hover:opacity-90 ${i === 0 ? 'bg-danger text-surface' : 'border border-line bg-surface'}`}
              >
                <Phone size={28} weight="fill" aria-hidden className={i === 0 ? '' : 'text-danger'} />
                <span className="flex flex-col">
                  <span className="text-2xl font-bold tabular-nums">{t('call', { n })}</span>
                  <span className={i === 0 ? 'opacity-90' : 'text-muted'}>{t(label)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <NearestCentre call108={false} />

        <section aria-labelledby="signs">
          <h2 id="signs" className="mb-3 text-xl font-semibold">{t('dangerSigns')}</h2>
          <div className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
            {emergencyRules.map((r) => (
              <details key={r.id} open={r.id === rule?.id} className="group">
                <summary className="flex min-h-14 cursor-pointer items-center px-4 font-semibold">{ruleText(r.title, lang)}</summary>
                <p className="px-4 pb-4">{ruleText(r.instruction, lang)}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
