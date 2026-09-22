import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight, ArrowRight, BarChart3, CornerDownLeft, FileText, Import,
  LayoutDashboard, Lightbulb, Moon, PiggyBank, Receipt, Search, Settings,
  Sparkles, Sun, Target, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react'
import { transactionApi } from '../lib/api'
import { useTheme } from '../context/ThemeContext'
import { cn, formatDate, formatMoney } from '../lib/utils'

interface Command {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  group: string
  keywords?: string
  run: () => void
}

/**
 * ⌘K palette: navigation, actions and a live transaction search in one box.
 *
 * The transaction query is debounced and only fires past two characters —
 * typing "d" shouldn't cost a round trip, and the navigation results are
 * usually what someone wants after one keystroke anyway.
 */
export default function CommandPalette({
  open, onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { resolved, toggle } = useTheme()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // The dialog animates in; focus after the frame so it isn't stolen back.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 180)
    return () => clearTimeout(timer)
  }, [query])

  const { data: matches } = useQuery({
    queryKey: ['palette-search', debounced],
    queryFn: () => transactionApi.list({ search: debounced, page_size: 5 }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  })

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path)
      onClose()
    }
    return [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Go to', run: go('/dashboard'), keywords: 'home overview' },
      { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, group: 'Go to', run: go('/transactions'), keywords: 'ledger list' },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Go to', run: go('/analytics'), keywords: 'charts trends monthly yearly' },
      { id: 'budgets', label: 'Budgets', icon: Wallet, group: 'Go to', run: go('/budgets'), keywords: 'limits caps spending plan' },
      { id: 'goals', label: 'Goals', icon: Target, group: 'Go to', run: go('/goals'), keywords: 'savings targets' },
      { id: 'subscriptions', label: 'Subscriptions', icon: Receipt, group: 'Go to', run: go('/subscriptions'), keywords: 'recurring bills renewals' },
      { id: 'forecast', label: 'Forecast', icon: TrendingUp, group: 'Go to', run: go('/forecast'), keywords: 'projection cash flow future runway' },
      { id: 'insights', label: 'Insights', icon: Lightbulb, group: 'Go to', run: go('/insights'), keywords: 'alerts findings' },
      { id: 'assistant', label: 'AI Assistant', icon: Sparkles, group: 'Go to', run: go('/assistant'), keywords: 'chat ask question' },
      { id: 'reports', label: 'Reports', icon: FileText, group: 'Go to', run: go('/reports'), keywords: 'export pdf csv download' },
      { id: 'import', label: 'Import statement', icon: Import, group: 'Actions', run: go('/import'), keywords: 'upload csv pdf bank add data' },
      { id: 'settings', label: 'Settings', icon: Settings, group: 'Go to', run: go('/settings'), keywords: 'preferences profile currency rules account' },
      {
        id: 'theme',
        label: resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: resolved === 'dark' ? Sun : Moon,
        group: 'Actions',
        keywords: 'dark light mode appearance',
        run: () => {
          toggle()
          onClose()
        },
      },
      {
        id: 'anomalies',
        label: 'Review flagged transactions',
        icon: Lightbulb,
        group: 'Actions',
        keywords: 'anomaly unusual suspicious',
        run: go('/transactions?flag=anomaly'),
      },
      {
        id: 'recurring',
        label: 'Show recurring payments',
        icon: PiggyBank,
        group: 'Actions',
        keywords: 'subscriptions repeat',
        run: go('/transactions?flag=recurring'),
      },
    ]
  }, [navigate, onClose, resolved, toggle])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter((c) =>
      c.label.toLowerCase().includes(needle) || c.keywords?.includes(needle))
  }, [commands, query])

  const txnResults = matches?.items ?? []
  const totalItems = filtered.length + txnResults.length

  useEffect(() => {
    setActive(0)
  }, [query])

  // Keep the highlighted row inside the scroll viewport during arrow nav.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const runAt = (index: number) => {
    if (index < filtered.length) {
      filtered[index].run()
      return
    }
    const txn = txnResults[index - filtered.length]
    if (txn) {
      navigate(`/transactions?search=${encodeURIComponent(txn.merchant || txn.description)}`)
      onClose()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % Math.max(totalItems, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + totalItems) % Math.max(totalItems, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runAt(active)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, { command: Command; index: number }[]>()
    filtered.forEach((command, index) => {
      const list = map.get(command.group) ?? []
      list.push({ command, index })
      map.set(command.group, list)
    })
    return [...map.entries()]
  }, [filtered])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-canvas/75 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-hairline
              bg-overlay shadow-xl"
          >
            <div className="flex items-center gap-3 border-b border-hairline px-4">
              <Search className="h-4 w-4 shrink-0 text-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search pages, actions and transactions…"
                className="w-full bg-transparent py-4 text-sm text-strong outline-none placeholder:text-faint"
                aria-label="Command palette search"
              />
              <kbd className="hidden shrink-0 rounded border border-hairline px-1.5 py-0.5
                text-2xs font-medium text-faint sm:block">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
              {totalItems === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted">
                  No matches for “{query}”.
                </p>
              )}

              {groups.map(([group, entries]) => (
                <div key={group} className="mb-1">
                  <p className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
                    {group}
                  </p>
                  {entries.map(({ command, index }) => (
                    <button
                      key={command.id}
                      data-active={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => runAt(index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        index === active ? 'bg-brand/10 text-strong' : 'text-body hover:bg-raised',
                      )}
                    >
                      <command.icon className={cn('h-4 w-4 shrink-0',
                        index === active ? 'text-brand' : 'text-muted')} />
                      <span className="flex-1 truncate">{command.label}</span>
                      {index === active && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" />
                      )}
                    </button>
                  ))}
                </div>
              ))}

              {txnResults.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
                    Transactions
                  </p>
                  {txnResults.map((txn, i) => {
                    const index = filtered.length + i
                    return (
                      <button
                        key={txn.id}
                        data-active={index === active}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => runAt(index)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          index === active ? 'bg-brand/10' : 'hover:bg-raised',
                        )}
                      >
                        <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-strong">
                            {txn.merchant || txn.description}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {txn.category} · {formatDate(txn.date, 'short')}
                          </span>
                        </span>
                        <span className={cn('tnum shrink-0 text-sm font-semibold',
                          txn.amount > 0 ? 'text-positive' : 'text-body')}>
                          {formatMoney(txn.amount)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-hairline
              px-4 py-2.5 text-2xs text-faint">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-hairline px-1">↑</kbd>
                  <kbd className="rounded border border-hairline px-1">↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-hairline px-1">↵</kbd>
                  select
                </span>
              </span>
              <span className="flex items-center gap-1">
                Search everything <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
