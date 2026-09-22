import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, ChevronLeft, ChevronRight,
  Download, EyeOff, RefreshCcw, Search, Sparkles, Tag, Trash2, Wand2, X,
} from 'lucide-react'
import { analyticsApi, apiError, reportApi, transactionApi, type TxnFilters } from '../lib/api'
import type { Transaction } from '../lib/types'
import {
  categoryColor, cn, formatDate, formatMoney, formatMonth,
} from '../lib/utils'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Modal,
  PageHeader, SegmentedControl, SkeletonRows, Tooltip, useToast,
} from '../components/ui'

const PAGE_SIZE = 50

const SOURCE_LABELS: Record<Transaction['category_source'], { label: string; tone: 'violet' | 'brand' | 'neutral' | 'info' }> = {
  gemini: { label: 'AI', tone: 'violet' },
  rule: { label: 'Rule', tone: 'brand' },
  manual: { label: 'You', tone: 'info' },
  local: { label: 'Auto', tone: 'neutral' },
}

export default function Transactions() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  // The URL is the source of truth for filters, so a filtered view is
  // shareable, bookmarkable, and survives a refresh. Insight cards deep-link
  // straight into a filter set.
  const filters = useMemo<TxnFilters>(() => ({
    month: params.get('month') ?? undefined,
    category: params.get('category') ?? undefined,
    search: params.get('search') ?? undefined,
    kind: (params.get('kind') as TxnFilters['kind']) ?? undefined,
    flag: (params.get('flag') as TxnFilters['flag']) ?? undefined,
    min_amount: params.get('min') ? Number(params.get('min')) : undefined,
    sort: (params.get('sort') as TxnFilters['sort']) ?? 'date',
    direction: (params.get('dir') as TxnFilters['direction']) ?? 'desc',
    page: Number(params.get('page') ?? 1),
    page_size: PAGE_SIZE,
  }), [params])

  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<Transaction | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null)

  useEffect(() => {
    setSearchInput(filters.search ?? '')
  }, [filters.search])

  const setFilter = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, String(value))
    })
    // Any filter change invalidates the current page position.
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
    setSelected(new Set())
  }

  const { data: overview } = useQuery({ queryKey: ['overview'], queryFn: analyticsApi.overview })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: transactionApi.categories,
    staleTime: Infinity,
  })
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionApi.list(filters),
    placeholderData: (previous) => previous,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['overview'] })
    queryClient.invalidateQueries({ queryKey: ['budgets'] })
    queryClient.invalidateQueries({ queryKey: ['health'] })
  }

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      transactionApi.update(id, body),
    onSuccess: (_res, variables) => {
      invalidate()
      if (variables.create_rule) {
        toast.success('Rule saved', 'Matching transactions were recategorized too.')
      }
    },
    onError: (e) => toast.error('Update failed', apiError(e)),
  })

  const bulk = useMutation({
    mutationFn: transactionApi.bulk,
    onSuccess: (res) => {
      invalidate()
      setSelected(new Set())
      setBulkOpen(false)
      toast.success(`${res.updated} transactions updated`)
    },
    onError: (e) => toast.error('Bulk update failed', apiError(e)),
  })

  const remove = useMutation({
    mutationFn: transactionApi.remove,
    onSuccess: () => {
      invalidate()
      setConfirmDelete(null)
      setDetail(null)
      toast.success('Transaction deleted')
    },
    onError: (e) => toast.error('Delete failed', apiError(e)),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = filters.page ?? 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeFilterCount = ['month', 'category', 'search', 'kind', 'flag', 'min']
    .filter((k) => params.get(k)).length

  const toggleSort = (column: NonNullable<TxnFilters['sort']>) => {
    const isSame = filters.sort === column
    setFilter({
      sort: column,
      dir: isSame && filters.direction === 'desc' ? 'asc' : 'desc',
    })
  }

  const allSelected = items.length > 0 && items.every((t) => selected.has(t.id))
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((t) => t.id)))
  }
  const toggleOne = (id: number) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const SortHeader = ({
    column, label, align = 'left',
  }: {
    column: NonNullable<TxnFilters['sort']>
    label: string
    align?: 'left' | 'right'
  }) => (
    <th className={cn('px-4 py-3 font-semibold', align === 'right' && 'text-right')}>
      <button
        onClick={() => toggleSort(column)}
        className={cn('inline-flex items-center gap-1 transition-colors hover:text-strong',
          filters.sort === column && 'text-strong')}
      >
        {label}
        {filters.sort === column && (
          filters.direction === 'asc'
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />
        )}
      </button>
    </th>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        subtitle={
          data
            ? `${total.toLocaleString()} matching · ${formatMoney(data.totals.outflow)} out, ${formatMoney(data.totals.inflow)} in`
            : 'Search, filter, recategorize'
        }
        actions={
          <Button
            icon={Download}
            onClick={() =>
              reportApi.transactionsCsv(
                { month: filters.month },
                `pfip-transactions-${filters.month ?? 'all'}.csv`,
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      {/* ------------------------------------------------------- Filters */}
      <Card className="!p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <form
            className="relative min-w-[220px] flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              setFilter({ search: searchInput || undefined })
            }}
          >
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search description, merchant or notes…"
              className="input !pl-10"
              aria-label="Search transactions"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('')
                  setFilter({ search: undefined })
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-strong"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>

          <select
            className="select max-w-[150px]"
            value={filters.month ?? ''}
            onChange={(e) => setFilter({ month: e.target.value || undefined })}
            aria-label="Filter by month"
          >
            <option value="">All months</option>
            {overview?.available_months.map((m) => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>

          <select
            className="select max-w-[170px]"
            value={filters.category ?? ''}
            onChange={(e) => setFilter({ category: e.target.value || undefined })}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <SegmentedControl
            size="sm"
            value={filters.kind ?? 'all'}
            onChange={(value) => setFilter({ kind: value === 'all' ? undefined : value })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'In' },
              { value: 'expense', label: 'Out' },
            ]}
          />

          <div className="flex gap-1.5">
            {([
              { key: 'recurring', label: 'Recurring', icon: RefreshCcw },
              { key: 'anomaly', label: 'Unusual', icon: AlertTriangle },
              { key: 'excluded', label: 'Excluded', icon: EyeOff },
            ] as const).map((flag) => (
              <button
                key={flag.key}
                onClick={() => setFilter({ flag: filters.flag === flag.key ? undefined : flag.key })}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  filters.flag === flag.key
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-hairline text-muted hover:text-strong',
                )}
              >
                <flag.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{flag.label}</span>
              </button>
            ))}
          </div>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              Clear {activeFilterCount}
            </Button>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------ Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-xl border
              border-brand/30 bg-brand/[0.07] px-4 py-2.5 backdrop-blur"
          >
            <span className="text-sm font-semibold text-strong">
              {selected.size} selected
            </span>
            <Button size="sm" icon={Tag} onClick={() => setBulkOpen(true)}>
              Recategorize
            </Button>
            <Button
              size="sm"
              icon={EyeOff}
              onClick={() => bulk.mutate({ ids: [...selected], is_excluded: true })}
              loading={bulk.isPending}
            >
              Exclude from metrics
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Cancel
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------- Table */}
      <Card className={cn('!p-0', isFetching && 'opacity-70 transition-opacity')}>
        {isLoading ? (
          <SkeletonRows rows={10} className="p-5" />
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={ArrowLeftRight}
              title="No transactions match"
              body={activeFilterCount > 0
                ? 'Try widening or clearing your filters.'
                : 'Import a bank statement to get started.'}
              action={
                activeFilterCount > 0 ? (
                  <Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wider text-muted">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all on this page"
                        className="h-4 w-4 cursor-pointer rounded border-hairline accent-[rgb(var(--c-brand))]"
                      />
                    </th>
                    <SortHeader column="date" label="Date" />
                    <SortHeader column="merchant" label="Description" />
                    <SortHeader column="category" label="Category" />
                    <SortHeader column="amount" label="Amount" align="right" />
                    <th className="w-24 px-4 py-3 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--c-hairline))]">
                  {items.map((txn) => (
                    <Row
                      key={txn.id}
                      txn={txn}
                      selected={selected.has(txn.id)}
                      onToggle={() => toggleOne(txn.id)}
                      onOpen={() => setDetail(txn)}
                      categories={categories ?? []}
                      onCategory={(category, createRule) =>
                        update.mutate({ id: txn.id, category, create_rule: createRule })}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
              <p className="text-xs text-muted">
                Showing <span className="tnum font-semibold text-strong">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
                </span> of <span className="tnum font-semibold text-strong">{total.toLocaleString()}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="ghost" icon={ChevronLeft}
                  disabled={page <= 1}
                  onClick={() => setFilter({ page: page - 1 })}
                >
                  Prev
                </Button>
                <span className="tnum px-2 text-xs text-muted">{page} / {totalPages}</span>
                <Button
                  size="sm" variant="ghost"
                  disabled={page >= totalPages}
                  onClick={() => setFilter({ page: page + 1 })}
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <DetailPanel
        txn={detail}
        categories={categories ?? []}
        onClose={() => setDetail(null)}
        onSave={(patch) => {
          if (detail) update.mutate({ id: detail.id, ...patch })
          setDetail(null)
        }}
        onDelete={() => detail && setConfirmDelete(detail)}
      />

      <BulkModal
        open={bulkOpen}
        count={selected.size}
        categories={categories ?? []}
        loading={bulk.isPending}
        onClose={() => setBulkOpen(false)}
        onApply={(category) => bulk.mutate({ ids: [...selected], category })}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        loading={remove.isPending}
        danger
        title="Delete this transaction?"
        confirmLabel="Delete"
        body={
          confirmDelete
            ? `“${confirmDelete.merchant || confirmDelete.description}” will be removed permanently. If you only want it out of your totals, exclude it instead.`
            : ''
        }
      />
    </div>
  )
}

function Row({
  txn, selected, onToggle, onOpen, categories, onCategory,
}: {
  txn: Transaction
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  categories: string[]
  onCategory: (category: string, createRule: boolean) => void
}) {
  const source = SOURCE_LABELS[txn.category_source] ?? SOURCE_LABELS.local
  return (
    <tr className={cn(
      'group transition-colors hover:bg-raised',
      selected && 'bg-brand/[0.05]',
      txn.is_excluded && 'opacity-50',
    )}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${txn.merchant || txn.description}`}
          className="h-4 w-4 cursor-pointer rounded border-hairline accent-[rgb(var(--c-brand))]"
        />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
        {formatDate(txn.date, 'short')}
        <span className="block text-2xs text-faint">{txn.date.slice(0, 4)}</span>
      </td>
      <td className="max-w-sm px-4 py-3">
        <button onClick={onOpen} className="block w-full text-left">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium text-strong group-hover:text-brand">
              {txn.merchant || txn.description}
            </span>
            {txn.is_recurring && (
              <Tooltip content="Recurring"><RefreshCcw className="h-3 w-3 shrink-0 text-info" /></Tooltip>
            )}
            {txn.is_anomaly && (
              <Tooltip content="Unusually large"><AlertTriangle className="h-3 w-3 shrink-0 text-warning" /></Tooltip>
            )}
            {txn.is_excluded && (
              <Tooltip content="Excluded from metrics"><EyeOff className="h-3 w-3 shrink-0 text-faint" /></Tooltip>
            )}
            {txn.notes && <Tooltip content={txn.notes}><span className="shrink-0 text-2xs text-faint">📝</span></Tooltip>}
          </span>
          <span className="mt-0.5 block truncate text-2xs text-faint">{txn.description}</span>
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <select
            value={txn.category}
            onChange={(e) => onCategory(e.target.value, false)}
            className="max-w-[150px] cursor-pointer truncate rounded-full border-0 px-2.5 py-1
              text-xs font-semibold outline-none transition-shadow focus:ring-2 focus:ring-brand/30"
            style={{
              backgroundColor: `${categoryColor(txn.category)}1f`,
              color: categoryColor(txn.category),
            }}
            aria-label="Category"
          >
            {categories.map((c) => (
              <option key={c} value={c} className="bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text-body))]">
                {c}
              </option>
            ))}
          </select>
          <Tooltip content={
            txn.category_source === 'manual' ? 'You set this'
              : txn.category_source === 'rule' ? 'Matched one of your rules'
                : txn.category_source === 'gemini' ? 'Classified by AI'
                  : 'Classified by the keyword engine'
          }>
            <span className="hidden text-2xs font-medium text-faint xl:inline">{source.label}</span>
          </Tooltip>
        </div>
      </td>
      <td className={cn('tnum whitespace-nowrap px-4 py-3 text-right font-semibold',
        txn.amount > 0 ? 'text-positive' : 'text-strong')}>
        {txn.amount > 0 ? '+' : ''}{formatMoney(txn.amount, true)}
      </td>
      <td className="tnum whitespace-nowrap px-4 py-3 text-right text-xs text-faint">
        {txn.balance != null ? formatMoney(txn.balance) : '—'}
      </td>
    </tr>
  )
}

function DetailPanel({
  txn, categories, onClose, onSave, onDelete,
}: {
  txn: Transaction | null
  categories: string[]
  onClose: () => void
  onSave: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')
  const [excluded, setExcluded] = useState(false)
  const [createRule, setCreateRule] = useState(false)

  useEffect(() => {
    if (!txn) return
    setCategory(txn.category)
    setNotes(txn.notes)
    setTags(txn.tags.join(', '))
    setExcluded(txn.is_excluded)
    setCreateRule(false)
  }, [txn])

  if (!txn) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={txn.merchant || 'Transaction'}
      description={formatDate(txn.date, 'long')}
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={onDelete}>Delete</Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => onSave({
              category,
              notes,
              tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
              is_excluded: excluded,
              create_rule: createRule && category !== txn.category,
            })}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-hairline bg-raised p-4">
          <p className="tnum font-display text-2xl font-bold text-strong">
            {txn.amount > 0 ? '+' : ''}{formatMoney(txn.amount, true)}
          </p>
          <p className="mt-1 break-words font-mono text-xs leading-relaxed text-muted">
            {txn.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {txn.is_recurring && <Badge tone="info" icon={RefreshCcw}>Recurring</Badge>}
            {txn.is_anomaly && <Badge tone="warning" icon={AlertTriangle}>Unusual</Badge>}
            {txn.balance != null && (
              <Badge tone="neutral">Balance after: {formatMoney(txn.balance)}</Badge>
            )}
            <Badge tone={SOURCE_LABELS[txn.category_source].tone} icon={Sparkles}>
              {SOURCE_LABELS[txn.category_source].label}-categorized
            </Badge>
          </div>
        </div>

        <Field label="Category">
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        {category !== txn.category && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border
            border-brand/30 bg-brand/[0.06] p-3">
            <input
              type="checkbox"
              checked={createRule}
              onChange={(e) => setCreateRule(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-[rgb(var(--c-brand))]"
            />
            <span className="text-xs leading-relaxed text-body">
              <span className="flex items-center gap-1.5 font-semibold text-strong">
                <Wand2 className="h-3.5 w-3.5 text-brand" />
                Remember this for “{txn.merchant}”
              </span>
              Creates a rule that recategorizes past and future matches automatically.
            </span>
          </label>
        )}

        <Field label="Notes" hint="Only you see this — searchable from the filter bar.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Reimbursable, split with Priya, warranty until 2028…"
            className="input resize-none"
          />
        </Field>

        <Field label="Tags" hint="Comma separated, up to 10.">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="work, reimbursable"
            className="input"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={excluded}
            onChange={(e) => setExcluded(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-[rgb(var(--c-brand))]"
          />
          <span className="text-xs leading-relaxed text-body">
            <span className="block font-semibold text-strong">Exclude from all metrics</span>
            Keeps the row in your ledger but drops it from totals, charts, budgets and the
            health score. Use it for transfers between your own accounts or reimbursed spend.
          </span>
        </label>
      </div>
    </Modal>
  )
}

function BulkModal({
  open, count, categories, loading, onClose, onApply,
}: {
  open: boolean
  count: number
  categories: string[]
  loading: boolean
  onClose: () => void
  onApply: (category: string) => void
}) {
  const [category, setCategory] = useState(categories[0] ?? 'Miscellaneous')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Recategorize ${count} transaction${count === 1 ? '' : 's'}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={loading} onClick={() => onApply(category)}>
            Apply
          </Button>
        </>
      }
    >
      <Field label="New category">
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
    </Modal>
  )
}
