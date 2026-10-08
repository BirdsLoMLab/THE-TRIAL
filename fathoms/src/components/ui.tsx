import type { ButtonHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON: Record<Variant, string> = {
  primary: 'bg-level-1 text-abyss hover:brightness-110',
  secondary: 'bg-surface text-ink border border-edge hover:border-ink-muted',
  ghost: 'text-ink-muted hover:text-ink',
  danger: 'bg-afterdark text-ink hover:brightness-110',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant
  readonly block?: boolean
}

/** Thumb sized button. Primary is reserved for the one main action of a screen. */
export function Button({
  variant = 'secondary',
  block = false,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`min-h-12 rounded-2xl px-5 py-3 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  )
}

export function LinkButton({
  to,
  variant = 'secondary',
  block = false,
  className = '',
  children,
  ...rest
}: {
  readonly to: string
  readonly variant?: Variant
  readonly block?: boolean
  readonly className?: string
  readonly children: ReactNode
  readonly 'data-testid'?: string
}) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-5 py-3 text-base font-medium transition ${BUTTON[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  )
}

export function TextArea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      className={`bg-abyss/60 border-edge text-ink placeholder:text-ink-muted/70 focus:border-level-1 w-full resize-y rounded-xl border px-3 py-2 text-base outline-none ${className}`}
      {...rest}
    />
  )
}

export function TextInput({
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { readonly className?: string }) {
  return (
    <input
      className={`bg-abyss/60 border-edge text-ink placeholder:text-ink-muted/70 focus:border-level-1 min-h-12 w-full rounded-xl border px-3 py-2 text-base outline-none ${className}`}
      {...rest}
    />
  )
}

export interface ScreenProps {
  readonly title: string
  readonly back?: string | undefined
  readonly right?: ReactNode
  readonly children: ReactNode
  readonly testId?: string | undefined
}

/** Phone first page frame: one column, 360 px friendly, top bar with a title. */
export function Screen({ title, back, right, children, testId }: ScreenProps) {
  return (
    <main
      data-testid={testId}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-4 pb-10"
    >
      <header className="mb-5 flex min-h-12 items-center gap-3">
        {back !== undefined && (
          <Link
            to={back}
            aria-label="Back"
            className="text-ink-muted hover:text-ink flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl"
          >
            {'‹'}
          </Link>
        )}
        <h1 className="flex-1 truncate text-xl font-semibold tracking-tight">{title}</h1>
        {right}
      </header>
      {children}
    </main>
  )
}

export function Notice({
  children,
  tone = 'muted',
}: {
  readonly children: ReactNode
  readonly tone?: 'muted' | 'error'
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={`mt-3 text-sm ${tone === 'error' ? 'text-[#ff8a8a]' : 'text-ink-muted'}`}
    >
      {children}
    </p>
  )
}

export function PlayerDot({ color, name }: { readonly color: string; readonly name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{name}</span>
    </span>
  )
}

export function SectionLabel({ children }: { readonly children: ReactNode }) {
  return (
    <h2 className="text-ink-muted mb-2 text-xs font-semibold tracking-widest uppercase">
      {children}
    </h2>
  )
}
