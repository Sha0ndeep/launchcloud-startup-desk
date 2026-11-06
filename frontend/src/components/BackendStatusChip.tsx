import { config } from '../config'
import { useHealth } from '../hooks/health'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'

export function BackendStatusChip() {
  const { health, status, error, refresh } = useHealth()
  if (config.useMockApi) {
    return (
      <div className="status-cluster" aria-live="polite">
        <Badge tone="warning">Mock backend</Badge>
        <Badge tone="neutral">Fixtures only</Badge>
      </div>
    )
  }
  if (status === 'checking') {
    return (
      <div className="status-cluster" aria-live="polite">
        <Badge tone="neutral">Backend: checking…</Badge>
      </div>
    )
  }
  if (status === 'unreachable' || status === 'error') {
    return (
      <div className="status-cluster" aria-live="polite">
        <Badge tone="danger" title={`${config.apiBaseUrl} — ${error?.message ?? ''}`}>
          {status === 'unreachable' ? 'Backend unreachable' : `Backend error${error ? ` (${error.status})` : ''}`}
        </Badge>
        <Button size="sm" variant="ghost" onClick={refresh}>
          Retry
        </Button>
      </div>
    )
  }
  return (
    <div className="status-cluster" aria-live="polite">
      <Badge tone="success" title={config.apiBaseUrl}>
        Backend online
      </Badge>
      {health && (
        <>
          <Badge tone={health.demo_mode ? 'warning' : 'neutral'} title="Reported by GET /api/health">
            {health.demo_mode ? 'Demo mode · simulated mailbox' : 'Non-demo mode'}
          </Badge>
          <Badge tone={health.research_mode === 'live' ? 'accent' : 'neutral'}>Research: {health.research_mode}</Badge>
          <Badge tone="neutral" title={health.model}>{health.model_configured ? `Extraction: ${health.model_provider ?? 'configured'}` : 'Extraction model: none'}</Badge>
        </>
      )}
    </div>
  )
}
