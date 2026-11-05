import { createContext, useContext } from 'react'
import type { ApiError } from '../api/errors'
import type { Health } from '../api/types'

export type BackendStatus = 'checking' | 'ok' | 'unreachable' | 'error'

export interface HealthContextValue {
  health: Health | null
  error: ApiError | null
  status: BackendStatus
  lastUpdated: number | null
  refresh: () => void
}

export const HealthContext = createContext<HealthContextValue>({
  health: null,
  error: null,
  status: 'checking',
  lastUpdated: null,
  refresh: () => {},
})

export function useHealth(): HealthContextValue {
  return useContext(HealthContext)
}
