import type { ReactNode } from 'react'
import type { Tone } from '../../lib/states'

export function Badge({ tone = 'neutral', children, title, className = '' }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span className={`badge tone-${tone} ${className}`.trim()} title={title}>
      {children}
    </span>
  )
}
