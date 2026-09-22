import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon, RefreshCw } from 'lucide-react'

interface State {
  error: Error | null
}

/**
 * Catches render-time crashes so one bad chart can't blank the whole app.
 *
 * A financial dashboard that shows nothing is worse than one that shows an
 * honest error: the user needs to know whether their data is missing or the
 * page merely failed to draw.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Wire to Sentry (or equivalent) here in a real deployment.
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-negative/10">
            <AlertOctagon className="h-7 w-7 text-negative" />
          </div>
          <h1 className="font-display text-lg font-semibold text-strong">
            This page hit an error
          </h1>
          <p className="mt-2 text-sm text-muted">
            Your data is safe — only the view failed to render. Reloading usually clears it.
          </p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-lg bg-raised p-3 text-left text-xs text-muted">
            {error.message}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={() => this.setState({ error: null })} className="btn-secondary">
              Try again
            </button>
            <button onClick={() => window.location.reload()} className="btn-primary">
              <RefreshCw className="h-4 w-4" /> Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
