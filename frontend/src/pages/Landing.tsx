import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  ArrowRight, BarChart3, Bot, Check, FileText, Gauge, Github, Import, Lock,
  Moon, Receipt, Repeat, Search, Shield, Sparkles, Sun, Target, TrendingUp,
  Wallet, Zap, type LucideIcon,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { useTheme } from '../context/ThemeContext'
import { cn } from '../lib/utils'

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Import,
    title: 'Import any statement',
    body: 'CSV or PDF, from HDFC, ICICI, SBI, Axis or a generic export. Split debit/credit columns, Dr/Cr flags, metadata preambles — the parser handles the mess so you don\'t have to.',
  },
  {
    icon: Sparkles,
    title: 'Categorized on arrival',
    body: 'Your own rules first, then AI, then a deterministic keyword engine that needs no API key. Correct one transaction and PFIP remembers the merchant forever.',
  },
  {
    icon: TrendingUp,
    title: 'Cash-flow forecast',
    body: 'Recurring payments projected onto their real due dates plus your median daily spend, to answer the only question that matters: what can I safely spend?',
  },
  {
    icon: Gauge,
    title: 'Financial health score',
    body: 'Eight weighted components — savings rate, income stability, emergency buffer, recurring load and more. Every point lost traces to a number you can change.',
  },
  {
    icon: Receipt,
    title: 'Subscription radar',
    body: 'Finds every recurring payee, predicts the next charge, separates cancellable subscriptions from fixed obligations, and catches quiet price rises.',
  },
  {
    icon: Wallet,
    title: 'Budgets that pace',
    body: 'Knowing on the 12th that you\'re on track to overshoot is useful. Knowing on the 30th that you did is not. Budgets project forward, not just backward.',
  },
  {
    icon: Target,
    title: 'Goals with real dates',
    body: 'Set a target and PFIP projects the finish line from your actual savings rate — and tells you the monthly number needed to hit a deadline.',
  },
  {
    icon: Bot,
    title: 'An assistant that cites',
    body: 'Ask anything about your money. Every answer is retrieved from your real transactions first, streams as it\'s written, and shows what it was grounded in.',
  },
  {
    icon: FileText,
    title: 'Reports worth keeping',
    body: 'Paginated PDF monthlies and annuals, spreadsheet exports, and a one-click archive of everything PFIP holds. Portability without a support ticket.',
  },
]

const PIPELINE = [
  { label: 'Parse', detail: 'Column detection across bank dialects' },
  { label: 'Deduplicate', detail: 'Fingerprints make re-imports idempotent' },
  { label: 'Categorize', detail: 'Rules → AI → keyword engine' },
  { label: 'Enrich', detail: 'Recurring detection, anomaly scoring' },
  { label: 'Analyse', detail: 'Trends, health, budgets, forecast' },
]

export default function Landing() {
  const { resolved, toggle } = useTheme()

  return (
    <div className="min-h-screen bg-canvas">
      <Nav resolved={resolved} onToggleTheme={toggle} />
      <Hero />
      <Trusted />
      <Features />
      <Pipeline />
      <Privacy />
      <CallToAction />
      <Footer />
    </div>
  )
}

function Nav({ resolved, onToggleTheme }: { resolved: string; onToggleTheme: () => void }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={cn(
      'fixed inset-x-0 top-0 z-50 transition-all duration-300',
      scrolled && 'border-b border-hairline bg-surface/80 backdrop-blur-xl',
    )}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="flex items-center gap-1.5">
          <a
            href="#features"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-strong sm:block"
          >
            Features
          </a>
          <a
            href="#how"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-strong sm:block"
          >
            How it works
          </a>
          <button
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-strong"
          >
            {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          <Link to="/login" className="btn-ghost">Sign in</Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:pt-40">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_20%,black,transparent)]" />
        <div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-brand/[0.12] blur-[140px]" />
        <div className="absolute right-1/4 top-40 h-64 w-64 animate-float rounded-full bg-info/[0.10] blur-[110px]" />
      </div>

      <div className="relative mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-hairline
            bg-surface px-3.5 py-1.5 text-xs font-medium text-muted shadow-xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            Works fully offline — an AI key is optional, not required
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.06 }}
          className="mt-7 font-display text-4xl font-bold leading-[1.08] tracking-tight text-strong sm:text-6xl"
        >
          Your bank statements,{' '}
          <span className="text-gradient">finally worth reading</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted"
        >
          PFIP turns a CSV export into categorized transactions, spending trends, a
          financial health score, budgets that pace themselves, a cash-flow forecast,
          and an assistant that answers from your real data — never from its imagination.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.18 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link to="/register" className="btn-primary !px-6 !py-3 text-base">
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#how" className="btn-secondary !px-6 !py-3 text-base">
            See how it works
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-5 text-xs text-faint"
        >
          No card. No bank credentials. Your data stays in your own database.
        </motion.p>
      </div>

      <HeroPreview />
    </section>
  )
}

/** A stylised product shot built from real markup, so it themes with the site. */
function HeroPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto mt-16 max-w-5xl"
    >
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-hairline bg-raised px-4 py-2.5">
          <span className="flex gap-1.5">
            {['bg-negative/50', 'bg-warning/50', 'bg-positive/50'].map((c) => (
              <span key={c} className={cn('h-2.5 w-2.5 rounded-full', c)} />
            ))}
          </span>
          <span className="mx-auto flex items-center gap-1.5 rounded-md bg-surface px-3 py-1 text-2xs text-faint">
            <Lock className="h-2.5 w-2.5" /> pfip.local/dashboard
          </span>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-4">
          {[
            { label: 'Income', value: '₹3.48L', tone: 'text-positive', bar: 100 },
            { label: 'Spending', value: '₹2.47L', tone: 'text-negative', bar: 71 },
            { label: 'Saved', value: '₹1.01L', tone: 'text-info', bar: 29 },
            { label: 'Savings rate', value: '29%', tone: 'text-brand', bar: 29 },
          ].map((tile, i) => (
            <motion.div
              key={tile.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.08 }}
              className="rounded-xl border border-hairline bg-raised p-4"
            >
              <p className="text-2xs text-muted">{tile.label}</p>
              <p className={cn('tnum mt-1 font-display text-xl font-bold', tile.tone)}>
                {tile.value}
              </p>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface">
                <motion.div
                  className={cn('h-full rounded-full',
                    tile.tone.replace('text-', 'bg-'))}
                  initial={{ width: 0 }}
                  animate={{ width: `${tile.bar}%` }}
                  transition={{ delay: 0.8 + i * 0.08, duration: 0.8 }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-4 px-5 pb-5 lg:grid-cols-3">
          <div className="rounded-xl border border-hairline bg-raised p-4 lg:col-span-2">
            <p className="mb-3 text-xs font-semibold text-strong">Cash flow</p>
            <svg viewBox="0 0 400 90" className="w-full" aria-hidden>
              <defs>
                <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--c-brand))" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(var(--c-brand))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.path
                d="M0,62 L44,54 L88,58 L132,38 L176,44 L220,28 L264,34 L308,20 L352,26 L400,14"
                fill="none"
                stroke="rgb(var(--c-brand))"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.4, delay: 0.9, ease: 'easeInOut' }}
              />
              <motion.path
                d="M0,62 L44,54 L88,58 L132,38 L176,44 L220,28 L264,34 L308,20 L352,26 L400,14 L400,90 L0,90 Z"
                fill="url(#heroFill)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6, duration: 0.6 }}
              />
              <motion.path
                d="M0,74 L44,70 L88,76 L132,64 L176,72 L220,60 L264,66 L308,56 L352,62 L400,52"
                fill="none"
                stroke="rgb(var(--c-negative))"
                strokeWidth="2"
                strokeDasharray="4 3"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.4, delay: 1.1, ease: 'easeInOut' }}
              />
            </svg>
          </div>

          <div className="rounded-xl border border-hairline bg-raised p-4">
            <p className="mb-3 text-xs font-semibold text-strong">Flagged for you</p>
            <div className="space-y-2">
              {[
                { text: 'Netflix raised its price 21%', tone: 'border-warning/30 bg-warning/[0.07]' },
                { text: 'Duplicate charge: Swiggy ₹1,249', tone: 'border-warning/30 bg-warning/[0.07]' },
                { text: 'Savings improved by ₹92,145', tone: 'border-positive/30 bg-positive/[0.07]' },
              ].map((item, i) => (
                <motion.p
                  key={item.text}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 + i * 0.15 }}
                  className={cn('rounded-lg border px-2.5 py-2 text-2xs leading-snug text-body', item.tone)}
                >
                  {item.text}
                </motion.p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-32 bg-gradient-to-t from-canvas to-transparent" />
    </motion.div>
  )
}

function Trusted() {
  const items = [
    'HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak',
    'IDFC First', 'Yes Bank', 'IndusInd', 'Bank of Baroda', 'Punjab National Bank',
  ]
  return (
    <section className="border-y border-hairline py-6">
      <p className="mb-4 text-center text-2xs font-semibold uppercase tracking-[0.12em] text-faint">
        Parses statement exports from
      </p>
      <div className="fade-edges relative overflow-hidden">
        <div className="flex w-max animate-marquee gap-10">
          {[...items, ...items].map((name, i) => (
            <span key={i} className="whitespace-nowrap text-sm font-medium text-muted">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 22 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Features() {
  return (
    <section id="features" className="px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-title">Everything, from one CSV</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-strong sm:text-4xl">
              A finance product, not a chart gallery
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Nine features that each answer a question you'd otherwise open a
              spreadsheet for.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 0.08}>
              <div className="group h-full rounded-2xl border border-hairline bg-surface p-6
                transition-all duration-300 hover:-translate-y-1 hover:border-brand/35 hover:shadow-md">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl
                  bg-brand/10 transition-transform duration-300 group-hover:scale-110">
                  <feature.icon className="h-5 w-5 text-brand" />
                </span>
                <h3 className="font-display text-base font-semibold text-strong">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pipeline() {
  return (
    <section id="how" className="border-y border-hairline bg-surface px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-title">How it works</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-strong sm:text-4xl">
              Five stages, all of them visible
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Import shows real progress because there's real work happening. Nothing here
              is an animation waiting out a spinner.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((stage, i) => (
            <Reveal key={stage.label} delay={i * 0.08}>
              <div className="relative h-full rounded-2xl border border-hairline bg-canvas p-5">
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg
                  bg-brand/10 font-display text-sm font-bold text-brand">
                  {i + 1}
                </span>
                <h3 className="font-display text-sm font-semibold text-strong">{stage.label}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{stage.detail}</p>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2
                    text-faint lg:block" />
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {[
              {
                icon: Repeat,
                title: 'Re-import safely',
                body: 'Every row gets a fingerprint from its date, amount and narration. Overlapping exports are skipped, not duplicated — so you can export three months at a time without thinking about it.',
              },
              {
                icon: Search,
                title: 'Find anything instantly',
                body: '⌘K searches pages, actions and your transactions at once. Filters live in the URL, so a filtered view is shareable and survives a refresh.',
              },
              {
                icon: Zap,
                title: 'Learns from corrections',
                body: 'Recategorize one transaction, tick "remember this", and PFIP writes a rule that fixes your history and every future import.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-hairline bg-canvas p-6">
                <item.icon className="mb-3 h-5 w-5 text-brand" />
                <h3 className="font-display text-base font-semibold text-strong">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Privacy() {
  const points = [
    'Statements are parsed on your own server',
    'Transactions live in your own database',
    'No bank credentials, ever — you upload a file',
    'The AI key is optional; everything works without one',
    'One-click export of everything PFIP holds',
    'Passwords hashed with PBKDF2-SHA256, 260k iterations',
  ]
  return (
    <section className="px-5 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <div>
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
                <Shield className="h-6 w-6 text-brand" />
              </span>
              <h2 className="font-display text-3xl font-bold tracking-tight text-strong">
                Your money data, on your terms
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                PFIP never asks for your net-banking login and never brokers a connection to
                your bank. You export a file; it stays where you put it.
              </p>
              <Link to="/register" className="btn-primary mt-7">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <ul className="space-y-3">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-3 rounded-xl border
                  border-hairline bg-surface px-4 py-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <span className="text-sm text-body">{point}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function CallToAction() {
  return (
    <section className="px-5 pb-24">
      <Reveal>
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border
          border-hairline bg-surface px-6 py-16 text-center shadow-lg">
          <div className="pointer-events-none absolute inset-0">
            <div className="bg-dots absolute inset-0 opacity-60" />
            <div className="absolute left-1/2 top-0 h-64 w-[520px] -translate-x-1/2 rounded-full bg-brand/[0.14] blur-[100px]" />
          </div>
          <div className="relative">
            <BarChart3 className="mx-auto mb-5 h-10 w-10 text-brand" />
            <h2 className="font-display text-3xl font-bold tracking-tight text-strong sm:text-4xl">
              Import one statement. See everything.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
              Eighteen months of transactions become a dashboard, a health score, a
              forecast and a list of things worth fixing — in about ten seconds.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className="btn-primary !px-6 !py-3 text-base">
                Create your account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className="btn-secondary !px-6 !py-3 text-base">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-hairline px-5 py-10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div>
          <Logo />
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-faint">
            Personal Finance Intelligence Platform — FastAPI, React and a lot of opinions
            about what a finance dashboard owes its user.
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-muted">
          <a href="#features" className="transition-colors hover:text-strong">Features</a>
          <a href="#how" className="transition-colors hover:text-strong">How it works</a>
          <Link to="/login" className="transition-colors hover:text-strong">Sign in</Link>
          <span className="flex items-center gap-1.5 text-faint">
            <Github className="h-3.5 w-3.5" /> Self-hosted
          </span>
        </div>
      </div>
    </footer>
  )
}
