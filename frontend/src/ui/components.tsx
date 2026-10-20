import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CaretLeft } from '@phosphor-icons/react'

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-neem text-on-neem hover:opacity-90',
  secondary: 'bg-surface text-ink border border-line hover:border-muted',
  ghost: 'text-neem hover:bg-surface',
  danger: 'bg-danger text-surface hover:opacity-90',
}
const buttonBase =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] px-5 font-semibold transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none'

/** For things that look like a button but are not one (a file picker label, an external link). */
export const buttonClass = (variant: Variant = 'primary') => cx(buttonBase, variants[variant])

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cx(buttonBase, variants[variant], className)} {...p} />
}

export function LinkButton({ variant = 'primary', className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, variants[variant], className)} {...p} />
}

export function Card({ className, ...p }: ComponentProps<'div'>) {
  return <div className={cx('rounded-[var(--radius-card)] border border-line bg-surface', className)} {...p} />
}

export type Tone = 'danger' | 'caution' | 'ok' | 'info'
const tones: Record<Tone, string> = {
  danger: 'bg-danger-bg text-danger',
  caution: 'bg-caution-bg text-caution',
  ok: 'bg-ok-bg text-ok',
  info: 'bg-info-bg text-info',
}

export function Banner({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className={cx('flex items-start gap-3 rounded-[var(--radius-card)] px-4 py-3 text-[15px]', tones[tone])}>
      {icon && <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>}
      <div>{children}</div>
    </div>
  )
}

export function Chip({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-xs font-semibold', tones[tone])}>
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  )
}

const syncTone: Record<string, [Tone, 'statusPending' | 'statusSynced' | 'statusConflict' | 'statusFailed']> = {
  pending: ['caution', 'statusPending'],
  synced: ['ok', 'statusSynced'],
  conflict: ['danger', 'statusConflict'],
  failed: ['danger', 'statusFailed'],
}

/** Sync state of a record (PRD AA-04). Text label always present; color is secondary. */
export function SyncChip({ status, label }: { status: string; label: (k: (typeof syncTone)[string][1]) => string }) {
  const [tone, key] = syncTone[status] ?? syncTone.pending
  return <Chip tone={tone}>{label(key)}</Chip>
}

export function PageHeader({ title, action, back }: { title: string; action?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="mb-5 flex flex-col gap-1">
      {back && (
        <Link to={back.to} className="-ml-2 flex min-h-11 w-fit items-center gap-1 px-2 text-muted hover:text-ink">
          <CaretLeft size={18} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl leading-tight font-bold">{title}</h1>
        {action}
      </div>
    </header>
  )
}

export function EmptyState({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-10 text-center">
      <span className="text-muted" aria-hidden>{icon}</span>
      <p className="text-muted">{title}</p>
      {action}
    </div>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error && <span className="text-sm text-muted">{hint}</span>}
      <span aria-live="polite" className="text-sm text-danger empty:hidden">{error}</span>
    </label>
  )
}

export const inputClass =
  'min-h-12 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-ink placeholder:text-muted focus:border-neem focus:outline-none'

/** The assistant's mark: the only place marigold appears (design.md). */
export function AssistantMark({ busy = false, className }: { busy?: boolean; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-3 shrink-0 rounded-full bg-marigold', busy && 'motion-safe:animate-pulse', className)} />
}
