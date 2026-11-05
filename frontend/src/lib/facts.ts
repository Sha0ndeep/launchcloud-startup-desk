import type { Check, Evidence, FactValues, ProductKind } from '../api/types'
import { formatUsd } from './money'

export type FactKey = keyof FactValues
export type CorrectableFact = Exclude<FactKey, 'attestation_accepted'>

export const CORRECTABLE_FACTS: readonly CorrectableFact[] = ['founding_year', 'headcount', 'funding_usd', 'product_kind', 'authority_declared']

export const FACT_LABELS: Record<FactKey, string> = {
  founding_year: 'Founding year',
  headcount: 'Full-time headcount',
  funding_usd: 'Total funding (USD)',
  product_kind: 'Product kind',
  authority_declared: 'Authority to apply',
  attestation_accepted: 'Eligibility attestation',
}

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  software: 'Software product',
  other: 'Not a software product',
  unknown: 'Unknown / not yet classified',
}

/** Rule ids emitted by backend/service.py evaluate() and the applicant fact each one concerns (null: not a fact the applicant supplies). */
const RULE_FACTS: Record<string, CorrectableFact | null> = {
  mailbox: null,
  authority: 'authority_declared',
  attestation: null,
  founding_year: 'founding_year',
  headcount: 'headcount',
  funding_usd: 'funding_usd',
  product: 'product_kind',
  external_consistency: null,
  research: null,
}

/** Mapping from a backend rule id to the fact it concerns; unknown rules fall back to keyword heuristics, then null. */
export function factForRule(rule: string): CorrectableFact | null {
  const r = rule.toLowerCase()
  if (r in RULE_FACTS) return RULE_FACTS[r]
  if (r.includes('headcount') || r.includes('employee')) return 'headcount'
  if (r.includes('found') || r.includes('year')) return 'founding_year'
  if (r.includes('fund') || r.includes('raise') || r.includes('capital')) return 'funding_usd'
  if (r.includes('product') || r.includes('software')) return 'product_kind'
  if (r.includes('authori')) return 'authority_declared'
  return null
}

/** Facts a conflict reason talks about (the backend's external_consistency rule names none in its id). */
export function factsMentioned(text: string): CorrectableFact[] {
  const t = text.toLowerCase()
  const out: CorrectableFact[] = []
  if (/fund|invest|raise/.test(t)) out.push('funding_usd')
  if (/founding|founded|year founded/.test(t)) out.push('founding_year')
  if (/headcount|workforce|employee/.test(t)) out.push('headcount')
  return out
}

/** Facts the open checks ask the applicant for: NEEDS_INFORMATION by rule, CONFLICT by rule or by the reason text. */
export function requestedFacts(checks: Check[]): Set<CorrectableFact> {
  const out = new Set<CorrectableFact>()
  for (const check of checks) {
    if (check.status === 'NEEDS_INFORMATION') {
      const fact = factForRule(check.rule)
      if (fact) out.add(fact)
    } else if (check.status === 'CONFLICT') {
      const fact = factForRule(check.rule)
      if (fact) out.add(fact)
      else for (const mentioned of factsMentioned(check.reason)) out.add(mentioned)
    }
  }
  return out
}

export function formatFactValue(key: FactKey, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Unknown — not provided'
  switch (key) {
    case 'funding_usd':
      return typeof value === 'number' ? formatUsd(value) : String(value)
    case 'headcount':
      return typeof value === 'number' ? `${value.toLocaleString('en-US')} full-time` : String(value)
    case 'product_kind':
      return PRODUCT_KIND_LABELS[value as ProductKind] ?? String(value)
    case 'authority_declared':
    case 'attestation_accepted':
      return value === true ? 'Yes (declared)' : value === false ? 'No' : String(value)
    default:
      return String(value)
  }
}

export function formatEvidenceValue(evidence: Evidence): string {
  const { field, value } = evidence
  if (value === null || value === undefined) return 'Unknown (null)'
  if (field in FACT_LABELS) return formatFactValue(field as FactKey, value)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function factLabel(field: string): string {
  return FACT_LABELS[field as FactKey] ?? field.replace(/[_-]+/g, ' ')
}
