import { useMemo, useState } from 'react'
import { api, type OperatorAuth } from '../api'
import type { ApplicationSummary, OperatorQueue } from '../api/types'
import { ProgramPolicyCard } from '../components/ProgramPolicyCard'
import { StateBadge } from '../components/StateBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorNotice } from '../components/ui/ErrorNotice'
import { Link } from '../components/ui/Link'
import { LoadingBlock, Spinner } from '../components/ui/Spinner'
import { Stat } from '../components/ui/Stat'
import { config } from '../config'
import { usePolling } from '../hooks/usePolling'
import { formatDateTime, formatRelative } from '../lib/dates'
import { formatCents } from '../lib/money'
import { routes } from '../lib/router'
import { clearOperatorToken } from '../lib/session'
import { ALL_STATES, STATE_META, stateMeta } from '../lib/states'

type Filter = 'ALL' | 'NEEDS_OPERATOR' | (typeof ALL_STATES)[number]
const NO_APPLICATIONS: ApplicationSummary[] = []

export function OperatorQueuePage({ auth }: { auth: OperatorAuth }) {
  const queue = usePolling<OperatorQueue>(() => api.operatorQueue(auth), {
    key: `queue|${auth.token}`,
    intervalFor: (_data, error) => {
      if (error) return error.status === 401 || error.status === 403 ? null : config.caseErrorPollMs
      return config.queuePollMs
    },
  })
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')

  const applications = queue.data?.applications ?? NO_APPLICATIONS
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const app of applications) map.set(app.state, (map.get(app.state) ?? 0) + 1)
    return map
  }, [applications])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return applications
      .filter((app) => {
        if (filter === 'ALL') return true
        if (filter === 'NEEDS_OPERATOR') return app.state === 'EXCEPTION'
        return app.state === filter
      })
      .filter((app) => (term ? [app.company_name, app.domain, app.work_email, app.id].some((v) => v.toLowerCase().includes(term)) : true))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [applications, filter, search])

  const authFailure = queue.error !== null && (queue.error.status === 401 || queue.error.status === 403)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operator desk</p>
          <h1>Program queue</h1>
          <p className="lead">Ordinary cases complete on their own. Exceptions need an explicit, reasoned decision; nothing here approves routinely.</p>
        </div>
        <div className="page-actions">
          {queue.data && !queue.error && <Spinner label={`Live · ${formatRelative(queue.lastUpdated ? new Date(queue.lastUpdated).toISOString() : null)}`} />}
          <Button variant="ghost" size="sm" onClick={queue.refresh} loading={queue.loading && !!queue.data}>
            Refresh
          </Button>
        </div>
      </header>

      {queue.error && (
        <ErrorNotice
          error={queue.error}
          onRetry={authFailure ? clearOperatorToken : queue.refresh}
          retryLabel={authFailure ? 'Change token' : 'Retry'}
        >
          {authFailure && <p>The backend rejected the operator token held in this tab. Enter the token configured in the backend's environment.</p>}
        </ErrorNotice>
      )}

      {!queue.data && queue.loading && !queue.error && <LoadingBlock label="Loading queue…" />}

      {queue.data && (
        <>
          <div className="stats-grid stats-grid-wide">
            <Stat label="Applications" value={applications.length} />
            <Stat label="Enrolled" value={counts.get('ENROLLED') ?? 0} tone="success" hint={`${counts.get('DUPLICATE_RESOLVED') ?? 0} linked to existing grants`} />
            <Stat label="Exceptions awaiting operator" value={counts.get('EXCEPTION') ?? 0} tone={(counts.get('EXCEPTION') ?? 0) > 0 ? 'danger' : 'neutral'} />
            <Stat label="Waiting on applicant" value={(counts.get('AWAITING_APPLICANT') ?? 0) + (counts.get('AWAITING_EMAIL') ?? 0)} tone="warning" hint="Not operator work" />
            <Stat label="Budget waiting" value={counts.get('BUDGET_WAITING') ?? 0} tone={(counts.get('BUDGET_WAITING') ?? 0) > 0 ? 'info' : 'neutral'} />
            <Stat label="Credits issued (allocated)" value={formatCents(queue.data.program.allocated_cents)} hint={`${formatCents(queue.data.program.remaining_cents)} remaining of ${formatCents(queue.data.program.budget_cents)}`} tone={queue.data.program.remaining_cents < queue.data.program.benefit_cents ? 'warning' : 'neutral'} />
          </div>

          <div className="layout-2col">
            <div className="col-main stack">
              <Card
                title="Applications"
                subtitle={`${visible.length} of ${applications.length} shown`}
                actions={
                  <label className="search">
                    <span className="visually-hidden">Search applications</span>
                    <input className="input input-sm" type="search" placeholder="Search company, domain, email, id" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </label>
                }
              >
                <div className="chip-row" role="group" aria-label="Filter by state">
                  <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')} label="All" count={applications.length} />
                  <FilterChip active={filter === 'NEEDS_OPERATOR'} onClick={() => setFilter('NEEDS_OPERATOR')} label="Needs operator" count={counts.get('EXCEPTION') ?? 0} tone="danger" />
                  {ALL_STATES.map((state) => (
                    <FilterChip key={state} active={filter === state} onClick={() => setFilter(state)} label={STATE_META[state].label} count={counts.get(state) ?? 0} />
                  ))}
                </div>
                {visible.length === 0 ? (
                  <EmptyState compact title={applications.length === 0 ? 'No applications yet' : 'No applications match this filter'} description={applications.length === 0 ? 'Applications appear here as soon as the backend records them.' : undefined} />
                ) : (
                  <QueueTable applications={visible} />
                )}
              </Card>
            </div>
            <aside className="col-side stack">
              <ProgramPolicyCard program={queue.data.program} error={null} loading={false} showAllocation />
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: 'danger' }) {
  return (
    <button type="button" className={`chip chip-btn ${active ? 'chip-active' : ''} ${tone ? `chip-${tone}` : ''}`.trim()} onClick={onClick} aria-pressed={active}>
      {label} <span className="chip-count">{count}</span>
    </button>
  )
}

function QueueTable({ applications }: { applications: ApplicationSummary[] }) {
  return (
    <table className="table table-rows">
      <thead>
        <tr>
          <th scope="col">Company</th>
          <th scope="col">State</th>
          <th scope="col">Waiting on</th>
          <th scope="col">Updated</th>
          <th scope="col">Created</th>
          <th scope="col">
            <span className="visually-hidden">Open</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {applications.map((app) => {
          const meta = stateMeta(app.state)
          return (
            <tr key={app.id}>
              <td>
                <Link to={routes.operatorCase(app.id)} className="row-link">
                  {app.company_name}
                </Link>
                <div className="muted small">
                  {app.domain} · {app.work_email}
                </div>
              </td>
              <td>
                <StateBadge state={app.state} />
              </td>
              <td className="muted">{meta.waitingOn === 'none' ? 'Closed' : meta.waitingOn}</td>
              <td className="muted" title={formatDateTime(app.updated_at)}>
                {formatRelative(app.updated_at)}
              </td>
              <td className="muted" title={formatDateTime(app.created_at)}>
                {formatRelative(app.created_at)}
              </td>
              <td>
                <Link to={routes.operatorCase(app.id)} className="btn btn-ghost btn-sm">
                  Open case
                </Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
