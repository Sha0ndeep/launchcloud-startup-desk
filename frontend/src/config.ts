const rawBase = import.meta.env.VITE_API_BASE_URL
const apiBaseUrl = (typeof rawBase === 'string' && rawBase.trim() !== '' ? rawBase.trim() : 'http://127.0.0.1:8000').replace(/\/+$/, '')

/**
 * Public runtime configuration. Everything here ships in the bundle, so no secrets belong here:
 * not the Crustdata key, not a model key, not the operator token.
 */
export const config = {
  /** Backend origin; every route is `${apiBaseUrl}/api/...`. */
  apiBaseUrl,
  /** Labeled frontend development mode (fixtures, no backend). Separately enabled via VITE_USE_MOCK_API=true. */
  useMockApi: import.meta.env.VITE_USE_MOCK_API === 'true',
  /** Poll cadence for a case while the backend is actively working on it. */
  caseActivePollMs: 2000,
  /** Poll cadence while waiting on the applicant, an operator or program budget. */
  caseWaitingPollMs: 5000,
  /** Poll cadence after a transport failure (bounded backoff). */
  caseErrorPollMs: 8000,
  queuePollMs: 5000,
  creditsPollMs: 15000,
  healthPollMs: 20000,
  healthErrorPollMs: 8000,
  inboxPollMs: 4000,
  requestTimeoutMs: 15000,
  /** Sample product action from the handoff: $1.00 as integer cents. */
  sampleUsageCents: 100,
  sampleUsageDescription: 'Sample API job',
} as const
