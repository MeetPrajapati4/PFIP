import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'

type ThemeChoice = 'light' | 'dark' | 'system'
type Resolved = 'light' | 'dark'

interface ThemeState {
  choice: ThemeChoice
  resolved: Resolved
  setChoice: (choice: ThemeChoice) => void
  toggle: () => void
}

const STORAGE_KEY = 'pfip_theme'
const ThemeContext = createContext<ThemeState | null>(null)

function systemTheme(): Resolved {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStored(): ThemeChoice {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStored)
  const [resolved, setResolved] = useState<Resolved>(() =>
    readStored() === 'system' ? systemTheme() : (readStored() as Resolved))

  useEffect(() => {
    const next = choice === 'system' ? systemTheme() : choice
    setResolved(next)
    document.documentElement.dataset.theme = next
    // Keep the browser chrome (mobile address bar) in step with the canvas.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#080b14' : '#f8fafc')
  }, [choice])

  useEffect(() => {
    if (choice !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next = systemTheme()
      setResolved(next)
      document.documentElement.dataset.theme = next
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [choice])

  const setChoice = useCallback((next: ThemeChoice) => {
    localStorage.setItem(STORAGE_KEY, next)
    setChoiceState(next)
  }, [])

  const toggle = useCallback(() => {
    setChoice(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setChoice])

  const value = useMemo(
    () => ({ choice, resolved, setChoice, toggle }),
    [choice, resolved, setChoice, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
