import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays, CalendarRange, Database, Download, FileJson, FileSpreadsheet,
  FileText, PieChart, type LucideIcon,
} from 'lucide-react'
import { analyticsApi, apiError, metaApi, reportApi } from '../lib/api'
import { formatMonth } from '../lib/utils'
import {
  Badge, Button, Card, EmptyState, PageHeader, useToast,
} from '../components/ui'

interface ReportDef {
  key: string
  icon: LucideIcon
  title: string
  body: string
  format: 'PDF' | 'CSV' | 'JSON'
  disabled?: boolean
  run: () => Promise<void>
}

export default function Reports() {
  const toast = useToast()
  const [month, setMonth] = useState<string>()
  const [year, setYear] = useState<number>()
  const [busy, setBusy] = useState<string | null>(null)

  const { data: overview } = useQuery({ queryKey: ['overview'], queryFn: analyticsApi.overview })
  const { data: meta } = useQuery({ queryKey: ['meta'], queryFn: metaApi.health })

  const activeMonth = month ?? overview?.available_months[0]
  const activeYear = year ?? overview?.available_years[0]
  const pdfReady = meta?.pdf_export ?? true

  if (overview && overview.empty) {
    return (
      <div className="space-y-5">
        <PageHeader title="Reports" />
        <EmptyState
          icon={FileText}
          title="Nothing to report on yet"
          body="Import a statement and you'll be able to export polished PDFs, spreadsheets and a complete data archive."
          action={<Link to="/import" className="btn-primary">Import a statement</Link>}
        />
      </div>
    )
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
      toast.success('Download started')
    } catch (e) {
      toast.error('Export failed', apiError(e))
    } finally {
      setBusy(null)
    }
  }

  const reports: ReportDef[] = [
    {
      key: 'monthly-pdf',
      icon: FileText,
      title: 'Monthly report',
      format: 'PDF',
      disabled: !pdfReady || !activeMonth,
      body: activeMonth
        ? `A paginated, branded report for ${formatMonth(activeMonth)} — headline figures, category table with month-on-month change, top merchants, largest expenses and anything flagged.`
        : 'Select a month.',
      run: () => reportApi.monthlyPdf(activeMonth!),
    },
    {
      key: 'yearly-pdf',
      icon: CalendarRange,
      title: 'Annual report',
      format: 'PDF',
      disabled: !pdfReady || !activeYear,
      body: activeYear
        ? `The full ${activeYear} picture: month-by-month table with savings rates, year-on-year movement and category totals. The one to send to an accountant.`
        : 'Select a year.',
      run: () => reportApi.yearlyPdf(activeYear!),
    },
    {
      key: 'month-csv',
      icon: FileSpreadsheet,
      title: 'Transactions — month',
      format: 'CSV',
      disabled: !activeMonth,
      body: `Every categorized transaction for ${activeMonth ? formatMonth(activeMonth) : '—'}, including notes, tags and the recurring/anomaly flags. Opens cleanly in Excel.`,
      run: () => reportApi.transactionsCsv(
        { month: activeMonth }, `pfip-transactions-${activeMonth}.csv`),
    },
    {
      key: 'all-csv',
      icon: FileSpreadsheet,
      title: 'Transactions — all time',
      format: 'CSV',
      body: 'Your complete categorized ledger across every statement you have imported.',
      run: () => reportApi.transactionsCsv({}, 'pfip-transactions-all.csv'),
    },
    {
      key: 'categories-csv',
      icon: PieChart,
      title: 'Category pivot',
      format: 'CSV',
      body: `Spend per category with counts and shares${activeMonth ? ` for ${formatMonth(activeMonth)}` : ''} — the shape you'd otherwise build a pivot table for.`,
      run: () => reportApi.categoriesCsv(
        { month: activeMonth }, `pfip-categories-${activeMonth ?? 'all'}.csv`),
    },
    {
      key: 'overview-json',
      icon: FileJson,
      title: 'Analytics snapshot',
      format: 'JSON',
      body: 'Overview metrics, the full health-score breakdown, subscriptions and the 90-day forecast — structured for feeding into your own tooling.',
      run: () => reportApi.downloadJson('/reports/overview', {}, 'pfip-overview.json'),
    },
    {
      key: 'full-export',
      icon: Database,
      title: 'Complete account export',
      format: 'JSON',
      body: 'Everything PFIP holds about you: profile, statements, every transaction, budgets, goals and computed analytics. Your data, one click, no support ticket.',
      run: () => reportApi.fullExport(),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Exports you can keep, share or hand to an accountant"
        actions={
          <>
            <select
              className="select max-w-[160px]"
              value={activeMonth ?? ''}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Report month"
            >
              {overview?.available_months.map((m) => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
            </select>
            <select
              className="select max-w-[110px]"
              value={activeYear ?? ''}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Report year"
            >
              {overview?.available_years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </>
        }
      />

      {!pdfReady && (
        <Card className="border-warning/30 !p-4">
          <p className="text-sm text-body">
            <span className="font-semibold text-strong">PDF export is unavailable.</span>{' '}
            Install the optional dependency on the API host with{' '}
            <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-brand">
              pip install reportlab
            </code> and restart. Everything else on this page works either way.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((report, i) => (
          <Card key={report.key} delay={i * 0.05} className="flex h-full flex-col !p-5" hover>
            <div className="mb-4 flex items-start justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10">
                <report.icon className="h-5 w-5 text-brand" />
              </span>
              <Badge tone={report.format === 'PDF' ? 'negative'
                : report.format === 'CSV' ? 'positive' : 'info'}>
                {report.format}
              </Badge>
            </div>
            <h3 className="font-display text-base font-semibold text-strong">{report.title}</h3>
            <p className="mb-5 mt-1.5 flex-1 text-sm leading-relaxed text-muted">{report.body}</p>
            <Button
              icon={Download}
              loading={busy === report.key}
              disabled={report.disabled || busy !== null}
              onClick={() => run(report.key, report.run)}
            >
              Download
            </Button>
          </Card>
        ))}
      </div>

      <Card delay={0.4} className="border-dashed">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
          <div>
            <p className="text-sm font-semibold text-strong">On the roadmap</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              Scheduled email delivery (a monthly PDF in your inbox on the 1st) and shareable
              read-only report links. Both need a mail provider and object storage, which is a
              deployment decision rather than a code one — see{' '}
              <code className="font-mono text-brand">implementation/plan/15-deployment-roadmap.md</code>.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
