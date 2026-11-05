import { useSyncExternalStore } from 'react'

/** Minimal explicit router: pathname store + pushState navigation. No URL ever carries a token or applicant id. */
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

function getPath() {
  return window.location.pathname
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, getPath, () => '/')
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  emit()
}

/** Match `/operator/cases/:id` style patterns. Returns params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i]
    const actual = pathParts[i]
    if (expected.startsWith(':')) {
      try {
        params[expected.slice(1)] = decodeURIComponent(actual)
      } catch {
        return null
      }
    } else if (expected !== actual) {
      return null
    }
  }
  return params
}

export const routes = {
  home: '/',
  apply: '/apply',
  status: '/status',
  account: '/account',
  operator: '/operator',
  operatorCase: (id: string) => `/operator/cases/${encodeURIComponent(id)}`,
} as const
