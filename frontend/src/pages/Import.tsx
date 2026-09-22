import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight, CheckCircle2, CloudUpload, Copy, FileSpreadsheet, FileText,
  Import as ImportIcon, Loader2, ShieldCheck, Sparkles, Trash2, TriangleAlert, XCircle,
} from 'lucide-react'
import { apiError, statementApi } from '../lib/api'
import type { Statement } from '../lib/types'
import { cn, formatDate, formatFileSize, formatRelative } from '../lib/utils'
import {
  Badge, Card, CardHeader, ConfirmDialog, EmptyState, PageHeader, useToast,
} from '../components/ui'

/**
 * Import screen.
 *
 * The progress here is real: the server processes on a worker thread and
 * writes its stage to the statement row, which this polls. An animated fake
 * would have been less code, but a 1,200-row statement genuinely takes long
 * enough that a lie would be visible.
 */
export default function Import() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [dragging, setDragging] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Statement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: statements } = useQuery({
    queryKey: ['statements'],
    queryFn: statementApi.list,
  })

  // Poll the active import until it settles. `refetchInterval` returning false
  // stops the loop the moment the server reports a terminal state.
  const { data: active } = useQuery({
    queryKey: ['statement', activeId],
    queryFn: () => statementApi.get(activeId!),
    enabled: activeId != null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'processed' || status === 'failed' ? false : 700
    },
  })

  const invalidateAll = useCallback(() => {
    for (const key of ['overview', 'statements', 'health', 'insights', 'transactions',
      'budgets', 'goals', 'subscriptions', 'forecast']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }, [queryClient])

  useEffect(() => {
    if (active?.status === 'processed') {
      invalidateAll()
      const imported = active.transaction_count
      const dupes = active.duplicate_count
      if (imported === 0 && dupes > 0) {
        toast.info('Already up to date', `All ${dupes} rows were already imported.`)
      } else {
        toast.success(
          `${imported.toLocaleString()} transactions imported`,
          dupes > 0 ? `${dupes} duplicate rows were skipped.` : undefined,
        )
      }
    }
    if (active?.status === 'failed') {
      toast.error('Import failed', active.error_message ?? undefined)
    }
  }, [active?.status, active?.transaction_count, active?.duplicate_count,
    active?.error_message, invalidateAll, toast])

  const upload = useMutation({
    mutationFn: (file: File) => statementApi.upload(file, setUploadPercent),
    onSuccess: (statement) => {
      setActiveId(statement.id)
      setError('')
      queryClient.invalidateQueries({ queryKey: ['statements'] })
    },
    onError: (err) => {
      setError(apiError(err))
      setUploadPercent(0)
    },
  })

  const remove = useMutation({
    mutationFn: statementApi.remove,
    onSuccess: () => {
      invalidateAll()
      setConfirmDelete(null)
      toast.success('Statement removed', 'Its transactions were deleted too.')
    },
    onError: (e) => toast.error('Could not delete', apiError(e)),
  })

  const start = useCallback((file: File) => {
    setUploadPercent(0)
    setError('')
    setActiveId(null)
    upload.mutate(file)
  }, [upload])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) start(file)
  }, [start])

  const busy = upload.isPending ||
    (active != null && active.status !== 'processed' && active.status !== 'failed')

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Import a statement"
        subtitle="CSV or PDF, up to 15 MB. Parsing, categorization and analysis run automatically."
      />

      <Card className="!p-4">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all duration-200',
            dragging
              ? 'border-brand bg-brand/[0.08] shadow-glow'
              : 'border-hairline hover:border-brand/45 hover:bg-brand/[0.03]',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.csv,text/csv,application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) start(file)
              e.target.value = ''
            }}
          />
          <motion.div
            animate={dragging ? { scale: 1.12, rotate: -4 } : { scale: 1, rotate: 0 }}
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10"
          >
            <CloudUpload className="h-8 w-8 text-brand" />
          </motion.div>
          <p className="font-display text-lg font-semibold text-strong">
            {dragging ? 'Drop it here' : 'Drag your statement in'}
          </p>
          <p className="mt-1 text-sm text-muted">
            or <span className="font-semibold text-brand">browse files</span> — CSV and PDF supported
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-2xs text-faint">
            <Badge tone="neutral">HDFC</Badge>
            <Badge tone="neutral">ICICI</Badge>
            <Badge tone="neutral">SBI</Badge>
            <Badge tone="neutral">Axis</Badge>
            <Badge tone="neutral">Kotak</Badge>
            <span>and generic exports</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {upload.isPending && uploadPercent < 100 && (
            <ProgressPanel
              key="uploading"
              label="Uploading file"
              percent={uploadPercent}
              stages={[]}
            />
          )}
          {active && active.status !== 'failed' && (
            <ProgressPanel
              key="processing"
              label={active.stage_label}
              percent={active.progress}
              done={active.status === 'processed'}
              stages={PIPELINE}
              statement={active}
            />
          )}
          {(error || active?.status === 'failed') && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-start gap-3 rounded-xl border border-negative/30
                bg-negative/[0.07] p-4 text-sm"
            >
              <XCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-negative" />
              <div>
                <p className="font-semibold text-strong">Import failed</p>
                <p className="mt-0.5 leading-relaxed text-muted">
                  {error || active?.error_message}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            title: 'Duplicates are handled',
            body: 'Re-import an overlapping export and PFIP skips rows it already has.',
          },
          {
            icon: Sparkles,
            title: 'Categorized on arrival',
            body: 'Your rules first, then AI, then a keyword engine that never needs a key.',
          },
          {
            icon: FileSpreadsheet,
            title: 'Any column layout',
            body: 'Split debit/credit, signed amounts, Dr/Cr flags and metadata preambles.',
          },
        ].map((item, i) => (
          <Card key={item.title} delay={0.05 * i} className="!p-4">
            <item.icon className="mb-2.5 h-5 w-5 text-brand" />
            <p className="text-sm font-semibold text-strong">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
          </Card>
        ))}
      </div>

      <Card delay={0.15}>
        <CardHeader
          title="Imported statements"
          subtitle={statements?.length
            ? `${statements.length} file${statements.length === 1 ? '' : 's'}`
            : undefined}
        />
        {!statements?.length ? (
          <EmptyState
            compact
            icon={FileText}
            title="Nothing imported yet"
            body="Your uploaded statements will be listed here."
          />
        ) : (
          <ul className="divide-y divide-[rgb(var(--c-hairline))]">
            {statements.map((st) => (
              <li key={st.id} className="flex items-center gap-4 py-3.5">
                <span className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  st.status === 'failed' ? 'bg-negative/10' : 'bg-info/10',
                )}>
                  {st.status === 'failed'
                    ? <TriangleAlert className="h-5 w-5 text-negative" />
                    : st.status !== 'processed'
                      ? <Loader2 className="h-5 w-5 animate-spin text-info" />
                      : <FileText className="h-5 w-5 text-info" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-strong">{st.filename}</p>
                  <p className="truncate text-xs text-muted">
                    {st.bank_name} · {st.transaction_count.toLocaleString()} transactions
                    {st.duplicate_count > 0 && ` · ${st.duplicate_count} duplicates skipped`}
                    {st.period_start && st.period_end &&
                      ` · ${formatDate(st.period_start, 'short')} → ${formatDate(st.period_end, 'short')}`}
                  </p>
                  <p className="mt-0.5 text-2xs text-faint">
                    {formatFileSize(st.file_size)} · imported {formatRelative(st.uploaded_at)}
                  </p>
                </div>
                <Badge tone={st.categorization_source === 'gemini' ? 'violet' : 'neutral'}>
                  {st.categorization_source === 'gemini' ? 'AI' : 'Local'}
                </Badge>
                <button
                  onClick={() => setConfirmDelete(st)}
                  aria-label={`Delete ${st.filename}`}
                  className="rounded-lg p-2 text-faint transition-colors hover:bg-negative/10 hover:text-negative"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card delay={0.2} className="border-dashed">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet/10">
              <Copy className="h-5 w-5 text-violet" />
            </span>
            <div>
              <p className="text-sm font-semibold text-strong">Don't have a statement handy?</p>
              <p className="mt-0.5 max-w-lg text-xs leading-relaxed text-muted">
                The repo ships three realistic statements in <code className="font-mono text-brand">
                sample-statements/</code> — HDFC, ICICI and SBI formats covering 15–24 months.
                Generate more with <code className="font-mono text-brand">
                python backend/scripts/generate_statement.py --all</code>.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        loading={remove.isPending}
        danger
        title="Delete this statement?"
        confirmLabel="Delete everything"
        body={
          confirmDelete
            ? `“${confirmDelete.filename}” and all ${confirmDelete.transaction_count.toLocaleString()} of its transactions will be permanently removed. Your budgets, goals and rules are untouched.`
            : ''
        }
      />
    </div>
  )
}

const PIPELINE = [
  { key: 'parsing', label: 'Reading the document' },
  { key: 'categorizing', label: 'Categorizing transactions' },
  { key: 'enriching', label: 'Detecting recurring & anomalies' },
  { key: 'processed', label: 'Done' },
]

function ProgressPanel({
  label, percent, stages, done = false, statement,
}: {
  label: string
  percent: number
  stages: { key: string; label: string }[]
  done?: boolean
  statement?: Statement
}) {
  const currentIndex = statement
    ? Math.max(stages.findIndex((s) => s.key === statement.status), 0)
    : -1

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-4 rounded-xl border border-hairline bg-raised p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-strong">
            {done
              ? <CheckCircle2 className="h-4 w-4 text-positive" />
              : <Loader2 className="h-4 w-4 animate-spin text-brand" />}
            {label}
          </span>
          <span className="tnum text-xs font-semibold text-muted">{percent}%</span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          <motion.div
            className={cn('h-full rounded-full', done ? 'bg-positive' : 'bg-brand')}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {stages.length > 0 && (
          <ul className="mt-4 space-y-2">
            {stages.map((stage, i) => (
              <li key={stage.key} className="flex items-center gap-2.5 text-xs">
                {i < currentIndex || done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
                ) : i === currentIndex ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-hairline" />
                )}
                <span className={i <= currentIndex || done ? 'text-body' : 'text-faint'}>
                  {stage.label}
                </span>
              </li>
            ))}
          </ul>
        )}

        {done && statement && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
            <p className="flex-1 text-xs text-muted">
              <span className="font-semibold text-strong">
                {statement.transaction_count.toLocaleString()} transactions
              </span>{' '}
              from {statement.bank_name}
              {statement.duplicate_count > 0 &&
                `, ${statement.duplicate_count} duplicates skipped`}
            </p>
            <Link to="/dashboard" className="btn-primary btn-sm">
              See your dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/insights" className="btn-secondary btn-sm">
              <ImportIcon className="h-3.5 w-3.5" /> Generate insights
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  )
}
