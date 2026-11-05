import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { OperatorAuth } from '../api'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { config } from '../config'
import { clearOperatorToken, saveOperatorToken, useOperatorToken } from '../lib/session'
import { describedBy } from '../lib/a11y'

/**
 * Asks for the operator token in a session-only field. The token is stored in this tab's
 * sessionStorage and sent as X-Operator-Token; nothing is embedded in the bundle.
 */
export function OperatorGate({ children }: { children: (auth: OperatorAuth) => ReactNode }) {
  const token = useOperatorToken()
  const auth = useMemo<OperatorAuth | null>(() => (token ? { kind: 'operator', token } : null), [token])
  if (!auth) return <OperatorTokenForm />
  return (
    <>
      <div className="operator-bar">
        <span className="muted">Operator desk · token held in this tab only</span>
        <Button size="sm" variant="ghost" onClick={clearOperatorToken}>
          Forget token
        </Button>
      </div>
      {children(auth)}
    </>
  )
}

function OperatorTokenForm() {
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Enter the operator token configured on the backend.')
      return
    }
    saveOperatorToken(trimmed)
  }
  return (
    <div className="page page-narrow">
      <Card title="Operator desk" subtitle="Enter the operator token configured on the backend (OPERATOR_TOKEN). It is kept in this tab's session storage and sent as X-Operator-Token.">
        <form className="stack-sm" onSubmit={submit} noValidate>
          <Field id={id} label="Operator token" required error={error} hint={config.useMockApi ? 'Mock backend accepts the fixture token demo-operator.' : 'The contract names demo-operator as the local default; the backend may override it through its environment.'}>
            <input id={id} className="input" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy(id, true, !!error)} />
          </Field>
          <div className="row">
            <Button type="submit" variant="primary">
              Open operator desk
            </Button>
          </div>
        </form>
        <Notice tone="neutral" compact title="Scope">
          The operator token is a demo shared secret, not an applicant identity. The desk resolves genuine exceptions and retries stalled research; it has no routine approve button because the backend owns ordinary decisions.
        </Notice>
      </Card>
    </div>
  )
}
