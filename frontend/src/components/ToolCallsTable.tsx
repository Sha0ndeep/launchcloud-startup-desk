import type { ToolCall } from '../api/types'
import { formatDateTime } from '../lib/dates'
import { formatResearchCredits } from '../lib/money'
import { Badge } from './ui/Badge'
import { EmptyState } from './ui/EmptyState'

export function ToolCallsTable({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (toolCalls.length === 0) return <EmptyState compact title="No research tool calls recorded" description="Calls appear once the worker starts research. If research is unconfigured, none will." />
  const total = toolCalls.reduce((sum, call) => sum + (Number.isFinite(call.credits_estimate) ? call.credits_estimate : 0), 0)
  return (
    <div className="stack-sm">
      <table className="table table-compact">
        <caption className="table-caption">
          Crustdata research calls. Credit figures are provider <em>estimates</em>, not billing receipts, and are separate from promotional product credits. A connection failure may still have been charged.
        </caption>
        <thead>
          <tr>
            <th scope="col">Endpoint</th>
            <th scope="col">Status</th>
            <th scope="col">Estimated cost</th>
            <th scope="col">Detail</th>
            <th scope="col">At</th>
          </tr>
        </thead>
        <tbody>
          {toolCalls.map((call, index) => {
            const ok = /success|ok|cached/i.test(call.status)
            return (
              <tr key={call.id ?? `${call.endpoint}-${index}`}>
                <td className="mono">{call.endpoint}</td>
                <td>
                  <Badge tone={ok ? 'success' : 'warning'}>{call.status}</Badge>
                </td>
                <td>{formatResearchCredits(call.credits_estimate)}</td>
                <td>{call.detail}</td>
                <td className="muted">{formatDateTime(call.created_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="muted">Estimated research spend on this case: {formatResearchCredits(total)}.</p>
    </div>
  )
}
