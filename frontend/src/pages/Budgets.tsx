import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, CheckCircle2, Plus, Sparkles, Trash2, TrendingUp, Wallet, Wand2,
} from 'lucide-react'
import { analyticsApi, apiError, budgetApi, transactionApi } from '../lib/api'
import type { BudgetItem, BudgetSuggestion } from '../lib/types'
import { categoryColor, cn, formatCompact, formatMoney, formatMonth } from '../lib/utils'
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Modal,
  PageHeader, Progress, SkeletonRows, Tooltip, useToast,
} from '../components/ui'

const STATUS_META: Record<BudgetItem['status'], {
  label: string
  tone: 'positive' | 'warning' | 'negative'
}> = {
  on_track: { label: 'On track', tone: 'positive' },
  warning: { label: 'Close to limit', tone: 'warning' },
  projected_over: { label: 'Trending over', tone: 'warning' },
  exceeded: { label: 'Over budget', tone: 'negative' },
}

export default function Budgets() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [month, setMonth] = useState<string>()
  const [editing, setEditing] = useState<BudgetItem | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<BudgetItem | null>(null)

  const { data: overview } = useQuery({ queryKey: ['overview'], queryFn: analyticsApi.overview })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: transactionApi.categories,
    staleTime: Infinity,
  })
  const { data: report, isLoading } = useQuery({
    queryKey: ['budgets', month],
    queryFn: () => budgetApi.report(month),
  })
  const { data: suggestions } = useQuery({
    queryKey: ['budget-suggestions'],
    queryFn: budgetApi.suggestions,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['budgets'] })
    queryClient.invalidateQueries({ queryKey: ['budget-suggestions'] })
    queryClient.invalidateQueries({ queryKey: ['health'] })
  }

  const save = useMutation({
    mutationFn: (data: { category: string; amount: number; alert_threshold?: number }) =>
      budgetApi.create(data),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      toast.success('Budget saved')
    },
    onError: (e) => toast.error('Could not save', apiError(e)),
  })

  const applyAll = useMutation({
    mutationFn: (items: BudgetSuggestion[]) =>
      budgetApi.createMany(items.map((s) => ({ category: s.category, amount: s.amount }))),
    onSuccess: (created) => {
      invalidate()
      toast.success(`${created.length} budgets created`, 'Based on your own spending history.')
    },
    onError: (e) => toast.error('Could not create budgets', apiError(e)),
  })

  const remove = useMutation({
    mutationFn: budgetApi.remove,
    onSuccess: () => {
      invalidate()
      setConfirmDelete(null)
      toast.success('Budget removed')
    },
    onError: (e) => toast.error('Could not remove', apiError(e)),
  })

  const activeMonth = report?.month ?? month
  const pacing = useMemo(() => {
    if (!report || !report.days_in_month) return 0
    return (report.days_elapsed / report.days_in_month) * 100
  }, [report])

  if (isLoading) return <SkeletonRows rows={6} />

  const hasBudgets = (report?.items.length ?? 0) > 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budgets"
        subtitle={activeMonth
          ? `${formatMonth(activeMonth)} · day ${report?.days_elapsed} of ${report?.days_in_month}`
          : 'Monthly caps by category'}
        actions={
          <>
            <select
              className="select max-w-[160px]"
              value={activeMonth ?? ''}
              onChange={(e) => setMonth(e.target.value || undefined)}
              aria-label="Budget month"
            >
              {overview?.available_months.map((m) => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
            </select>
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              New budget
            </Button>
          </>
        }
      />

      {hasBudgets && report && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Spent this month</p>
              <p className="tnum mt-1 font-display text-3xl font-bold text-strong">
                {formatMoney(report.totals.spent)}
                <span className="ml-2 text-base font-medium text-muted">
                  of {formatMoney(report.totals.budgeted)}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-muted">Remaining</p>
                <p className={cn('tnum mt-0.5 font-display text-lg font-bold',
                  report.totals.remaining >= 0 ? 'text-positive' : 'text-negative')}>
                  {formatMoney(report.totals.remaining)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Unbudgeted spend</p>
                <p className="tnum mt-0.5 font-display text-lg font-bold text-strong">
                  {formatMoney(report.totals.unbudgeted)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Over budget</p>
                <p className={cn('tnum mt-0.5 font-display text-lg font-bold',
                  report.over_count > 0 ? 'text-negative' : 'text-positive')}>
                  {report.over_count}
                </p>
              </div>
            </div>
          </div>

          <div className="relative mt-5">
            <Progress
              value={report.totals.percent}
              height="lg"
              tone={report.totals.percent > 100 ? 'negative'
                : report.totals.percent > 85 ? 'warning' : 'brand'}
            />
            {/* Where the month is, versus where the money is. The gap is the story. */}
            <Tooltip content={`You're ${pacing.toFixed(0)}% through the month`}>
              <span
                className="absolute -top-1 h-5 w-0.5 rounded-full bg-strong"
                style={{ left: `${Math.min(pacing, 100)}%` }}
              />
            </Tooltip>
          </div>
          <p className="mt-2 text-xs text-muted">
            The marker shows how far through the month you are. Bars past it are running hot.
          </p>
        </Card>
      )}

      {!hasBudgets ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No budgets set"
            body="A budget turns a number you regret at month-end into one you can steer mid-month. PFIP can suggest starting points from your own spending."
            action={
              suggestions && suggestions.length > 0 ? (
                <Button
                  variant="primary"
                  icon={Wand2}
                  loading={applyAll.isPending}
                  onClick={() => applyAll.mutate(suggestions.slice(0, 6))}
                >
                  Create {Math.min(suggestions.length, 6)} suggested budgets
                </Button>
              ) : (
                <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                  Create your first budget
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {report?.items.map((item, i) => (
            <BudgetCard
              key={item.id}
              item={item}
              delay={i * 0.04}
              onEdit={() => setEditing(item)}
              onDelete={() => setConfirmDelete(item)}
            />
          ))}
        </div>
      )}

      {suggestions && suggestions.length > 0 && hasBudgets && (
        <Card>
          <CardHeader
            title="Suggested budgets"
            icon={Sparkles}
            subtitle="Derived from your own median spend — set 5% below, so there's something to aim at"
            action={
              <Button
                size="sm"
                icon={Wand2}
                loading={applyAll.isPending}
                onClick={() => applyAll.mutate(suggestions)}
              >
                Add all
              </Button>
            }
          />
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.category}
                onClick={() => save.mutate({ category: s.category, amount: s.amount })}
                className="group flex items-center gap-2.5 rounded-xl border border-hairline
                  bg-raised px-3 py-2 text-left transition-colors hover:border-brand/40"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor(s.category) }}
                />
                <span>
                  <span className="block text-xs font-semibold text-strong">{s.category}</span>
                  <span className="block text-2xs text-muted">{s.basis}</span>
                </span>
                <span className="tnum ml-2 text-sm font-bold text-strong">
                  {formatCompact(s.amount)}
                </span>
                <Plus className="h-3.5 w-3.5 text-faint transition-colors group-hover:text-brand" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <BudgetModal
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        categories={categories ?? []}
        existing={report?.items.map((i) => i.category) ?? []}
        loading={save.isPending}
        onClose={() => setEditing(null)}
        onSave={(data) => save.mutate(data)}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        loading={remove.isPending}
        danger
        title={`Remove the ${confirmDelete?.category} budget?`}
        confirmLabel="Remove"
        body="Your transactions and history stay exactly as they are — only the cap is removed."
      />
    </div>
  )
}

function BudgetCard({
  item, delay, onEdit, onDelete,
}: {
  item: BudgetItem
  delay: number
  onEdit: () => void
  onDelete: () => void
}) {
  const { data: history } = useQuery({
    queryKey: ['budget-history', item.category],
    queryFn: () => budgetApi.history(item.category),
    staleTime: 5 * 60_000,
  })

  const meta = STATUS_META[item.status]
  const color = categoryColor(item.category)
  const peak = Math.max(...(history ?? []).map((h) => Math.max(h.spent, h.budget)), 1)

  return (
    <Card delay={delay} hover className="flex flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <p className="text-sm font-semibold text-strong">{item.category}</p>
            <p className="tnum text-2xs text-muted">
              {item.transaction_count} transaction{item.transaction_count === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="tnum font-display text-xl font-bold text-strong">
          {formatMoney(item.spent)}
        </span>
        <span className="tnum text-xs text-muted">of {formatMoney(item.amount)}</span>
      </div>

      <Progress value={item.percent} tone={meta.tone === 'positive' ? 'brand' : meta.tone} />

      <div className="mt-3 space-y-1.5 text-xs">
        {item.status === 'exceeded' ? (
          <p className="text-negative">
            <span className="tnum font-semibold">{formatMoney(-item.remaining)}</span> over the cap.
          </p>
        ) : (
          <p className="text-muted">
            <span className="tnum font-semibold text-strong">{formatMoney(item.remaining)}</span> left
            {item.days_left > 0 && item.daily_allowance > 0 && (
              <> · <span className="tnum">{formatMoney(item.daily_allowance)}/day</span> for {item.days_left} days</>
            )}
          </p>
        )}
        {item.status === 'projected_over' && (
          <p className="flex items-center gap-1.5 text-warning">
            <TrendingUp className="h-3.5 w-3.5 shrink-0" />
            On pace for <span className="tnum font-semibold">{formatMoney(item.projected)}</span> by month end
          </p>
        )}
        {item.status === 'on_track' && item.percent < 60 && (
          <p className="flex items-center gap-1.5 text-positive">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Comfortably within budget
          </p>
        )}
      </div>

      {history && history.length > 1 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
            <CalendarDays className="h-3 w-3" /> Last {history.length} months
          </p>
          <div className="flex h-10 items-end gap-1">
            {history.map((h) => (
              <Tooltip key={h.month} content={`${formatMonth(h.month)}: ${formatMoney(h.spent)}`}>
                <span className="flex flex-1 flex-col justify-end">
                  <span
                    className={cn('w-full rounded-t-sm transition-all',
                      h.budget > 0 && h.spent > h.budget ? 'bg-negative/70' : 'bg-brand/50')}
                    style={{ height: `${Math.max((h.spent / peak) * 40, 2)}px` }}
                  />
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2 border-t border-hairline pt-3">
        <Button size="sm" variant="ghost" onClick={onEdit} className="flex-1">Edit</Button>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} aria-label="Delete budget" />
      </div>
    </Card>
  )
}

function BudgetModal({
  open, item, categories, existing, loading, onClose, onSave,
}: {
  open: boolean
  item: BudgetItem | null
  categories: string[]
  existing: string[]
  loading: boolean
  onClose: () => void
  onSave: (data: { category: string; amount: number; alert_threshold: number }) => void
}) {
  const available = categories.filter((c) => !existing.includes(c) || c === item?.category)
  const [category, setCategory] = useState(item?.category ?? available[0] ?? '')
  const [amount, setAmount] = useState(String(item?.amount ?? ''))
  const [threshold, setThreshold] = useState(item?.alert_threshold ?? 80)

  // Re-seed the form each time the modal target changes.
  useEffect(() => {
    setCategory(item?.category ?? available[0] ?? '')
    setAmount(item ? String(item.amount) : '')
    setThreshold(item?.alert_threshold ?? 80)
  }, [item, open])

  const value = Number(amount)
  const valid = category && value > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Edit ${item.category} budget` : 'New budget'}
      description="Monthly cap. It rolls forward until you change it."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!valid}
            onClick={() => onSave({ category, amount: value, alert_threshold: threshold })}
          >
            {item ? 'Save' : 'Create budget'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Category" required>
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={Boolean(item)}
          >
            {available.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Monthly amount" required>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="15000"
            className="input tnum"
          />
        </Field>

        <Field
          label={`Warn me at ${threshold}%`}
          hint="You'll see a warning badge once spending crosses this share of the cap."
        >
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-[rgb(var(--c-brand))]"
          />
        </Field>

        <p className="rounded-xl border border-hairline bg-raised p-3 text-xs leading-relaxed text-muted">
          Not sure what to set? <Link to="/analytics" className="font-semibold text-brand hover:underline">
          Check your history</Link> — the suggestions on this page use your own median spend.
        </p>
      </div>
    </Modal>
  )
}
