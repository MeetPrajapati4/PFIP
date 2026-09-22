import { useMemo } from 'react'
import type { CalendarDay } from '../lib/types'
import { cn, formatDate, formatMoney } from '../lib/utils'
import { Tooltip } from './ui'

/**
 * A year of spending as a heat calendar.
 *
 * Intensity is bucketed by quantile rather than by a linear scale of the
 * maximum: one ₹1.6L laptop purchase would otherwise flatten every ordinary
 * day to the palest shade and the whole year would look empty.
 */
export default function SpendingCalendar({
  data, year,
}: {
  data: CalendarDay[]
  year: number
}) {
  const { weeks, thresholds, monthLabels } = useMemo(() => {
    const byDate = new Map(data.map((d) => [d.date, d]))
    const amounts = data.map((d) => d.amount).filter((a) => a > 0).sort((a, b) => a - b)
    const q = (p: number) => amounts[Math.floor(amounts.length * p)] ?? 0
    const cuts = [q(0.25), q(0.5), q(0.75), q(0.92)]

    const start = new Date(year, 0, 1)
    const end = new Date(year, 11, 31)
    // Pad back to the Monday on or before Jan 1 so columns are clean weeks.
    const cursor = new Date(start)
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))

    const cols: (CalendarDay & { inYear: boolean })[][] = []
    const labels: { col: number; label: string }[] = []
    let lastMonth = -1

    while (cursor <= end) {
      const week: (CalendarDay & { inYear: boolean })[] = []
      for (let d = 0; d < 7; d++) {
        const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
        const inYear = cursor.getFullYear() === year
        week.push({ ...(byDate.get(iso) ?? { date: iso, amount: 0, count: 0 }), inYear })
        if (d === 0 && inYear && cursor.getMonth() !== lastMonth) {
          lastMonth = cursor.getMonth()
          labels.push({
            col: cols.length,
            label: cursor.toLocaleDateString(undefined, { month: 'short' }),
          })
        }
        cursor.setDate(cursor.getDate() + 1)
      }
      cols.push(week)
    }
    return { weeks: cols, thresholds: cuts, monthLabels: labels }
  }, [data, year])

  const level = (amount: number): number => {
    if (amount <= 0) return 0
    if (amount <= thresholds[0]) return 1
    if (amount <= thresholds[1]) return 2
    if (amount <= thresholds[2]) return 3
    if (amount <= thresholds[3]) return 4
    return 5
  }

  const SHADES = [
    'bg-raised',
    'bg-brand/20',
    'bg-brand/40',
    'bg-brand/60',
    'bg-brand/80',
    'bg-brand',
  ]

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[680px]">
          <div className="mb-1 flex gap-[3px] pl-7 text-2xs text-faint">
            {weeks.map((_, i) => {
              const label = monthLabels.find((m) => m.col === i)
              return (
                <span key={i} className="w-[11px] shrink-0">
                  {label ? <span className="relative -left-0.5">{label.label}</span> : ''}
                </span>
              )
            })}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex w-6 shrink-0 flex-col gap-[3px] text-2xs text-faint">
              {['', 'Tue', '', 'Thu', '', 'Sat', ''].map((label, i) => (
                <span key={i} className="h-[11px] leading-[11px]">{label}</span>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <Tooltip
                    key={day.date}
                    content={
                      day.inYear
                        ? `${formatDate(day.date)} · ${day.count ? `${formatMoney(day.amount)} over ${day.count} txn${day.count > 1 ? 's' : ''}` : 'no spending'}`
                        : ''
                    }
                  >
                    <span
                      className={cn(
                        'h-[11px] w-[11px] rounded-[2px] transition-transform hover:scale-125',
                        day.inYear ? SHADES[level(day.amount)] : 'bg-transparent',
                      )}
                    />
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 text-2xs text-faint">
        <span>Less</span>
        {SHADES.map((shade, i) => (
          <span key={i} className={cn('h-[11px] w-[11px] rounded-[2px]', shade)} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
