import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Eye, EyeOff } from 'lucide-react'
import { AuthShell } from './Login'
import { Button, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { apiError } from '../lib/api'
import { cn } from '../lib/utils'

/** Cheap, honest strength signal — length and variety, no vendor library. */
function strength(password: string): { score: number; label: string; tone: string } {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { score, label: 'Weak', tone: 'bg-negative' }
  if (score === 3) return { score, label: 'Fair', tone: 'bg-warning' }
  if (score === 4) return { score, label: 'Good', tone: 'bg-info' }
  return { score, label: 'Strong', tone: 'bg-positive' }
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const meter = useMemo(() => strength(password), [password])
  const longEnough = password.length >= 8

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(name, email, password)
      // A brand-new account has nothing to show, so send them to the import step.
      navigate('/import', { replace: true })
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Turn raw bank statements into financial intelligence."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Vinit Singh"
            autoComplete="name"
            autoFocus
          />
        </Field>

        <Field label="Email" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>

        <Field label="Password" required>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-11"
              placeholder="At least 8 characters"
              autoComplete="new-password"
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

        {password && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn('h-1 flex-1 rounded-full transition-colors',
                    i < meter.score ? meter.tone : 'bg-raised')}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-2xs">
              <span className="text-muted">Password strength: {meter.label}</span>
              <span className={cn('flex items-center gap-1',
                longEnough ? 'text-positive' : 'text-faint')}>
                {longEnough && <Check className="h-3 w-3" />} 8+ characters
              </span>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-negative/25 bg-negative/[0.07] px-3 py-2 text-sm text-negative">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={!longEnough}
          className="w-full !py-3"
        >
          Create account <ArrowRight className="h-4 w-4" />
        </Button>

        <p className="text-center text-2xs leading-relaxed text-faint">
          Your statements are parsed on your own server and stored in your own database.
          Nothing is shared with a third party unless you configure an AI key.
        </p>
      </form>
    </AuthShell>
  )
}
