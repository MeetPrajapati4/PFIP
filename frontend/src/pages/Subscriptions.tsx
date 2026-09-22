import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, CalendarClock, Repeat, TrendingUp, Zap,
} from 'lucide-react'
import { analyticsApi } from '../lib/api'
import type { SubscriptionItem, SubscriptionKind } from '../lib/types'
import {
  categoryColor, cn, formatCompact, formatDate, formatMoney, formatRelative,
} from '../lib/utils'
import {
  Badge, Card, CardHeader, EmptyState, PageHeader, SegmentedControl,
  SkeletonRows, Tooltip,
} from '../components/ui'

const KIND_META: Record<SubscriptionKind, { label: string; tone: 'violet' | 'info' | 'neutral'; blurb: string }> = {
  subscription: {
    label: 'Subscription',
    tone: 'violet',
    blurb: 'Discretionary services — the ones you can actually cancel',
  },
  bill: {
    label: 'Bill',
    tone: 'info',
    blurb: 'Utilities and usage-based charges',
  },
  obligation: {
    label: 'Obligation',
    tone: 'neutral',
    blurb: 'Rent, loans, insurance — committed, not optional',
  },
}

type Filter = 'all' | SubscriptionKind

export default function Subscriptions() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: analyticsApi.subscriptions,
  })

  const filtered = useMemo(() => {
    const items = data?.items ?? []
    return filter === 'all' ? items : items.filter((i) => i.kind === filter)
  }, [data, filter])

  if (isLoading) return <SkeletonRows rows={6} />

  const totals = data?.totals
  const hasAny = (data?.items.length ?? 0) > 0

  if (!hasAny) {
    return (
      <div className="space-y-5">
        <PageHeader title="Recurring payments" />
        <Card>
          <EmptyState
            icon={Repeat}
            title="No recurring payments detected yet"
            body="A payee is marked recurring once it repeats on a stable cadence for three or more cycles. Import a few months of statements and they'll surface here automatically."
            action={<Link to="/import" className="btn-primary">Import a statement</Link>}
          />
        </Card>
      </div>
    )
  }

  // The share of committed spend that's genuinely optional — the number worth
  // acting on, and the one a plain "recurring total" hides.
  const optionalShare = totals && totals.monthly > 0
    ? (totals.subscriptions_monthly / totals.monthly) * 100
    : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recurring payments"
        subtitle={data?.as_of
          ? `${totals?.count} active payees · detected up to ${formatDate(data.as_of)}`
          : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="!p-5">
          <p className="text-sm text-muted">Total per month</p>
          <p className="tnum mt-1.5 font-display text-2xl font-bold text-strong">
            {formatMoney(totals?.monthly ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatMoney(totals?.yearly ?? 0)} a year, on autopilot
          </p>
        </Card>

        <Card className="!p-5" delay={0.05}>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Zap className="h-3.5 w-3.5 text-violet" /> Cancellable
          </p>
          <p className="tnum mt-1.5 font-display text-2xl font-bold text-violet">
            {formatMoney(totals?.subscriptions_monthly ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {totals?.subscription_count} subscription{totals?.subscription_count === 1 ? '' : 's'} ·{' '}
            {formatMoney((totals?.subscriptions_monthly ?? 0) * 12)}/yr
          </p>
        </Card>

        <Card className="!p-5" delay={0.1}>
          <p className="text-sm text-muted">Bills</p>
          <p className="tnum mt-1.5 font-display text-2xl font-bold text-strong">
            {formatMoney(totals?.bills_monthly ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">Utilities and usage charges</p>
        </Card>

        <Card className="!p-5" delay={0.15}>
          <p className="text-sm text-muted">Fixed obligations</p>
          <p className="tnum mt-1.5 font-display text-2xl font-bold text-strong">
            {formatMoney(totals?.obligations_monthly ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted">Rent, loans and insurance</p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="What's actually optional"
          subtitle="Committed outflow, split by how much choice you really have"
        />
        <div className="flex h-3 overflow-hidden rounded-full">
          {(['obligation', 'bill', 'subscription'] as SubscriptionKind[]).map((kind) => {
            const value = kind === 'obligation' ? totals?.obligations_monthly
              : kind === 'bill' ? totals?.bills_monthly : totals?.subscriptions_monthly
            const width = totals?.monthly ? ((value ?? 0) / totals.monthly) * 100 : 0
            const colors = {
              obligation: 'bg-muted',
              bill: 'bg-info',
              subscription: 'bg-violet',
            }
            return width > 0 ? (
              <Tooltip key={kind} content={`${KIND_META[kind].label}: ${formatMoney(value ?? 0)}/mo`}>
                <span className={cn('h-full', colors[kind])} style={{ width: `${width}%` }} />
              </Tooltip>
            ) : null
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {(['obligation', 'bill', 'subscription'] as SubscriptionKind[]).map((kind) => (
            <span key={kind} className="flex items-center gap-1.5 text-xs text-muted">
              <span className={cn('h-2 w-2 rounded-full',
                kind === 'obligation' ? 'bg-muted' : kind === 'bill' ? 'bg-info' : 'bg-violet')} />
              {KIND_META[kind].label}s — {KIND_META[kind].blurb}
            </span>
          ))}
        </div>
        <p className="mt-4 rounded-xl border border-hairline bg-raised p-3.5 text-sm leading-relaxed text-body">
          Only <span className="font-semibold text-violet">{optionalShare.toFixed(0)}%</span> of your
          recurring outflow is discretionary — {formatMoney(totals?.subscriptions_monthly ?? 0)} a
          month. Cutting half of that would free up{' '}
          <span className="font-semibold text-strong">
            {formatMoney((totals?.subscriptions_monthly ?? 0) * 6)}
          </span> over a year.
        </p>
      </Card>

      {data && data.upcoming.length > 0 && (
        <Card>
          <CardHeader
            title="Due next"
            icon={CalendarClock}
            subtitle="Predicted from each payee's own cadence"
          />
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.upcoming.map((item) => (
              <div
                key={item.merchant}
                className="w-44 shrink-0 rounded-xl border border-hairline bg-raised p-3.5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(item.category) }}
                  />
                  <span className="truncate text-xs font-semibold text-strong">{item.merchant}</span>
                </div>
                <p className="tnum font-display text-lg font-bold text-strong">
                  {formatMoney(item.amount)}
                </p>
                <p className={cn('mt-1 text-2xs',
                  item.days_until_due <= 3 ? 'font-semibold text-warning' : 'text-muted')}>
                  {item.days_until_due <= 0 ? 'Due now' : `In ${item.days_until_due} days`} ·{' '}
                  {formatDate(item.next_due, 'short')}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${data?.items.length}` },
            { value: 'subscription', label: 'Subscriptions' },
            { value: 'bill', label: 'Bills' },
            { value: 'obligation', label: 'Obligations' },
          ]}
        />
      </div>

      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-semibold">Payee</th>
                <th className="px-4 py-3 font-semibold">Cadence</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-right font-semibold">Per year</th>
                <th className="px-4 py-3 font-semibold">Next due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--c-hairline))]">
              {filtered.map((item) => (
                <SubscriptionRow key={item.merchant} item={item} />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted">
            Nothing in this group.
          </p>
        )}
      </Card>
    </div>
  )
}

function SubscriptionRow({ item }: { item: SubscriptionItem }) {
  const meta = KIND_META[item.kind]
  const lapsed = item.status === 'lapsed'
  // A rise on a payee that was previously stable is a real price change; on a
  // variable bill it's just Tuesday.
  const realHike = !item.is_variable && item.price_change > item.amount * 0.05

  return (
    <tr className={cn('transition-colors hover:bg-raised', lapsed && 'opacity-55')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(item.category) }}
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-strong">
              {item.merchant}
              {realHike && (
                <Tooltip content={`Up ${formatMoney(item.price_change)} since it started`}>
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-warning" />
                </Tooltip>
              )}
              {lapsed && (
                <Tooltip content="No charge for more than a full cycle — cancelled, or a card expired">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-faint" />
                </Tooltip>
              )}
            </p>
            <p className="truncate text-2xs text-muted">
              {item.category} · {item.occurrences} charges since {formatDate(item.first_seen, 'short')}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="text-xs capitalize text-muted">{item.cadence}</span>
        </div>
      </td>
      <td className="tnum whitespace-nowrap px-4 py-3 text-right font-semibold text-strong">
        {formatMoney(item.amount)}
        {item.is_variable && (
          <Tooltip content="Amount varies between charges — this is the median">
            <span className="ml-1 text-2xs font-normal text-faint">~</span>
          </Tooltip>
        )}
      </td>
      <td className="tnum whitespace-nowrap px-4 py-3 text-right text-muted">
        {formatCompact(item.yearly_cost)}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {lapsed ? (
          <span className="text-xs text-faint">
            Last charged {formatRelative(item.last_charged)}
          </span>
        ) : (
          <span className={cn('text-xs',
            item.days_until_due <= 3 ? 'font-semibold text-warning' : 'text-muted')}>
            {formatDate(item.next_due, 'short')}
            <span className="ml-1.5 text-2xs text-faint">
              {item.days_until_due <= 0 ? 'due' : `${item.days_until_due}d`}
            </span>
          </span>
        )}
      </td>
    </tr>
  )
}
