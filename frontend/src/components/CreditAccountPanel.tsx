import type { CreditAccount } from '../api/types'
import { compareCreatedAt, formatDateTime } from '../lib/dates'
import { formatCents } from '../lib/money'
import { GrantReceipt } from './GrantReceipt'
import { EmptyState } from './ui/EmptyState'
import { Stat } from './ui/Stat'

/** Server-reported promotional balance, grant receipts and usage. The frontend never computes an alternative balance. */
export function CreditAccountPanel({ credits }: { credits: CreditAccount }) {
  const usage = [...credits.usage].sort(compareCreatedAt).reverse()
  return (
    <div className="stack">
      <div className="stats-grid">
        <Stat label="Available promotional balance" value={formatCents(credits.available_cents)} hint={`Currency ${credits.currency} · reported by the backend`} tone={credits.available_cents > 0 ? 'success' : 'neutral'} />
        <Stat label="Product account" value={credits.account_id ? <span className="mono">{credits.account_id}</span> : <span className="muted">Not provisioned</span>} hint={credits.account_id ? undefined : 'An account is created or linked at enrollment'} />
        <Stat label="Grants / usage entries" value={`${credits.grants.length} / ${credits.usage.length}`} />
      </div>
      {credits.grants.length === 0 ? (
        <EmptyState compact title="No grant on this account" description="A grant receipt appears here after enrollment. A zero balance before enrollment is expected." />
      ) : (
        <div className="stack-sm">
          {credits.grants.map((grant) => (
            <GrantReceipt key={grant.id} grant={grant} accountId={credits.account_id} />
          ))}
        </div>
      )}
      <div>
        <h3 className="section-title">Usage</h3>
        {usage.length === 0 ? (
          <p className="muted">No product usage recorded yet.</p>
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th scope="col">Usage id</th>
                <th scope="col">Amount</th>
                <th scope="col">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.id}</td>
                  <td>−{formatCents(u.amount_cents)}</td>
                  <td className="muted">{formatDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
