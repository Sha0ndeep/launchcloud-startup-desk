import { config } from '../config'
import type { ValidationErrorItem } from './types'

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse'

/** Every failure from the API client is surfaced as an ApiError; the UI never invents a fallback verdict. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP status, or 0 when no response was received. */
  readonly status: number
  /** FastAPI `detail` (string | ValidationErrorItem[]), or whatever body was returned. */
  readonly detail: unknown
  readonly retryAfterSeconds: number | null

  constructor(args: { kind: ApiErrorKind; status: number; detail: unknown; retryAfterSeconds?: number | null }) {
    super(summarizeDetail(args.detail) || `${args.kind} error (${args.status})`)
    this.name = 'ApiError'
    this.kind = args.kind
    this.status = args.status
    this.detail = args.detail
    this.retryAfterSeconds = args.retryAfterSeconds ?? null
  }
}

export function isValidationItems(detail: unknown): detail is ValidationErrorItem[] {
  return (
    Array.isArray(detail) &&
    detail.length > 0 &&
    detail.every((d) => typeof d === 'object' && d !== null && 'msg' in d && 'loc' in d && Array.isArray((d as { loc: unknown }).loc))
  )
}

const LOCATION_PREFIXES = new Set(['body', 'header', 'query', 'path'])

export function validationField(item: ValidationErrorItem): string {
  return item.loc
    .filter((part, index) => !(index === 0 && typeof part === 'string' && LOCATION_PREFIXES.has(part)))
    .map(String)
    .join('.')
}

export function formatValidationItem(item: ValidationErrorItem): string {
  const field = validationField(item)
  return field ? `${field}: ${item.msg}` : item.msg
}

export function summarizeDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (isValidationItems(detail)) return detail.map(formatValidationItem).join('; ')
  if (detail === null || detail === undefined) return ''
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

/** Map a 422 payload to `{ field: message }` for inline form errors. */
export function validationFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (err instanceof ApiError && isValidationItems(err.detail)) {
    for (const item of err.detail) {
      const field = validationField(item)
      if (field && !(field in out)) out[field] = item.msg
    }
  }
  return out
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  return new ApiError({ kind: 'network', status: 0, detail: err instanceof Error ? err.message : String(err) })
}

export interface ErrorDescription {
  title: string
  message: string
  items: string[]
  canRetry: boolean
}

export function describeError(err: unknown): ErrorDescription {
  const e = toApiError(err)
  const text = summarizeDetail(e.detail)
  const items = isValidationItems(e.detail) ? e.detail.map(formatValidationItem) : []

  if (e.kind === 'network') {
    return {
      title: 'Backend unreachable',
      message: `No response from ${config.apiBaseUrl}. The API may be down, not started yet, or blocked by CORS.${text ? ` (${text})` : ''}`,
      items: [],
      canRetry: true,
    }
  }
  if (e.kind === 'timeout') {
    return { title: 'Backend timed out', message: `The request to ${config.apiBaseUrl} did not complete within ${config.requestTimeoutMs / 1000}s.`, items: [], canRetry: true }
  }
  if (e.kind === 'parse') {
    return { title: 'Unreadable backend response', message: text || 'The backend returned a body that is not JSON.', items: [], canRetry: true }
  }

  switch (e.status) {
    case 400:
      return { title: 'Request rejected', message: text || 'The backend rejected this request.', items, canRetry: false }
    case 401:
      return { title: 'Not authenticated', message: text || 'The token was missing or rejected by the backend.', items: [], canRetry: false }
    case 403:
      return { title: 'Not permitted', message: text || 'This token is not allowed to perform that action.', items: [], canRetry: false }
    case 404:
      return { title: 'Not found', message: text || 'The backend has no record at this route.', items: [], canRetry: false }
    case 409:
      return { title: 'Conflict', message: text || 'The backend refused because the request conflicts with the current state.', items: [], canRetry: false }
    case 422:
      return { title: 'Validation error', message: items.length ? 'The backend rejected one or more fields.' : text || 'The backend rejected the input.', items, canRetry: false }
    case 429:
      return {
        title: 'Rate limited',
        message: `${text || 'Too many requests.'}${e.retryAfterSeconds !== null ? ` Retry after ${e.retryAfterSeconds}s.` : ''}`,
        items: [],
        canRetry: true,
      }
    default:
      if (e.status >= 500) {
        return { title: `Backend error (${e.status})`, message: text || 'The backend failed while processing the request.', items: [], canRetry: true }
      }
      return { title: `Request failed (${e.status})`, message: text || e.message, items, canRetry: false }
  }
}
