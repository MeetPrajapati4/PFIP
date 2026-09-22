import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, ArrowRight, Copy, Lightbulb, Receipt, Sparkles, TrendingUp,
  Wallet, Wand2, X, type LucideIcon,
} from 'lucide-react'
import { apiError, insightApi } from '../lib/api'
import type { Insight } from '../lib/types'
import { cn, formatMoney, formatMonth } from '../lib/utils'
import {
  Badge, Button, Card, EmptyState, PageHeader, SegmentedControl, SkeletonRows,
  Tooltip, useToast,
} from '../components/ui'

const TYPE_ICONS: Record<string, LucideIcon> = {
  spike: TrendingUp,
  subscription: Receipt,
  duplicate: Copy,
  anomaly: AlertTriangle,
  tip: Lightbulb,
  summary: Sparkles,
  budget: Wallet,
  forecast: TrendingUp,
}

type Filter = 'all' | 'warning' | 'positive'

export default function Insights() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('all')

  const { data: insights, isLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: insightApi.list,
  })

  const generate = useMutation({
    mutationFn: insightApi.generate,
    onSuccess: (data) => {
      queryClient.setQueryData(['insights'], data)
      toast.success(
        data.length ? `${data.length} insights found` : 'Nothing to flag',
        data.length ? undefined : 'Your finances look steady this period.',
      )
    },
    onError: (e) => toast.error('Could not generate insights', apiError(e)),
  })

  const dismiss = useMutation({
    mutationFn: insightApi.dismiss,
    onMutate: async (id: number) => {
      // Optimistic: dismissing should feel instant, and it's trivially undoable
      // by regenerating.
      await queryClient.cancelQueries({ queryKey: ['insights'] })
      const previous = queryClient.getQueryData<Insight[]>(['insights'])
      queryClient.setQueryData<Insight[]>(['insights'], (old) =>
        (old ?? []).filter((i) => i.id !== id))
      return { previous }
    },
    onError: (_e, _id, context) => {
      queryClient.setQueryData(['insights'], context?.previous)
      toast.error('Could not dismiss')
    },
  })

  const filtered = useMemo(() => {
    const items = insights ?? []
    if (filter === 'all') return items
    return items.filter((i) => i.severity === filter)
  }, [insights, filter])

  const totalImpact = (insights ?? [])
    .filter((i) => i.severity === 'warning')
    .reduce((sum, i) => sum + i.impact, 0)

  const warnings = (insights ?? []).filter((i) => i.severity === 'warning').length
  const wins = (insights ?? []).filter((i) => i.severity === 'positive').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Insights"
        subtitle="Rule-based detection over your real transactions, ranked by money at stake"
        actions={
          <Button
            variant="primary"
            icon={Wand2}
            loading={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? 'Analysing…' : 'Regenerate'}
          </Button>
        }
      />

      {insights && insights.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="!p-5">
            <p className="text-sm text-muted">Money at stake</p>
            <p className="tnum mt-1.5 font-display text-2xl font-bold text-warning">
              {formatMoney(totalImpact)}
            </p>
            <p className="mt-1 text-xs text-muted">Across everything flagged for review</p>
          </Card>
          <Card className="!p-5" delay={0.05}>
            <p className="text-sm text-muted">Need attention</p>
            <p className="tnum mt-1.5 font-display text-2xl font-bold text-strong">{warnings}</p>
            <p className="mt-1 text-xs text-muted">Spikes, duplicates, breaches and anomalies</p>
          </Card>
          <Card className="!p-5" delay={0.1}>
            <p className="text-sm text-muted">Going well</p>
            <p className="tnum mt-1.5 font-display text-2xl font-bold text-positive">{wins}</p>
            <p className="mt-1 text-xs text-muted">Habits worth keeping</p>
          </Card>
        </div>
      )}

      {insights && insights.length > 0 && (
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${insights.length}` },
            { value: 'warning', label: `Attention ${warnings}` },
            { value: 'positive', label: `Wins ${wins}` },
          ]}
        />
      )}

      {isLoading ? (
        <SkeletonRows rows={5} />
      ) : !insights?.length ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="No insights yet"
            body="PFIP scans for spending spikes, forgotten subscriptions, quiet price rises, duplicate charges, budget breaches and projected shortfalls. Run it once you have a couple of months of data."
            action={
              <Button
                variant="primary"
                icon={Wand2}
                loading={generate.isPending}
                onClick={() => generate.mutate()}
              >
                Generate insights
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((insight, i) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                index={i}
                onDismiss={() => dismiss.mutate(insight.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {filtered.length === 0 && insights && insights.length > 0 && (
        <Card>
          <EmptyState
            compact
            icon={Sparkles}
            title="Nothing in this group"
            body="Switch the filter to see the rest."
          />
        </Card>
      )}
    </div>
  )
}

function InsightCard({
  insight, index, onDismiss,
}: {
  insight: Insight
  index: number
  onDismiss: () => void
}) {
  const Icon = TYPE_ICONS[insight.type] ?? Sparkles
  const tone = insight.severity === 'warning' ? 'warning'
    : insight.severity === 'positive' ? 'positive' : 'info'
  const iconClass = {
    warning: 'bg-warning/10 text-warning',
    positive: 'bg-positive/10 text-positive',
    info: 'bg-info/10 text-info',
  }[tone]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.4) }}
    >
      <Card className="group relative flex h-full flex-col !p-5" hover>
        <button
          onClick={onDismiss}
          aria-label="Dismiss insight"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-faint opacity-0 transition-all
            hover:bg-raised hover:text-strong focus:opacity-100 group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-start gap-4">
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconClass)}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{insight.type}</Badge>
              {insight.month && (
                <span className="text-2xs text-faint">{formatMonth(insight.month)}</span>
              )}
              {insight.impact > 0 && (
                <Tooltip content="Estimated money at stake — insights are ranked by this">
                  <span className="tnum cursor-help text-2xs font-semibold text-muted">
                    {formatMoney(insight.impact)}
                  </span>
                </Tooltip>
              )}
            </div>
            <h3 className="pr-6 font-display text-base font-semibold leading-snug text-strong">
              {insight.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{insight.body}</p>
          </div>
        </div>

        {insight.action_href && (
          <div className="mt-4 border-t border-hairline pt-3">
            <Link
              to={insight.action_href}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            >
              {insight.action_label || 'Take a look'} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
