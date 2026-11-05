import { useSyncExternalStore } from 'react'

/**
 * Applicant and operator contexts are stored separately in sessionStorage (tab-scoped, cleared when
 * the tab closes) and never placed in URLs. The operator token is typed by the operator; nothing is
 * embedded in the bundle.
 */
export interface ApplicantSession {
  applicationId: string
  accessToken: string
  companyName: string
  workEmail: string
  createdAt: string
}

const APPLICANT_KEY = 'launchcloud.applicant.session.v1'
const OPERATOR_KEY = 'launchcloud.operator.token.v1'

const listeners = new Set<() => void>()
let applicantCache: ApplicantSession | null | undefined
let operatorCache: string | null | undefined

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    // storage unavailable; in-memory cache still serves this page load
  }
}

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === APPLICANT_KEY) applicantCache = undefined
    if (event.key === OPERATOR_KEY) operatorCache = undefined
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function parseSession(raw: string): ApplicantSession | null {
  try {
    const value = JSON.parse(raw) as Partial<ApplicantSession>
    if (typeof value.applicationId === 'string' && typeof value.accessToken === 'string') {
      return {
        applicationId: value.applicationId,
        accessToken: value.accessToken,
        companyName: typeof value.companyName === 'string' ? value.companyName : '',
        workEmail: typeof value.workEmail === 'string' ? value.workEmail : '',
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return null
}

export function loadApplicantSession(): ApplicantSession | null {
  if (applicantCache === undefined) {
    const raw = read(APPLICANT_KEY)
    applicantCache = raw ? parseSession(raw) : null
  }
  return applicantCache
}

export function saveApplicantSession(session: ApplicantSession) {
  applicantCache = session
  write(APPLICANT_KEY, JSON.stringify(session))
  emit()
}

export function clearApplicantSession() {
  applicantCache = null
  write(APPLICANT_KEY, null)
  emit()
}

export function loadOperatorToken(): string | null {
  if (operatorCache === undefined) {
    const raw = read(OPERATOR_KEY)
    operatorCache = raw && raw.length > 0 ? raw : null
  }
  return operatorCache
}

export function saveOperatorToken(token: string) {
  operatorCache = token
  write(OPERATOR_KEY, token)
  emit()
}

export function clearOperatorToken() {
  operatorCache = null
  write(OPERATOR_KEY, null)
  emit()
}

export function useApplicantSession(): ApplicantSession | null {
  return useSyncExternalStore(subscribe, loadApplicantSession, () => null)
}

export function useOperatorToken(): string | null {
  return useSyncExternalStore(subscribe, loadOperatorToken, () => null)
}
