import { useId } from 'react'
import { cn } from '../lib/utils'

export function LogoMark({ className }: { className?: string }) {
  // A unique gradient id per instance — duplicate ids make every mark on the
  // page inherit the first one's fill.
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 48 48" className={cn('h-8 w-8', className)} aria-hidden>
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--c-brand))" />
          <stop offset="100%" stopColor="rgb(var(--c-info))" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="rgb(var(--c-brand) / 0.10)" />
      <rect
        x="2" y="2" width="44" height="44" rx="13"
        fill="none" stroke={`url(#lg-${id})`} strokeWidth="2.25"
      />
      <path
        d="M11 31 L18.5 22.5 L24.5 27 L32 15.5 L38 19.5"
        fill="none"
        stroke={`url(#lg-${id})`}
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="38" cy="19.5" r="3.6" fill="rgb(var(--c-brand))" />
    </svg>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex select-none items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight text-strong">
          PFIP<span className="text-brand">.</span>
        </span>
      )}
    </span>
  )
}
