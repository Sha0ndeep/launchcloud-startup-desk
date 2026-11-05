import { useEffect, type ReactNode } from 'react'
import { AppShell } from './components/AppShell'
import { HealthProvider } from './components/HealthProvider'
import { Toaster } from './components/ui/Toaster'
import { matchPath, routes, usePath } from './lib/router'
import { AccountPage } from './pages/AccountPage'
import { ApplyPage } from './pages/ApplyPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OperatorCasePage } from './pages/OperatorCasePage'
import { OperatorGate } from './pages/OperatorGate'
import { OperatorQueuePage } from './pages/OperatorQueuePage'
import { StatusPage } from './pages/StatusPage'

function resolvePage(path: string): ReactNode {
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  if (normalized === routes.home) return <HomePage />
  if (normalized === routes.apply) return <ApplyPage />
  if (normalized === routes.status) return <StatusPage />
  if (normalized === routes.account) return <AccountPage />
  if (normalized === routes.operator) return <OperatorGate>{(auth) => <OperatorQueuePage auth={auth} />}</OperatorGate>
  const caseMatch = matchPath('/operator/cases/:id', normalized)
  if (caseMatch) return <OperatorGate>{(auth) => <OperatorCasePage key={caseMatch.id} applicationId={caseMatch.id} auth={auth} />}</OperatorGate>
  return <NotFoundPage />
}

export default function App() {
  const path = usePath()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [path])
  return (
    <HealthProvider>
      <AppShell>{resolvePage(path)}</AppShell>
      <Toaster />
    </HealthProvider>
  )
}
