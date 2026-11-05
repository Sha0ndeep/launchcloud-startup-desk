import type { Evidence, FactValues } from '../api/types'
import { FACT_LABELS, formatEvidenceValue, formatFactValue, type FactKey } from '../lib/facts'
import { formatDate } from '../lib/dates'
import { EvidenceKindBadge } from './StateBadge'
import { Card } from './ui/Card'

const FACT_ORDER: FactKey[] = ['product_kind', 'founding_year', 'headcount', 'funding_usd', 'authority_declared', 'attestation_accepted']

/** Current normalized facts with the evidence kinds that support each one. Unknown values stay unknown. */
export function FactsCard({ facts, evidence, policyVersion, onShowEvidence }: { facts: FactValues; evidence: Evidence[]; policyVersion: string; onShowEvidence?: (id: string) => void }) {
  return (
    <Card title="Facts on file" subtitle={`As normalized by the backend under policy ${policyVersion}`}>
      <table className="table table-compact">
        <thead>
          <tr>
            <th scope="col">Fact</th>
            <th scope="col">Current value</th>
            <th scope="col">Support</th>
          </tr>
        </thead>
        <tbody>
          {FACT_ORDER.map((key) => {
            const support = evidence.filter((e) => e.field === key)
            return (
              <tr key={key}>
                <th scope="row">{FACT_LABELS[key]}</th>
                <td className={facts[key] === null ? 'muted' : undefined}>{formatFactValue(key, facts[key])}</td>
                <td>
                  {support.length === 0 ? (
                    <span className="muted">No evidence recorded</span>
                  ) : (
                    <ul className="support-list">
                      {support.map((e) => (
                        <li key={e.id}>
                          <button type="button" className="link-btn" onClick={() => onShowEvidence?.(e.id)} title={e.note}>
                            <EvidenceKindBadge kind={e.kind} />
                          </button>{' '}
                          <span>{formatEvidenceValue(e)}</span>
                          {e.observed_at && <span className="muted"> · as of {formatDate(e.observed_at)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
