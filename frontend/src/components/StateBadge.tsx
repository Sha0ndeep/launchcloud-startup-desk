import { checkStatusMeta, evidenceKindMeta, researchStatusMeta, stateMeta } from '../lib/states'
import { Badge } from './ui/Badge'

export function StateBadge({ state, audience = 'operator' }: { state: string; audience?: 'applicant' | 'operator' }) {
  const meta = stateMeta(state)
  return (
    <Badge tone={meta.tone} title={audience === 'applicant' ? meta.applicant : meta.operator}>
      {meta.label}
    </Badge>
  )
}

export function CheckStatusBadge({ status }: { status: string }) {
  const meta = checkStatusMeta(status)
  return (
    <Badge tone={meta.tone} title={meta.description}>
      {meta.label}
    </Badge>
  )
}

export function EvidenceKindBadge({ kind }: { kind: string }) {
  const meta = evidenceKindMeta(kind)
  return (
    <Badge tone={meta.tone} title={meta.description}>
      {meta.label}
    </Badge>
  )
}

export function ResearchStatusBadge({ status }: { status: string }) {
  const meta = researchStatusMeta(status)
  return (
    <Badge tone={meta.tone} title={meta.description}>
      Research: {meta.label}
    </Badge>
  )
}
