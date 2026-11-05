import { config } from '../config'
import { ApiError } from './errors'
import type {
  ApplicantResponse,
  ApplicationCreated,
  ApplicationInput,
  CaseResponse,
  CreditAccount,
  DemoInbox,
  Health,
  OperatorQueue,
  Program,
  ResolutionInput,
  UsageInput,
  VerificationInput,
} from './types'

export interface ApplicantAuth {
  kind: 'applicant'
  accessToken: string
}
export interface OperatorAuth {
  kind: 'operator'
  token: string
}
export type Auth = ApplicantAuth | OperatorAuth

/**
 * One typed client for API_CONTRACT.md v1. Pages only depend on this interface, so the HTTP
 * implementation can be swapped for the labeled fixture client (see ./mock.ts) or a future one.
 */
export interface ApiClient {
  health(): Promise<Health>
  program(): Promise<Program>
  createApplication(input: ApplicationInput, opts: { idempotencyKey: string }): Promise<ApplicationCreated>
  getCase(applicationId: string, auth: Auth): Promise<CaseResponse>
  verifyEmail(applicationId: string, input: VerificationInput, auth: ApplicantAuth): Promise<CaseResponse>
  respond(applicationId: string, input: ApplicantResponse, auth: ApplicantAuth): Promise<CaseResponse>
  getReport(applicationId: string, auth: Auth): Promise<unknown>
  getCredits(applicationId: string, auth: Auth): Promise<CreditAccount>
  postUsage(applicationId: string, input: UsageInput, opts: { idempotencyKey: string }, auth: ApplicantAuth): Promise<CreditAccount>
  getDemoInbox(applicationId: string, auth: ApplicantAuth): Promise<DemoInbox>
  operatorQueue(auth: OperatorAuth): Promise<OperatorQueue>
  operatorResolve(applicationId: string, input: ResolutionInput, auth: OperatorAuth): Promise<CaseResponse>
  operatorRetry(applicationId: string, auth: OperatorAuth): Promise<CaseResponse>
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  auth?: Auth
  idempotencyKey?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds))
  const date = Date.parse(header)
  return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000))
}

export class HttpApiClient implements ApiClient {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.auth?.kind === 'applicant') headers.Authorization = `Bearer ${opts.auth.accessToken}`
    if (opts.auth?.kind === 'operator') headers['X-Operator-Token'] = opts.auth.token
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), config.requestTimeoutMs)

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
        // Tokens travel in headers; never send cookies to the API origin.
        credentials: 'omit',
      })
    } catch (err) {
      window.clearTimeout(timer)
      if (controller.signal.aborted) {
        throw new ApiError({ kind: 'timeout', status: 0, detail: `No response within ${config.requestTimeoutMs / 1000}s` })
      }
      throw new ApiError({ kind: 'network', status: 0, detail: err instanceof Error ? err.message : String(err) })
    }
    window.clearTimeout(timer)

    const text = await response.text()
    let data: unknown = null
    if (text.length > 0) {
      try {
        data = JSON.parse(text)
      } catch {
        if (response.ok) throw new ApiError({ kind: 'parse', status: response.status, detail: 'Response body was not valid JSON' })
        data = text
      }
    }

    if (!response.ok) {
      const detail = isRecord(data) && 'detail' in data ? data.detail : (data ?? response.statusText)
      throw new ApiError({
        kind: 'http',
        status: response.status,
        detail,
        retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
      })
    }
    return data as T
  }

  private appPath(applicationId: string, suffix = ''): string {
    return `/api/applications/${encodeURIComponent(applicationId)}${suffix}`
  }

  private operatorPath(applicationId: string, suffix = ''): string {
    return `/api/operator/applications/${encodeURIComponent(applicationId)}${suffix}`
  }

  health() {
    return this.request<Health>('/api/health')
  }

  program() {
    return this.request<Program>('/api/program')
  }

  createApplication(input: ApplicationInput, opts: { idempotencyKey: string }) {
    return this.request<ApplicationCreated>('/api/applications', { method: 'POST', body: input, idempotencyKey: opts.idempotencyKey })
  }

  getCase(applicationId: string, auth: Auth) {
    return this.request<CaseResponse>(this.appPath(applicationId), { auth })
  }

  verifyEmail(applicationId: string, input: VerificationInput, auth: ApplicantAuth) {
    return this.request<CaseResponse>(this.appPath(applicationId, '/verify-email'), { method: 'POST', body: input, auth })
  }

  respond(applicationId: string, input: ApplicantResponse, auth: ApplicantAuth) {
    return this.request<CaseResponse>(this.appPath(applicationId, '/responses'), { method: 'POST', body: input, auth })
  }

  getReport(applicationId: string, auth: Auth) {
    return this.request<unknown>(this.appPath(applicationId, '/report'), { auth })
  }

  getCredits(applicationId: string, auth: Auth) {
    return this.request<CreditAccount>(this.appPath(applicationId, '/credits'), { auth })
  }

  postUsage(applicationId: string, input: UsageInput, opts: { idempotencyKey: string }, auth: ApplicantAuth) {
    return this.request<CreditAccount>(this.appPath(applicationId, '/usage'), {
      method: 'POST',
      body: input,
      auth,
      idempotencyKey: opts.idempotencyKey,
    })
  }

  getDemoInbox(applicationId: string, auth: ApplicantAuth) {
    return this.request<DemoInbox>(this.appPath(applicationId, '/demo-inbox'), { auth })
  }

  operatorQueue(auth: OperatorAuth) {
    return this.request<OperatorQueue>('/api/operator/applications', { auth })
  }

  operatorResolve(applicationId: string, input: ResolutionInput, auth: OperatorAuth) {
    return this.request<CaseResponse>(this.operatorPath(applicationId, '/resolve'), { method: 'POST', body: input, auth })
  }

  operatorRetry(applicationId: string, auth: OperatorAuth) {
    return this.request<CaseResponse>(this.operatorPath(applicationId, '/retry'), { method: 'POST', body: {}, auth })
  }
}
