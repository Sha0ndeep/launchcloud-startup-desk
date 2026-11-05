import { ProgramPolicyCard } from '../components/ProgramPolicyCard'
import { Card } from '../components/ui/Card'
import { Link } from '../components/ui/Link'
import { Notice } from '../components/ui/Notice'
import { useProgram } from '../hooks/useProgram'
import { formatCents } from '../lib/money'
import { routes } from '../lib/router'
import { useApplicantSession } from '../lib/session'

export function HomePage() {
  const session = useApplicantSession()
  const program = useProgram()
  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Startup-program operations desk</p>
        <h1>Applications go in. Verified decisions and activated product credits come out.</h1>
        <p className="lead">
          LaunchCloud's agent receives startup applications, verifies mailbox control, researches the business, applies explicit policy rules, asks for what is
          missing, and issues promotional product credits. Operators only see genuine unresolved exceptions.
        </p>
      </section>
      <div className="grid-2">
        <Card title="Applicants" subtitle="Apply, verify your mailbox, answer requests, use your credits">
          <p>
            {program.data ? `Apply for ${formatCents(program.data.benefit_cents)} of LaunchCloud promotional product credit` : 'Apply for LaunchCloud promotional product credit'} under the
            published policy. Your application id and access token stay in this browser tab only.
          </p>
          <div className="row">
            <Link to={routes.apply} className="btn btn-primary btn-md">
              Start an application
            </Link>
            {session && (
              <Link to={routes.status} className="btn btn-secondary btn-md">
                Open my application{session.companyName ? ` · ${session.companyName}` : ''}
              </Link>
            )}
          </div>
        </Card>
        <Card title="Operators" subtitle="Queue, allocation, exceptions, evidence, audit trail">
          <p>Ordinary cases complete without you. The desk surfaces budget, issued credits and the cases that need an explicit, reasoned decision.</p>
          <Link to={routes.operator} className="btn btn-secondary btn-md">
            Open operator desk
          </Link>
        </Card>
      </div>
      <ProgramPolicyCard program={program.data} error={program.error} loading={program.loading} onRetry={program.refresh} />
      <Notice tone="info" title="What is real in this demo">
        <ul className="notice-list">
          <li>The mailbox is simulated by the backend's demo adapter. A state never proves a real email was delivered.</li>
          <li>Facts you declare are "applicant declarations accepted under the policy", not independently verified payroll or funding.</li>
          <li>Company research uses Crustdata and web sources as corroboration. Research costs shown are estimates in research credits.</li>
          <li>Issued credits are LaunchCloud promotional product credits in the fictional provider's own ledger, not credits on any other vendor's platform.</li>
        </ul>
      </Notice>
    </div>
  )
}
