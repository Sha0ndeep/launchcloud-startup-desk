import type { ReactNode } from 'react'
import type { Tone } from '../../lib/states'

interface NoticeProps {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  compact?: boolean
  className?: string
}

export function Notice({ tone = 'neutral', title, children, actions, compact = false, className = '' }: NoticeProps) {
  return (
    <div className={`notice tone-${tone} ${compact ? 'notice-compact' : ''} ${className}`.trim()} role={tone === 'danger' ? 'alert' : 'status'}>
      <div className="notice-body">
        {title && <p className="notice-title">{title}</p>}
        {children && <div className="notice-text">{children}</div>}
      </div>
      {actions && <div className="notice-actions">{actions}</div>}
    </div>
  )
}
