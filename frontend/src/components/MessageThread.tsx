import type { Message } from '../api/types'
import { compareCreatedAt, formatDateTime } from '../lib/dates'
import { Badge } from './ui/Badge'
import { EmptyState } from './ui/EmptyState'

/** Full conversation as recorded by the backend. Outbound rows are messages the backend queued, not proof of delivery. */
export function MessageThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) return <EmptyState compact title="No messages recorded" />
  const ordered = [...messages].sort(compareCreatedAt)
  return (
    <ul className="thread">
      {ordered.map((m) => (
        <li key={m.id} className={`thread-item thread-${m.direction}`}>
          <div className="thread-head">
            <Badge tone={m.direction === 'outbound' ? 'info' : 'accent'}>{m.direction === 'outbound' ? 'To applicant' : 'From applicant'}</Badge>
            <span className="muted">{m.kind.replace(/[_-]+/g, ' ')}</span>
            <time className="muted" dateTime={m.created_at}>
              {formatDateTime(m.created_at)}
            </time>
          </div>
          <p className="thread-subject">{m.subject}</p>
          <pre className="message-body">{m.body}</pre>
        </li>
      ))}
    </ul>
  )
}
