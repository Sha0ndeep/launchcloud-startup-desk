import { useCallback, useEffect, useRef, useState } from 'react'
import { toApiError, type ApiError } from '../api/errors'

export interface PollingOptions<T> {
  /** Identity of what is being polled; null disables polling and yields empty data. */
  key: string | null
  /** Next delay in ms, or null to stop (terminal state / unrecoverable error). */
  intervalFor: (data: T | null, error: ApiError | null) => number | null
}

export interface PollingResult<T> {
  data: T | null
  error: ApiError | null
  /** True until the first response (success or failure) for the current key arrives. */
  loading: boolean
  lastUpdated: number | null
  /** Fetch now and restart the schedule. */
  refresh: () => void
  /** Apply state returned by a mutation, then restart the schedule. */
  applyData: (data: T) => void
}

interface Snapshot<T> {
  key: string
  data: T | null
  error: ApiError | null
  lastUpdated: number | null
}

const HIDDEN_TAB_RETRY_MS = 10000

/**
 * Generic polling with bounded scheduling. The fetcher is read through a ref so callers can pass
 * fresh closures without restarting the loop; only `key` changes and explicit refreshes restart it.
 * Snapshots are tagged with their key, so a key change never shows stale data from another case.
 */
export function usePolling<T>(fetcher: () => Promise<T>, options: PollingOptions<T>): PollingResult<T> {
  const fetcherRef = useRef(fetcher)
  const intervalRef = useRef(options.intervalFor)
  const latestRef = useRef<{ key: string | null; data: T | null }>({ key: null, data: null })
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    fetcherRef.current = fetcher
    intervalRef.current = options.intervalFor
  })

  useEffect(() => {
    const key = options.key
    if (key === null) return
    if (latestRef.current.key !== key) latestRef.current = { key, data: null }

    const loop = { cancelled: false, timer: undefined as number | undefined }

    const schedule = (error: ApiError | null) => {
      const ms = intervalRef.current(latestRef.current.data, error)
      if (ms !== null && ms > 0) loop.timer = window.setTimeout(tick, ms)
    }

    const tick = async () => {
      if (loop.cancelled) return
      if (document.visibilityState === 'hidden') {
        loop.timer = window.setTimeout(tick, HIDDEN_TAB_RETRY_MS)
        return
      }
      try {
        const data = await fetcherRef.current()
        if (loop.cancelled) return
        latestRef.current = { key, data }
        setSnapshot({ key, data, error: null, lastUpdated: Date.now() })
        schedule(null)
      } catch (err) {
        if (loop.cancelled) return
        const error = toApiError(err)
        setSnapshot((prev) => (prev && prev.key === key ? { ...prev, error } : { key, data: null, error, lastUpdated: null }))
        schedule(error)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(loop.timer)
        void tick()
      }
    }

    void tick()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      loop.cancelled = true
      window.clearTimeout(loop.timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [options.key, generation])

  const refresh = useCallback(() => setGeneration((g) => g + 1), [])
  const key = options.key
  const applyData = useCallback(
    (data: T) => {
      if (key === null) return
      latestRef.current = { key, data }
      setSnapshot({ key, data, error: null, lastUpdated: Date.now() })
      setGeneration((g) => g + 1)
    },
    [key],
  )

  const current = snapshot && snapshot.key === key ? snapshot : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: key !== null && current === null,
    lastUpdated: current?.lastUpdated ?? null,
    refresh,
    applyData,
  }
}
