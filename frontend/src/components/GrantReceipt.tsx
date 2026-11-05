import type { Grant } from '../api/types'
import { formatDateTime } from '../lib/dates'
import { formatCents } from '../lib/money'
import { KeyValue } from './ui/KeyValue'

export function GrantReceipt({ grant, accountId }: { grant: Grant; accountId: string | null }) {
  return (
    <div className="receipt">
      <p className="receipt-title">Grant receipt · LaunchCloud promotional product credit</p>
      <KeyValue
        columns={2}
        items={[
          { key: 'amount', label: 'Amount', value: <strong>{formatCents(grant.amount_cents)}</strong> },
          { key: 'issued', label: 'Issued', value: formatDateTime(grant.created_at) },
          { key: 'grant', label: 'Grant id', value: grant.id, mono: true },
          { key: 'account', label: 'Product account', value: accountId ?? <span className="muted">not linked</span>, mono: true },
        ]}
      />
      <p className="muted">Issued by the fictional SaaS provider's ledger. Not Crustdata credits, not cash.</p>
    </div>
  )
}
