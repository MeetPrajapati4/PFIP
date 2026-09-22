export interface User {
  id: number
  email: string
  name: string
  currency: string
  locale: string
  monthly_income_target: number | null
  emergency_fund_months: number
  onboarded_at: string | null
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export type StatementStatus =
  | 'queued'
  | 'parsing'
  | 'categorizing'
  | 'enriching'
  | 'processed'
  | 'failed'

export interface Statement {
  id: number
  filename: string
  bank_name: string
  period_start: string | null
  period_end: string | null
  status: StatementStatus
  progress: number
  stage_label: string
  error_message: string | null
  transaction_count: number
  duplicate_count: number
  categorization_source: string
  file_size: number
  uploaded_at: string
  processed_at: string | null
}

export interface Transaction {
  id: number
  date: string
  description: string
  merchant: string
  amount: number
  balance: number | null
  category: string
  category_source: 'gemini' | 'local' | 'rule' | 'manual'
  is_recurring: boolean
  is_anomaly: boolean
  is_excluded: boolean
  notes: string
  tags: string[]
  statement_id: number | null
}

export interface TransactionPage {
  items: Transaction[]
  total: number
  page: number
  page_size: number
  totals: { inflow: number; outflow: number; net: number }
}

export interface TxnLite {
  id: number
  date: string
  description: string
  merchant: string
  amount: number
  category: string
  is_recurring: boolean
  is_anomaly: boolean
}

export interface Summary {
  income: number
  expenses: number
  spend: number
  invested: number
  savings: number
  net_cash: number
  savings_rate: number
  transaction_count: number
  avg_transaction: number
}

export interface MonthPoint {
  month: string
  income: number
  expenses: number
  spend: number
  invested: number
  savings: number
  count: number
}

export interface CategoryRow {
  category: string
  amount: number
  count: number
  percent: number
  previous?: number
  change_pct?: number | null
}

export interface MerchantRow {
  merchant: string
  amount: number
  count: number
  category: string
  avg: number
  last_date: string | null
}

export interface BalancePoint {
  date: string
  balance: number
}

export interface Overview {
  empty: boolean
  summary: Summary
  months: MonthPoint[]
  categories: CategoryRow[]
  merchants: MerchantRow[]
  largest_expenses: TxnLite[]
  recent: TxnLite[]
  mom: {
    month: string
    income_change: number
    expense_change: number
    savings_change: number
    income_change_pct: number | null
    expense_change_pct: number | null
  } | null
  balance_series: BalancePoint[]
  current_balance: number | null
  daily_burn: number
  available_months: string[]
  available_years: number[]
  period: { start: string; end: string } | null
}

export interface DailyPoint {
  date: string
  income: number
  expenses: number
  net: number
}

export interface WeekdayPoint {
  weekday: string
  total: number
  average: number
}

export interface MonthlyAnalytics {
  month: string
  summary: Summary
  previous: Summary & { month: string }
  categories: CategoryRow[]
  merchants: MerchantRow[]
  daily: DailyPoint[]
  weekday_pattern: WeekdayPoint[]
  largest_expenses: TxnLite[]
  largest_income: TxnLite[]
  recurring_total: number
  anomalies: TxnLite[]
}

export interface YearlyAnalytics {
  year: number
  summary: Summary
  previous: Summary & { year: number }
  yoy: { income_growth_pct: number | null; expense_growth_pct: number | null } | null
  months: MonthPoint[]
  categories: CategoryRow[]
  merchants: MerchantRow[]
  best_month: MonthPoint | null
  worst_month: MonthPoint | null
  balance_series: BalancePoint[]
}

export interface CalendarDay {
  date: string
  amount: number
  count: number
}

export interface HealthComponent {
  key: string
  label: string
  score: number | null
  weight: number
  detail: string
  advice: string
  applies: boolean
}

export interface HealthScore {
  score: number | null
  grade: string | null
  components: HealthComponent[]
  history: { month: string; score: number }[]
  message: string | null
}

export interface Insight {
  id: number
  type: string
  severity: 'info' | 'warning' | 'positive'
  title: string
  body: string
  month: string | null
  impact: number
  action_label: string
  action_href: string
  is_dismissed: boolean
  created_at: string
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  grounding: string[]
  created_at: string
}

export interface ChatMeta {
  ai_online: boolean
  suggestions: string[]
  streaming: boolean
}

// ---------- Budgets ----------
export type BudgetStatus = 'on_track' | 'warning' | 'projected_over' | 'exceeded'

export interface BudgetItem {
  id: number
  category: string
  amount: number
  spent: number
  remaining: number
  percent: number
  projected: number
  projected_percent: number
  transaction_count: number
  alert_threshold: number
  status: BudgetStatus
  daily_allowance: number
  days_left: number
}

export interface BudgetReport {
  month: string
  items: BudgetItem[]
  totals: {
    budgeted: number
    spent: number
    remaining: number
    percent: number
    unbudgeted: number
  }
  days_elapsed: number
  days_in_month: number
  over_count: number
}

export interface BudgetSuggestion {
  category: string
  amount: number
  basis: string
}

/** The stored budget itself, as returned by create/update. */
export interface BudgetOut {
  id: number
  category: string
  amount: number
  alert_threshold: number
  is_active: boolean
}

// ---------- Goals ----------
export interface GoalItem {
  id: number
  name: string
  target_amount: number
  current_amount: number
  remaining: number
  percent: number
  target_date: string | null
  icon: string
  color: string
  status: 'active' | 'achieved' | 'archived'
  required_monthly: number | null
  projected_date: string | null
  months_to_goal: number | null
  on_track: boolean | null
}

export interface GoalReport {
  items: GoalItem[]
  monthly_savings_rate: number
  allocated_per_goal: number
  totals: { target: number; saved: number; count: number; achieved: number }
}

// ---------- Subscriptions ----------
export type SubscriptionKind = 'subscription' | 'bill' | 'obligation'

export interface SubscriptionItem {
  merchant: string
  category: string
  kind: SubscriptionKind
  amount: number
  is_variable: boolean
  last_amount: number
  cadence: string
  period_days: number
  occurrences: number
  first_seen: string
  last_charged: string
  next_due: string
  days_until_due: number
  monthly_cost: number
  yearly_cost: number
  status: 'active' | 'lapsed'
  price_change: number
}

export interface SubscriptionReport {
  items: SubscriptionItem[]
  upcoming: SubscriptionItem[]
  as_of: string | null
  totals: {
    monthly: number
    yearly: number
    count: number
    subscriptions_monthly: number
    bills_monthly: number
    obligations_monthly: number
    subscription_count: number
  }
}

// ---------- Forecast ----------
export interface ForecastPoint {
  date: string
  balance: number
  scheduled: number
  variable: number
}

export interface ScheduledItem {
  date: string
  label: string
  amount: number
  kind: 'subscription' | 'income'
  category: string
}

export interface Forecast {
  empty?: boolean
  as_of: string
  opening_balance: number
  horizon_days: number
  points: ForecastPoint[]
  scheduled: ScheduledItem[]
  summary: {
    projected_balance: number
    projected_change: number
    scheduled_out: number
    scheduled_in: number
    daily_variable: number
    variable_total: number
    low_point: { date: string; balance: number }
    safe_to_spend: number
    days_of_runway: number | null
    will_dip_negative: boolean
  } | null
}

// ---------- Rules ----------
export interface CategoryRule {
  id: number
  match_type: 'contains' | 'equals' | 'regex'
  pattern: string
  category: string
  priority: number
  hits: number
  is_active: boolean
  created_at: string
}

export interface HealthMeta {
  status: string
  service: string
  version: string
  environment: string
  ai_online: boolean
  pdf_export: boolean
  models: { main: string; lite: string }
}
