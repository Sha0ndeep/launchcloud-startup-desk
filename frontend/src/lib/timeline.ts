import type { CaseResponse } from '../api/types'
import type { Tone } from './states'
import { compareCreatedAt } from './dates'

export interface TimelineItem {
  id: string
  at: string
  kind: 'event' | 'message' | 'tool_call'
  title: string
  detail: string
  tone: Tone
  /** Long body shown collapsed (message bodies). */
  body?: string
}

function eventTone(type: string): Tone {
  const t = type.toLowerCase()
  if (t.includes('enrol') || t.includes('verified') || t.includes('complete')) return 'success'
  if (t.includes('fail') || t.includes('declin') || t.includes('exception') || t.includes('error')) return 'danger'
  if (t.includes('request') || t.includes('waiting') || t.includes('needs')) return 'warning'
  return 'neutral'
}

export function buildTimeline(c: CaseResponse, opts: { includeToolCalls: boolean }): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const event of c.events) {
    items.push({ id: `event-${event.id}`, at: event.created_at, kind: 'event', title: event.type.replace(/[_-]+/g, ' '), detail: event.detail, tone: eventTone(event.type) })
  }
  for (const message of c.messages) {
    const direction = message.direction === 'outbound' ? 'Sent to applicant' : 'From applicant'
    items.push({
      id: `message-${message.id}`,
      at: message.created_at,
      kind: 'message',
      title: `${direction} · ${message.kind.replace(/[_-]+/g, ' ')}`,
      detail: message.subject,
      tone: message.direction === 'outbound' ? 'info' : 'accent',
      body: message.body,
    })
  }
  if (opts.includeToolCalls) {
    c.tool_calls.forEach((call, index) => {
      items.push({
        id: `tool-${call.id ?? index}`,
        at: call.created_at,
        kind: 'tool_call',
        title: `Research call · ${call.endpoint}`,
        detail: `${call.status}${call.detail ? ` — ${call.detail}` : ''}`,
        tone: /success|ok|cached/i.test(call.status) ? 'neutral' : 'warning',
      })
    })
  }
  return items.map((item) => ({ ...item, created_at: item.at })).sort(compareCreatedAt)
}
