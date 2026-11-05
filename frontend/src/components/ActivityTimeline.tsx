import type { TimelineItem } from '../lib/timeline'
import { formatDateTime, formatRelative } from '../lib/dates'
import { EmptyState } from './ui/EmptyState'

export function ActivityTimeline({ items, newestFirst = true }: { items: TimelineItem[]; newestFirst?: boolean }) {
  if (items.length === 0) return <EmptyState compact title="No activity yet" description="Events and messages recorded by the backend appear here in order." />
  const ordered = newestFirst ? [...items].reverse() : items
  return (
    <ol className="timeline" aria-label="Activity">
      {ordered.map((item) => (
        <li key={item.id} className={`timeline-item tone-${item.tone} kind-${item.kind}`}>
          <span className="timeline-dot" aria-hidden="true" />
          <div className="timeline-main">
            <div className="timeline-head">
              <span className="timeline-title">{item.title}</span>
              <time className="timeline-time muted" dateTime={item.at} title={formatDateTime(item.at)}>
                {formatRelative(item.at)}
              </time>
            </div>
            <p className="timeline-detail">{item.detail}</p>
            {item.body && (
              <details className="timeline-body">
                <summary>Show message</summary>
                <pre className="message-body">{item.body}</pre>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
