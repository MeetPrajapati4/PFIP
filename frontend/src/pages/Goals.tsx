import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Car, CheckCircle2, GraduationCap, Heart, Home, Landmark, Plane, Plus,
  ShieldCheck, Sparkles, Target, Trash2, TrendingUp, type LucideIcon,
} from 'lucide-react'
import { apiError, goalApi } from '../lib/api'
import type { GoalItem } from '../lib/types'
import { cn, formatCompact, formatDate, formatMoney, formatRelative } from '../lib/utils'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Modal, PageHeader,
  Progress, SkeletonRows, useToast,
} from '../components/ui'

const ICONS: Record<string, LucideIcon> = {
  target: Target,
  home: Home,
  car: Car,
  plane: Plane,
  shield: ShieldCheck,
  graduation: GraduationCap,
  heart: Heart,
  bank: Landmark,
}

const ICON_CHOICES = Object.keys(ICONS)

// Common goals, so a new user picks rather than composes.
const TEMPLATES = [
  { name: 'Emergency fund', icon: 'shield', target: 600_000, hint: '6 months of expenses' },
  { name: 'Home down payment', icon: 'home', target: 2_000_000, hint: '20% of a first home' },
  { name: 'New car', icon: 'car', target: 900_000, hint: 'On-road, mid-segment' },
  { name: 'Travel fund', icon: 'plane', target: 250_000, hint: 'One big trip a year' },
]

export default function Goals() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<GoalItem | 'new' | null>(null)
  const [contributing, setContributing] = useState<GoalItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<GoalItem | null>(null)

  const { data: report, isLoading } = useQuery({ queryKey: ['goals'], queryFn: goalApi.list })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['goals'] })

  const create = useMutation({
    mutationFn: goalApi.create,
    onSuccess: () => {
      invalidate()
      setEditing(null)
      toast.success('Goal created')
    },
    onError: (e) => toast.error('Could not create goal', apiError(e)),
  })

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) =>
      goalApi.update(id, data),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      toast.success('Goal updated')
    },
    onError: (e) => toast.error('Could not update goal', apiError(e)),
  })

  const contribute = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) => goalApi.contribute(id, amount),
    onSuccess: (res, variables) => {
      invalidate()
      setContributing(null)
      const goal = res.items.find((g) => g.id === variables.id)
      if (goal?.status === 'achieved') {
        toast.success('Goal reached! 🎉', `${goal.name} is fully funded.`)
      } else {
        toast.success(`${formatMoney(variables.amount)} added`)
      }
    },
    onError: (e) => toast.error('Could not record contribution', apiError(e)),
  })

  const remove = useMutation({
    mutationFn: goalApi.remove,
    onSuccess: () => {
      invalidate()
      setConfirmDelete(null)
      toast.success('Goal deleted')
    },
    onError: (e) => toast.error('Could not delete goal', apiError(e)),
  })

  if (isLoading) return <SkeletonRows rows={5} />

  const items = report?.items ?? []
  const totals = report?.totals

  return (
    <div className="space-y-5">
      <PageHeader
        title="Goals"
        subtitle={
          report && report.monthly_savings_rate > 0
            ? `You're saving about ${formatMoney(report.monthly_savings_rate)}/month — split across ${items.filter((g) => g.status === 'active').length || 1} active goal${items.filter((g) => g.status === 'active').length === 1 ? '' : 's'}`
            : 'Name what you\'re saving for and PFIP projects when you\'ll get there'
        }
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            New goal
          </Button>
        }
      />

      {totals && totals.count > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="!p-4">
            <p className="text-xs text-muted">Total saved</p>
            <p className="tnum mt-1 font-display text-2xl font-bold text-strong">
              {formatMoney(totals.saved)}
            </p>
            <Progress
              className="mt-2"
              height="sm"
              value={totals.target ? (totals.saved / totals.target) * 100 : 0}
            />
          </Card>
          <Card className="!p-4" delay={0.05}>
            <p className="text-xs text-muted">Combined target</p>
            <p className="tnum mt-1 font-display text-2xl font-bold text-strong">
              {formatMoney(totals.target)}
            </p>
            <p className="mt-2 text-xs text-muted">
              {formatMoney(totals.target - totals.saved)} still to go
            </p>
          </Card>
          <Card className="!p-4" delay={0.1}>
            <p className="text-xs text-muted">Achieved</p>
            <p className="tnum mt-1 font-display text-2xl font-bold text-positive">
              {totals.achieved} <span className="text-base font-medium text-muted">of {totals.count}</span>
            </p>
            <p className="mt-2 text-xs text-muted">
              {formatMoney(report?.allocated_per_goal ?? 0)}/month per active goal
            </p>
          </Card>
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="No goals yet"
            body="A goal turns 'I should save more' into a date. Pick a starting point below, or write your own."
          />
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((template) => {
              const Icon = ICONS[template.icon]
              return (
                <button
                  key={template.name}
                  onClick={() => create.mutate({
                    name: template.name,
                    target_amount: template.target,
                    icon: template.icon,
                  })}
                  className="group rounded-xl border border-hairline bg-raised p-4 text-left
                    transition-colors hover:border-brand/40"
                >
                  <Icon className="mb-2 h-5 w-5 text-brand" />
                  <p className="text-sm font-semibold text-strong">{template.name}</p>
                  <p className="mt-0.5 text-2xs text-muted">{template.hint}</p>
                  <p className="tnum mt-2 text-sm font-bold text-brand">
                    {formatCompact(template.target)}
                  </p>
                </button>
              )
            })}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((goal, i) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              delay={i * 0.05}
              onEdit={() => setEditing(goal)}
              onContribute={() => setContributing(goal)}
              onDelete={() => setConfirmDelete(goal)}
            />
          ))}
        </div>
      )}

      <GoalModal
        open={editing !== null}
        goal={editing === 'new' ? null : editing}
        loading={create.isPending || update.isPending}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing && editing !== 'new') update.mutate({ id: editing.id, ...data })
          else create.mutate(data)
        }}
      />

      <ContributeModal
        goal={contributing}
        loading={contribute.isPending}
        onClose={() => setContributing(null)}
        onSubmit={(amount) => contributing && contribute.mutate({ id: contributing.id, amount })}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        loading={remove.isPending}
        danger
        title={`Delete “${confirmDelete?.name}”?`}
        confirmLabel="Delete goal"
        body="The goal and its recorded progress are removed. Your transactions are unaffected."
      />
    </div>
  )
}

function GoalCard({
  goal, delay, onEdit, onContribute, onDelete,
}: {
  goal: GoalItem
  delay: number
  onEdit: () => void
  onContribute: () => void
  onDelete: () => void
}) {
  const Icon = ICONS[goal.icon] ?? Target
  const achieved = goal.status === 'achieved'

  return (
    <Card delay={delay} hover className="flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            achieved ? 'bg-positive/10 text-positive' : 'bg-brand/10 text-brand',
          )}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-strong">{goal.name}</p>
            {goal.target_date && (
              <p className="text-2xs text-muted">
                Target {formatDate(goal.target_date, 'short')} · {formatRelative(goal.target_date)}
              </p>
            )}
          </div>
        </div>
        {achieved ? (
          <Badge tone="positive" icon={CheckCircle2}>Achieved</Badge>
        ) : goal.on_track === false ? (
          <Badge tone="warning">Behind</Badge>
        ) : goal.on_track ? (
          <Badge tone="positive">On track</Badge>
        ) : null}
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="tnum font-display text-xl font-bold text-strong">
          {formatMoney(goal.current_amount)}
        </span>
        <span className="tnum text-xs text-muted">of {formatMoney(goal.target_amount)}</span>
      </div>

      <Progress
        value={goal.percent}
        tone={achieved ? 'positive' : goal.on_track === false ? 'warning' : 'brand'}
      />
      <p className="tnum mt-1.5 text-2xs text-muted">{goal.percent.toFixed(0)}% funded</p>

      <div className="mt-4 flex-1 space-y-1.5 text-xs">
        {achieved ? (
          <p className="flex items-center gap-1.5 text-positive">
            <Sparkles className="h-3.5 w-3.5 shrink-0" /> Fully funded — nice work.
          </p>
        ) : (
          <>
            <p className="text-muted">
              <span className="tnum font-semibold text-strong">{formatMoney(goal.remaining)}</span> remaining
            </p>
            {goal.required_monthly != null && (
              <p className="text-muted">
                Needs <span className="tnum font-semibold text-strong">
                  {formatMoney(goal.required_monthly)}
                </span>/month to hit the date
              </p>
            )}
            {goal.projected_date && (
              <p className="flex items-center gap-1.5 text-muted">
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                At your current rate: <span className="font-semibold text-strong">
                  {formatDate(goal.projected_date, 'short')}
                </span>
              </p>
            )}
            {goal.months_to_goal == null && (
              <p className="text-warning">
                No surplus detected yet — this needs positive monthly savings to project.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex gap-2 border-t border-hairline pt-3">
        {!achieved && (
          <Button size="sm" variant="secondary" icon={Plus} onClick={onContribute} className="flex-1">
            Add funds
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onEdit} className={achieved ? 'flex-1' : ''}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} aria-label="Delete goal" />
      </div>
    </Card>
  )
}

function GoalModal({
  open, goal, loading, onClose, onSave,
}: {
  open: boolean
  goal: GoalItem | null
  loading: boolean
  onClose: () => void
  onSave: (data: {
    name: string; target_amount: number; current_amount: number
    target_date: string | null; icon: string
  }) => void
}) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [current, setCurrent] = useState('')
  const [date, setDate] = useState('')
  const [icon, setIcon] = useState('target')

  useEffect(() => {
    if (!open) return
    setName(goal?.name ?? '')
    setTarget(goal ? String(goal.target_amount) : '')
    setCurrent(goal ? String(goal.current_amount) : '')
    setDate(goal?.target_date ?? '')
    setIcon(goal?.icon ?? 'target')
  }, [goal, open])

  const targetValue = Number(target)
  const valid = name.trim() && targetValue > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={goal ? `Edit “${goal.name}”` : 'New savings goal'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!valid}
            onClick={() => onSave({
              name: name.trim(),
              target_amount: targetValue,
              current_amount: Number(current) || 0,
              target_date: date || null,
              icon,
            })}
          >
            {goal ? 'Save' : 'Create goal'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What are you saving for?" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Emergency fund"
            className="input"
            autoFocus
          />
        </Field>

        <Field label="Icon">
          <div className="flex flex-wrap gap-2">
            {ICON_CHOICES.map((key) => {
              const Icon = ICONS[key]
              return (
                <button
                  key={key}
                  onClick={() => setIcon(key)}
                  aria-label={key}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
                    icon === key
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-hairline text-muted hover:text-strong',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </button>
              )
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target amount" required>
            <input
              type="number" inputMode="decimal" min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="600000"
              className="input tnum"
            />
          </Field>
          <Field label="Already saved">
            <input
              type="number" inputMode="decimal" min={0}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="0"
              className="input tnum"
            />
          </Field>
        </div>

        <Field
          label="Target date"
          hint="Optional — set one and PFIP tells you the monthly amount it needs."
        >
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </Field>
      </div>
    </Modal>
  )
}

function ContributeModal({
  goal, loading, onClose, onSubmit,
}: {
  goal: GoalItem | null
  loading: boolean
  onClose: () => void
  onSubmit: (amount: number) => void
}) {
  const [amount, setAmount] = useState('')

  useEffect(() => {
    setAmount('')
  }, [goal])

  if (!goal) return null
  const value = Number(amount)
  // Offer the amounts someone would actually type.
  const quick = [5_000, 10_000, 25_000, goal.remaining].filter((v, i, arr) =>
    v > 0 && arr.indexOf(v) === i)

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add to “${goal.name}”`}
      description={`${formatMoney(goal.remaining)} left to reach ${formatMoney(goal.target_amount)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!(value > 0)}
            onClick={() => onSubmit(value)}
          >
            Add {value > 0 ? formatMoney(value) : 'funds'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Amount" required>
          <input
            type="number" inputMode="decimal" min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000"
            className="input tnum"
            autoFocus
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {quick.map((value) => (
            <button
              key={value}
              onClick={() => setAmount(String(Math.round(value)))}
              className="tnum rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold
                text-muted transition-colors hover:border-brand/40 hover:text-brand"
            >
              {value === goal.remaining ? `All ${formatCompact(value)}` : formatCompact(value)}
            </button>
          ))}
        </div>
        <p className="rounded-xl border border-hairline bg-raised p-3 text-xs leading-relaxed text-muted">
          This records money you've already moved into savings. PFIP doesn't touch your accounts —
          it tracks the number so the projection stays honest.
        </p>
      </div>
    </Modal>
  )
}
