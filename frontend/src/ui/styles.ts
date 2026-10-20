export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ')

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
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
