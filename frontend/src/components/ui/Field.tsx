import type { ReactNode } from 'react'

interface FieldProps {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  children: ReactNode
  className?: string
}

/** Labelled form control wrapper: the child must use `id`, and `aria-describedby` ids are exposed via data attributes. */
export function Field({ id, label, hint, error, required, children, className = '' }: FieldProps) {
  return (
    <div className={`field ${error ? 'field-error' : ''} ${className}`.trim()}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="field-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-message" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
