/** Shared frontend types for API_CONTRACT.md v1. Runtime truth is the backend. */
export type ApplicationState =
  | 'AWAITING_EMAIL' | 'RESEARCH_QUEUED' | 'RESEARCHING'
  | 'AWAITING_APPLICANT' | 'EXCEPTION' | 'DECLINED'
  | 'BUDGET_WAITING' | 'ENROLLED' | 'DUPLICATE_RESOLVED';
export type ProductKind = 'software' | 'other' | 'unknown';
export interface ApplicationInput {
  company_name: string; domain: string; applicant_name: string; work_email: string;
  applicant_role: string; product_description: string; product_kind: ProductKind;
  profile_url?: string | null; founding_year?: number | null;
  headcount?: number | null; funding_usd?: number | null;
  authority_declared: boolean; attestation_accepted: boolean;
}
export interface ApplicationCreated {
  application_id: string; access_token: string; state: ApplicationState;
}
export interface FactValues {
  founding_year: number | null; headcount: number | null; funding_usd: number | null;
  product_kind: ProductKind; authority_declared: boolean; attestation_accepted: boolean;
}
export interface ApplicantResponse {
  text?: string;
  facts?: Partial<Omit<FactValues, 'attestation_accepted'>>;
  source_urls?: string[]; attestation_accepted: boolean;
}
export interface Check {
  rule: string; status: 'PASS' | 'FAIL' | 'NEEDS_INFORMATION' | 'CONFLICT';
  reason: string; evidence_ids: string[];
}
export interface Evidence {
  id: string; field: string; value: unknown;
  kind: 'APPLICANT_DECLARATION' | 'PROVIDER_OBSERVATION' | 'APPLICANT_LINK';
  source_url: string | null; source_pointer: string | null;
  observed_at: string | null; retrieved_at: string; note: string;
}
export interface Message {
  id: string; direction: 'inbound' | 'outbound'; kind: string;
  subject: string; body: string; created_at: string;
}
export interface Grant { id: string; amount_cents: number; created_at: string }
export interface Research {
  status: 'pending' | 'unconfigured' | 'partial' | 'complete' | 'failed';
  configured: boolean; error: string | null; retryable?: boolean; retry_after_seconds?: number;
}
export interface CaseResponse {
  id: string; company_name: string; domain: string; work_email: string;
  state: ApplicationState; policy_version: string; email_verified: boolean;
  facts: FactValues; checks: Check[]; evidence: Evidence[]; messages: Message[];
  events: Array<{id: string; type: string; detail: string; created_at: string}>;
  tool_calls: Array<{id: string; endpoint: string; status: string; credits_estimate: number; detail: string; created_at: string}>;
  research: Research; grant: Grant | null; account_id: string | null;
  created_at: string; updated_at: string;
}
export interface CreditAccount {
  account_id: string | null; currency: 'USD'; available_cents: number;
  grants: Grant[]; usage: Array<{id: string; amount_cents: number; created_at: string}>;
}
export interface Program {
  id: string; name: string; policy_version: string; benefit_cents: number;
  currency: 'USD'; budget_cents: number; allocated_cents: number; remaining_cents: number;
  policy: {founded_year_min: number; headcount_max_exclusive: number;
    funding_max_usd_exclusive: number; accept_attestations: boolean; description: string};
}
export interface ApplicationSummary {
  id: string; company_name: string; domain: string; work_email: string;
  state: ApplicationState; created_at: string; updated_at: string;
}
export interface OperatorQueue {applications: ApplicationSummary[]; program: Program}
export interface DemoInbox {demo_mode: true; messages: Array<Message & {payload: {code?: string}}>}
export interface Health {
  status: 'ok'; demo_mode: boolean; research_mode: 'live' | 'unconfigured';
  model_configured: boolean; worker_required: true;
}
