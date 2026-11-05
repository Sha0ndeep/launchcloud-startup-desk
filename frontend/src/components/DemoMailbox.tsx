import { api, type ApplicantAuth } from '../api'
import type { DemoInbox } from '../api/types'
import { config } from '../config'
import { compareCreatedAt, formatDateTime } from '../lib/dates'
import { usePolling } from '../hooks/usePolling'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { EmptyState } from './ui/EmptyState'
import { ErrorNotice } from './ui/ErrorNotice'
import { LoadingBlock } from './ui/Spinner'

interface Props {
  applicationId: string
  auth: ApplicantAuth
  /** Poll while the case is not terminal; a final fetch still happens when false. */
  live: boolean
  onUseCode?: (code: string) => void
}

/** Team-controlled simulated inbox. Shown only while the backend reports demo mode. Never proof of a delivered email. */
export function DemoMailbox({ applicationId, auth, live, onUseCode }: Props) {
  const inbox = usePolling<DemoInbox>(() => api.getDemoInbox(applicationId, auth), {
    key: `inbox|${applicationId}|${auth.accessToken}`,
    intervalFor: (_data, error) => {
      if (error) return error.status === 401 || error.status === 403 || error.status === 404 ? null : config.caseErrorPollMs
      return live ? config.inboxPollMs : null
    },
  })
  const messages = inbox.data ? [...inbox.data.messages].sort(compareCreatedAt).reverse() : []

  return (
    <Card
      title={
        <span className="row">
          Simulated mailbox <Badge tone="warning">Demo adapter</Badge>
        </span>
      }
      subtitle="Team-controlled test inbox served by the backend. Messages shown here were recorded by the demo adapter; this is not evidence that any real email was delivered."
      actions={
        <Button size="sm" variant="ghost" onClick={inbox.refresh} loading={inbox.loading && !!inbox.data}>
          Refresh
        </Button>
      }
    >
      {!inbox.data && inbox.loading && <LoadingBlock label="Loading simulated mailbox…" />}
      {inbox.error && (
        <ErrorNotice error={inbox.error} compact onRetry={inbox.refresh}>
          <p className="muted">The demo inbox route is applicant-only and exists only while the backend runs in demo mode.</p>
        </ErrorNotice>
      )}
      {inbox.data && messages.length === 0 && <EmptyState compact title="No messages yet" description="The verification code appears here once the backend records it." />}
      {messages.length > 0 && (
        <ul className="mail-list">
          {messages.map((m) => (
            <li key={m.id} className="mail-item">
              <div className="mail-head">
                <span className="mail-kind">{m.kind.replace(/[_-]+/g, ' ')}</span>
                <time className="muted" dateTime={m.created_at}>
                  {formatDateTime(m.created_at)}
                </time>
              </div>
              <p className="mail-subject">{m.subject}</p>
              <pre className="message-body">{m.body}</pre>
              {m.payload?.code && (
                <div className="row">
                  <span className="code-chip mono" aria-label="Verification code">
                    {m.payload.code}
                  </span>
                  {onUseCode && (
                    <Button size="sm" onClick={() => onUseCode(m.payload.code ?? '')}>
                      Use this code
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
