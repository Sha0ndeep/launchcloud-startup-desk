/**
 * Idempotency keys: one key per user intent, retained in sessionStorage so a network retry of the
 * same intent reuses it, while a changed payload (a new intent) gets a fresh key.
 */
const PREFIX = 'launchcloud.idem.v1.'

interface StoredKey {
  key: string
  fingerprint: string
  createdAt: string
}

function readStorage(name: string): string | null {
  try {
    return sessionStorage.getItem(name)
  } catch {
    return null
  }
}

function writeStorage(name: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(name)
    else sessionStorage.setItem(name, value)
  } catch {
    // Storage can be unavailable (private mode); keys then live only for this page load.
  }
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** Stable JSON used to decide whether a submission is the same intent as the previous attempt. */
export function stableFingerprint(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

export function getOrCreateIdempotencyKey(intent: string, fingerprint: string): string {
  const raw = readStorage(PREFIX + intent)
  if (raw) {
    try {
      const stored = JSON.parse(raw) as StoredKey
      if (stored && stored.fingerprint === fingerprint && typeof stored.key === 'string') return stored.key
    } catch {
      // fall through and mint a new key
    }
  }
  const fresh: StoredKey = { key: newIdempotencyKey(), fingerprint, createdAt: new Date().toISOString() }
  writeStorage(PREFIX + intent, JSON.stringify(fresh))
  return fresh.key
}

export function clearIdempotencyKey(intent: string) {
  writeStorage(PREFIX + intent, null)
}
