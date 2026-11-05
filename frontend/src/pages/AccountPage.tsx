import { useMemo, useState } from 'react'
import { api, type ApplicantAuth } from '../api'
import { toApiError, type ApiError } from '../api/errors'
import { newIdempotencyKey } from '../api/idempotency'
import type { CreditAccount } from '../api/types'
import { CreditAccountPanel } from '../components/CreditAccountPanel'
import { StateBadge } from '../components/StateBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorNotice } from '../components/ui/ErrorNotice'
import { Link } from '../components/ui/Link'
import { Notice } from '../components/ui/Notice'
import { LoadingBlock } from '../components/ui/Spinner'
import { config } from '../config'
import { useCase } from '../hooks/useCase'
import { usePolling } from '../hooks/usePolling'
import { formatCents } from '../lib/money'
import { routes } from '../lib/router'
import { useApplicantSession, type ApplicantSession } from '../lib/session'
import { CREDIT_USAGE_STATES, stateMeta } from '../lib/states'
import { pushToast } from '../lib/toastStore'

export function AccountPage() {
  const session = useApplicantSession()
  if (!session) {
    return (
      <div className="page">
        <EmptyState
          title="No application in this browser tab"
          description="The product account belongs to the application held in this tab's session storage."
          action={
            <Link to={routes.apply} className="btn btn-primary btn-md">
              Start an application
            </Link>
          }
        />
      </div>
    )
  }
  return <AccountView key={session.applicationId} session={session} />
}

interface UsageIntent {
  key: string
  status: 'running' | 'failed'
  error: ApiError | null
}

function AccountView({ session }: { session: ApplicantSession }) {
  const auth = useMemo<ApplicantAuth>(() => ({ kind: 'applicant', accessToken: session.accessToken }), [session.accessToken])
  const kase = useCase(session.applicationId, auth)
  const credits = usePolling<CreditAccount>(() => api.getCredits(session.applicationId, auth), {
    key: `credits|${session.applicationId}|${session.accessToken}`,
    intervalFor: (_data, error) => {
      if (error) return error.status === 401 || error.status === 403 || error.status === 404 ? null : config.caseErrorPollMs
      return config.creditsPollMs
    },
  })
  const [intent, setIntent] = useState<UsageIntent | null>(null)

  const state = kase.data?.state ?? null
  const stateAllows = state !== null && CREDIT_USAGE_STATES.has(state)
  const hasAccount = Boolean(credits.data?.account_id)
  const canRun = stateAllows && hasAccount && intent?.status !== 'running'

  const run = async (reuseKey: string | null) => {
    const key = reuseKey ?? newIdempotencyKey()
    setIntent({ key, status: 'running', error: null })
    try {
      const account = await api.postUsage(session.applicationId, { amount_cents: config.sampleUsageCents, description: config.sampleUsageDescription }, { idempotencyKey: key }, auth)
      credits.applyData(account)
      kase.refresh()
      setIntent(null)
      pushToast({ tone: 'success', title: 'Backend accepted the sample job', message: `Server-reported available balance is now ${formatCents(account.available_cents)}.` })
    } catch (err) {
      setIntent({ key, status: 'failed', error: toApiError(err) })
    }
  }

  const retryable = intent?.status === 'failed' && intent.error !== null && (intent.error.status === 0 || intent.error.status === 429 || intent.error.status >= 500)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Applicant · product account</p>
          <h1>{session.companyName || 'Product account'}</h1>
          <div className="row">
            {state && <StateBadge state={state} audience="applicant" />}
            <span className="muted">Promotional product credits on the fictional LaunchCloud provider</span>
          </div>
        </div>
        <div className="page-actions">
          <Button variant="ghost" size="sm" onClick={() => { credits.refresh(); kase.refresh() }} loading={credits.loading && !!credits.data}>
            Refresh
          </Button>
        </div>
      </header>

      {kase.error && <ErrorNotice error={kase.error} compact onRetry={kase.refresh} />}

      <div className="layout-2col">
        <div className="col-main stack">
          <Card title="Balance and receipts" subtitle="Everything here is read from GET /api/applications/{id}/credits. The interface never computes its own balance.">
            {!credits.data && credits.loading && <LoadingBlock label="Loading credit account…" />}
            {credits.error && <ErrorNotice error={credits.error} compact onRetry={credits.refresh} />}
            {credits.data && <CreditAccountPanel credits={credits.data} />}
          </Card>
        </div>
        <aside className="col-side stack">
          <Card title={`Run sample API job (${formatCents(config.sampleUsageCents)})`} subtitle="A minimal product action that consumes promotional credit, proving issuance has an operational effect.">
            <div className="stack-sm">
              <p className="muted">
                Sends {config.sampleUsageCents} cents with a fresh Idempotency-Key, then shows the balance the server returns. A network retry reuses the same key; a new click is a new job with a new key.
              </p>
              {!stateAllows && state && (
                <Notice tone="neutral" compact title="Not available yet">
                  {stateMeta(state).applicant} Only an enrolled or duplicate-resolved application may consume credits.
                </Notice>
              )}
              {stateAllows && !hasAccount && credits.data && (
                <Notice tone="warning" compact title="No product account linked">
                  The backend reports enrollment but no account id on the credit route yet.
                </Notice>
              )}
              {intent?.status === 'failed' && intent.error && (
                <ErrorNotice error={intent.error} onRetry={retryable ? () => void run(intent.key) : undefined} retryLabel="Retry same job (same key)">
                  {intent.error.status === 409 && <p>The backend refused this job. Common reasons: insufficient promotional balance, or the application is not authorized to consume credits. The balance shown is still the server's.</p>}
                </ErrorNotice>
              )}
              <div className="row">
                <Button variant="primary" disabled={!canRun} loading={intent?.status === 'running'} onClick={() => void run(null)}>
                  {intent?.status === 'failed' ? 'Start a new sample job' : `Run sample API job (${formatCents(config.sampleUsageCents)})`}
                </Button>
              </div>
            </div>
          </Card>
          <Card title="About these credits">
            <ul className="rule-list">
              <li>Promotional product credits of the fictional SaaS provider, recorded in its own ledger.</li>
              <li>Separate from the team's Crustdata research credits, which are shown only on operator tool-call summaries.</li>
              <li>Not cash, not transferable, not credits on another vendor's platform.</li>
            </ul>
            <Link to={routes.status} className="btn btn-ghost btn-sm">
              Back to application status
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  )
}
