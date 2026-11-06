import type { Program } from '../api/types'
import { formatCents, formatUsd } from '../lib/money'
import { Card } from './ui/Card'
import { ErrorNotice } from './ui/ErrorNotice'
import { LoadingBlock } from './ui/Spinner'
import { Stat } from './ui/Stat'

interface Props {
  program: Program | null
  error: unknown
  loading: boolean
  showAllocation?: boolean
  onRetry?: () => void
}

/** Displays the actual configured rules reported by GET /api/program; nothing is assumed when the backend is unavailable. */
export function ProgramPolicyCard({ program, error, loading, showAllocation = false, onRetry }: Props) {
  if (!program) {
    return (
      <Card title="Program policy">
        {loading ? (
          <LoadingBlock label="Loading program policy…" />
        ) : (
          <>
            <ErrorNotice error={error} compact onRetry={onRetry} />
            <p className="muted">The eligibility rules are shown only as the backend reports them. No caps are assumed while it is unavailable.</p>
          </>
        )}
      </Card>
    )
  }
  const p = program.policy
  const v = program.policy_version
  return (
    <Card title={program.name} subtitle={`Policy ${v} · ${formatCents(program.benefit_cents)} promotional product credit per eligible company`}>
      <ul className="rule-list">
        <li>
          <strong>Mailbox control</strong> — a single-use code to the company work address (simulated mailbox in demo mode).
        </li>
        <li>
          <strong>Authority to apply</strong> — recorded applicant declaration; a professional profile corroborates only.
        </li>
        <li>
          <strong>Software startup</strong> with an identifiable product.
        </li>
        <li>
          <strong>Founded in {p.founded_year_min} or later.</strong>
        </li>
        <li>
          <strong>Fewer than {p.headcount_max_exclusive.toLocaleString('en-US')} full-time employees.</strong>
        </li>
        <li>
          <strong>Total funding below {formatUsd(p.funding_max_usd_exclusive)}.</strong> Missing funding is unknown, not zero.
        </li>
        <li>
          <strong>One grant per company</strong>; budget and authorization are rechecked at issuance.
        </li>
      </ul>
      <p className="muted">{p.description}</p>
      <p>
        {p.accept_attestations
          ? `Policy ${v} accepts timestamped applicant declarations for founding year, headcount and funding. Decisions read "accepted under policy ${v}", never "independently verified".`
          : `Policy ${v} does not accept declarations alone: each hard criterion needs independently supported evidence, and missing proof stays unresolved.`}
      </p>
      {showAllocation && (
        <div className="stats-grid">
          <Stat label="Program budget" value={formatCents(program.budget_cents)} />
          <Stat label="Allocated (credits issued)" value={formatCents(program.allocated_cents)} />
          <Stat
            label="Remaining allocation"
            value={formatCents(program.remaining_cents)}
            tone={program.remaining_cents < program.benefit_cents ? 'warning' : 'success'}
            hint={program.remaining_cents < program.benefit_cents ? 'Below one benefit: new approvals will wait for budget' : undefined}
          />
        </div>
      )}
      {showAllocation && program.ledger_reconciled !== undefined && <p className="muted">Demo ledger reconciliation: {program.ledger_reconciled ? 'balances match all grant and usage entries' : 'mismatch requires operator investigation'}.</p>}
    </Card>
  )
}
