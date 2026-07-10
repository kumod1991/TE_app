import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'

const App = lazy(() => import('./App.jsx'))

function AppShell() {
  return (
    <div className="app-shell" aria-busy="true" aria-live="polite">
      <div className="app-shell__topbar app-shell__topbar--compact">
        <div className="app-shell__brand app-shell__brand--compact" aria-hidden="true" />
        <div className="app-shell__search" />
        <div className="app-shell__avatar" />
      </div>
      <div className="app-shell__card app-shell__card--compact">
        <div className="app-shell__title">Preparing TradeEdge</div>
        <div className="app-shell__subtitle">Loading market workspace...</div>
        <div className="app-shell__grid">
          <div className="app-shell__panel" />
          <div className="app-shell__panel" />
          <div className="app-shell__panel" />
          <div className="app-shell__panel" />
        </div>
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
