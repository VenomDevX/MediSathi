import { Phone, Warning } from '@phosphor-icons/react'
import { ruleText, type EmergencyRule } from '../domain/emergency'
import { useLang, useT } from '../i18n'
import { LinkButton } from './components'
import { cx } from './styles'

/** Shown before anything else whenever a message or search matches a red-flag rule. */
export function EmergencyCard({ rule, className }: { rule: EmergencyRule; className?: string }) {
  const t = useT()
  const { lang } = useLang()
  return (
    <section role="alert" className={cx('flex flex-col gap-3 rounded-[var(--radius-card)] border-2 border-danger bg-danger-bg p-4', className)}>
      <p className="flex items-center gap-2 text-lg font-bold text-danger">
        <Warning size={24} weight="bold" aria-hidden />
        {t('emergencyDetected')}: {ruleText(rule.title, lang)}
      </p>
      <p>{ruleText(rule.instruction, lang)}</p>
      <div className="flex flex-wrap gap-3">
        <a href="tel:108" className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] bg-danger px-5 font-semibold text-surface hover:opacity-90">
          <Phone size={20} weight="fill" aria-hidden />
          {t('call', { n: 108 })}
        </a>
        <LinkButton to={`/emergency?rule=${rule.id}`} variant="secondary">{t('openEmergency')}</LinkButton>
      </div>
    </section>
  )
}
