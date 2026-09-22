import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef,
  useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'

/* -------------------------------------------------------------------------
 * Surfaces
 * ---------------------------------------------------------------------- */

export function Card({
  children, className, delay = 0, hover = false, ...rest
}: {
  children: ReactNode
  className?: string
  delay?: number
  hover?: boolean
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn('card p-5', hover && 'card-hover', className)}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </motion.div>
  )
}

export function CardHeader({
  title, subtitle, action, icon: Icon, className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-strong">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title, subtitle, actions, children,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-strong lg:text-[1.75rem]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/* -------------------------------------------------------------------------
 * Buttons & controls
 * ---------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary', size = 'md', loading = false, icon: Icon, children, className,
  ...props
}: {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: LucideIcon
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  }
  return (
    <button
      className={cn(variants[variant], size === 'sm' && 'btn-sm', className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn('animate-spin', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      ) : (
        Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      )}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon, label, tone = 'default', className, ...props
}: {
  icon: LucideIcon
  label: string
  tone?: 'default' | 'danger'
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip content={label}>
      <button
        aria-label={label}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors',
          tone === 'danger'
            ? 'hover:bg-negative/10 hover:text-negative'
            : 'hover:bg-raised hover:text-strong',
          className,
        )}
        {...props}
      >
        <Icon className="h-4 w-4" />
      </button>
    </Tooltip>
  )
}

export function SegmentedControl<T extends string>({
  options, value, onChange, size = 'md',
}: {
  options: { value: T; label: ReactNode; icon?: LucideIcon }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  const groupId = useId()
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-0.5 rounded-xl border border-hairline bg-raised p-1"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex items-center gap-1.5 rounded-lg font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'text-strong' : 'text-muted hover:text-body',
            )}
          >
            {active && (
              <motion.span
                layoutId={`segment-${groupId}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-xs"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.icon && <option.icon className="h-3.5 w-3.5" />}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Field({
  label, hint, error, children, required,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-negative">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-negative">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-faint">{hint}</span>
      ) : null}
    </label>
  )
}

/* -------------------------------------------------------------------------
 * Display
 * ---------------------------------------------------------------------- */

const badgeTones = {
  brand: 'border-brand/25 bg-brand/10 text-brand',
  positive: 'border-positive/25 bg-positive/10 text-positive',
  negative: 'border-negative/25 bg-negative/10 text-negative',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  info: 'border-info/25 bg-info/10 text-info',
  violet: 'border-violet/25 bg-violet/10 text-violet',
  neutral: 'border-hairline bg-raised text-muted',
} as const

export type BadgeTone = keyof typeof badgeTones

export function Badge({
  children, tone = 'neutral', className, icon: Icon,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
  icon?: LucideIcon
}) {
  return (
    <span className={cn('chip', badgeTones[tone], className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}

export function Progress({
  value, tone = 'brand', className, showTrack = true, height = 'md',
}: {
  value: number
  tone?: BadgeTone
  className?: string
  showTrack?: boolean
  height?: 'sm' | 'md' | 'lg'
}) {
  const fills: Record<BadgeTone, string> = {
    brand: 'bg-brand',
    positive: 'bg-positive',
    negative: 'bg-negative',
    warning: 'bg-warning',
    info: 'bg-info',
    violet: 'bg-violet',
    neutral: 'bg-muted',
  }
  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' }
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full', heights[height],
        showTrack && 'bg-raised', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cn('h-full rounded-full', fills[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}

export function EmptyState({
  icon: Icon, title, body, action, compact = false,
}: {
  icon: LucideIcon
  title: string
  body: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-hairline text-center',
        compact ? 'px-4 py-8' : 'px-6 py-16',
      )}
    >
      <div className={cn(
        'mb-4 flex items-center justify-center rounded-2xl bg-brand/10',
        compact ? 'h-10 w-10' : 'h-14 w-14',
      )}>
        <Icon className={cn('text-brand', compact ? 'h-5 w-5' : 'h-7 w-7')} />
      </div>
      <h3 className={cn('font-display font-semibold text-strong', compact ? 'text-sm' : 'text-lg')}>
        {title}
      </h3>
      <p className={cn('mt-1 max-w-sm text-muted', compact ? 'text-xs' : 'mb-5 text-sm')}>{body}</p>
      {action}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand', className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------
 * Tooltip — portalled so it escapes overflow-hidden ancestors
 * ---------------------------------------------------------------------- */

export function Tooltip({
  content, children, side = 'top',
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  const show = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setCoords({
      x: rect.left + rect.width / 2,
      y: side === 'top' ? rect.top - 8 : rect.bottom + 8,
    })
    setOpen(true)
  }

  if (!content) return <>{children}</>

  return (
    <>
      <span
        ref={ref}
        className="contents"
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            role="tooltip"
            style={{
              left: coords.x,
              top: coords.y,
              transform: `translate(-50%, ${side === 'top' ? '-100%' : '0'})`,
            }}
            className="pointer-events-none fixed z-[100] max-w-xs animate-fade-in rounded-lg border
              border-hairline bg-overlay px-2.5 py-1.5 text-xs font-medium text-strong shadow-lg"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  )
}

/* -------------------------------------------------------------------------
 * Modal
 * ---------------------------------------------------------------------- */

export function Modal({
  open, onClose, title, description, children, footer, size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Locking scroll stops the page drifting behind the dialog on mobile.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative w-full rounded-t-3xl border border-hairline bg-surface shadow-xl sm:rounded-2xl',
              widths[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-hairline p-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-strong">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <IconButton icon={X} label="Close" onClick={onClose} />
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-5">{children}</div>
            {footer && (
              <div className="flex justify-end gap-2 border-t border-hairline p-4">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger = false, loading = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-body">{body}</p>
    </Modal>
  )
}

/* -------------------------------------------------------------------------
 * Toasts
 * ---------------------------------------------------------------------- */

type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: number
  kind: ToastKind
  message: string
  description?: string
}

interface ToastApi {
  success: (message: string, description?: string) => void
  error: (message: string, description?: string) => void
  info: (message: string, description?: string) => void
  warning: (message: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const TOAST_ICONS: Record<ToastKind, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const TOAST_TONES: Record<ToastKind, string> = {
  success: 'text-positive',
  error: 'text-negative',
  info: 'text-info',
  warning: 'text-warning',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const push = useCallback((kind: ToastKind, message: string, description?: string) => {
    const id = ++counter.current
    setToasts((current) => [...current, { id, kind, message, description }])
    // Errors linger — they usually need reading, not just noticing.
    const ttl = kind === 'error' ? 7000 : 4000
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), ttl)
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (m, d) => push('success', m, d),
    error: (m, d) => push('error', m, d),
    info: (m, d) => push('info', m, d),
    warning: (m, d) => push('warning', m, d),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
        >
          <AnimatePresence initial={false}>
            {toasts.map((toast) => {
              const Icon = TOAST_ICONS[toast.kind]
              return (
                <motion.div
                  key={toast.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.96 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-auto flex items-start gap-3 rounded-xl border border-hairline
                    bg-overlay p-3.5 shadow-lg"
                >
                  <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', TOAST_TONES[toast.kind])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-strong">{toast.message}</p>
                    {toast.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{toast.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setToasts((c) => c.filter((t) => t.id !== toast.id))}
                    aria-label="Dismiss"
                    className="shrink-0 rounded p-0.5 text-faint transition-colors hover:text-strong"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
