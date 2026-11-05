import { useCallback, useId, useState } from 'react'
import { api, type OperatorAuth } from '../api'
import { toApiError, type ApiError } from '../api/errors'
import { LIMITS, RESOLUTION_ACTIONS, type CaseResponse, type CreditAccount, type ResolutionAction } from '../api/types'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { ChecksTable } from '../components/ChecksTable'
import { CreditAccountPanel } from '../components/CreditAccountPanel'
import { EvidenceDrawer, EvidenceList } from '../components/EvidenceDrawer'
import { ExportCaseButton } from '../components/ExportCaseButton'
import { FactsCard } from '../components/FactsCard'
import { GrantReceipt } from '../components/GrantReceipt'
import { MessageThread } from '../components/MessageThread'
import { ResearchStatusCard } from '../components/ResearchStatusCard'
import { CheckStatusBadge, StateBadge } from '../components/StateBadge'
import { ToolCallsTable } from '../components/ToolCallsTable'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ErrorNotice } from '../components/ui/ErrorNotice'
import { Field } from '../components/ui/Field'
import { KeyValue } from '../components/ui/KeyValue'
import { Link } from '../components/ui/Link'
import { Notice } from '../components/ui/Notice'
import { LoadingBlock, Spinner } from '../components/ui/Spinner'
import { config } from '../config'
import { useHealth } from '../hooks/health'
import { useCase } from '../hooks/useCase'
import { usePolling } from '../hooks/usePolling'
import { ageSeconds, formatDateTime, formatRelative } from '../lib/dates'
import { routes } from '../lib/router'
import { ACTIVE_STATES, humanizeRule, isTerminal, stateMeta } from '../lib/states'
import { buildTimeline } from '../lib/timeline'
import { pushToast } from '../lib/toastStore'
import { describedBy } from '../lib/a11y'

const STALLED_AFTER_SECONDS = 90

export function OperatorCasePage({ applicationId, auth }: { applicationId: string; auth: OperatorAuth }) {
  const kase = useCase(applicationId, auth)
  const { health } = useHealth()
  const credits = usePolling<CreditAccount>(() => api.getCredits(applicationId, auth), {
    key: `op-credits|${applicationId}|${auth.token}`,
    intervalFor: (_data, error) => (error ? (error.status === 401 || error.status === 403 || error.status === 404 ? null : config.caseErrorPollMs) : config.creditsPollMs),
  })
  const [drawer, setDrawer] = useState<{ open: boolean; focus: string | null }>({ open: false, focus: null })
  const showEvidence = useCallback((id?: string) => setDrawer({ open: true, focus: id ?? null }), [])
  const closeDrawer = useCallback(() => setDrawer((d) => ({ ...d, open: false })), [])

  const data = kase.data
  if (!data) {
    return (
      <div className="page">
        <Link to={routes.operator} className="btn btn-ghost btn-sm">
          ← Queue
        </Link>
        {kase.loading && !kase.error && <LoadingBlock label="Loading case…" />}
        {kase.error && (
          <ErrorNotice error={kase.error} onRetry={kase.error.status === 401 || kase.error.status === 403 || kase.error.status === 404 ? undefined : kase.refresh}>
            {(kase.error.status === 401 || kase.error.status === 403) && (
              <p>
                The backend rejected the operator token held in this tab for this case. The case route also accepts applicant tokens, so the refusal is worded as
                "Invalid applicant credentials". Go back to the queue, choose "Forget token" and enter the token configured in the backend's OPERATOR_TOKEN.
              </p>
            )}
          </ErrorNotice>
        )}
      </div>
    )
  }

  const meta = stateMeta(data.state)
  const terminal = isTerminal(data.state)
  const timeline = buildTimeline(data, { includeToolCalls: true })
  const updatedAge = ageSeconds(data.updated_at)
  const possiblyStalled = ACTIVE_STATES.has(data.state) && updatedAge !== null && updatedAge > STALLED_AFTER_SECONDS
  // backend/main.py retry: any verified, non-terminal case without an active worker lease may be requeued.
  const researchIncomplete = data.research.status === 'failed' || data.research.status === 'partial' || data.research.status === 'unconfigured'
  const researchCheckOpen = data.checks.some((c) => c.rule === 'research' && c.status !== 'PASS')
  const retryOffered = !terminal && data.email_verified && (possiblyStalled || (!ACTIVE_STATES.has(data.state) && (researchIncomplete || researchCheckOpen || data.research.retryable === true)))

  const onCase = (updated: CaseResponse) => {
    kase.applyData(updated)
    credits.refresh()
  }

  return (
    <div className="page">
      <Link to={routes.operator} className="btn btn-ghost btn-sm">
        ← Queue
      </Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            Case <span className="mono">{data.id}</span> · {data.domain}
          </p>
          <h1>{data.company_name}</h1>
          <div className="row">
            <StateBadge state={data.state} />
            <span className="muted">Policy {data.policy_version}</span>
            <span className="muted">{data.email_verified ? 'Mailbox verified' : 'Mailbox not verified'}</span>
            <span className="muted" title={formatDateTime(data.updated_at)}>
              Updated {formatRelative(data.updated_at)}
            </span>
            {!terminal && <Spinner label="Live" />}
          </div>
          <p className="lead">{meta.operator}</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" size="sm" onClick={kase.refresh} loading={kase.loading}>
            Refresh
          </Button>
        </div>
      </header>

      {kase.error && (
        <ErrorNotice error={kase.error} compact onRetry={kase.refresh}>
          <p className="muted">Showing the last state received ({formatRelative(data.updated_at)}).</p>
        </ErrorNotice>
      )}

      <div className="layout-2col">
        <div className="col-main stack">
          {data.state === 'EXCEPTION' && <ExceptionPanel data={data} auth={auth} onCase={onCase} onShowEvidence={showEvidence} />}
          {data.state === 'BUDGET_WAITING' && (
            <Notice tone="info" title="Held for program budget">
              Evaluation is complete and no rule failed; the program allocation is unavailable. Issuance resumes when budget is available and is rechecked in the issuing transaction. There is no operator action for this hold.
            </Notice>
          )}
          {data.state === 'AWAITING_APPLICANT' && researchCheckOpen && (
            <Notice tone="warning" title="Held on external research" compact>
              The research check is open (research status: {data.research.status}) and the applicant cannot satisfy it. Restore the research configuration or provider on the
              backend, then requeue the job from the research card. Any other open checks still wait on the applicant.
            </Notice>
          )}
          {data.state === 'AWAITING_APPLICANT' && !researchCheckOpen && (
            <Notice tone="warning" title="Waiting on the applicant" compact>
              The case resumes automatically when the applicant replies. No operator action is required unless it becomes an exception.
            </Notice>
          )}
          {possiblyStalled && (
            <Notice tone="warning" title="Possibly stalled research job" compact>
              State {data.state} has not changed for {Math.round(updatedAge ?? 0)}s. If the worker is down or the job lost its lease, requeue it below.
              {health?.worker_required ? ' This backend needs a separate worker process (python -m backend.worker); check that it is running.' : ''}
            </Notice>
          )}

          <Card title="Policy checks" subtitle="Per-rule outcomes with the evidence ids each one cites.">
            <ChecksTable checks={data.checks} onShowEvidence={showEvidence} />
          </Card>

          <Card title="Applicant conversation" subtitle="Messages recorded by the backend. An outbound row proves the message was queued, not delivered.">
            <MessageThread messages={data.messages} />
          </Card>

          <Card title="Research tool calls">
            <ToolCallsTable toolCalls={data.tool_calls} />
          </Card>

          <Card title="Activity stream" subtitle="Events, messages and tool calls in order.">
            <ActivityTimeline items={timeline} />
          </Card>
        </div>

        <aside className="col-side stack">
          <ResearchStatusCard research={data.research} actions={retryOffered ? <RetryResearchButton data={data} auth={auth} onCase={onCase} /> : undefined} />
          <FactsCard facts={data.facts} evidence={data.evidence} policyVersion={data.policy_version} onShowEvidence={showEvidence} />
          <Card
            title="Evidence and sources"
            subtitle={`${data.evidence.length} item${data.evidence.length === 1 ? '' : 's'}`}
            actions={
              <Button size="sm" onClick={() => showEvidence()}>
                Open drawer
              </Button>
            }
          >
            <EvidenceList evidence={data.evidence.slice(0, 3)} highlightId={null} />
            {data.evidence.length > 3 && <p className="muted">Showing 3 of {data.evidence.length}; open the drawer for all.</p>}
          </Card>
          <Card title="Grant and account">
            {data.grant ? <GrantReceipt grant={data.grant} accountId={data.account_id} /> : <p className="muted">No grant on this case{data.account_id ? `; linked account ${data.account_id}` : ''}.</p>}
            <h3 className="section-title">Credit account (read-only)</h3>
            {!credits.data && credits.loading && <LoadingBlock label="Loading credits…" />}
            {credits.error && <ErrorNotice error={credits.error} compact onRetry={credits.refresh} />}
            {credits.data && <CreditAccountPanel credits={credits.data} />}
          </Card>
          <Card title="Applicant">
            <KeyValue
              items={[
                { key: 'email', label: 'Work email', value: data.work_email },
                { key: 'created', label: 'Created', value: formatDateTime(data.created_at) },
                { key: 'account', label: 'Account id', value: data.account_id ?? '—', mono: true },
              ]}
            />
          </Card>
          <Card title="Export">
            <ExportCaseButton applicationId={data.id} auth={auth} />
          </Card>
        </aside>
      </div>

      <EvidenceDrawer open={drawer.open} onClose={closeDrawer} evidence={data.evidence} highlightId={drawer.focus} />
    </div>
  )
}

const ACTION_META: Record<ResolutionAction, { label: string; description: string; danger: boolean }> = {
  request_information: { label: 'Request information', description: 'Send the applicant a specific clarification request; the case moves to waiting-on-applicant and resumes on reply.', danger: false },
  waive_conflict: { label: 'Waive conflict', description: 'Record a reasoned waiver of a CONFLICT check and let evaluation rerun. Mailbox verification, authority, duplicate constraints and budget cannot be waived; a waiver never issues a second grant.', danger: false },
  decline: { label: 'Decline', description: 'Decline with specific supported reasons recorded as operator evidence.', danger: true },
}

function ExceptionPanel({ data, auth, onCase, onShowEvidence }: { data: CaseResponse; auth: OperatorAuth; onCase: (c: CaseResponse) => void; onShowEvidence: (id?: string) => void }) {
  const idBase = useId()
  const unresolved = data.checks.filter((c) => c.status === 'CONFLICT' || c.status === 'NEEDS_INFORMATION')
  const hasConflict = data.checks.some((c) => c.status === 'CONFLICT')
  // backend/main.py refuses to waive a provider identity collision ("confirm legal entity"); it needs account reconciliation.
  const entityCollision = data.checks.some((c) => c.status === 'CONFLICT' && /confirm legal entity/i.test(c.reason))
  const [action, setAction] = useState<ResolutionAction>('request_information')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const reasonOk = reason.trim().length >= LIMITS.resolutionReason.min && reason.trim().length <= LIMITS.resolutionReason.max
  const offered = RESOLUTION_ACTIONS.filter((a) => a !== 'waive_conflict' || hasConflict)

  const open = () => {
    if (!reasonOk) {
      setLocalError(`Write a specific reason of at least ${LIMITS.resolutionReason.min} characters; it is recorded as operator evidence.`)
      document.getElementById(`${idBase}-reason`)?.focus()
      return
    }
    setLocalError(null)
    setConfirm(true)
  }

  const resolve = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.operatorResolve(data.id, { action, reason: reason.trim() }, auth)
      onCase(updated)
      setConfirm(false)
      setReason('')
      pushToast({ tone: 'success', title: 'Resolution recorded by the backend', message: `Action ${ACTION_META[action].label}; backend state is now ${updated.state}.` })
    } catch (err) {
      setError(toApiError(err))
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Exception: operator decision required" tone="danger" subtitle="The precise unresolved question, the evidence in play, and the actions the backend permits. Every action needs an explicit reason.">
      <div className="stack">
        {unresolved.length === 0 ? (
          <p className="muted">The backend reports EXCEPTION without a CONFLICT or NEEDS_INFORMATION check. Read the activity stream for the reason it recorded.</p>
        ) : (
          <ul className="check-list">
            {unresolved.map((check, index) => (
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
        )}

        <fieldset className="fieldset">
          <legend>Action</legend>
          <div className="stack-sm">
            {offered.map((a) => (
              <label key={a} className={`radio-row ${action === a ? 'radio-active' : ''}`.trim()}>
                <input type="radio" name={`${idBase}-action`} value={a} checked={action === a} onChange={() => setAction(a)} />
                <span>
                  <strong>{ACTION_META[a].label}</strong>
                  <span className="muted block">{ACTION_META[a].description}</span>
                </span>
              </label>
            ))}
            {!hasConflict && <p className="muted">"Waive conflict" is not offered because no check is in CONFLICT. The backend would refuse it.</p>}
            {entityCollision && (
              <Notice tone="warning" compact title="Entity collision cannot be waived">
                The conflict reports a provider identity overlapping an account on another domain. The backend refuses a waiver for this (it requires account
                reconciliation, which v1 does not implement); request information or decline are the actions it accepts.
              </Notice>
            )}
          </div>
        </fieldset>

        <Field id={`${idBase}-reason`} label="Reason (recorded as operator evidence)" required error={localError} hint={`${LIMITS.resolutionReason.min}–${LIMITS.resolutionReason.max.toLocaleString('en-US')} characters. Be specific: which evidence you weighed and why.`}>
          <textarea id={`${idBase}-reason`} className="textarea" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LIMITS.resolutionReason.max} aria-invalid={!!localError} aria-describedby={describedBy(`${idBase}-reason`, true, !!localError)} />
        </Field>
        {error && <ErrorNotice error={error} />}
        <div className="row">
          <Button variant={ACTION_META[action].danger ? 'danger' : 'primary'} onClick={open} disabled={!reasonOk}>
            {ACTION_META[action].label}…
          </Button>
          <span className="muted">The backend reruns evaluation after a resolution; no action here issues credits directly.</span>
        </div>
      </div>
      <ConfirmDialog open={confirm} title={`Confirm: ${ACTION_META[action].label}`} confirmLabel={`Record ${ACTION_META[action].label.toLowerCase()}`} danger={ACTION_META[action].danger} busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void resolve()}>
        <p>{ACTION_META[action].description}</p>
        <p className="muted">Reason to be recorded:</p>
        <pre className="message-body">{reason.trim()}</pre>
      </ConfirmDialog>
    </Card>
  )
}

function RetryResearchButton({ data, auth, onCase }: { data: CaseResponse; auth: OperatorAuth; onCase: (c: CaseResponse) => void }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const retry = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.operatorRetry(data.id, auth)
      onCase(updated)
      setConfirm(false)
      pushToast({ tone: 'success', title: 'Research job requeued', message: `Backend state is now ${updated.state}.` })
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button size="sm" onClick={() => setConfirm(true)}>
        Retry research
      </Button>
      <ConfirmDialog open={confirm} title="Requeue the research job?" confirmLabel="Requeue" busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void retry()}>
        <p>POST /retry requeues a stalled or failed research job. It cannot issue credits, fabricate evidence or approve anything; the backend may refuse if the job is not retryable.</p>
        {error && <ErrorNotice error={error} compact />}
      </ConfirmDialog>
    </>
  )
}
