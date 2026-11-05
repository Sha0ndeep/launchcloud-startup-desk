/**
 * Frontend view of API_CONTRACT.md v1.
 * The shared types are owned jointly and imported from ../integration/api-types.ts (alias @contract).
 * Only request bodies that the backend OpenAPI document defines but the shared file omits are added here.
 */
export type {
  ApplicantResponse,
  ApplicationCreated,
  ApplicationInput,
  ApplicationState,
  ApplicationSummary,
  CaseResponse,
  Check,
  CreditAccount,
  DemoInbox,
  Evidence,
  FactValues,
  Grant,
  Health,
  Message,
  OperatorQueue,
  ProductKind,
  Program,
  Research,
} from '@contract/api-types'

import type { CaseResponse, Check, Evidence, ProductKind } from '@contract/api-types'

export type CaseEvent = CaseResponse['events'][number]
export type ToolCall = CaseResponse['tool_calls'][number]
export type CheckStatus = Check['status']
export type EvidenceKind = Evidence['kind']
export type ResearchStatus = CaseResponse['research']['status']

/** FastAPI validation error item (HTTP 422). */
export interface ValidationErrorItem {
  loc: Array<string | number>
  msg: string
  type: string
}

/** POST /api/applications/{id}/verify-email (OpenAPI: VerificationInput, ^\d{6}$). */
export interface VerificationInput {
  code: string
}

/** POST /api/applications/{id}/usage (OpenAPI: UsageInput, 0 < amount_cents <= 50000). */
export interface UsageInput {
  amount_cents: number
  description: string
}

/** POST /api/operator/applications/{id}/resolve (OpenAPI: ResolutionInput, reason 15..4000 chars). */
export type ResolutionAction = 'request_information' | 'waive_conflict' | 'decline'
export interface ResolutionInput {
  action: ResolutionAction
  reason: string
}

export const PRODUCT_KINDS: readonly ProductKind[] = ['software', 'other', 'unknown']
export const RESOLUTION_ACTIONS: readonly ResolutionAction[] = ['request_information', 'waive_conflict', 'decline']

/** Constraints copied from integration/openapi.json so the UI validates before the backend does. */
export const LIMITS = {
  companyName: { min: 2, max: 200 },
  applicantName: { min: 1, max: 150 },
  applicantRole: { min: 1, max: 150 },
  workEmail: { max: 254 },
  productDescription: { min: 10, max: 5000 },
  foundingYear: { min: 1800, max: 2100 },
  headcount: { min: 0, max: 10_000_000 },
  fundingUsd: { min: 0, max: 1_000_000_000_000_000 },
  replyText: { max: 10_000 },
  sourceUrls: { max: 10 },
  resolutionReason: { min: 15, max: 4000 },
  usageAmountCents: { max: 50_000 },
  usageDescription: { min: 1, max: 500 },
} as const

export const VERIFICATION_CODE_PATTERN = /^\d{6}$/
