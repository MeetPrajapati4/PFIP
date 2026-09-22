import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, BarChart3, CalendarDays, Info, Repeat, TrendingDown, TrendingUp,
} from 'lucide-react'
import { analyticsApi } from '../lib/api'
import type { HealthComponent } from '../lib/types'
import { cn, formatCompact, formatMoney, formatMonth, formatMonthLong } from '../lib/utils'
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, Progress, SegmentedControl,
  SkeletonRows, Tooltip,
} from '../components/ui'
import {
  BalanceChart, CashflowChart, CategoryBars, CategoryDonut, DailyFlowChart,
  HealthGauge, SavingsBars, ScoreTrend, WeekdayChart,
} from '../components/charts'
import SpendingCalendar from '../components/SpendingCalendar'
import TxnRow from '../components/TxnRow'

type Mode = 'monthly' | 'yearly'

export default function Analytics() {
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>(
    params.get('year') && !params.get('month') ? 'yearly' : 'monthly'
  )

  const { data: overview, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: analyticsApi.overview,
  })

  const month = params.get('month') ?? overview?.available_months[0]
  const year = Number(params.get('year')) || overview?.available_years[0]

  const setPeriod = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => next.set(k, String(v)))
    setParams(next, { replace: true })
  }

  if (isLoading) return <SkeletonRows rows={6} />
  if (!overview || overview.empty) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nothing to analyse yet"
        body="Import a bank statement and this page fills with your trends, patterns and health breakdown."
        action={<Link to="/import" className="btn-primary">Import a statement</Link>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        subtitle="Monthly and annual deep-dives into where the money actually goes"
        actions={
          <>
            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
            />
            {mode === 'monthly' ? (
              <select
                className="select max-w-[160px]"
                value={month}
                onChange={(e) => setPeriod({ month: e.target.value })}
                aria-label="Select month"
              >
                {overview.available_months.map((m) => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            ) : (
              <select
                className="select max-w-[110px]"
                value={year}
                onChange={(e) => setPeriod({ year: e.target.value })}
                aria-label="Select year"
              >
                {overview.available_years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </>
        }
      />

      {mode === 'monthly' && month && <MonthlyView month={month} />}
      {mode === 'yearly' && year && <YearlyView year={year} />}
    </div>
  )
}

function DeltaChip({ value, invert = false }: { value: number | null | undefined; invert?: boolean }) {
  if (value == null || !isFinite(value)) return null
  const flat = Math.abs(value) < 0.5
  const good = invert ? value < 0 : value > 0
  return (
    <span className={cn(
      'chip',
      flat ? 'border-hairline bg-raised text-muted'
        : good ? 'border-positive/25 bg-positive/10 text-positive'
          : 'border-negative/25 bg-negative/10 text-negative',
    )}>
      {!flat && (value > 0
        ? <TrendingUp className="h-3 w-3" />
        : <TrendingDown className="h-3 w-3" />)}
      {flat ? 'flat' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
    </span>
  )
}

function SummaryStrip({
  income, spend, savings, savingsRate, invested, incomeDelta, spendDelta,
}: {
  income: number
  spend: number
  savings: number
  savingsRate: number
  invested: number
  incomeDelta?: number | null
  spendDelta?: number | null
}) {
  const tiles = [
    { label: 'Income', value: formatMoney(income), chip: <DeltaChip value={incomeDelta} /> },
    { label: 'Spending', value: formatMoney(spend), chip: <DeltaChip value={spendDelta} invert /> },
    { label: 'Saved', value: formatMoney(savings), sub: invested > 0 ? `${formatCompact(invested)} invested` : undefined },
    { label: 'Savings rate', value: `${savingsRate}%`, sub: savingsRate >= 20 ? 'Above benchmark' : 'Below the 20% benchmark' },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile, i) => (
        <Card key={tile.label} delay={i * 0.04} className="!p-5">
          <p className="text-sm text-muted">{tile.label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="tnum font-display text-2xl font-bold text-strong">{tile.value}</p>
            {tile.chip}
          </div>
          {tile.sub && <p className="mt-1 text-xs text-muted">{tile.sub}</p>}
        </Card>
      ))}
    </div>
  )
}

function MonthlyView({ month }: { month: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['monthly', month],
    queryFn: () => analyticsApi.monthly(month),
  })
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: analyticsApi.health })

  if (isLoading || !data) return <SkeletonRows rows={5} />

  const incomeDelta = data.previous.income
    ? ((data.summary.income - data.previous.income) / data.previous.income) * 100
    : null
  const spendDelta = data.previous.spend
    ? ((data.summary.spend - data.previous.spend) / data.previous.spend) * 100
    : null

  const busiest = [...data.weekday_pattern].sort((a, b) => b.average - a.average)[0]

  return (
    <div className="space-y-5">
      <SummaryStrip
        income={data.summary.income}
        spend={data.summary.spend}
        savings={data.summary.savings}
        savingsRate={data.summary.savings_rate}
        invested={data.summary.invested}
        incomeDelta={incomeDelta}
        spendDelta={spendDelta}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" delay={0.08}>
          <CardHeader
            title={`Daily activity — ${formatMonthLong(month)}`}
            subtitle="Bars are individual days; the line is the running net for the month"
          />
          {data.daily.length ? (
            <DailyFlowChart data={data.daily} />
          ) : (
            <p className="py-12 text-center text-sm text-muted">No activity this month.</p>
          )}
        </Card>

        <Card delay={0.12}>
          <CardHeader title="Financial health" />
          {health?.score != null ? (
            <>
              <HealthGauge score={health.score} grade={health.grade ?? '—'} />
              {health.history.length > 1 && <ScoreTrend data={health.history} />}
              <ul className="mt-4 space-y-3 border-t border-hairline pt-4">
                {health.components.map((c) => <ComponentRow key={c.key} component={c} />)}
              </ul>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted">{health?.message ?? 'Computing…'}</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card delay={0.16}>
          <CardHeader
            title="Category breakdown"
            subtitle={`Compared with ${formatMonth(data.previous.month)}`}
          />
          <CategoryBars categories={data.categories} showChange limit={12} />
        </Card>

        <div className="space-y-4">
          <Card delay={0.2}>
            <CardHeader
              title="When you spend"
              icon={CalendarDays}
              subtitle={busiest && busiest.average > 0
                ? `${busiest.weekday} is your heaviest day — ${formatMoney(busiest.average)} on average`
                : undefined}
            />
            <WeekdayChart data={data.weekday_pattern} />
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card delay={0.24} className="!p-5">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Repeat className="h-3.5 w-3.5" /> Recurring this month
              </p>
              <p className="tnum mt-1.5 font-display text-2xl font-bold text-strong">
                {formatMoney(data.recurring_total)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {data.summary.spend > 0
                  ? `${((data.recurring_total / data.summary.spend) * 100).toFixed(0)}% of spending`
                  : '—'}
              </p>
            </Card>
            <Card delay={0.28} className="!p-5">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <AlertTriangle className="h-3.5 w-3.5" /> Flagged
              </p>
              <p className={cn('tnum mt-1.5 font-display text-2xl font-bold',
                data.anomalies.length > 0 ? 'text-warning' : 'text-strong')}>
                {data.anomalies.length}
              </p>
              <p className="mt-1 text-xs text-muted">
                {data.anomalies.length > 0 ? 'Unusually large for their category' : 'Nothing unusual'}
              </p>
            </Card>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card delay={0.3}>
          <CardHeader title="Category mix" />
          <CategoryDonut data={data.categories} height={200} />
        </Card>
        <Card delay={0.34}>
          <CardHeader title="Largest expenses" />
          <div className="-mx-2">
            {data.largest_expenses.map((t) => <TxnRow key={t.id} txn={t} showDate />)}
          </div>
        </Card>
        <Card delay={0.38}>
          <CardHeader title="Money in" />
          <div className="-mx-2">
            {data.largest_income.length
              ? data.largest_income.map((t) => <TxnRow key={t.id} txn={t} showDate />)
              : <p className="py-8 text-center text-sm text-muted">No income recorded this month.</p>}
          </div>
        </Card>
      </div>

      {data.merchants.length > 0 && (
        <Card delay={0.42}>
          <CardHeader title="Top merchants this month" />
          <CategoryBars
            categories={data.merchants.map((m) => ({
              category: m.merchant,
              amount: m.amount,
              count: m.count,
              percent: data.summary.spend ? (m.amount / data.summary.spend) * 100 : 0,
            }))}
            limit={10}
          />
        </Card>
      )}
    </div>
  )
}

function ComponentRow({ component }: { component: HealthComponent }) {
  if (!component.applies) {
    return (
      <li className="text-sm opacity-60">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted">
            {component.label}
            <Tooltip content={component.advice}>
              <Info className="h-3 w-3 cursor-help" />
            </Tooltip>
          </span>
          <Badge tone="neutral">n/a</Badge>
        </div>
        <p className="mt-0.5 text-2xs text-faint">{component.detail}</p>
      </li>
    )
  }
  const score = component.score ?? 0
  return (
    <li className="text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Tooltip content={component.advice}>
          <span className="cursor-help text-muted">{component.label}</span>
        </Tooltip>
        <span className="flex items-center gap-2">
          <span className="text-2xs text-faint">{(component.weight * 100).toFixed(0)}%</span>
          <span className="tnum font-semibold text-strong">{score}</span>
        </span>
      </div>
      <Progress
        value={score}
        height="sm"
        tone={score >= 70 ? 'positive' : score >= 45 ? 'warning' : 'negative'}
      />
      <p className="mt-1 text-2xs text-faint">{component.detail}</p>
    </li>
  )
}

function YearlyView({ year }: { year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['yearly', year],
    queryFn: () => analyticsApi.yearly(year),
  })
  const { data: calendar } = useQuery({
    queryKey: ['calendar', year],
    queryFn: () => analyticsApi.calendar(year),
  })

  if (isLoading || !data) return <SkeletonRows rows={5} />

  return (
    <div className="space-y-5">
      <SummaryStrip
        income={data.summary.income}
        spend={data.summary.spend}
        savings={data.summary.savings}
        savingsRate={data.summary.savings_rate}
        invested={data.summary.invested}
        incomeDelta={data.yoy?.income_growth_pct}
        spendDelta={data.yoy?.expense_growth_pct}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card delay={0.08}>
          <CardHeader title={`Income vs spending — ${year}`} />
          <CashflowChart data={data.months} showSavings />
        </Card>
        <Card delay={0.12}>
          <CardHeader
            title={`Monthly savings — ${year}`}
            subtitle={data.best_month && data.worst_month
              ? `Best: ${formatMonth(data.best_month.month)} (${formatCompact(data.best_month.savings)}) · Worst: ${formatMonth(data.worst_month.month)} (${formatCompact(data.worst_month.savings)})`
              : undefined}
          />
          <SavingsBars data={data.months} />
        </Card>
      </div>

      {calendar && calendar.length > 0 && (
        <Card delay={0.16}>
          <CardHeader
            title="Spending calendar"
            icon={CalendarDays}
            subtitle="Every day of the year, shaded by how much left your account"
          />
          <SpendingCalendar data={calendar} year={year} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card delay={0.2}>
          <CardHeader title={`Category spending — ${year}`} />
          <CategoryDonut data={data.categories} height={220} limit={8} />
        </Card>
        <Card delay={0.24}>
          <CardHeader title={`Top merchants — ${year}`} />
          <CategoryBars
            categories={data.merchants.map((m) => ({
              category: m.merchant,
              amount: m.amount,
              count: m.count,
              percent: data.summary.spend ? (m.amount / data.summary.spend) * 100 : 0,
            }))}
            limit={12}
          />
        </Card>
      </div>

      {data.balance_series.length > 1 && (
        <Card delay={0.28}>
          <CardHeader title={`Balance through ${year}`} />
          <BalanceChart data={data.balance_series} height={260} />
        </Card>
      )}
    </div>
  )
}
