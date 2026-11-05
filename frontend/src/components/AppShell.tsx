import type { ReactNode } from 'react'
import { config } from '../config'
import { routes } from '../lib/router'
import { useApplicantSession } from '../lib/session'
import { BackendStatusChip } from './BackendStatusChip'
import { MockBanner } from './MockBanner'
import { Link } from './ui/Link'

export function AppShell({ children }: { children: ReactNode }) {
  const session = useApplicantSession()
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {config.useMockApi && <MockBanner />}
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={routes.home} className="brand" aria-label="LaunchCloud Startup Desk home">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">
              <span className="brand-name">LaunchCloud</span>
              <span className="brand-sub">Startup Desk</span>
            </span>
          </Link>
          <nav className="nav" aria-label="Primary">
            <Link nav to={routes.apply}>
              Apply
            </Link>
            <Link nav to={routes.status}>
              My application{session ? '' : ''}
            </Link>
            <Link nav to={routes.account}>
              Product account
            </Link>
            <Link nav to={routes.operator}>
              Operator desk
            </Link>
          </nav>
          <BackendStatusChip />
        </div>
      </header>
      <main className="main" id="main">
        {children}
      </main>
      <footer className="footer">
        <p>
          LaunchCloud is a fictional SaaS provider for this demo. Credits are LaunchCloud promotional product credits, separate from Crustdata
          research credits. The mailbox is simulated; a state never proves a real email was delivered. Applicant declarations are accepted under
          the program policy, not independently verified.
        </p>
      </footer>
    </div>
  )
}
