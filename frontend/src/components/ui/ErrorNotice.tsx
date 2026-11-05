import { describeError } from '../../api/errors'
import { Button } from './Button'
import { Notice } from './Notice'

interface ErrorNoticeProps {
  error: unknown
  onRetry?: () => void
  retryLabel?: string
  compact?: boolean
  /** Additional explanation shown under the backend detail (for example, 409 recovery guidance). */
  children?: React.ReactNode
}

/** Renders a backend or transport failure exactly as reported; never substitutes a fallback verdict. */
export function ErrorNotice({ error, onRetry, retryLabel = 'Retry', compact = false, children }: ErrorNoticeProps) {
  const described = describeError(error)
  return (
    <Notice
      tone="danger"
      compact={compact}
      title={described.title}
      actions={
        onRetry && (
          <Button size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        )
      }
    >
      <p>{described.message}</p>
      {described.items.length > 0 && (
        <ul className="notice-list">
          {described.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {children}
    </Notice>
  )
}
