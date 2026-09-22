import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { cn, formatCompact } from '../lib/utils'
import { Sparkline } from './charts'
import { Tooltip } from './ui'

type Tone = 'brand' | 'positive' | 'negative' | 'info' | 'violet' | 'warning'

const TONES: Record<Tone, string> = {
  brand: 'bg-brand/10 text-brand',
  positive: 'bg-positive/10 text-positive',
  negative: 'bg-negative/10 text-negative',
  info: 'bg-info/10 text-info',
  violet: 'bg-violet/10 text-violet',
  warning: 'bg-warning/10 text-warning',
}

export default function StatCard({
  label, value, icon: Icon, tone = 'brand', change, changeLabel, invertChange = false,
  delay = 0, hint, spark, sparkTone, footer, onClick,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone?: Tone
  /** Absolute change in currency. Direction is coloured via `invertChange`. */
  change?: number | null
  changeLabel?: string
  /** Set for cost-like metrics, where a fall is the good outcome. */
  invertChange?: boolean
  delay?: number
  hint?: string
  spark?: Record<string, number | string>[]
  sparkTone?: 'brand' | 'positive' | 'negative' | 'info'
  footer?: ReactNode
  onClick?: () => void
}) {
  const flat = change != null && Math.abs(change) < 1
  const good = change != null && !flat && (invertChange ? change < 0 : change > 0)
  const ChangeIcon = flat ? Minus : change != null && change >= 0 ? TrendingUp : TrendingDown

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className={cn('card group relative overflow-hidden p-5', onClick && 'cursor-pointer card-hover')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
            {label}
            {hint && (
              <Tooltip content={hint}>
                <span className="cursor-help text-faint" aria-label={hint}>ⓘ</span>
              </Tooltip>
            )}
          </p>
          <p className="tnum mt-2 font-display text-2xl font-bold tracking-tight text-strong lg:text-[1.7rem]">
            {value}
          </p>
        </div>
        <div className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110',
          TONES[tone],
        )}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {change != null && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <ChangeIcon className={cn('h-3.5 w-3.5',
            flat ? 'text-muted' : good ? 'text-positive' : 'text-negative')} />
          <span className={cn('tnum font-semibold',
            flat ? 'text-muted' : good ? 'text-positive' : 'text-negative')}>
            {flat ? 'No change' : `${change >= 0 ? '+' : ''}${formatCompact(change)}`}
          </span>
          <span className="text-faint">{changeLabel ?? 'vs last month'}</span>
        </div>
      )}

      {footer && <div className="mt-3 text-xs text-muted">{footer}</div>}

      {spark && spark.length > 1 && (
        <div className="-mx-5 -mb-5 mt-4 opacity-70 transition-opacity group-hover:opacity-100">
          <Sparkline data={spark} tone={sparkTone ?? (tone === 'negative' ? 'negative' : 'brand')} />
        </div>
      )}
    </motion.div>
  )
}
