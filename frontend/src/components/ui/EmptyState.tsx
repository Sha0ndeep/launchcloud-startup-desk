import type { ReactNode } from 'react'

export function EmptyState({ title, description, action, compact = false }: { title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty ${compact ? 'empty-compact' : ''}`.trim()}>
      <p className="empty-title">{title}</p>
      {description && <p className="empty-text">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
