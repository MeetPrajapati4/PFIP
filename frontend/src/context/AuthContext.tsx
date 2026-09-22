import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { authApi, hasToken, setToken } from '../lib/api'
import type { User } from '../lib/types'
import { configureCurrency } from '../lib/utils'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
  applyUser: (user: User) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Every money string in the app runs through the formatters, so the user's
  // currency has to be installed before anything renders a figure.
  const applyUser = useCallback((next: User) => {
    configureCurrency(next.currency, next.locale)
    setUser(next)
  }, [])

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false)
      return
    }
    authApi
      .me()
      .then(applyUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [applyUser])

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password })
    setToken(res.access_token)
    applyUser(res.user)
  }, [applyUser])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await authApi.register({ name, email, password })
    setToken(res.access_token)
    applyUser(res.user)
  }, [applyUser])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!hasToken()) return
    applyUser(await authApi.me())
  }, [applyUser])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, applyUser }),
    [user, loading, login, register, logout, refresh, applyUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
