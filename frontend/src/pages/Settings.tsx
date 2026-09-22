import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Check, Database, Download, KeyRound, Monitor, Moon, Palette,
  Plus, Sparkles, Sun, Trash2, User as UserIcon, Wand2,
} from 'lucide-react'
import { apiError, authApi, metaApi, reportApi, ruleApi, transactionApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { categoryColor, cn, formatDate } from '../lib/utils'
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Modal,
  PageHeader, SegmentedControl, useToast,
} from '../components/ui'

const CURRENCIES = [
  { code: 'INR', label: '₹ Indian Rupee', locale: 'en-IN' },
  { code: 'USD', label: '$ US Dollar', locale: 'en-US' },
  { code: 'EUR', label: '€ Euro', locale: 'de-DE' },
  { code: 'GBP', label: '£ British Pound', locale: 'en-GB' },
  { code: 'AED', label: 'AED UAE Dirham', locale: 'en-AE' },
  { code: 'SGD', label: 'S$ Singapore Dollar', locale: 'en-SG' },
  { code: 'AUD', label: 'A$ Australian Dollar', locale: 'en-AU' },
  { code: 'CAD', label: 'C$ Canadian Dollar', locale: 'en-CA' },
]

type Tab = 'profile' | 'rules' | 'appearance' | 'data'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('profile')

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Your profile, categorization rules, appearance and data"
      />

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'profile', label: 'Profile', icon: UserIcon },
          { value: 'rules', label: 'Rules', icon: Wand2 },
          { value: 'appearance', label: 'Appearance', icon: Palette },
          { value: 'data', label: 'Data', icon: Database },
        ]}
      />

      {tab === 'profile' && <ProfileTab />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'data' && <DataTab />}
    </div>
  )
}

/* ------------------------------------------------------------------ Profile */

function ProfileTab() {
  const { user, applyUser } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [name, setName] = useState(user?.name ?? '')
  const [currency, setCurrency] = useState(user?.currency ?? 'INR')
  const [income, setIncome] = useState(user?.monthly_income_target?.toString() ?? '')
  const [months, setMonths] = useState(user?.emergency_fund_months ?? 6)

  useEffect(() => {
    if (!user) return
    setName(user.name)
    setCurrency(user.currency)
    setIncome(user.monthly_income_target?.toString() ?? '')
    setMonths(user.emergency_fund_months)
  }, [user])

  const save = useMutation({
    mutationFn: authApi.update,
    onSuccess: (updated) => {
      applyUser(updated)
      // Currency changes every formatted figure in the app.
      queryClient.invalidateQueries()
      toast.success('Profile saved')
    },
    onError: (e) => toast.error('Could not save', apiError(e)),
  })

  const [passwordOpen, setPasswordOpen] = useState(false)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Your details" icon={UserIcon} />
        <div className="space-y-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </Field>

          <Field label="Email" hint="Your sign-in address can't be changed here yet.">
            <input value={user?.email ?? ''} disabled className="input opacity-60" />
          </Field>

          <Field
            label="Currency"
            hint="Changes how every amount is formatted. It does not convert your existing data."
          >
            <select
              className="select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>

          <Field
            label="Monthly take-home (optional)"
            hint="Used to suggest budgets when your income is irregular or not yet visible in the imported history."
          >
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="185000"
              className="input tnum"
            />
          </Field>

          <Field
            label={`Emergency fund target: ${months} months`}
            hint="How many months of expenses you want in reserve. Feeds the health score."
          >
            <input
              type="range"
              min={1}
              max={12}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full accent-[rgb(var(--c-brand))]"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end border-t border-hairline pt-4">
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => save.mutate({
              name: name.trim(),
              currency,
              locale: CURRENCIES.find((c) => c.code === currency)?.locale,
              monthly_income_target: income ? Number(income) : null,
              emergency_fund_months: months,
            })}
          >
            Save changes
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Security" icon={KeyRound} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Member since {user ? formatDate(user.created_at) : '—'}. Passwords are hashed with
            PBKDF2-SHA256 at 260,000 iterations.
          </p>
          <Button onClick={() => setPasswordOpen(true)}>Change password</Button>
        </div>
      </Card>

      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  )
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    if (open) {
      setCurrent('')
      setNext('')
      setConfirm('')
    }
  }, [open])

  const change = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      toast.success('Password changed')
      onClose()
    },
    onError: (e) => toast.error('Could not change password', apiError(e)),
  })

  const mismatch = confirm.length > 0 && next !== confirm
  const valid = current.length > 0 && next.length >= 8 && next === confirm

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={change.isPending}
            onClick={() => change.mutate({ current_password: current, new_password: next })}
          >
            Update password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Current password" required>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="input"
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" hint="At least 8 characters." required>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="input"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password" error={mismatch ? "Passwords don't match" : undefined} required>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
            autoComplete="new-password"
          />
        </Field>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------- Rules */

function RulesTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)

  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: ruleApi.list })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: transactionApi.categories,
    staleTime: Infinity,
  })

  const create = useMutation({
    mutationFn: ruleApi.create,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
      setOpen(false)
      toast.success(
        'Rule created',
        res.applied > 0
          ? `${res.applied} existing transactions were recategorized.`
          : 'It will apply to future imports.',
      )
    },
    onError: (e) => toast.error('Could not create rule', apiError(e)),
  })

  const remove = useMutation({
    mutationFn: ruleApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Rule removed')
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Categorization rules"
          icon={Wand2}
          subtitle="Your rules beat both the AI and the keyword engine, on every import"
          action={<Button size="sm" icon={Plus} onClick={() => setOpen(true)}>New rule</Button>}
        />

        {!rules?.length ? (
          <EmptyState
            compact
            icon={Wand2}
            title="No rules yet"
            body="When you recategorize a transaction you can tick 'remember this' — that creates a rule here. Or write one directly."
            action={<Button className="mt-3" size="sm" onClick={() => setOpen(true)}>Create a rule</Button>}
          />
        ) : (
          <ul className="divide-y divide-[rgb(var(--c-hairline))]">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center gap-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted">
                      {rule.match_type === 'regex' ? 'matches' : rule.match_type}
                    </span>
                    <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-strong">
                      {rule.pattern}
                    </code>
                    <span className="text-muted">→</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: `${categoryColor(rule.category)}1f`,
                        color: categoryColor(rule.category),
                      }}
                    >
                      {rule.category}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-2xs text-faint">
                    Applied {rule.hits} time{rule.hits === 1 ? '' : 's'} · created{' '}
                    {formatDate(rule.created_at, 'short')}
                  </span>
                </span>
                <button
                  onClick={() => remove.mutate(rule.id)}
                  aria-label="Delete rule"
                  className="rounded-lg p-2 text-faint transition-colors hover:bg-negative/10 hover:text-negative"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-dashed !p-4">
        <p className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>
            Rules are checked before anything else during an import, so a merchant you've
            corrected once stays corrected forever — including on re-imports. Creating a rule
            also fixes matching transactions already in your history, except ones you
            categorized by hand.
          </span>
        </p>
      </Card>

      <RuleModal
        open={open}
        categories={categories ?? []}
        loading={create.isPending}
        onClose={() => setOpen(false)}
        onCreate={(data) => create.mutate(data)}
      />
    </div>
  )
}

function RuleModal({
  open, categories, loading, onClose, onCreate,
}: {
  open: boolean
  categories: string[]
  loading: boolean
  onClose: () => void
  onCreate: (data: {
    pattern: string; category: string; match_type: string; backfill: boolean
  }) => void
}) {
  const [pattern, setPattern] = useState('')
  const [category, setCategory] = useState(categories[0] ?? 'Miscellaneous')
  const [matchType, setMatchType] = useState('contains')
  const [backfill, setBackfill] = useState(true)

  useEffect(() => {
    if (open) {
      setPattern('')
      setMatchType('contains')
      setBackfill(true)
    }
  }, [open])

  const { data: suggestions } = useQuery({
    queryKey: ['merchants', pattern],
    queryFn: () => transactionApi.merchants(pattern),
    enabled: open && pattern.length >= 2,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New categorization rule"
      description="When a transaction's narration matches, force this category."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={pattern.trim().length < 2}
            onClick={() => onCreate({
              pattern: pattern.trim(), category, match_type: matchType, backfill,
            })}
          >
            Create rule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Match type">
          <select className="select" value={matchType} onChange={(e) => setMatchType(e.target.value)}>
            <option value="contains">Description contains…</option>
            <option value="equals">Description is exactly…</option>
            <option value="regex">Matches regular expression…</option>
          </select>
        </Field>

        <Field label="Pattern" hint="Case-insensitive. Merchant names work well." required>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="SWIGGY"
            className="input font-mono"
            autoFocus
          />
        </Field>

        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 6).map((merchant) => (
              <button
                key={merchant}
                onClick={() => setPattern(merchant)}
                className="rounded-lg border border-hairline px-2 py-1 text-2xs text-muted
                  transition-colors hover:border-brand/40 hover:text-brand"
              >
                {merchant}
              </button>
            ))}
          </div>
        )}

        <Field label="Category">
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={backfill}
            onChange={(e) => setBackfill(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-[rgb(var(--c-brand))]"
          />
          <span className="text-xs leading-relaxed text-body">
            <span className="block font-semibold text-strong">Apply to existing transactions</span>
            Recategorizes matching history immediately. Transactions you set by hand are left alone.
          </span>
        </label>
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------------- Appearance */

function AppearanceTab() {
  const { choice, setChoice, resolved } = useTheme()
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: metaApi.health })

  const options = [
    { value: 'light' as const, icon: Sun, label: 'Light', blurb: 'Bright, high-contrast' },
    { value: 'dark' as const, icon: Moon, label: 'Dark', blurb: 'Easier at night' },
    { value: 'system' as const, icon: Monitor, label: 'System', blurb: 'Follow your OS' },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Theme" icon={Palette} subtitle={`Currently rendering in ${resolved}`} />
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => setChoice(option.value)}
              className={cn(
                'relative rounded-xl border p-4 text-left transition-all',
                choice === option.value
                  ? 'border-brand bg-brand/[0.06] shadow-glow'
                  : 'border-hairline hover:border-brand/40',
              )}
            >
              {choice === option.value && (
                <Check className="absolute right-3 top-3 h-4 w-4 text-brand" />
              )}
              <option.icon className={cn('mb-2.5 h-5 w-5',
                choice === option.value ? 'text-brand' : 'text-muted')} />
              <p className="text-sm font-semibold text-strong">{option.label}</p>
              <p className="mt-0.5 text-xs text-muted">{option.blurb}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="System status" icon={Sparkles} />
        <dl className="divide-y divide-[rgb(var(--c-hairline))] text-sm">
          {[
            {
              label: 'AI categorization & chat',
              value: meta?.ai_online
                ? <Badge tone="violet" icon={Sparkles}>Online — {meta.models.main}</Badge>
                : <Badge tone="neutral">Offline — local engines</Badge>,
              hint: meta?.ai_online
                ? 'Transactions are classified by Gemini, with the keyword engine as backup.'
                : 'Set GEMINI_API_KEY on the API to enable AI categorization and conversation. Everything works without it.',
            },
            {
              label: 'PDF export',
              value: meta?.pdf_export
                ? <Badge tone="positive" icon={Check}>Available</Badge>
                : <Badge tone="warning">reportlab not installed</Badge>,
              hint: 'Powers the monthly and annual reports on the Reports page.',
            },
            {
              label: 'API version',
              value: <span className="font-mono text-xs text-muted">{meta?.version ?? '—'}</span>,
              hint: `Running in ${meta?.environment ?? 'unknown'} mode.`,
            },
          ].map((row) => (
            <div key={row.label} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <dt className="font-medium text-strong">{row.label}</dt>
                <dd className="mt-0.5 max-w-lg text-xs leading-relaxed text-muted">{row.hint}</dd>
              </div>
              {row.value}
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}

/* --------------------------------------------------------------------- Data */

function DataTab() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const wipe = useMutation({
    mutationFn: authApi.deleteData,
    onSuccess: () => {
      queryClient.invalidateQueries()
      setConfirmWipe(false)
      toast.success('Financial data cleared', 'Your account is intact — import when you\'re ready.')
      navigate('/dashboard')
    },
    onError: (e) => toast.error('Could not clear data', apiError(e)),
  })

  const destroy = useMutation({
    mutationFn: authApi.deleteAccount,
    onSuccess: () => {
      logout()
      navigate('/')
    },
    onError: (e) => toast.error('Could not delete account', apiError(e)),
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Export your data"
          icon={Download}
          subtitle="Portability shouldn't require a support ticket"
        />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-lg text-sm text-muted">
            A single JSON archive containing your profile, every statement, every transaction with
            its notes and tags, your budgets, goals and the computed analytics.
          </p>
          <Button icon={Download} onClick={() => reportApi.fullExport()}>
            Download archive
          </Button>
        </div>
      </Card>

      <Card className="border-negative/25">
        <CardHeader title="Danger zone" icon={AlertTriangle} />
        <div className="divide-y divide-[rgb(var(--c-hairline))]">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
            <div className="max-w-lg">
              <p className="text-sm font-semibold text-strong">Clear all financial data</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Deletes every statement, transaction, insight, budget, goal and rule — but keeps
                your account and password. Useful for starting a clean import.
              </p>
            </div>
            <Button variant="danger" onClick={() => setConfirmWipe(true)}>Clear data</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
            <div className="max-w-lg">
              <p className="text-sm font-semibold text-strong">Delete account</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Permanently removes your account and everything in it. This cannot be undone —
                export your archive first if you might want it.
              </p>
            </div>
            <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        onConfirm={() => wipe.mutate()}
        loading={wipe.isPending}
        danger
        title="Clear all financial data?"
        confirmLabel="Yes, clear everything"
        body="Every statement, transaction, budget, goal, rule and insight will be deleted. Your login stays active. This cannot be undone."
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => destroy.mutate()}
        loading={destroy.isPending}
        danger
        title="Delete your account?"
        confirmLabel="Delete permanently"
        body="Your account and all associated data will be permanently erased. There is no recovery."
      />
    </div>
  )
}
