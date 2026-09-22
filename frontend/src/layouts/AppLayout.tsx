import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight, BarChart3, Bell, ChevronDown, FileText, Import, LayoutDashboard,
  Lightbulb, LogOut, Menu, Monitor, Moon, Receipt, Search, Settings, Sparkles, Sun,
  Target, TrendingUp, Wallet, X, type LucideIcon,
} from 'lucide-react'
import { Logo, LogoMark } from '../components/Logo'
import CommandPalette from '../components/CommandPalette'
import ErrorBoundary from '../components/ErrorBoundary'
import { Badge, Tooltip } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { insightApi, metaApi } from '../lib/api'
import { cn, initials } from '../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: number
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/forecast', label: 'Forecast', icon: TrendingUp },
    ],
  },
  {
    title: 'Manage',
    items: [
      { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
      { to: '/budgets', label: 'Budgets', icon: Wallet },
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/subscriptions', label: 'Subscriptions', icon: Receipt },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { to: '/insights', label: 'Insights', icon: Lightbulb },
      { to: '/assistant', label: 'Assistant', icon: Sparkles },
      { to: '/reports', label: 'Reports', icon: FileText },
    ],
  },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { choice, resolved, setChoice } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { data: insights } = useQuery({
    queryKey: ['insights'],
    queryFn: insightApi.list,
    staleTime: 60_000,
  })
  const { data: meta } = useQuery({
    queryKey: ['meta'],
    queryFn: metaApi.health,
    staleTime: 5 * 60_000,
  })

  const alertCount = (insights ?? []).filter((i) => i.severity === 'warning').length

  // ⌘K / Ctrl-K from anywhere, and "/" when not already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      const target = e.target as HTMLElement | null
      const typing = target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const navigation = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-2xs font-semibold uppercase tracking-[0.09em] text-faint">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand/10 text-brand'
                      : 'text-muted hover:bg-raised hover:text-strong',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-indicator"
                        className="absolute -left-3 h-5 w-1 rounded-r-full bg-brand"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1">{label}</span>
                    {to === '/insights' && alertCount > 0 && (
                      <span className="tnum flex h-5 min-w-[20px] items-center justify-center
                        rounded-full bg-warning/15 px-1.5 text-2xs font-bold text-warning">
                        {alertCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  const importLink = (
    <NavLink
      to="/import"
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-sm font-semibold transition-colors',
          isActive
            ? 'border-brand/50 bg-brand/10 text-brand'
            : 'border-hairline text-muted hover:border-brand/40 hover:text-brand',
        )
      }
    >
      <Import className="h-[18px] w-[18px]" />
      Import statement
    </NavLink>
  )

  const themeOptions = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ]

  return (
    <div className="min-h-screen bg-canvas">
      {/* ------------------------------------------------ Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col gap-6 border-r
        border-hairline bg-surface px-4 py-5 lg:flex">
        <div className="px-1">
          <Logo />
        </div>
        {navigation}
        <div className="space-y-3">
          {importLink}
          <div className="border-t border-hairline pt-3">
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-raised"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                  bg-gradient-to-br from-brand to-info text-xs font-bold text-brand-contrast">
                  {initials(user?.name ?? 'U')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-strong">{user?.name}</span>
                  <span className="block truncate text-xs text-muted">{user?.email}</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-faint transition-transform',
                  menuOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-xl
                      border border-hairline bg-overlay p-1.5 shadow-lg"
                  >
                    <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-faint">
                      Theme
                    </p>
                    <div className="mb-1 flex gap-1 px-1 pb-1">
                      {themeOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setChoice(option.value)}
                          className={cn(
                            'flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-2xs font-medium transition-colors',
                            choice === option.value
                              ? 'bg-brand/10 text-brand'
                              : 'text-muted hover:bg-raised',
                          )}
                        >
                          <option.icon className="h-3.5 w-3.5" />
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => navigate('/settings')}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm
                        text-body transition-colors hover:bg-raised"
                    >
                      <Settings className="h-4 w-4" /> Settings
                    </button>
                    <button
                      onClick={() => {
                        logout()
                        navigate('/')
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm
                        text-body transition-colors hover:bg-negative/10 hover:text-negative"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------- Top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b
        border-hairline bg-surface/85 px-4 backdrop-blur-xl lg:left-[248px] lg:px-6">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-strong lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="lg:hidden">
          <LogoMark className="h-7 w-7" />
        </span>

        <button
          onClick={() => setPaletteOpen(true)}
          className="group ml-auto flex h-9 items-center gap-2 rounded-xl border border-hairline
            bg-raised px-3 text-sm text-muted transition-colors hover:border-brand/40 hover:text-body
            lg:ml-0 lg:w-full lg:max-w-sm"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden flex-1 text-left sm:block">Search or jump to…</span>
          <kbd className="ml-auto hidden shrink-0 rounded border border-hairline bg-surface px-1.5
            py-0.5 text-2xs font-medium sm:block">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {meta && (
            <Tooltip
              content={meta.ai_online
                ? `AI online · ${meta.models.main}`
                : 'AI offline — running on local engines'}
            >
              <span className="hidden sm:block">
                <Badge tone={meta.ai_online ? 'violet' : 'neutral'} icon={Sparkles}>
                  {meta.ai_online ? 'AI' : 'Local'}
                </Badge>
              </span>
            </Tooltip>
          )}
          <Tooltip content={`${alertCount} item${alertCount === 1 ? '' : 's'} need attention`}>
            <button
              onClick={() => navigate('/insights')}
              aria-label="Insights"
              className="relative rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-strong"
            >
              <Bell className="h-[18px] w-[18px]" />
              {alertCount > 0 && (
                <>
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning" />
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse-ring rounded-full bg-warning" />
                </>
              )}
            </button>
          </Tooltip>
          <button
            onClick={() => setChoice(resolved === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-strong"
          >
            {resolved === 'dark'
              ? <Sun className="h-[18px] w-[18px]" />
              : <Moon className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </header>

      {/* -------------------------------------------------- Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="relative flex h-full w-[270px] flex-col gap-5 border-r border-hairline
                bg-surface px-4 py-5"
            >
              <div className="flex items-center justify-between">
                <Logo />
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-lg p-2 text-muted hover:bg-raised"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {navigation}
              <div className="space-y-2">
                {importLink}
                <button
                  onClick={() => navigate('/settings')}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm
                    font-medium text-muted hover:bg-raised hover:text-strong"
                >
                  <Settings className="h-[18px] w-[18px]" /> Settings
                </button>
                <button
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm
                    font-medium text-muted hover:bg-negative/10 hover:text-negative"
                >
                  <LogOut className="h-[18px] w-[18px]" /> Sign out
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main className="px-4 pb-16 pt-20 lg:ml-[248px] lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
