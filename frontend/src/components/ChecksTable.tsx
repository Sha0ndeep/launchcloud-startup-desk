import type { Check } from '../api/types'
import { humanizeRule } from '../lib/states'
import { CheckStatusBadge } from './StateBadge'
import { EmptyState } from './ui/EmptyState'

export function ChecksTable({ checks, onShowEvidence }: { checks: Check[]; onShowEvidence?: (evidenceId: string) => void }) {
  if (checks.length === 0) {
    return <EmptyState compact title="No policy checks yet" description="Checks appear once mailbox control is verified and the research job has evaluated the case." />
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Rule</th>
          <th scope="col">Outcome</th>
          <th scope="col">Reason</th>
          <th scope="col">Evidence</th>
        </tr>
      </thead>
      <tbody>
        {checks.map((check, index) => (
          <tr key={`${check.rule}-${index}`}>
            <th scope="row">{humanizeRule(check.rule)}</th>
            <td>
              <CheckStatusBadge status={check.status} />
            </td>
            <td>{check.reason}</td>
            <td>
              {check.evidence_ids.length === 0 ? (
                <span className="muted">none cited</span>
              ) : (
                <div className="chip-row">
                  {check.evidence_ids.map((id) => (
                    <button type="button" key={id} className="chip chip-btn mono" onClick={() => onShowEvidence?.(id)} title="Open this evidence item">
                      {id.length > 14 ? `${id.slice(0, 12)}…` : id}
                    </button>
                  ))}
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
