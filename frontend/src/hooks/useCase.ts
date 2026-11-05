import { api, type Auth } from '../api'
import type { ApiError } from '../api/errors'
import type { CaseResponse } from '../api/types'
import { config } from '../config'
import { ACTIVE_STATES, isTerminal } from '../lib/states'
import { usePolling, type PollingResult } from './usePolling'

function authKey(auth: Auth): string {
  return auth.kind === 'applicant' ? `applicant:${auth.accessToken}` : `operator:${auth.token}`
}

export function caseInterval(data: CaseResponse | null, error: ApiError | null): number | null {
  if (error) {
    // Authorization and missing-record errors do not resolve themselves; stop and let the user act.
    if (error.status === 401 || error.status === 403 || error.status === 404) return null
    if (error.status === 429 && error.retryAfterSeconds !== null) return Math.max(error.retryAfterSeconds * 1000, config.caseWaitingPollMs)
    return config.caseErrorPollMs
  }
  if (!data) return config.caseActivePollMs
  if (isTerminal(data.state)) return null
  return ACTIVE_STATES.has(data.state) ? config.caseActivePollMs : config.caseWaitingPollMs
}

/** Poll one case about every 2s while the backend is working on it, slower while waiting, never after a terminal state. */
export function useCase(applicationId: string | null, auth: Auth | null): PollingResult<CaseResponse> {
  const key = applicationId && auth ? `${applicationId}|${authKey(auth)}` : null
  return usePolling<CaseResponse>(() => {
    if (!applicationId || !auth) return Promise.reject(new Error('No case selected'))
    return api.getCase(applicationId, auth)
  }, { key, intervalFor: caseInterval })
}
