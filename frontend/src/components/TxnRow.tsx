import { AlertTriangle, EyeOff, RefreshCcw } from 'lucide-react'
import type { TxnLite } from '../lib/types'
import { categoryColor, cn, formatDate, formatMoney } from '../lib/utils'
import { Tooltip } from './ui'

/** Compact ledger line used inside dashboard cards and drill-down panels. */
export default function TxnRow({
  txn, showDate = true, excluded = false, onClick,
}: {
  txn: TxnLite
  showDate?: boolean
  excluded?: boolean
  onClick?: () => void
}) {
  const color = categoryColor(txn.category)
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-raised',
        excluded && 'opacity-50',
      )}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-2xs font-bold"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        {(txn.merchant || txn.category).slice(0, 2).toUpperCase()}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-strong">
            {txn.merchant || txn.description}
          </span>
          {txn.is_recurring && (
            <Tooltip content="Recurring payment">
              <RefreshCcw className="h-3 w-3 shrink-0 text-info" />
            </Tooltip>
          )}
          {txn.is_anomaly && (
            <Tooltip content="Unusually large for this category">
              <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
            </Tooltip>
          )}
          {excluded && (
            <Tooltip content="Excluded from all metrics">
              <EyeOff className="h-3 w-3 shrink-0 text-faint" />
            </Tooltip>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {txn.category}
          {showDate && ` · ${formatDate(txn.date, 'short')}`}
        </span>
      </span>

      <span className={cn('tnum shrink-0 text-sm font-semibold',
        txn.amount > 0 ? 'text-positive' : 'text-strong')}>
        {txn.amount > 0 ? '+' : ''}{formatMoney(txn.amount)}
      </span>
    </Wrapper>
  )
}
