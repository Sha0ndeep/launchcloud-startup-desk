import { api } from '../api'
import type { Program } from '../api/types'
import { config } from '../config'
import { usePolling, type PollingResult } from './usePolling'

/** Program policy and allocation; refreshed slowly so allocation numbers stay current on dashboards. */
export function useProgram(enabled = true): PollingResult<Program> {
  return usePolling<Program>(() => api.program(), {
    key: enabled ? 'program' : null,
    intervalFor: (_data, error) => (error ? config.healthErrorPollMs : 30000),
  })
}
