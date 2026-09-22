import { useMemo } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line,
  Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type {
  BalancePoint, CategoryRow, DailyPoint, ForecastPoint, MonthPoint, WeekdayPoint,
} from '../lib/types'
import {
  categoryColor, cn, formatCompact, formatDate, formatMoney, formatMonth,
} from '../lib/utils'

/*
 * Charts read their colours from the same CSS variables as the rest of the
 * app, so they re-theme with everything else. Recharts needs concrete values
 * rather than `var(...)` in some props, so `cssVar` resolves them at render.
 */
function cssVar(name: string, alpha = 1): string {
  if (typeof window === 'undefined') return '#64748b'
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw ? `rgb(${raw.split(/\s+/).join(' ')} / ${alpha})` : '#64748b'
}

const AXIS_PROPS = {
  axisLine: false,
  tickLine: false,
  tick: { fill: 'rgb(var(--c-text-muted))', fontSize: 11 },
} as const

const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'rgb(var(--c-text-faint) / 0.18)',
  vertical: false,
} as const

/** One tooltip for every chart, so the reading experience never shifts. */
function ChartTooltip({
  active, payload, label, labelFormatter, valueFormatter, hideZero = false,
}: {
  active?: boolean
  payload?: { name?: string; dataKey?: string; value?: number; color?: string; payload?: unknown }[]
  label?: string | number
  labelFormatter?: (label: string) => string
  valueFormatter?: (value: number) => string
  hideZero?: boolean
}) {
  if (!active || !payload?.length) return null
  const rows = hideZero ? payload.filter((p) => Math.abs(Number(p.value ?? 0)) > 0.005) : payload
  if (!rows.length) return null

  return (
    <div className="rounded-xl border border-hairline bg-overlay px-3 py-2 shadow-lg">
      {label !== undefined && (
        <p className="mb-1.5 text-xs font-semibold text-strong">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </p>
      )}
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
            <span className="flex-1 capitalize text-muted">{row.name ?? row.dataKey}</span>
            <span className="tnum font-semibold text-strong">
              {valueFormatter ? valueFormatter(Number(row.value)) : formatMoney(Number(row.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- Cashflow */

export function CashflowChart({
  data, height = 280, showSavings = false,
}: {
  data: MonthPoint[]
  height?: number
  showSavings?: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--c-positive')} stopOpacity={0.28} />
            <stop offset="100%" stopColor={cssVar('--c-positive')} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--c-negative')} stopOpacity={0.24} />
            <stop offset="100%" stopColor={cssVar('--c-negative')} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...AXIS_PROPS} minTickGap={16} />
        <YAxis tickFormatter={formatCompact} width={58} {...AXIS_PROPS} />
        <Tooltip
          content={<ChartTooltip labelFormatter={formatMonth} />}
          cursor={{ stroke: 'rgb(var(--c-text-faint) / 0.3)', strokeWidth: 1 }}
        />
        <Area
          type="monotone" dataKey="income" name="Income" stroke={cssVar('--c-positive')}
          strokeWidth={2.5} fill="url(#gradIncome)" dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--c-surface))' }}
        />
        <Area
          type="monotone" dataKey="spend" name="Spending" stroke={cssVar('--c-negative')}
          strokeWidth={2.5} fill="url(#gradSpend)" dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--c-surface))' }}
        />
        {showSavings && (
          <Line
            type="monotone" dataKey="savings" name="Saved" stroke={cssVar('--c-info')}
            strokeWidth={2} strokeDasharray="4 3" dot={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------ Daily detail */

export function DailyFlowChart({ data, height = 260 }: { data: DailyPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => formatDate(v, 'short')}
          {...AXIS_PROPS}
          minTickGap={24}
        />
        <YAxis tickFormatter={formatCompact} width={58} {...AXIS_PROPS} />
        <Tooltip
          content={<ChartTooltip labelFormatter={(v) => formatDate(v)} hideZero />}
          cursor={{ fill: 'rgb(var(--c-text-faint) / 0.08)' }}
        />
        <Bar dataKey="expenses" name="Spent" fill={cssVar('--c-negative', 0.75)} radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="income" name="Received" fill={cssVar('--c-positive', 0.8)} radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Line
          type="monotone" dataKey="net" name="Running net" stroke={cssVar('--c-info')}
          strokeWidth={2} dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* -------------------------------------------------------------- Categories */

export function CategoryDonut({
  data, height = 240, limit = 7,
}: {
  data: CategoryRow[]
  height?: number
  limit?: number
}) {
  const chartData = useMemo(() => {
    const top = data.slice(0, limit)
    const rest = data.slice(limit)
    if (!rest.length) return top
    return [...top, {
      category: 'Other',
      amount: rest.reduce((s, c) => s + c.amount, 0),
      count: rest.reduce((s, c) => s + c.count, 0),
      percent: rest.reduce((s, c) => s + c.percent, 0),
    }]
  }, [data, limit])

  const total = chartData.reduce((s, c) => s + c.amount, 0)

  if (!chartData.length) {
    return <p className="py-12 text-center text-sm text-muted">No spending to break down yet.</p>
  }

  return (
    <div className="flex flex-col items-center gap-5 lg:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="category"
              innerRadius="64%"
              outerRadius="92%"
              paddingAngle={2}
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
            >
              {chartData.map((entry) => (
                <Cell key={entry.category} fill={categoryColor(entry.category)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* The centre is the most valuable pixel on a donut — put the total in it. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xs uppercase tracking-wider text-faint">Total</span>
          <span className="font-display text-lg font-bold text-strong">
            {formatCompact(total)}
          </span>
        </div>
      </div>
      <ul className="grid w-full flex-1 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-1">
        {chartData.map((c) => (
          <li key={c.category} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor(c.category) }}
              />
              <span className="truncate text-body">{c.category}</span>
            </span>
            <span className="tnum shrink-0 text-xs font-semibold text-muted">
              {c.percent.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CategoryBars({
  categories, limit = 10, showChange = false,
}: {
  categories: CategoryRow[]
  limit?: number
  showChange?: boolean
}) {
  const max = categories[0]?.amount ?? 1
  if (!categories.length) {
    return <p className="py-8 text-center text-sm text-muted">Nothing to show for this period.</p>
  }
  return (
    <ul className="space-y-3.5">
      {categories.slice(0, limit).map((c) => (
        <li key={c.category}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-body">{c.category}</span>
              <span className="shrink-0 text-2xs text-faint">{c.count}×</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              {showChange && c.change_pct != null && Math.abs(c.change_pct) >= 1 && (
                <span className={cn('tnum text-2xs font-semibold',
                  c.change_pct > 0 ? 'text-negative' : 'text-positive')}>
                  {c.change_pct > 0 ? '+' : ''}{c.change_pct.toFixed(0)}%
                </span>
              )}
              <span className="tnum font-semibold text-strong">{formatMoney(c.amount)}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full transition-all duration-700 ease-spring"
              style={{
                width: `${Math.max((c.amount / max) * 100, 1.5)}%`,
                backgroundColor: categoryColor(c.category),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ----------------------------------------------------------------- Savings */

export function SavingsBars({ data, height = 240 }: { data: MonthPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...AXIS_PROPS} minTickGap={12} />
        <YAxis tickFormatter={formatCompact} width={58} {...AXIS_PROPS} />
        <Tooltip
          content={<ChartTooltip labelFormatter={formatMonth} />}
          cursor={{ fill: 'rgb(var(--c-text-faint) / 0.08)' }}
        />
        <ReferenceLine y={0} stroke="rgb(var(--c-text-faint) / 0.4)" />
        <Bar dataKey="savings" name="Saved" radius={[5, 5, 0, 0]} maxBarSize={44}>
          {data.map((m) => (
            <Cell
              key={m.month}
              fill={m.savings >= 0 ? cssVar('--c-positive', 0.85) : cssVar('--c-negative', 0.85)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ----------------------------------------------------------------- Balance */

export function BalanceChart({
  data, height = 220,
}: {
  data: BalancePoint[]
  height?: number
}) {
  if (data.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        Balance history appears once your statement includes a running balance column.
      </p>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--c-info')} stopOpacity={0.3} />
            <stop offset="100%" stopColor={cssVar('--c-info')} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => formatDate(v, 'short')}
          {...AXIS_PROPS}
          minTickGap={40}
        />
        <YAxis tickFormatter={formatCompact} width={58} {...AXIS_PROPS} domain={['auto', 'auto']} />
        <Tooltip content={<ChartTooltip labelFormatter={(v) => formatDate(v)} />} />
        <Area
          type="monotone" dataKey="balance" name="Balance" stroke={cssVar('--c-info')}
          strokeWidth={2.5} fill="url(#gradBalance)" dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ---------------------------------------------------------------- Forecast */

export function ForecastChart({
  points, opening, height = 300,
}: {
  points: ForecastPoint[]
  opening: number
  height?: number
}) {
  const lowest = points.reduce((min, p) => Math.min(min, p.balance), opening)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gradForecast" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--c-brand')} stopOpacity={0.28} />
            <stop offset="100%" stopColor={cssVar('--c-brand')} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => formatDate(v, 'short')}
          {...AXIS_PROPS}
          minTickGap={40}
        />
        <YAxis tickFormatter={formatCompact} width={58} {...AXIS_PROPS} domain={['auto', 'auto']} />
        <Tooltip content={<ChartTooltip labelFormatter={(v) => formatDate(v)} />} />
        {/* Today's balance, so the projection is read as a departure from it. */}
        <ReferenceLine
          y={opening}
          stroke="rgb(var(--c-text-faint) / 0.5)"
          strokeDasharray="4 4"
          label={{ value: 'today', position: 'insideTopLeft', fill: 'rgb(var(--c-text-muted))', fontSize: 10 }}
        />
        {lowest < 0 && <ReferenceLine y={0} stroke={cssVar('--c-negative')} strokeWidth={1.5} />}
        <Area
          type="monotone" dataKey="balance" name="Projected balance"
          stroke={cssVar('--c-brand')} strokeWidth={2.5} fill="url(#gradForecast)" dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------- Health ring */

export function HealthGauge({
  score, grade, size = 200,
}: {
  score: number
  grade: string
  size?: number
}) {
  // The score maps to a semantic colour, not a fixed brand colour — a 42
  // rendered in confident green would be a lie.
  const tone = score >= 80 ? '--c-positive' : score >= 55 ? '--c-warning' : '--c-negative'
  const color = cssVar(tone)
  const data = [{ name: 'score', value: score, fill: color }]

  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 0.62 }}>
      <ResponsiveContainer width="100%" height={size}>
        <RadialBarChart
          data={data}
          startAngle={200}
          endAngle={-20}
          innerRadius="76%"
          outerRadius="100%"
          barSize={14}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            background={{ fill: 'rgb(var(--c-text-faint) / 0.18)' }}
            dataKey="value"
            cornerRadius={8}
            isAnimationActive
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="font-display text-4xl font-bold leading-none text-strong">{score}</div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          Grade {grade}
        </div>
      </div>
    </div>
  )
}

export function ScoreTrend({ data, height = 60 }: { data: { month: string; score: number }[]; height?: number }) {
  if (data.length < 2) return null
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradScore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cssVar('--c-brand')} stopOpacity={0.3} />
            <stop offset="100%" stopColor={cssVar('--c-brand')} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          content={<ChartTooltip labelFormatter={formatMonth} valueFormatter={(v) => `${v}/100`} />}
        />
        <XAxis dataKey="month" hide />
        <YAxis hide domain={[0, 100]} />
        <Area
          type="monotone" dataKey="score" name="Score" stroke={cssVar('--c-brand')}
          strokeWidth={2} fill="url(#gradScore)" dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ---------------------------------------------------------------- Sparkline */

export function Sparkline({
  data, dataKey = 'value', tone = 'brand', height = 40,
}: {
  data: Record<string, number | string>[]
  dataKey?: string
  tone?: 'brand' | 'positive' | 'negative' | 'info'
  height?: number
}) {
  const color = cssVar(`--c-${tone === 'brand' ? 'brand' : tone}`)
  const id = `spark-${dataKey}-${tone}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.75}
          fill={`url(#${id})`} dot={false} isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------ Weekday mix */

export function WeekdayChart({ data, height = 200 }: { data: WeekdayPoint[]; height?: number }) {
  const peak = Math.max(...data.map((d) => d.average), 0)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="weekday" {...AXIS_PROPS} />
        <YAxis tickFormatter={formatCompact} width={54} {...AXIS_PROPS} />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: 'rgb(var(--c-text-faint) / 0.08)' }}
        />
        <Bar dataKey="average" name="Avg / active day" radius={[5, 5, 0, 0]} maxBarSize={42}>
          {data.map((d) => (
            <Cell
              key={d.weekday}
              // Highlight the peak day; the rest recede so the point lands instantly.
              fill={d.average === peak ? cssVar('--c-brand') : cssVar('--c-info', 0.4)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
