import type { Research } from '../api/types'
import { researchStatusMeta } from '../lib/states'
import { ResearchStatusBadge } from './StateBadge'
import { Card } from './ui/Card'
import { Notice } from './ui/Notice'

export function ResearchStatusCard({ research, actions }: { research: Research; actions?: React.ReactNode }) {
  const meta = researchStatusMeta(research.status)
  return (
    <Card title="Company research" actions={actions}>
      <div className="stack-sm">
        <div className="row">
          <ResearchStatusBadge status={research.status} />
          <span className="muted">{research.configured ? 'Provider configured' : 'No research provider configured'}</span>
        </div>
        <p>{meta.description}</p>
        {research.stop_reason && <p><strong>Investigation stopped:</strong> {['operator_conflict', 'clarification_required'].includes(research.stop_reason) ? 'conflicting evidence found' : research.stop_reason.replaceAll('_', ' ')}</p>}
        {research.unresolved_facts && research.unresolved_facts.length > 0 && <p>Unresolved at investigation end: {research.unresolved_facts.join(', ')}. Search leads do not replace applicant declarations.</p>}
        {research.plan && research.plan.length > 0 && (
          <details><summary>Investigation plan · {research.rounds} {research.rounds === 1 ? 'round' : 'rounds'}</summary>
            <p className="muted">Planner: {research.planner_status?.replaceAll('_', ' ')}. At most 3 rounds, 10 total calls and 25 estimated research credits per case.</p>
            <ol>{research.plan.map((step, index) => <li key={index}>Round {step.round}: {step.purpose} <span className="muted">(estimated {step.estimated_cost} research credits)</span></li>)}</ol>
          </details>
        )}
        {research.error && (
          <Notice tone={research.status === 'failed' ? 'danger' : 'warning'} compact title="Reported by the research job">
            <p>{research.error}</p>
            {research.retryable !== undefined && (
              <p className="muted">
                {research.retryable ? 'The backend marks this job retryable.' : 'The backend marks this job not retryable; it needs explicit repair.'}
                {research.retry_after_seconds !== undefined && ` Suggested wait: ${research.retry_after_seconds}s.`}
              </p>
            )}
          </Notice>
        )}
        {(research.status === 'failed' || research.status === 'unconfigured') && (
          <p className="muted">A research failure or missing provider is never an eligibility failure. The backend holds enrollment rather than inserting synthetic provider data.</p>
        )}
      </div>
    </Card>
  )
}
