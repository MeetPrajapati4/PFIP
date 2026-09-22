import axios from 'axios'
import type {
  AuthResponse, BudgetOut, BudgetReport, BudgetSuggestion, CalendarDay, CategoryRule,
  ChatMessage, ChatMeta, Forecast, GoalReport, HealthMeta, HealthScore, Insight,
  MonthlyAnalytics, Overview, Statement, SubscriptionReport, Transaction,
  TransactionPage, User, YearlyAnalytics,
} from './types'
import { downloadBlob } from './utils'

const TOKEN_KEY = 'pfip_token'

export const api = axios.create({ baseURL: '/api', timeout: 60_000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // An expired token should return the user to the door, but a failed login
    // attempt is a message to display, not a redirect.
    const isAuthRoute = error.config?.url?.includes('/auth/login') ||
      error.config?.url?.includes('/auth/register')
    if (error.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1'
      }
    }
    return Promise.reject(error)
  },
)

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function hasToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY))
}

export function apiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'That request timed out. Please try again.'
    if (!error.response) return 'Cannot reach the server. Is the backend running?'
    const detail = error.response.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d) => d.msg ?? String(d)).join('; ')
    if (error.response.status === 429) return 'Too many requests — please slow down.'
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

/** Authenticated download for routes the browser navigates to directly. */
function tokenUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v))
  })
  const token = getToken()
  if (token) search.set('token', token)
  return `/api${path}?${search.toString()}`
}

// ---------- Meta ----------
export const metaApi = {
  health: () => api.get<HealthMeta>('/health').then((r) => r.data),
}

// ---------- Auth ----------
export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post<AuthResponse>('/auth/register', data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', data).then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  update: (data: Partial<Pick<User, 'name' | 'currency' | 'locale' | 'monthly_income_target'
    | 'emergency_fund_months'>> & { mark_onboarded?: boolean }) =>
    api.patch<User>('/auth/me', data).then((r) => r.data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/password', data),
  deleteData: () => api.delete('/auth/me/data'),
  deleteAccount: () => api.delete('/auth/me'),
}

// ---------- Statements ----------
export const statementApi = {
  list: () => api.get<Statement[]>('/statements').then((r) => r.data),
  get: (id: number) => api.get<Statement>(`/statements/${id}`).then((r) => r.data),
  upload: (file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<Statement>('/statements/upload', form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      .then((r) => r.data)
  },
  remove: (id: number) => api.delete(`/statements/${id}`),
}

// ---------- Transactions ----------
export interface TxnFilters {
  month?: string
  date_from?: string
  date_to?: string
  category?: string
  search?: string
  kind?: 'income' | 'expense'
  flag?: 'recurring' | 'anomaly' | 'excluded'
  statement_id?: number
  min_amount?: number
  max_amount?: number
  sort?: 'date' | 'amount' | 'merchant' | 'category'
  direction?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export const transactionApi = {
  list: (filters: TxnFilters) =>
    api.get<TransactionPage>('/transactions', { params: filters }).then((r) => r.data),
  categories: () => api.get<string[]>('/transactions/categories').then((r) => r.data),
  merchants: (search?: string) =>
    api.get<string[]>('/transactions/merchants', { params: { search } }).then((r) => r.data),
  update: (id: number, data: {
    category?: string; merchant?: string; notes?: string; tags?: string[]
    is_excluded?: boolean; create_rule?: boolean
  }) => api.patch<Transaction>(`/transactions/${id}`, data).then((r) => r.data),
  bulk: (data: {
    ids: number[]; category?: string; is_excluded?: boolean; add_tags?: string[]
  }) => api.post<{ updated: number }>('/transactions/bulk', data).then((r) => r.data),
  remove: (id: number) => api.delete(`/transactions/${id}`),
}

// ---------- Analytics ----------
export const analyticsApi = {
  overview: () => api.get<Overview>('/analytics/overview').then((r) => r.data),
  monthly: (month: string) =>
    api.get<MonthlyAnalytics>('/analytics/monthly', { params: { month } }).then((r) => r.data),
  yearly: (year: number) =>
    api.get<YearlyAnalytics>('/analytics/yearly', { params: { year } }).then((r) => r.data),
  calendar: (year: number) =>
    api.get<CalendarDay[]>('/analytics/calendar', { params: { year } }).then((r) => r.data),
  health: () => api.get<HealthScore>('/analytics/health-score').then((r) => r.data),
  forecast: (horizon = 90, buffer = 0) =>
    api.get<Forecast>('/analytics/forecast', { params: { horizon, buffer } }).then((r) => r.data),
  subscriptions: () =>
    api.get<SubscriptionReport>('/analytics/subscriptions').then((r) => r.data),
}

// ---------- Budgets ----------
export const budgetApi = {
  report: (month?: string) =>
    api.get<BudgetReport>('/budgets', { params: { month } }).then((r) => r.data),
  suggestions: () => api.get<BudgetSuggestion[]>('/budgets/suggestions').then((r) => r.data),
  history: (category: string, months = 6) =>
    api.get<{ month: string; spent: number; budget: number }[]>(
      `/budgets/${encodeURIComponent(category)}/history`, { params: { months } },
    ).then((r) => r.data),
  create: (data: { category: string; amount: number; alert_threshold?: number }) =>
    api.post<BudgetOut>('/budgets', data).then((r) => r.data),
  createMany: (data: { category: string; amount: number }[]) =>
    api.post<BudgetOut[]>('/budgets/bulk', data).then((r) => r.data),
  update: (id: number, data: { amount?: number; alert_threshold?: number; is_active?: boolean }) =>
    api.patch<BudgetOut>(`/budgets/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/budgets/${id}`),
}

// ---------- Goals ----------
export const goalApi = {
  list: () => api.get<GoalReport>('/goals').then((r) => r.data),
  create: (data: {
    name: string; target_amount: number; current_amount?: number
    target_date?: string | null; icon?: string; color?: string
  }) => api.post<GoalReport>('/goals', data).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>) =>
    api.patch<GoalReport>(`/goals/${id}`, data).then((r) => r.data),
  contribute: (id: number, amount: number) =>
    api.post<GoalReport>(`/goals/${id}/contribute`, { amount }).then((r) => r.data),
  remove: (id: number) => api.delete(`/goals/${id}`),
}

// ---------- Rules ----------
export const ruleApi = {
  list: () => api.get<CategoryRule[]>('/rules').then((r) => r.data),
  create: (data: {
    pattern: string; category: string; match_type?: string; backfill?: boolean
  }) => api.post<{ rule: CategoryRule; applied: number }>('/rules', data).then((r) => r.data),
  remove: (id: number) => api.delete(`/rules/${id}`),
}

// ---------- Insights ----------
export const insightApi = {
  list: () => api.get<Insight[]>('/insights').then((r) => r.data),
  generate: () => api.post<Insight[]>('/insights/generate').then((r) => r.data),
  dismiss: (id: number) => api.post(`/insights/${id}/dismiss`),
}

// ---------- Chat ----------
export const chatApi = {
  send: (message: string) => api.post<ChatMessage>('/chat', { message }).then((r) => r.data),
  history: () => api.get<ChatMessage[]>('/chat/history').then((r) => r.data),
  clear: () => api.delete('/chat/history'),
  meta: () => api.get<ChatMeta>('/chat/meta').then((r) => r.data),
  streamUrl: (message: string) => tokenUrl('/chat/stream', { message }),
}

// ---------- Reports ----------
type Period = { month?: string; year?: number }

async function download(path: string, params: Period, filename: string, blobType?: string) {
  const res = await api.get(path, { params, responseType: 'blob' })
  const blob = blobType ? new Blob([res.data as BlobPart], { type: blobType }) : (res.data as Blob)
  downloadBlob(blob, filename)
}

export const reportApi = {
  transactionsCsv: (params: Period, filename: string) =>
    download('/reports/transactions.csv', params, filename),
  categoriesCsv: (params: Period, filename: string) =>
    download('/reports/categories.csv', params, filename),
  monthlyPdf: (month: string) =>
    download('/reports/monthly.pdf', { month }, `pfip-report-${month}.pdf`),
  yearlyPdf: (year: number) =>
    download('/reports/yearly.pdf', { year }, `pfip-report-${year}.pdf`),
  fullExport: () => download('/reports/export.json', {}, 'pfip-full-export.json'),
  downloadJson: async (path: string, params: Period, filename: string) => {
    const res = await api.get(path, { params })
    downloadBlob(
      new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }),
      filename,
    )
  },
}
