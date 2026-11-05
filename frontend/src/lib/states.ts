import type { ApplicationState, CheckStatus, EvidenceKind, ResearchStatus } from '../api/types'

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

export interface StateMeta {
  label: string
  tone: Tone
  /** Who or what the case is waiting on. */
  waitingOn: 'applicant' | 'system' | 'operator' | 'budget' | 'none'
  applicant: string
  operator: string
}

export const ALL_STATES: readonly ApplicationState[] = [
  'AWAITING_EMAIL',
  'RESEARCH_QUEUED',
  'RESEARCHING',
  'AWAITING_APPLICANT',
  'EXCEPTION',
  'BUDGET_WAITING',
  'ENROLLED',
  'DUPLICATE_RESOLVED',
  'DECLINED',
]

export const TERMINAL_STATES: ReadonlySet<ApplicationState> = new Set<ApplicationState>(['DECLINED', 'ENROLLED', 'DUPLICATE_RESOLVED'])
export const ACTIVE_STATES: ReadonlySet<ApplicationState> = new Set<ApplicationState>(['RESEARCH_QUEUED', 'RESEARCHING'])
/** States in which the backend permits credit consumption (contract: enrolled/duplicate-resolved only). */
export const CREDIT_USAGE_STATES: ReadonlySet<ApplicationState> = new Set<ApplicationState>(['ENROLLED', 'DUPLICATE_RESOLVED'])

export function isTerminal(state: ApplicationState | string): boolean {
  return TERMINAL_STATES.has(state as ApplicationState)
}

export const STATE_META: Record<ApplicationState, StateMeta> = {
  AWAITING_EMAIL: {
    label: 'Awaiting mailbox verification',
    tone: 'warning',
    waitingOn: 'applicant',
    applicant: 'Enter the single-use code issued to your work mailbox to continue.',
    operator: 'Applicant has not yet verified mailbox control.',
  },
  RESEARCH_QUEUED: {
    label: 'Research queued',
    tone: 'info',
    waitingOn: 'system',
    applicant: 'Mailbox verified. Company research is queued with the worker.',
    operator: 'Research job queued; the worker has not picked it up yet.',
  },
  RESEARCHING: {
    label: 'Researching',
    tone: 'accent',
    waitingOn: 'system',
    applicant: 'Researching the business from provider and web sources, then applying the policy rules.',
    operator: 'Worker is researching and evaluating this case.',
  },
  AWAITING_APPLICANT: {
    label: 'Information requested',
    tone: 'warning',
    waitingOn: 'applicant',
    applicant: 'The backend is waiting for more information. Reply below and the case resumes automatically.',
    operator: 'Waiting on the applicant to answer an information request, or on external research being restored while the research check is open. No routine decision is needed.',
  },
  EXCEPTION: {
    label: 'Operator review',
    tone: 'danger',
    waitingOn: 'operator',
    applicant: 'An unresolved question is with a program operator. Nothing has been decided yet.',
    operator: 'Genuine unresolved exception: an explicit, reasoned operator resolution is required.',
  },
  BUDGET_WAITING: {
    label: 'Waiting for program budget',
    tone: 'info',
    waitingOn: 'budget',
    applicant: 'Program allocation is currently unavailable. Your application is held, not declined.',
    operator: 'Held for program allocation. Not an eligibility failure; issuance resumes when budget is available.',
  },
  ENROLLED: {
    label: 'Enrolled',
    tone: 'success',
    waitingOn: 'none',
    applicant: 'Enrolled. Your promotional product credit grant is active.',
    operator: 'Enrolled; one grant issued and recorded in the ledger.',
  },
  DUPLICATE_RESOLVED: {
    label: 'Duplicate resolved',
    tone: 'success',
    waitingOn: 'none',
    applicant: 'Your company already holds a grant under this program; this application is linked to it.',
    operator: 'Resolved to an existing company grant; no second grant was issued.',
  },
  DECLINED: {
    label: 'Declined',
    tone: 'danger',
    waitingOn: 'none',
    applicant: 'Declined under the program policy. The failing rules and reasons are listed below.',
    operator: 'Declined on supported failing rules under the recorded policy version.',
  },
}

export function stateMeta(state: string): StateMeta {
  return (
    STATE_META[state as ApplicationState] ?? {
      label: state,
      tone: 'neutral',
      waitingOn: 'none',
      applicant: 'The backend reported a state this interface does not describe yet.',
      operator: 'Unrecognized state reported by the backend.',
    }
  )
}

export const CHECK_STATUS_META: Record<CheckStatus, { label: string; tone: Tone; description: string }> = {
  PASS: { label: 'Pass', tone: 'success', description: 'Rule satisfied on accepted evidence.' },
  FAIL: { label: 'Fail', tone: 'danger', description: 'Rule failed on supported evidence; this can decline an application.' },
  NEEDS_INFORMATION: { label: 'Needs information', tone: 'warning', description: 'Evidence is missing; the applicant is asked for it.' },
  CONFLICT: { label: 'Conflict', tone: 'danger', description: 'Observations disagree; clarification or an operator decision is required. A conflict does not establish fraud.' },
}

export function checkStatusMeta(status: string) {
  return CHECK_STATUS_META[status as CheckStatus] ?? { label: status, tone: 'neutral' as Tone, description: 'Unrecognized check status.' }
}

export const EVIDENCE_KIND_META: Record<EvidenceKind, { label: string; tone: Tone; description: string }> = {
  APPLICANT_DECLARATION: {
    label: 'Applicant declaration',
    tone: 'warning',
    description: 'Timestamped declaration accepted under the program policy. Not independently verified.',
  },
  PROVIDER_OBSERVATION: {
    label: 'Provider observation',
    tone: 'accent',
    description: 'Company/professional intelligence from the research provider (Crustdata). Corroboration only; not a payroll or funding audit.',
  },
  APPLICANT_LINK: {
    label: 'Applicant-supplied link',
    tone: 'info',
    description: 'A source URL supplied by the applicant. Its content is not automatically trusted.',
  },
}

export function evidenceKindMeta(kind: string) {
  return EVIDENCE_KIND_META[kind as EvidenceKind] ?? { label: kind, tone: 'neutral' as Tone, description: 'Evidence kind not described by contract v1.' }
}

export const RESEARCH_STATUS_META: Record<ResearchStatus, { label: string; tone: Tone; description: string }> = {
  pending: { label: 'Pending', tone: 'info', description: 'Research has not completed yet.' },
  unconfigured: { label: 'Unconfigured', tone: 'warning', description: 'No research provider is configured on this backend. Enrollment is held until an operator restores research; declarations cannot bypass this check.' },
  partial: { label: 'Partial', tone: 'warning', description: 'Some research calls completed and others did not. Enrollment is held until research completes; an operator can requeue it.' },
  complete: { label: 'Complete', tone: 'success', description: 'Bounded external checks completed and provider observations were recorded.' },
  failed: { label: 'Failed', tone: 'danger', description: 'The research job failed. This is never an eligibility failure; enrollment is held until research is restored.' },
}

export function researchStatusMeta(status: string) {
  return RESEARCH_STATUS_META[status as ResearchStatus] ?? { label: status, tone: 'neutral' as Tone, description: 'Unrecognized research status.' }
}

/** Labels for the rule ids the backend emits (backend/service.py evaluate()); unknown rules are shown as reported. */
const RULE_LABELS: Record<string, string> = {
  mailbox: 'Mailbox control',
  authority: 'Authority declaration',
  attestation: 'Eligibility attestation',
  founding_year: 'Founding year',
  headcount: 'Full-time headcount',
  funding_usd: 'Total funding (USD)',
  product: 'Software product',
  external_consistency: 'External consistency',
  research: 'External research',
}

export function humanizeRule(rule: string): string {
  return RULE_LABELS[rule.toLowerCase()] ?? rule.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
