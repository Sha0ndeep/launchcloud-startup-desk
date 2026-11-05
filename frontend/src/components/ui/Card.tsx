import type { ReactNode } from 'react'
import type { Tone } from '../../lib/states'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  tone?: Tone
  children: ReactNode
  className?: string
  id?: string
}

export function Card({ title, subtitle, actions, tone, children, className = '', id }: CardProps) {
  return (
    <section id={id} className={`card ${tone ? `card-${tone}` : ''} ${className}`.trim()} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  )
}
