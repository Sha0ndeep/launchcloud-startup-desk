import { useCallback, useId, useMemo, useState, type FormEvent } from 'react'
import { api, type ApplicantAuth } from '../api'
import { toApiError, type ApiError } from '../api/errors'
import { VERIFICATION_CODE_PATTERN, type CaseResponse } from '../api/types'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ChecksTable } from '../components/ChecksTable'
import { DemoMailbox } from '../components/DemoMailbox'
import { EvidenceDrawer } from '../components/EvidenceDrawer'
import { ExportCaseButton } from '../components/ExportCaseButton'
import { FactsCard } from '../components/FactsCard'
import { GrantReceipt } from '../components/GrantReceipt'
import { ReplyForm } from '../components/ReplyForm'
import { ResearchStatusCard } from '../components/ResearchStatusCard'
import { CheckStatusBadge, EvidenceKindBadge, StateBadge } from '../components/StateBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorNotice } from '../components/ui/ErrorNotice'
import { Field } from '../components/ui/Field'
import { KeyValue } from '../components/ui/KeyValue'
import { Link } from '../components/ui/Link'
import { Notice } from '../components/ui/Notice'
import { LoadingBlock, Spinner } from '../components/ui/Spinner'
import { useHealth } from '../hooks/health'
import { useCase } from '../hooks/useCase'
import { formatDateTime, formatRelative } from '../lib/dates'
import { requestedFacts } from '../lib/facts'
import { humanizeRule, isTerminal, stateMeta } from '../lib/states'
import { routes } from '../lib/router'
import { clearApplicantSession, useApplicantSession, type ApplicantSession } from '../lib/session'
import { buildTimeline } from '../lib/timeline'
import { pushToast } from '../lib/toastStore'
import { describedBy } from '../lib/a11y'

export function StatusPage() {
  const session = useApplicantSession()
  if (!session) {
    return (
      <div className="page">
        <EmptyState
          title="No application in this browser tab"
          description="Your application id and access token are kept only in this tab's session storage. Start an application, or reopen the tab where you applied."
          action={
            <Link to={routes.apply} className="btn btn-primary btn-md">
              Start an application
            </Link>
          }
        />
      </div>
    )
  }
  return <ApplicantCaseView key={session.applicationId} session={session} />
}

function ApplicantCaseView({ session }: { session: ApplicantSession }) {
  const auth = useMemo<ApplicantAuth>(() => ({ kind: 'applicant', accessToken: session.accessToken }), [session.accessToken])
  const kase = useCase(session.applicationId, auth)
  const { health, status: backendStatus } = useHealth()
  const [drawer, setDrawer] = useState<{ open: boolean; focus: string | null }>({ open: false, focus: null })
  const showEvidence = useCallback((id?: string) => setDrawer({ open: true, focus: id ?? null }), [])
  const closeDrawer = useCallback(() => setDrawer((d) => ({ ...d, open: false })), [])

  const data = kase.data
  const authFailure = kase.error !== null && (kase.error.status === 401 || kase.error.status === 403 || kase.error.status === 404)

  if (!data) {
    return (
      <div className="page">
        {kase.loading && !kase.error && <LoadingBlock label="Loading your application…" />}
        {kase.error && (
          <div className="stack">
            <ErrorNotice error={kase.error} onRetry={authFailure ? undefined : kase.refresh}>
              {authFailure && <p>The backend did not accept the stored access token for this application. If the application was created against a different backend or the token was reset, you will need to apply again.</p>}
            </ErrorNotice>
            {authFailure && <SessionPanel session={session} />}
          </div>
        )}
      </div>
    )
  }

  const meta = stateMeta(data.state)
  const timeline = buildTimeline(data, { includeToolCalls: false })
  const terminal = isTerminal(data.state)
  const demoMode = health?.demo_mode === true

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Applicant · {data.domain}</p>
          <h1>{data.company_name}</h1>
          <div className="row">
            <StateBadge state={data.state} audience="applicant" />
            <span className="muted">Policy {data.policy_version}</span>
            <span className="muted" title={formatDateTime(data.updated_at)}>
              Updated {formatRelative(data.updated_at)}
            </span>
            {!terminal && <Spinner label="Live" />}
          </div>
          <p className="lead">{meta.applicant}</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" size="sm" onClick={kase.refresh} loading={kase.loading}>
            Refresh
          </Button>
        </div>
      </header>

      {kase.error && (
        <ErrorNotice error={kase.error} compact onRetry={kase.refresh}>
          <p className="muted">Showing the last state received from the backend ({formatRelative(data.updated_at)}).</p>
        </ErrorNotice>
      )}

      <div className="layout-2col">
        <div className="col-main stack">
          <CurrentStep data={data} auth={auth} onCase={kase.applyData} demoMode={demoMode} backendStatus={backendStatus} modelConfigured={health ? health.model_configured : null} onShowEvidence={showEvidence} />

          <Card title="Policy checks" subtitle="Each rule's outcome on the evidence accepted so far. A conflict is a question, not an accusation.">
            <ChecksTable checks={data.checks} onShowEvidence={showEvidence} />
          </Card>

          <Card title="Activity" subtitle="Events and messages recorded by the backend. Outbound messages are recorded, not proof of delivery.">
            <ActivityTimeline items={timeline} />
          </Card>
        </div>

        <aside className="col-side stack">
          <FactsCard facts={data.facts} evidence={data.evidence} policyVersion={data.policy_version} onShowEvidence={showEvidence} />
          <ResearchStatusCard research={data.research} />
          <Card
            title="Evidence and sources"
            actions={
              <Button size="sm" onClick={() => showEvidence()}>
                Open
              </Button>
            }
          >
            <EvidenceSummary evidence={data.evidence} />
          </Card>
          {demoMode && data.state !== 'AWAITING_EMAIL' && <DemoMailbox applicationId={data.id} auth={auth} live={!terminal} />}
          {!demoMode && backendStatus === 'ok' && (
            <Notice tone="neutral" compact title="Mailbox">
              This backend is not in demo mode, so no simulated mailbox is shown. Messages go to the real work address.
            </Notice>
          )}
          <Card title="Export">
            <ExportCaseButton applicationId={data.id} auth={auth} />
          </Card>
          <SessionPanel session={session} />
        </aside>
      </div>

      <EvidenceDrawer open={drawer.open} onClose={closeDrawer} evidence={data.evidence} highlightId={drawer.focus} />
    </div>
  )
}

function EvidenceSummary({ evidence }: { evidence: CaseResponse['evidence'] }) {
  if (evidence.length === 0) return <p className="muted">No evidence recorded yet. Missing evidence stays unknown; nothing is guessed.</p>
  const counts = new Map<string, number>()
  for (const item of evidence) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  return (
    <ul className="support-list">
      {Array.from(counts.entries()).map(([kind, count]) => (
        <li key={kind}>
          <EvidenceKindBadge kind={kind} /> <span>{count}</span>
        </li>
      ))}
    </ul>
  )
}

interface StepProps {
  data: CaseResponse
  auth: ApplicantAuth
  onCase: (c: CaseResponse) => void
  demoMode: boolean
  backendStatus: string
  modelConfigured: boolean | null
  onShowEvidence: (id?: string) => void
}

function CurrentStep(props: StepProps) {
  const { data } = props
  switch (data.state) {
    case 'AWAITING_EMAIL':
      return <VerifyEmailCard {...props} />
    case 'RESEARCH_QUEUED':
    case 'RESEARCHING':
      return (
        <Card title={data.state === 'RESEARCH_QUEUED' ? 'Research queued' : 'Researching your company'} tone="accent">
          <div className="row">
            <Spinner />
            <p>{stateMeta(data.state).applicant} This page refreshes automatically.</p>
          </div>
          <p className="muted">The worker resolves the company by domain, requests basic profile, headcount and funding fields from the research provider, and evaluates the policy rules. Provider data corroborates; it does not replace your declarations.</p>
        </Card>
      )
    case 'AWAITING_APPLICANT':
      return <InformationRequestCard {...props} />
    case 'EXCEPTION':
      return <ExceptionCard {...props} />
    case 'BUDGET_WAITING':
      return (
        <Card title="Waiting for program budget" tone="info">
          <p>{stateMeta('BUDGET_WAITING').applicant}</p>
          <p className="muted">Budget is rechecked at issuance. No eligibility rule failed because of this hold.</p>
        </Card>
      )
    case 'ENROLLED':
      return (
        <Card title="Enrolled" tone="success">
          <p>{stateMeta('ENROLLED').applicant}</p>
          {data.grant ? <GrantReceipt grant={data.grant} accountId={data.account_id} /> : <p className="muted">The backend reports enrollment but has not attached a grant receipt to this case yet.</p>}
          <div className="row">
            <Link to={routes.account} className="btn btn-primary btn-md">
              Open product account
            </Link>
          </div>
        </Card>
      )
    case 'DUPLICATE_RESOLVED':
      return (
        <Card title="Linked to an existing grant" tone="success">
          <p>{stateMeta('DUPLICATE_RESOLVED').applicant} One grant per company applies; no second grant is issued.</p>
          {data.grant ? <GrantReceipt grant={data.grant} accountId={data.account_id} /> : <p className="muted">The existing grant's receipt is not attached to this case; the product account page shows the server-reported balance.</p>}
          <Link to={routes.account} className="btn btn-secondary btn-md">
            Open product account
          </Link>
        </Card>
      )
    case 'DECLINED':
      return (
        <Card title={`Declined under policy ${data.policy_version}`} tone="danger">
          <p>{stateMeta('DECLINED').applicant}</p>
          <UnresolvedChecks data={data} onShowEvidence={props.onShowEvidence} statuses={['FAIL']} />
          <p className="muted">Declines rest on supported failing rules only. A research failure alone cannot decline an application.</p>
        </Card>
      )
    default:
      return (
        <Card title={`State: ${data.state}`}>
          <p>{stateMeta(data.state).applicant}</p>
        </Card>
      )
  }
}

function UnresolvedChecks({ data, onShowEvidence, statuses }: { data: CaseResponse; onShowEvidence: (id?: string) => void; statuses: string[] }) {
  const items = data.checks.filter((c) => statuses.includes(c.status))
  if (items.length === 0) return <p className="muted">The backend has not attached a specific check to this state.</p>
  return (
    <ul className="check-list">
      {items.map((check, index) => (
        <li key={`${check.rule}-${index}`}>
          <div className="row">
            <CheckStatusBadge status={check.status} />
            <strong>{humanizeRule(check.rule)}</strong>
          </div>
          <p>{check.reason}</p>
          {check.evidence_ids.length > 0 && (
            <div className="chip-row">
              {check.evidence_ids.map((id) => (
                <button key={id} type="button" className="chip chip-btn mono" onClick={() => onShowEvidence(id)}>
                  {id.length > 14 ? `${id.slice(0, 12)}…` : id}
                </button>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function VerifyEmailCard({ data, auth, onCase, demoMode, backendStatus }: StepProps) {
  const id = useId()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = code.trim()
    if (!VERIFICATION_CODE_PATTERN.test(trimmed)) {
      setLocalError('Enter the six-digit code exactly as issued.')
      return
    }
    setLocalError(null)
    setBusy(true)
    setError(null)
    try {
      const updated = await api.verifyEmail(data.id, { code: trimmed }, auth)
      onCase(updated)
      pushToast({ tone: 'success', title: 'Mailbox verified', message: `Backend state is now ${updated.state}. Research has been scheduled.` })
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card title="Verify your work mailbox" tone="accent" subtitle={`A single-use six-digit code was issued to ${data.work_email}. Entering it proves mailbox control, not legal authority.`}>
        <form className="stack-sm" onSubmit={submit} noValidate>
          <Field id={id} label="Verification code" required error={localError} hint="Codes expire and lock after five wrong attempts. This version has no reissue endpoint: an expired code means submitting a fresh application.">
            <input
              id={id}
              className="input input-code mono"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={!!localError}
              aria-describedby={describedBy(id, true, !!localError)}
            />
          </Field>
          {error && <ErrorNotice error={error} />}
          <div className="row">
            <Button type="submit" variant="primary" loading={busy}>
              Verify mailbox
            </Button>
          </div>
        </form>
      </Card>
      {demoMode ? (
        <DemoMailbox applicationId={data.id} auth={auth} live onUseCode={(value) => setCode(value)} />
      ) : (
        <Notice tone="neutral" compact title="Where is the code?">
          {backendStatus === 'ok'
            ? 'This backend is not in demo mode: the code goes to the real work address, and no simulated mailbox is shown.'
            : 'The backend status is unknown, so the simulated mailbox is not shown until the backend confirms demo mode.'}
        </Notice>
      )}
    </div>
  )
}

const INCOMPLETE_RESEARCH = new Set<string>(['unconfigured', 'partial', 'failed'])

function latestRequestMessage(data: CaseResponse) {
  const outbound = [...data.messages].filter((m) => m.direction === 'outbound').sort((a, b) => a.created_at.localeCompare(b.created_at))
  return outbound.filter((m) => m.kind.toLowerCase().includes('request')).at(-1) ?? outbound.at(-1) ?? null
}

function RequestBox({ message }: { message: CaseResponse['messages'][number] }) {
  return (
    <div className="request-box">
      <p className="request-subject">{message.subject}</p>
      <pre className="message-body">{message.body}</pre>
      <p className="muted">Recorded {formatDateTime(message.created_at)}</p>
    </div>
  )
}

/** The backend holds enrollment while research is unconfigured, partial or failed; the applicant cannot satisfy that check. */
function ResearchHoldNotice({ data }: { data: CaseResponse }) {
  const checkOpen = data.checks.some((c) => c.rule === 'research' && c.status !== 'PASS')
  if (!checkOpen && !INCOMPLETE_RESEARCH.has(data.research.status)) return null
  const factsRequested = requestedFacts(data.checks).size > 0
  return (
    <Notice tone="warning" compact title="External research is incomplete">
      <p>{data.research.error ?? `The backend reports research status "${data.research.status}".`}</p>
      <p className="muted">
        This is not an eligibility failure, and nothing you send can substitute for it: a program operator must restore research before credits can be issued.
        {factsRequested ? ' Any facts requested below are still needed from you.' : ' You may still add an explanation or supporting links; they are recorded on the case.'}
      </p>
    </Notice>
  )
}

function InformationRequestCard({ data, auth, onCase, modelConfigured, onShowEvidence }: StepProps) {
  const latestRequest = latestRequestMessage(data)
  const openChecks = data.checks.filter((c) => c.status !== 'PASS')
  const researchOnly = openChecks.length > 0 && openChecks.every((c) => c.rule === 'research') && requestedFacts(data.checks).size === 0
  return (
    <Card
      title={researchOnly ? 'Waiting for program research' : 'Information requested'}
      tone={researchOnly ? 'info' : 'warning'}
      subtitle={
        researchOnly
          ? 'Nothing is needed from you right now; the hold is on the program side and this page keeps refreshing.'
          : 'Reply here. Your answer is authenticated to this application and the case resumes without an operator.'
      }
    >
      <div className="stack">
        {latestRequest ? <RequestBox message={latestRequest} /> : <p className="muted">The backend has not attached a message to this request; the checks below describe what is missing.</p>}
        <UnresolvedChecks data={data} onShowEvidence={onShowEvidence} statuses={['NEEDS_INFORMATION', 'CONFLICT']} />
        <ResearchHoldNotice data={data} />
        <ReplyForm kase={data} auth={auth} modelConfigured={modelConfigured} onCase={onCase} context="request" />
      </div>
    </Card>
  )
}

/** The backend accepts applicant replies while an exception is open; they are recorded for the operator and re-evaluated. */
function ExceptionCard({ data, auth, onCase, modelConfigured, onShowEvidence }: StepProps) {
  const latestRequest = latestRequestMessage(data)
  return (
    <Card title="Under operator review" tone="danger" subtitle="Nothing has been decided. The unresolved question is with a program operator.">
      <div className="stack">
        <p>{stateMeta('EXCEPTION').applicant}</p>
        {latestRequest && <RequestBox message={latestRequest} />}
        <UnresolvedChecks data={data} onShowEvidence={onShowEvidence} statuses={['CONFLICT', 'NEEDS_INFORMATION']} />
        <ResearchHoldNotice data={data} />
        <p className="muted">
          An operator may ask you for clarification, record a reasoned waiver, or decline with reasons. You can add a clarification now: it is recorded for the operator
          and the backend re-evaluates the case, but a conflict with provider records is resolved by the operator, not by your reply alone.
        </p>
        <h3 className="section-title">Add a clarification (optional)</h3>
        <ReplyForm kase={data} auth={auth} modelConfigured={modelConfigured} onCase={onCase} context="clarification" />
      </div>
    </Card>
  )
}

function SessionPanel({ session }: { session: ApplicantSession }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <Card title="This session">
      <KeyValue
        items={[
          { key: 'id', label: 'Application id', value: session.applicationId, mono: true },
          { key: 'email', label: 'Work email', value: session.workEmail || '—' },
          { key: 'created', label: 'Stored', value: session.createdAt ? formatDateTime(session.createdAt) : '—' },
          { key: 'token', label: 'Access token', value: <span className="muted">Held in this tab's session storage; never shown or placed in a URL.</span> },
        ]}
      />
      <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
        Forget this application in this tab
      </Button>
      <ConfirmDialog open={confirm} title="Forget this application?" confirmLabel="Forget it" danger onCancel={() => setConfirm(false)} onConfirm={() => { clearApplicantSession(); setConfirm(false) }}>
        <p>The access token was issued once by the backend and cannot be recovered from this interface. The application itself is unaffected, but you will not be able to reopen it from this tab.</p>
      </ConfirmDialog>
    </Card>
  )
}
