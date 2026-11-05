import { useMemo, type ReactNode } from 'react'
import { api } from '../api'
import type { Health } from '../api/types'
import { config } from '../config'
import { HealthContext, type BackendStatus, type HealthContextValue } from '../hooks/health'
import { usePolling } from '../hooks/usePolling'

/** One shared health poller for the app: drives the status chip, demo-mode gating and model hints. */
export function HealthProvider({ children }: { children: ReactNode }) {
  const poll = usePolling<Health>(() => api.health(), {
    key: 'health',
    intervalFor: (_data, error) => (error ? config.healthErrorPollMs : config.healthPollMs),
  })

  let status: BackendStatus = 'checking'
  if (poll.error) status = poll.error.kind === 'network' || poll.error.kind === 'timeout' ? 'unreachable' : 'error'
  else if (poll.data) status = 'ok'

  const value = useMemo<HealthContextValue>(
    () => ({ health: poll.data, error: poll.error, status, lastUpdated: poll.lastUpdated, refresh: poll.refresh }),
    [poll.data, poll.error, status, poll.lastUpdated, poll.refresh],
  )
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>
}
