import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2,
  ShieldCheck, TrendingUp, Wallet,
} from 'lucide-react'
import { analyticsApi } from '../lib/api'
import { categoryColor, cn, formatDate, formatMoney } from '../lib/utils'
import {
  Card, CardHeader, EmptyState, Field, PageHeader, SegmentedControl, SkeletonRows,
} from '../components/ui'
import { ForecastChart } from '../components/charts'

const HORIZONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '6 months' },
]

export default function Forecast() {
  const [horizon, setHorizon] = useState('90')
  const [buffer, setBuffer] = useState('')

  const bufferValue = Number(buffer) || 0
  const { data, isLoading } = useQuery({
    queryKey: ['forecast', horizon, bufferValue],
    queryFn: () => analyticsApi.forecast(Number(horizon), bufferValue),
  })

  if (isLoading) return <SkeletonRows rows={6} />

  if (!data || data.empty || !data.summary) {
    return (
      <div className="space-y-5">
        <PageHeader title="Forecast" />
        <EmptyState
          icon={TrendingUp}
          title="Not enough history to project"
          body="The forecast needs a few months of transactions with running balances to model your scheduled payments and spending rate."
          action={<Link to="/import" className="btn-primary">Import a statement</Link>}
        />
      </div>
    )
  }

  const s = data.summary
  const risky = s.will_dip_negative || (bufferValue > 0 && s.low_point.balance < bufferValue)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cash-flow forecast"
        subtitle={`Projected from ${formatDate(data.as_of)} using your recurring payments and spending rate`}
        actions={
          <SegmentedControl
            value={horizon}
            onChange={setHorizon}
            options={HORIZONS}
          />
        }
      />

      {/* The headline: what can be committed today without breaking the month. */}
      <Card className={cn('!p-6', risky && 'border-warning/40')}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-muted">
              <ShieldCheck className="h-4 w-4 text-brand" />
              Safe to spend over the next {horizon} days
            </p>
            <p className={cn('tnum mt-2 font-display text-4xl font-bold',
              risky ? 'text-warning' : 'text-strong')}>
              {formatMoney(s.safe_to_spend)}
            </p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Starting from {formatMoney(data.opening_balance)}, after{' '}
              <span className="font-semibold text-strong">{formatMoney(s.scheduled_out)}</span> of
              known payments,{' '}
              <span className="font-semibold text-strong">{formatMoney(s.scheduled_in)}</span> of
              expected income, and about{' '}
              <span className="font-semibold text-strong">{formatMoney(s.daily_variable)}/day</span>{' '}
              of everyday spending.
            </p>
          </div>

          <div className="w-full max-w-[220px] shrink-0">
            <Field
              label="Keep a buffer"
              hint="Money you never want the projection to touch."
            >
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                placeholder="50000"
                className="input tnum"
              />
            </Field>
          </div>
        </div>

        {risky && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-warning/30
            bg-warning/[0.07] p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm leading-relaxed text-body">
              {s.will_dip_negative
                ? <>Your balance is projected to go <span className="font-semibold text-negative">
                    negative</span> around {formatDate(s.low_point.date)}.</>
                : <>Your balance dips to {formatMoney(s.low_point.balance)} on{' '}
                    {formatDate(s.low_point.date)}, below the buffer you set.</>}
              {' '}Moving one large discretionary purchase past that date is usually enough to clear it.
            </p>
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Projected balance',
            value: formatMoney(s.projected_balance),
            sub: `${s.projected_change >= 0 ? '+' : ''}${formatMoney(s.projected_change)} from today`,
            icon: Wallet,
            tone: s.projected_change >= 0 ? 'text-positive' : 'text-negative',
          },
          {
            label: 'Lowest point',
            value: formatMoney(s.low_point.balance),
            sub: formatDate(s.low_point.date),
            icon: ArrowDownRight,
            tone: s.low_point.balance < 0 ? 'text-negative' : 'text-strong',
          },
          {
            label: 'Scheduled out',
            value: formatMoney(s.scheduled_out),
            sub: `plus ${formatMoney(s.variable_total)} variable`,
            icon: CalendarClock,
            tone: 'text-strong',
          },
          {
            label: 'Runway',
            value: s.days_of_runway != null ? `${s.days_of_runway} days` : '—',
            sub: 'If all income stopped today',
            icon: TrendingUp,
            tone: (s.days_of_runway ?? 0) > 90 ? 'text-positive' : 'text-warning',
          },
        ].map((tile, i) => (
          <Card key={tile.label} delay={i * 0.05} className="!p-5">
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <tile.icon className="h-3.5 w-3.5" /> {tile.label}
            </p>
            <p className={cn('tnum mt-1.5 font-display text-2xl font-bold', tile.tone)}>
              {tile.value}
            </p>
            <p className="mt-1 text-xs text-muted">{tile.sub}</p>
          </Card>
        ))}
      </div>

      <Card delay={0.2}>
        <CardHeader
          title="Projected balance"
          subtitle="Scheduled payments applied on their due dates, plus your median daily spend"
        />
        <ForecastChart points={data.points} opening={data.opening_balance} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card delay={0.24}>
          <CardHeader
            title="What's scheduled"
            subtitle="Predicted from each payee's observed cadence — not a bank feed"
          />
          {data.scheduled.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No recurring payments detected yet.
            </p>
          ) : (
            <ul className="max-h-[420px] space-y-1 overflow-y-auto">
              {data.scheduled.map((item, i) => (
                <li
                  key={`${item.label}-${item.date}-${i}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-raised"
                >
                  <span className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    item.amount > 0 ? 'bg-positive/10' : 'bg-negative/10',
                  )}>
                    {item.amount > 0
                      ? <ArrowUpRight className="h-4 w-4 text-positive" />
                      : <ArrowDownRight className="h-4 w-4 text-negative" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-strong">
                      {item.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-2xs text-muted">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: categoryColor(item.category) }}
                      />
                      {item.category} · {formatDate(item.date, 'short')}
                    </span>
                  </span>
                  <span className={cn('tnum shrink-0 text-sm font-semibold',
                    item.amount > 0 ? 'text-positive' : 'text-strong')}>
                    {item.amount > 0 ? '+' : ''}{formatMoney(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card delay={0.28}>
          <CardHeader title="How this is calculated" />
          <ol className="space-y-4">
            {[
              {
                title: 'Scheduled payments',
                body: `Every recurring payee is projected onto its next due dates from its own observed rhythm — monthly, fortnightly, quarterly. Over ${horizon} days that's ${formatMoney(s.scheduled_out)} out and ${formatMoney(s.scheduled_in)} in.`,
              },
              {
                title: 'Everyday spending',
                body: `The median of your daily non-recurring spend over the last 90 days — ${formatMoney(s.daily_variable)}/day. A median rather than an average, so one laptop purchase doesn't distort the whole projection.`,
              },
              {
                title: 'The low point',
                body: `Balance is walked forward day by day; the worst day is what matters, because that's when a payment would actually bounce. Yours is ${formatMoney(s.low_point.balance)} on ${formatDate(s.low_point.date)}.`,
              },
              {
                title: 'Safe to spend',
                body: 'The slack between that low point and any buffer you set. It never goes negative — a shortfall is a different message, not a negative allowance.',
              },
            ].map((step, i) => (
              <li key={step.title} className="flex gap-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                  bg-brand/10 text-2xs font-bold text-brand">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-strong">{step.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 flex items-start gap-2 rounded-xl border border-hairline bg-raised p-3 text-xs leading-relaxed text-muted">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            This is a projection from your own history, not a guarantee. A one-off purchase or a
            missed invoice moves it — re-check after your next import.
          </p>
        </Card>
      </div>
    </div>
  )
}
