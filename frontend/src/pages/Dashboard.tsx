import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Banknote, Gauge, Import, Lightbulb,
  PiggyBank, Receipt, Sparkles, Target, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react'
import {
  analyticsApi, budgetApi, goalApi, insightApi,
} from '../lib/api'
import { cn, formatCompact, formatMoney, formatMonth, formatRelative } from '../lib/utils'
import {
  Badge, Button, Card, CardHeader, EmptyState, PageHeader, Progress, Skeleton, Tooltip,
} from '../components/ui'
import StatCard from '../components/StatCard'
import TxnRow from '../components/TxnRow'
import { BalanceChart, CashflowChart, CategoryDonut, HealthGauge, ScoreTrend } from '../components/charts'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: overview, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: analyticsApi.overview,
  })

  const hasData = Boolean(overview && !overview.empty)

  // One batch so the dashboard settles in a single paint rather than popping
  // in card by card.
  const [health, insights, budgets, goals, forecast] = useQueries({
    queries: [
      { queryKey: ['health'], queryFn: analyticsApi.health, enabled: hasData },
      { queryKey: ['insights'], queryFn: insightApi.list, enabled: hasData },
      { queryKey: ['budgets'], queryFn: () => budgetApi.report(), enabled: hasData },
      { queryKey: ['goals'], queryFn: goalApi.list, enabled: hasData },
      { queryKey: ['forecast', 60], queryFn: () => analyticsApi.forecast(60), enabled: hasData },
    ],
  })

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 5) return 'Still up'
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  if (isLoading) return <DashboardSkeleton />

  if (!overview || overview.empty) {
    return <FirstRun name={user?.name?.split(' ')[0]} />
  }

  const s = overview.summary
  const months = overview.months
  const topInsights = (insights.data ?? []).slice(0, 3)
  const warnings = (insights.data ?? []).filter((i) => i.severity === 'warning').length
  const budgetReport = budgets.data
  const goalReport = goals.data
  const fc = forecast.data

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={
          overview.period
            ? `${s.transaction_count.toLocaleString()} transactions · ${formatMonth(overview.period.start)} — ${formatMonth(overview.period.end)}`
            : undefined
        }
        actions={
          <>
            <Button icon={Import} onClick={() => navigate('/import')}>Import</Button>
            <Button variant="primary" icon={Sparkles} onClick={() => navigate('/assistant')}>
              Ask AI
            </Button>
          </>
        }
      />

      {/* Anything urgent gets said before anything else. */}
      {warnings > 0 && (
        <Link
          to="/insights"
          className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/[0.07]
            px-4 py-3 transition-colors hover:bg-warning/[0.12]"
        >
          <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-warning" />
          <span className="flex-1 text-sm text-body">
            <span className="font-semibold text-strong">
              {warnings} thing{warnings === 1 ? '' : 's'} need your attention
            </span>
            {' — '}
            {(insights.data ?? []).find((i) => i.severity === 'warning')?.title}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-warning" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Income"
          value={formatMoney(s.income)}
          icon={Banknote}
          tone="positive"
          change={overview.mom?.income_change}
          spark={months.map((m) => ({ name: m.month, value: m.income }))}
          sparkTone="positive"
          delay={0}
        />
        <StatCard
          label="Spending"
          value={formatMoney(s.spend)}
          icon={Wallet}
          tone="negative"
          change={overview.mom?.expense_change}
          invertChange
          hint="Excludes investments and transfers between your own accounts."
          spark={months.map((m) => ({ name: m.month, value: m.spend }))}
          sparkTone="negative"
          delay={0.05}
        />
        <StatCard
          label="Saved"
          value={formatMoney(s.savings)}
          icon={PiggyBank}
          tone="info"
          change={overview.mom?.savings_change}
          footer={s.invested > 0 ? `${formatCompact(s.invested)} of it invested` : undefined}
          delay={0.1}
        />
        <StatCard
          label="Savings rate"
          value={`${s.savings_rate}%`}
          icon={Gauge}
          tone={s.savings_rate >= 20 ? 'positive' : s.savings_rate >= 10 ? 'warning' : 'negative'}
          footer={
            s.savings_rate >= 20
              ? 'Above the 20% benchmark'
              : `${(20 - s.savings_rate).toFixed(0)} points below the 20% benchmark`
          }
          delay={0.15}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" delay={0.1}>
          <CardHeader
            title="Cash flow"
            subtitle="Income against spending, month by month"
            action={
              <Link to="/analytics" className="text-xs font-semibold text-brand hover:underline">
                Analytics →
              </Link>
            }
          />
          <CashflowChart data={months} showSavings />
        </Card>

        <Card delay={0.15}>
          <CardHeader title="Financial health" />
          {health.data?.score != null ? (
            <>
              <HealthGauge score={health.data.score} grade={health.data.grade ?? '—'} />
              {health.data.history.length > 1 && (
                <div className="mt-2">
                  <ScoreTrend data={health.data.history} />
                  <p className="mt-1 text-center text-2xs text-faint">
                    Trend over {health.data.history.length} months
                  </p>
                </div>
              )}
              <ul className="mt-4 space-y-2 border-t border-hairline pt-4">
                {health.data.components
                  .filter((c) => c.applies)
                  .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
                  .slice(0, 3)
                  .map((c) => (
                    <li key={c.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-muted">{c.label}</span>
                        <span className="tnum font-semibold text-strong">{c.score}</span>
                      </div>
                      <Progress
                        value={c.score ?? 0}
                        height="sm"
                        tone={(c.score ?? 0) >= 70 ? 'positive' : (c.score ?? 0) >= 45 ? 'warning' : 'negative'}
                      />
                    </li>
                  ))}
              </ul>
              <Link
                to="/analytics"
                className="mt-4 flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                Full breakdown <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </Card>
      </div>

      {/* Forward-looking row: what's coming, not what happened. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {fc?.summary && (
          <Card delay={0.18} className="lg:col-span-1">
            <CardHeader
              title="Safe to spend"
              subtitle="Next 60 days, after scheduled payments"
              icon={TrendingUp}
            />
            <p className="tnum font-display text-3xl font-bold text-strong">
              {formatMoney(fc.summary.safe_to_spend)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Balance is projected to bottom out at{' '}
              <span className={cn('font-semibold',
                fc.summary.will_dip_negative ? 'text-negative' : 'text-strong')}>
                {formatMoney(fc.summary.low_point.balance)}
              </span>{' '}
              around {formatMonth(fc.summary.low_point.date)}, spending about{' '}
              {formatMoney(fc.summary.daily_variable)}/day.
            </p>
            <Link
              to="/forecast"
              className="mt-3 flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              Open forecast <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Card>
        )}

        {budgetReport && budgetReport.items.length > 0 ? (
          <Card delay={0.22}>
            <CardHeader
              title="Budgets"
              subtitle={formatMonth(budgetReport.month)}
              action={
                <Link to="/budgets" className="text-xs font-semibold text-brand hover:underline">
                  Manage →
                </Link>
              }
            />
            <div className="mb-3 flex items-baseline justify-between">
              <span className="tnum font-display text-2xl font-bold text-strong">
                {formatCompact(budgetReport.totals.spent)}
              </span>
              <span className="text-xs text-muted">
                of {formatCompact(budgetReport.totals.budgeted)}
              </span>
            </div>
            <Progress
              value={budgetReport.totals.percent}
              tone={budgetReport.totals.percent > 100 ? 'negative'
                : budgetReport.totals.percent > 80 ? 'warning' : 'brand'}
            />
            <ul className="mt-4 space-y-2.5">
              {budgetReport.items.slice(0, 3).map((item) => (
                <li key={item.id} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 truncate text-muted">{item.category}</span>
                  <Progress
                    value={item.percent}
                    height="sm"
                    tone={item.status === 'exceeded' ? 'negative'
                      : item.status === 'projected_over' || item.status === 'warning' ? 'warning' : 'brand'}
                  />
                  <span className="tnum w-10 shrink-0 text-right font-semibold text-strong">
                    {item.percent.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card delay={0.22}>
            <CardHeader title="Budgets" icon={Wallet} />
            <EmptyState
              compact
              icon={Wallet}
              title="No budgets yet"
              body="Set caps on your top categories and PFIP will pace them through the month."
              action={<Link to="/budgets" className="btn-secondary btn-sm mt-3">Set budgets</Link>}
            />
          </Card>
        )}

        {goalReport && goalReport.items.length > 0 ? (
          <Card delay={0.26}>
            <CardHeader
              title="Goals"
              subtitle={`Saving ${formatCompact(goalReport.monthly_savings_rate)}/month`}
              action={
                <Link to="/goals" className="text-xs font-semibold text-brand hover:underline">
                  Manage →
                </Link>
              }
            />
            <ul className="space-y-3.5">
              {goalReport.items.slice(0, 3).map((goal) => (
                <li key={goal.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-strong">{goal.name}</span>
                    <span className="tnum shrink-0 text-muted">
                      {formatCompact(goal.current_amount)} / {formatCompact(goal.target_amount)}
                    </span>
                  </div>
                  <Progress
                    value={goal.percent}
                    height="sm"
                    tone={goal.status === 'achieved' ? 'positive'
                      : goal.on_track === false ? 'warning' : 'brand'}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card delay={0.26}>
            <CardHeader title="Goals" icon={Target} />
            <EmptyState
              compact
              icon={Target}
              title="No goals yet"
              body="Name something you're saving for and PFIP will project when you'll get there."
              action={<Link to="/goals" className="btn-secondary btn-sm mt-3">Add a goal</Link>}
            />
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card delay={0.3}>
          <CardHeader title="Where it goes" subtitle="All time, by category" />
          <CategoryDonut data={overview.categories} height={200} />
        </Card>

        <Card delay={0.34}>
          <CardHeader
            title="Recent activity"
            action={
              <Link to="/transactions" className="text-xs font-semibold text-brand hover:underline">
                View all →
              </Link>
            }
          />
          <div className="-mx-2">
            {overview.recent.slice(0, 7).map((t) => (
              <TxnRow
                key={t.id}
                txn={t}
                onClick={() => navigate(`/transactions?search=${encodeURIComponent(t.merchant || t.description)}`)}
              />
            ))}
          </div>
        </Card>

        <Card delay={0.38}>
          <CardHeader
            title="Smart insights"
            icon={Lightbulb}
            action={
              <Link to="/insights" className="text-xs font-semibold text-brand hover:underline">
                View all →
              </Link>
            }
          />
          {topInsights.length === 0 ? (
            <EmptyState
              compact
              icon={Sparkles}
              title="Nothing flagged"
              body="Generate insights to scan for spikes, duplicates and forgotten subscriptions."
              action={<Link to="/insights" className="btn-secondary btn-sm mt-3">Generate</Link>}
            />
          ) : (
            <ul className="space-y-2.5">
              {topInsights.map((ins) => (
                <li key={ins.id}>
                  <Link
                    to={ins.action_href || '/insights'}
                    className="block rounded-xl border border-hairline bg-raised p-3 transition-colors hover:border-brand/40"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge tone={ins.severity === 'warning' ? 'warning'
                        : ins.severity === 'positive' ? 'positive' : 'info'}>
                        {ins.type}
                      </Badge>
                      {ins.impact > 0 && (
                        <span className="tnum text-2xs font-semibold text-muted">
                          {formatCompact(ins.impact)} at stake
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold leading-snug text-strong">{ins.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{ins.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" delay={0.42}>
          <CardHeader
            title="Account balance"
            subtitle={
              overview.current_balance != null
                ? `Currently ${formatMoney(overview.current_balance)}`
                : 'Running balance from your statements'
            }
          />
          <BalanceChart data={overview.balance_series} />
        </Card>

        <Card delay={0.46}>
          <CardHeader
            title="Top merchants"
            icon={Receipt}
            subtitle={`Burning ${formatMoney(overview.daily_burn)}/day on average`}
          />
          <ul className="space-y-3">
            {overview.merchants.slice(0, 6).map((m, i) => {
              const max = overview.merchants[0]?.amount ?? 1
              return (
                <li key={m.merchant}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="tnum w-4 shrink-0 text-2xs text-faint">{i + 1}</span>
                      <Tooltip content={m.last_date ? `Last visit ${formatRelative(m.last_date)}` : ''}>
                        <span className="truncate text-body">{m.merchant}</span>
                      </Tooltip>
                      <span className="shrink-0 text-2xs text-faint">{m.count}×</span>
                    </span>
                    <span className="tnum shrink-0 text-sm font-semibold text-strong">
                      {formatMoney(m.amount)}
                    </span>
                  </div>
                  <Progress value={(m.amount / max) * 100} height="sm" />
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card delay={0.5}>
          <CardHeader title="Largest expenses" icon={TrendingDown} />
          <div className="-mx-2">
            {overview.largest_expenses.map((t) => <TxnRow key={t.id} txn={t} />)}
          </div>
        </Card>
        <Card delay={0.54}>
          <CardHeader title="Month at a glance" />
          <div className="grid grid-cols-2 gap-4">
            {months.slice(-4).reverse().map((m) => (
              <Link
                key={m.month}
                to={`/analytics?month=${m.month}`}
                className="rounded-xl border border-hairline bg-raised p-3.5 transition-colors hover:border-brand/40"
              >
                <p className="text-xs font-medium text-muted">{formatMonth(m.month)}</p>
                <p className={cn('tnum mt-1 font-display text-lg font-bold',
                  m.savings >= 0 ? 'text-strong' : 'text-negative')}>
                  {m.savings >= 0 ? '+' : ''}{formatCompact(m.savings)}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-2xs text-faint">
                  <ArrowUpRight className="h-3 w-3" />
                  {formatCompact(m.spend)} spent
                </p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function FirstRun({ name }: { name?: string }) {
  return (
    <div className="mx-auto max-w-2xl pt-10">
      <Card className="!p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
          <Import className="h-8 w-8 text-brand" />
        </div>
        <h1 className="font-display text-2xl font-bold text-strong">
          Welcome{name ? `, ${name}` : ''} — let's get your data in
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          PFIP works from your real bank statements. Export a CSV or PDF from your
          bank's site and drop it in — parsing, categorization and analysis run
          automatically, and nothing leaves your machine unless you configure an AI key.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/import" className="btn-primary">
            Import a statement <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
          {[
            { title: 'Any bank', body: 'HDFC, ICICI, SBI, Axis and generic exports all parse.' },
            { title: 'Categorized', body: 'Every transaction is classified, then you can correct it.' },
            { title: 'Instant analysis', body: 'Trends, health score, budgets and forecast, immediately.' },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-hairline bg-raised p-4">
              <p className="text-sm font-semibold text-strong">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px]" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
      </div>
    </div>
  )
}
