import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './layouts/AppLayout'
import { Spinner } from './components/ui'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'

// Split the heavier screens: the landing/auth/dashboard path is what a first
// visit pays for, and nobody needs the Reports bundle before they've imported
// anything.
const Transactions = lazy(() => import('./pages/Transactions'))
const ImportPage = lazy(() => import('./pages/Import'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Forecast = lazy(() => import('./pages/Forecast'))
const Budgets = lazy(() => import('./pages/Budgets'))
const Goals = lazy(() => import('./pages/Goals'))
const Subscriptions = lazy(() => import('./pages/Subscriptions'))
const Insights = lazy(() => import('./pages/Insights'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))

function FullPageSpinner() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }
  // Remember where they were headed so login can return them there.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

      <Route element={<Protected><AppLayout /></Protected>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/*"
          element={
            <Suspense fallback={<FullPageSpinner />}>
              <Routes>
                <Route path="transactions" element={<Transactions />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="forecast" element={<Forecast />} />
                <Route path="budgets" element={<Budgets />} />
                <Route path="goals" element={<Goals />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="insights" element={<Insights />} />
                <Route path="assistant" element={<Assistant />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}
