import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Info } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Button, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { apiError } from '../lib/api'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const expired = params.get('expired') === '1'
  const from = (location.state as { from?: string } | null)?.from

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your financial command centre."
      footer={
        <>
          New to PFIP?{' '}
          <Link to="/register" className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {expired && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-info/30
          bg-info/[0.07] p-3 text-xs leading-relaxed text-body">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
          Your session expired. Sign in again to pick up where you left off.
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
          />
        </Field>

        <Field label="Password" required>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-11"
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-strong"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        {error && (
          <p role="alert" className="rounded-xl border border-negative/25 bg-negative/[0.07] px-3 py-2 text-sm text-negative">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" loading={busy} className="w-full !py-3">
          Sign in <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </AuthShell>
  )
}

export function AuthShell({
  title, subtitle, children, footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <div className="absolute -top-40 left-1/2 h-96 w-[680px] -translate-x-1/2 rounded-full bg-brand/10 blur-[130px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="card relative w-full max-w-md p-8 shadow-lg"
      >
        <Link to="/" className="mb-8 inline-block">
          <Logo />
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight text-strong">{title}</h1>
        <p className="mb-6 mt-1.5 text-sm text-muted">{subtitle}</p>
        {children}
        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      </motion.div>
    </div>
  )
}
