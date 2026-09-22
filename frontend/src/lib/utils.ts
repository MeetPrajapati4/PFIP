import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/*
 * Currency formatting is user-configurable, so the formatters are built on
 * demand and memoised rather than fixed at module load. `Intl` constructors
 * are expensive enough that re-creating one per table cell shows up in a
 * profile of a 200-row ledger.
 */
let currentCurrency = 'INR'
let currentLocale = 'en-IN'
const cache = new Map<string, Intl.NumberFormat>()

export function configureCurrency(currency?: string | null, locale?: string | null) {
  currentCurrency = currency || 'INR'
  currentLocale = locale || (currentCurrency === 'INR' ? 'en-IN' : 'en-US')
  cache.clear()
}

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${currentLocale}|${currentCurrency}|${key}`
  let found = cache.get(cacheKey)
  if (!found) {
    found = new Intl.NumberFormat(currentLocale, {
      style: 'currency',
      currency: currentCurrency,
      ...options,
    })
    cache.set(cacheKey, found)
  }
  return found
}

export function currencySymbol(): string {
  const parts = formatter('sym', { maximumFractionDigits: 0 }).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value ?? '₹'
}

export function formatMoney(value: number, precise = false): string {
  return formatter(precise ? 'precise' : 'round', {
    maximumFractionDigits: precise ? 2 : 0,
    minimumFractionDigits: precise ? 2 : 0,
  }).format(value)
}

/** Signed, with an explicit + for credits — direction matters more than magnitude. */
export function formatSigned(value: number, precise = false): string {
  const formatted = formatMoney(Math.abs(value), precise)
  return `${value < 0 ? '−' : '+'}${formatted}`
}

/**
 * Compact notation for axis ticks and stat tiles. Indian numbering uses
 * lakh/crore, which `Intl`'s `compact` mode gets wrong for en-IN in several
 * browsers, so that path is written out explicitly.
 */
export function formatCompact(value: number): string {
  const symbol = currencySymbol()
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (currentCurrency === 'INR') {
    if (abs >= 1_00_00_000) return `${sign}${symbol}${(abs / 1_00_00_000).toFixed(abs >= 10_00_00_000 ? 0 : 1)}Cr`
    if (abs >= 1_00_000) return `${sign}${symbol}${(abs / 1_00_000).toFixed(abs >= 10_00_000 ? 0 : 1)}L`
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
    return `${sign}${symbol}${abs.toFixed(0)}`
  }
  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`
  return `${sign}${symbol}${abs.toFixed(0)}`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(currentLocale).format(value)
}

export function formatPercent(value: number, digits = 0): string {
  return `${value >= 0 ? '' : '−'}${Math.abs(value).toFixed(digits)}%`
}

/** Parse a YYYY-MM-DD as local time; `new Date('2026-01-01')` is UTC and drifts. */
export function parseDate(iso: string): Date {
  if (iso.length === 10) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(iso)
}

export function formatDate(iso: string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const date = parseDate(iso)
  if (style === 'short') {
    return date.toLocaleDateString(currentLocale, { day: 'numeric', month: 'short' })
  }
  if (style === 'long') {
    return date.toLocaleDateString(currentLocale, {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    })
  }
  return date.toLocaleDateString(currentLocale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(currentLocale, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

/** "3 days ago" / "in 2 weeks" — relative time reads faster than a date. */
export function formatRelative(iso: string): string {
  const target = parseDate(iso).getTime()
  const days = Math.round((target - Date.now()) / 86_400_000)
  const rtf = new Intl.RelativeTimeFormat(currentLocale, { numeric: 'auto' })
  if (Math.abs(days) < 1) return 'today'
  if (Math.abs(days) < 31) return rtf.format(days, 'day')
  if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month')
  return rtf.format(Math.round(days / 365), 'year')
}

/** Accepts YYYY-MM and YYYY-MM-DD; returns "Mar 2026" or "12 Mar". */
export function formatMonth(value: string): string {
  const [y, m, d] = value.split('-').map(Number)
  if (d) return new Date(y, m - 1, d).toLocaleDateString(currentLocale, { day: 'numeric', month: 'short' })
  return new Date(y, m - 1, 1).toLocaleDateString(currentLocale, { month: 'short', year: 'numeric' })
}

export function formatMonthLong(value: string): string {
  const [y, m] = value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/*
 * Category colours are assigned by hand rather than generated, so related
 * categories sit in related hues (all food is warm, all transport is blue) and
 * no two adjacent slices of a typical donut collide. Both themes read the same
 * hues because these are chosen to clear contrast on either canvas.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  Salary: '#0d946a',
  'Business Income': '#14b88a',
  Refunds: '#34d399',

  'Food & Dining': '#f0913a',
  Groceries: '#84cc16',
  Shopping: '#ec4899',
  Entertainment: '#d946ef',
  Travel: '#38bdf8',
  'Personal Care': '#fb7185',

  Transportation: '#3b82f6',
  Utilities: '#0ea5e9',
  Rent: '#8b5cf6',
  Insurance: '#a78bfa',
  Subscriptions: '#f472b6',

  Investments: '#06b6d4',
  'Loan Payments': '#f97316',
  Taxes: '#78716c',
  'Fees & Charges': '#ef4444',

  Healthcare: '#e11d48',
  Education: '#eab308',
  Childcare: '#facc15',
  Pets: '#a3a3a3',
  'Gifts & Donations': '#c084fc',

  'Cash Withdrawal': '#94a3b8',
  Transfers: '#64748b',
  Miscellaneous: '#71717a',
}

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#71717a'
}

/** Deterministic hue for anything without a curated colour (merchants, tags). */
export function hashColor(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0
  const palette = [
    '#0d946a', '#3b82f6', '#8b5cf6', '#ec4899', '#f0913a',
    '#06b6d4', '#84cc16', '#f43f5e', '#a78bfa', '#0ea5e9',
  ]
  return palette[Math.abs(hash) % palette.length]
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
