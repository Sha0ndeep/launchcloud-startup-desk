import { useSyncExternalStore } from 'react'
import type { Tone } from './states'

export interface Toast {
  id: number
  tone: Tone
  title: string
  message?: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getToasts() {
  return toasts
}

/** Toasts only announce confirmed backend responses; failures are rendered inline by ErrorNotice. */
export function pushToast(toast: Omit<Toast, 'id'>, ttlMs = 7000) {
  const id = nextId++
  toasts = [...toasts, { id, ...toast }]
  emit()
  window.setTimeout(() => dismissToast(id), ttlMs)
  return id
}

export function dismissToast(id: number) {
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getToasts, getToasts)
}
