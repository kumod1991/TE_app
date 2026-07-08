import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'

const App = lazy(() => import('./App.jsx'))

function AppShell() {
  return (
    <div className="app-shell" aria-busy="true" aria-live="polite">
      <div className="app-shell__card">
        <div className="app-shell__brand" />
        <div className="app-shell__title">TradeEdge</div>
        <div className="app-shell__subtitle">Loading market workspace…</div>
        <div className="app-shell__bar" />
        <div className="app-shell__bar app-shell__bar--short" />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<AppShell />}>
      <App />
    </Suspense>
  </StrictMode>,
)
