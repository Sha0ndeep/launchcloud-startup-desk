import { useEffect, useMemo, useRef } from 'react'
import type { Evidence } from '../api/types'
import { formatDateTime } from '../lib/dates'
import { factLabel, formatEvidenceValue } from '../lib/facts'
import { EVIDENCE_KIND_META } from '../lib/states'
import { EvidenceKindBadge } from './StateBadge'
import { Drawer } from './ui/Drawer'
import { EmptyState } from './ui/EmptyState'

function EvidenceCard({ item, highlighted }: { item: Evidence; highlighted: boolean }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])
  return (
    <article ref={ref} className={`evidence-card ${highlighted ? 'evidence-card-highlight' : ''}`.trim()} aria-label={`Evidence ${item.id}`}>
      <header className="evidence-head">
        <EvidenceKindBadge kind={item.kind} />
        <span className="mono muted evidence-id">{item.id}</span>
      </header>
      <p className="evidence-field">
        <span className="muted">{factLabel(item.field)}</span>
        <strong>{formatEvidenceValue(item)}</strong>
      </p>
      <dl className="evidence-meta">
        {item.source_type && <><dt>Provenance</dt><dd>{item.source_type.replaceAll('_', ' ')}</dd></>}
        {item.fact_status && <><dt>Support</dt><dd>{item.fact_status.replaceAll('_', ' ')}</dd></>}
        {item.match_status && <><dt>Identity match</dt><dd>{item.match_status.replaceAll('_', ' ')}</dd></>}
        {item.tool_call_id && <><dt>Research call</dt><dd className="mono">{item.tool_call_id}</dd></>}
        {item.source_url && (
          <>
            <dt>Source</dt>
            <dd>
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                {item.source_url}
              </a>
            </dd>
          </>
        )}
        {item.source_pointer && (
          <>
            <dt>Pointer</dt>
            <dd className="mono">{item.source_pointer}</dd>
          </>
        )}
        <dt>Observed</dt>
        <dd>{item.observed_at ? formatDateTime(item.observed_at) : <span className="muted">no effective date recorded</span>}</dd>
        <dt>Retrieved</dt>
        <dd>{formatDateTime(item.retrieved_at)}</dd>
      </dl>
      {item.note && <p className="evidence-note">{item.note}</p>}
    </article>
  )
}

export function EvidenceList({ evidence, highlightId }: { evidence: Evidence[]; highlightId: string | null }) {
  const groups = useMemo(() => {
    const map = new Map<string, Evidence[]>()
    for (const item of evidence) {
      const list = map.get(item.field) ?? []
      list.push(item)
      map.set(item.field, list)
    }
    return Array.from(map.entries())
  }, [evidence])

  if (evidence.length === 0) {
    return <EmptyState compact title="No evidence recorded" description="Evidence appears as declarations are recorded and research observations arrive. Missing evidence is shown as unknown, never guessed." />
  }
  return (
    <div className="stack">
      {groups.map(([field, items]) => (
        <section key={field} className="evidence-group" aria-label={factLabel(field)}>
          <h3 className="evidence-group-title">{factLabel(field)}</h3>
          <div className="stack-sm">
            {items.map((item) => (
              <EvidenceCard key={item.id} item={item} highlighted={item.id === highlightId} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function EvidenceDrawer({ open, onClose, evidence, highlightId }: { open: boolean; onClose: () => void; evidence: Evidence[]; highlightId: string | null }) {
  return (
    <Drawer open={open} onClose={onClose} title="Evidence and sources">
      <div className="legend">
        {Object.entries(EVIDENCE_KIND_META).map(([kind, meta]) => (
          <p key={kind} className="legend-row">
            <EvidenceKindBadge kind={kind} />
            <span className="muted">{meta.description}</span>
          </p>
        ))}
      </div>
      <EvidenceList evidence={evidence} highlightId={highlightId} />
    </Drawer>
  )
}
