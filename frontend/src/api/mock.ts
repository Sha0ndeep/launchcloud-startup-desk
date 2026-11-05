/**
 * MOCK BACKEND — frontend development mode only (VITE_USE_MOCK_API=true).
 *
 * Simulates API_CONTRACT.md v1 inside the browser so every screen can be exercised while the
 * real backend is unavailable. It mirrors the behaviour read in backend/ (service.py, main.py,
 * models.py) on 6 Nov 2026: rule ids, hold states, status codes and message kinds. Everything it
 * returns is fixture data: no research is performed, no mail is delivered and no real credits
 * exist. The app shows a persistent banner whenever this client is active. It must never be
 * enabled for a demo of real backend behaviour.
 */
import type { ApiClient, ApplicantAuth, Auth, OperatorAuth } from './client'
import { ApiError } from './errors'
import type {
  ApplicantResponse,
  ApplicationCreated,
  ApplicationInput,
  ApplicationState,
  CaseResponse,
  Check,
  CreditAccount,
  DemoInbox,
  Evidence,
  FactValues,
  Grant,
  Health,
  OperatorQueue,
  Program,
  Research,
  ResolutionInput,
  UsageInput,
  ValidationErrorItem,
  VerificationInput,
} from './types'
import { TERMINAL_STATES } from '../lib/states'

const STORAGE_KEY = 'launchcloud.mock.state.v2'
const OPERATOR_TOKEN = 'demo-operator'
const POLICY_VERSION = 'v1'
const BENEFIT_CENTS = 50_000
/** Smaller than the backend's 5,000,000 so budget exhaustion is reachable in a demo. */
const BUDGET_CENTS = 200_000
const CODE_TTL_MS = 30 * 60 * 1000
const MAX_RESEARCH_ATTEMPTS = 3
const FIXTURE = 'MOCK FIXTURE (frontend development mode) — not real company data.'
const MAILBOX_PROVIDERS = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'bit.ly', 'bitly.com', 'linkedin.com'])
const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

const POLICY: Program['policy'] = {
  founded_year_min: 2021,
  headcount_max_exclusive: 50,
  funding_max_usd_exclusive: 10_000_000,
  accept_attestations: true,
  description:
    'Mock fixture copy of the backend policy. Limited promotional grant. Named applicant declarations are accepted for founding year, full-time headcount, funding and software-product classification. External observations are corroboration. Material conflicts require clarification. Mailbox control and authority declaration are mandatory. This is not independently verified payroll or funding.',
}

const REPORT_LIMITATIONS = [
  'Demo mailbox does not deliver real email.',
  'Accepted declarations are not independent verification.',
  'Search snippets and source links are research leads, not authenticated documents.',
  'External research costs shown are estimates.',
]

type InboxMessage = DemoInbox['messages'][number]
type CorrectableFact = keyof Omit<FactValues, 'attestation_accepted'>
const CORRECTABLE: readonly CorrectableFact[] = ['founding_year', 'headcount', 'funding_usd', 'product_kind', 'authority_declared']
const NUMERIC_FACTS = ['founding_year', 'headcount', 'funding_usd'] as const

interface MockCase extends Omit<CaseResponse, 'messages'> {
  /** Outbound rows carry the demo payload (verification code); the case view strips it. */
  messages: InboxMessage[]
  access_token: string
  verification_code: string
  code_expires_at: number
  verification_attempts: number
  usage_keys: Record<string, { amount_cents: number; description: string }>
  research_attempts: number
  conflict_waiver: string | null
  /** Epoch ms when the mock worker may pick the queued job up. */
  queued_at: number | null
}

interface MockAccount {
  id: string
  domain: string
  available_cents: number
  grants: Grant[]
  usage: CreditAccount['usage']
}

interface MockState {
  seq: number
  allocated_cents: number
  cases: MockCase[]
  accounts: Record<string, MockAccount>
  create_keys: Record<string, { fingerprint: string; application_id: string }>
}

const CASE_FIELDS: ReadonlyArray<keyof CaseResponse> = [
  'id', 'company_name', 'domain', 'work_email', 'state', 'policy_version', 'email_verified', 'facts', 'checks',
  'evidence', 'events', 'tool_calls', 'research', 'grant', 'account_id', 'created_at', 'updated_at',
]

function nowIso() {
  return new Date().toISOString()
}
function delay(ms = 180 + Math.random() * 220) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
function http(status: number, detail: unknown): ApiError {
  return new ApiError({ kind: 'http', status, detail })
}
function item(loc: Array<string | number>, msg: string): ValidationErrorItem {
  return { loc, msg, type: 'value_error' }
}
function invalid(items: ValidationErrorItem[]): ApiError {
  return http(422, items)
}
/** backend/models.py normalize_domain, simplified: null when the backend would reject the value. */
function normalizeDomain(value: string): string | null {
  let host = value.trim().toLowerCase()
  try {
    host = new URL(host.includes('://') ? host : `https://${host}`).hostname
  } catch {
    return null
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '')
  if (!DOMAIN_RE.test(host)) return null
  if (/\.(localhost|local|internal|test|invalid)$/.test(host)) return null
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  return host
}
function isLinkedInProfile(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'linkedin.com' || url.hostname === 'www.linkedin.com') && url.pathname.startsWith('/in/') && url.search === '' && url.hash === ''
  } catch {
    return false
  }
}
function isPublicHttps(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && value.length <= 2000 && normalizeDomain(url.hostname) !== null
  } catch {
    return false
  }
}
function boundedInt(value: unknown, min: number, max: number): string | null {
  if (typeof value === 'boolean') return 'Value error, Use a numeric value, not a boolean.'
  if (!Number.isInteger(value)) return 'Input should be a valid integer'
  const n = value as number
  if (n < min) return `Input should be greater than or equal to ${min}`
  if (n > max) return `Input should be less than or equal to ${max}`
  return null
}
function boundedNumber(value: unknown, min: number, max: number): string | null {
  if (typeof value === 'boolean') return 'Value error, Use a numeric value, not a boolean.'
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Input should be a valid number'
  if (value < min) return `Input should be greater than or equal to ${min}`
  if (value > max) return `Input should be less than or equal to ${max}`
  return null
}
function toCase(c: MockCase): CaseResponse {
  const out: Record<string, unknown> = {}
  for (const key of CASE_FIELDS) out[key] = c[key]
  out.messages = c.messages.map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, subject: m.subject, body: m.body, created_at: m.created_at }))
  return structuredClone(out) as unknown as CaseResponse
}
function emptyState(): MockState {
  return { seq: 0, allocated_cents: 0, cases: [], accounts: {}, create_keys: {} }
}

export class MockApiClient implements ApiClient {
  private state: MockState
  private readonly timers = new Map<string, number>()

  constructor() {
    const loaded = this.load()
    this.state = loaded ?? emptyState()
    if (!loaded) this.seedFixtures()
    this.persist()
    for (const c of this.state.cases) this.arm(c)
  }

  // ---------------------------------------------------------------- persistence

  private load(): MockState | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as MockState
      return Array.isArray(parsed.cases) && typeof parsed.seq === 'number' ? parsed : null
    } catch {
      return null
    }
  }

  private persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      // storage unavailable; state lives in memory for this page load
    }
  }

  private nextId(prefix: string) {
    this.state.seq += 1
    return `${prefix}_${this.state.seq.toString(36).padStart(4, '0')}`
  }

  private find(id: string): MockCase | undefined {
    return this.state.cases.find((c) => c.id === id)
  }

  // ---------------------------------------------------------------- auth (backend: 401 for operator, 403 for applicant)

  private requireOperator(auth: Auth | undefined) {
    if (!auth || auth.kind !== 'operator' || auth.token !== OPERATOR_TOKEN) throw http(401, 'Operator credentials required.')
  }

  private requireApplicant(id: string, auth: Auth | undefined): MockCase {
    const c = this.find(id)
    if (!auth || auth.kind !== 'applicant' || !c || c.access_token !== auth.accessToken) throw http(403, 'Invalid applicant credentials.')
    return c
  }

  private requireAny(id: string, auth: Auth): MockCase {
    if (auth.kind === 'operator' && auth.token === OPERATOR_TOKEN) {
      const c = this.find(id)
      if (!c) throw http(404, 'Application not found.')
      return c
    }
    return this.requireApplicant(id, auth)
  }

  // ---------------------------------------------------------------- record helpers

  private touch(c: MockCase) {
    c.updated_at = nowIso()
  }

  private event(c: MockCase, type: string, detail: string) {
    c.events.push({ id: this.nextId('evt'), type, detail, created_at: nowIso() })
  }

  private message(c: MockCase, kind: string, subject: string, body: string, payload: { code?: string } = {}, direction: 'inbound' | 'outbound' = 'outbound') {
    c.messages.push({ id: this.nextId('msg'), direction, kind, subject, body, created_at: nowIso(), payload })
  }

  /** backend/service.py set_state: the event type is the lower-cased state name. */
  private setState(c: MockCase, state: ApplicationState, detail: string) {
    c.state = state
    this.event(c, state.toLowerCase(), detail)
    this.touch(c)
  }

  private addEvidence(c: MockCase, entry: Omit<Evidence, 'id' | 'retrieved_at'> & { retrieved_at?: string }): Evidence {
    const evidence: Evidence = { id: this.nextId('ev'), retrieved_at: nowIso(), ...entry }
    c.evidence.push(evidence)
    return evidence
  }

  private declare(c: MockCase, field: string, value: unknown, note: string) {
    this.addEvidence(c, { field, value, kind: 'APPLICANT_DECLARATION', source_url: null, source_pointer: null, observed_at: null, note })
  }

  private evidenceIds(c: MockCase, fields: readonly string[]) {
    return c.evidence.filter((e) => fields.includes(e.field)).map((e) => e.id)
  }

  // ---------------------------------------------------------------- lifecycle

  private newCase(input: ApplicationInput, domain: string, email: string): MockCase {
    const at = nowIso()
    const c: MockCase = {
      id: this.nextId('app'),
      company_name: input.company_name.trim(),
      domain,
      work_email: email,
      state: 'AWAITING_EMAIL',
      policy_version: POLICY_VERSION,
      email_verified: false,
      facts: {
        founding_year: input.founding_year ?? null,
        headcount: input.headcount ?? null,
        funding_usd: input.funding_usd ?? null,
        product_kind: input.product_kind ?? 'unknown',
        authority_declared: input.authority_declared,
        attestation_accepted: input.attestation_accepted,
      },
      checks: [],
      evidence: [],
      messages: [],
      events: [],
      tool_calls: [],
      research: { status: 'pending', configured: true, error: null },
      grant: null,
      account_id: null,
      created_at: at,
      updated_at: at,
      access_token: `mock-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
      verification_code: String(Math.floor(100000 + Math.random() * 900000)),
      code_expires_at: Date.now() + CODE_TTL_MS,
      verification_attempts: 0,
      usage_keys: {},
      research_attempts: 0,
      conflict_waiver: null,
      queued_at: null,
    }
    for (const key of CORRECTABLE) {
      const value = c.facts[key]
      if (value !== null && value !== undefined) this.declare(c, key, value, 'Applicant supplied this value; it is not independently verified.')
    }
    this.message(c, 'verification', 'Verify your company mailbox', 'Demo mailbox only. Enter the single-use code to simulate control of this company inbox.', { code: c.verification_code })
    this.event(c, 'submitted', `Application created under policy ${POLICY_VERSION}. Verification is pending.`)
    return c
  }

  private enqueue(c: MockCase, delayMs = 0) {
    c.queued_at = Date.now() + delayMs
    this.arm(c)
  }

  private arm(c: MockCase) {
    const existing = this.timers.get(c.id)
    if (existing !== undefined) window.clearTimeout(existing)
    if (c.state === 'RESEARCH_QUEUED') {
      const wait = Math.max(1500, (c.queued_at ?? 0) - Date.now())
      this.timers.set(c.id, window.setTimeout(() => this.beginResearch(c.id), wait))
    } else if (c.state === 'RESEARCHING') {
      this.timers.set(c.id, window.setTimeout(() => this.finishResearch(c.id), 2500))
    }
  }

  private beginResearch(id: string) {
    const c = this.find(id)
    if (!c || c.state !== 'RESEARCH_QUEUED') return
    c.state = 'RESEARCHING'
    c.research_attempts += 1
    this.event(c, 'research_started', 'Read-only external research started; null values remain unknown. (Mock worker: no provider is called.)')
    this.touch(c)
    this.persist()
    this.arm(c)
  }

  /**
   * Fixture research outcomes by domain: "unconfigured" → no provider key; "fail" → first attempt is a
   * transient failure (auto-retried, like the backend's bounded retry); "alwaysfail" → every attempt fails;
   * "conflict" → provider headcount 100 crosses the cap; "multimatch" → several provider matches;
   * anything else → a complete pass with a provider headcount observation of 14 and a zero funding row.
   */
  private finishResearch(id: string) {
    const c = this.find(id)
    if (!c || c.state !== 'RESEARCHING') return
    const at = nowIso()
    const attempt = c.research_attempts
    const transientFailure = c.domain.includes('alwaysfail') || (c.domain.includes('fail') && attempt === 1)
    const observation = (field: string, value: unknown, pointer: string, observedAt: string | null, note: string, url = `https://${c.domain}`) =>
      this.addEvidence(c, { field, value, kind: 'PROVIDER_OBSERVATION', source_url: url, source_pointer: pointer, observed_at: observedAt, retrieved_at: at, note })
    const call = (endpoint: string, status: string, credits: number, detail: string) =>
      c.tool_calls.push({ id: this.nextId('tc'), endpoint, status, credits_estimate: credits, detail, created_at: at })

    // The backend replaces provider observations on every run and keeps declarations and audit history.
    c.evidence = c.evidence.filter((e) => e.kind !== 'PROVIDER_OBSERVATION')
    let research: Research
    if (c.domain.includes('unconfigured')) {
      research = { status: 'unconfigured', configured: false, error: 'Crustdata key is not configured. External checks are incomplete; no live-data verification claimed.' }
    } else if (transientFailure) {
      call('/company/enrich', 'unknown', 2, 'Transport/parse failure. Spend may be uncertain; no blind immediate retry. (Simulated; fixture.)')
      call('/web/search/live', 'unknown', 1, 'Transport/parse failure. Spend may be uncertain; no blind immediate retry. (Simulated; fixture.)')
      research = { status: 'partial', configured: true, error: 'Research connection failed. No eligibility inference was made.', retryable: true, retry_after_seconds: 10 }
    } else {
      const cached = attempt > 1
      call('/company/enrich', cached ? 'cached' : 'success', cached ? 0 : 2, cached ? 'Cached provider response; underlying observation dates preserved.' : 'Provider response stored; credit amount is a planning estimate.')
      const note = `External provider observation, not an independently verified eligibility fact. ${FIXTURE}`
      observation('company_name', c.company_name, 'basic_info.name', null, note)
      observation('headcount', c.domain.includes('conflict') ? 100 : 14, 'headcount.total', '2026-09-30', note)
      observation('funding_usd', 0, 'funding.total_investment_usd', null, `Provider returned zero without establishing complete funding coverage; not proof of no funding. ${FIXTURE}`)
      if (c.domain.includes('multimatch')) observation('identity_conflict', true, 'matches', null, 'Multiple provider company matches; identity requires clarification.')
      call('/web/search/live', cached ? 'cached' : 'success', cached ? 0 : 1, cached ? 'Cached provider response; underlying observation dates preserved.' : 'Provider response stored; credit amount is a planning estimate.')
      observation('public_source_lead', `${c.company_name} announces seed round (fixture headline)`, 'results', null, 'Search lead only; snippet is not independently verified evidence.', `https://${c.domain}/press/seed-round`)
      research = { status: 'complete', configured: true, error: null, retryable: false, retry_after_seconds: 5 }
    }
    c.research = research

    if (research.retryable && attempt < MAX_RESEARCH_ATTEMPTS) {
      const backendDelay = Math.max(research.retry_after_seconds ?? 5, 5 * 2 ** (attempt - 1))
      this.enqueue(c, 5000)
      this.setState(c, 'RESEARCH_QUEUED', `Transient provider failure; automatic bounded retry scheduled in ${backendDelay} seconds (the mock runs it after 5 s). Cached successful calls will be reused.`)
      this.persist()
      return
    }
    this.event(c, 'research_finished', `Research status: ${research.status}`)
    this.evaluate(c)
    this.touch(c)
    this.persist()
  }

  /** backend/service.py evaluate(): same rule ids, reasons, ordering and state decision. */
  private evaluate(c: MockCase) {
    if (TERMINAL_STATES.has(c.state) || !c.email_verified) return
    const f = c.facts
    const currentYear = new Date().getUTCFullYear()
    const checks: Check[] = []
    const add = (rule: string, status: Check['status'], reason: string, fields: readonly string[] = []) => checks.push({ rule, status, reason, evidence_ids: this.evidenceIds(c, fields) })

    add('mailbox', 'PASS', 'Demo mailbox challenge completed; not real email delivery.')
    add('authority', f.authority_declared ? 'PASS' : 'NEEDS_INFORMATION', f.authority_declared ? 'Applicant authority declaration accepted.' : 'Confirm authorization to apply for this company.', ['authority_declared'])
    add('attestation', f.attestation_accepted ? 'PASS' : 'NEEDS_INFORMATION', f.attestation_accepted ? `Applicant accepted declaration responsibility under policy ${POLICY_VERSION}.` : 'Accept the program declaration policy.')
    const numeric: Array<[(typeof NUMERIC_FACTS)[number], string, (x: number) => boolean]> = [
      ['founding_year', 'Founding year', (x) => POLICY.founded_year_min <= x && x <= currentYear],
      ['headcount', 'Full-time employee count', (x) => x < POLICY.headcount_max_exclusive],
      ['funding_usd', 'Total funding in USD', (x) => x < POLICY.funding_max_usd_exclusive],
    ]
    for (const [field, label, ok] of numeric) {
      const value = f[field]
      if (value === null) add(field, 'NEEDS_INFORMATION', `Provide ${label.toLowerCase()} and accept responsibility for the declaration.`, [field])
      else add(field, ok(value) ? 'PASS' : 'FAIL', `${label}: ${value}. Applicant declaration evaluated under policy ${POLICY_VERSION}; not independently verified.`, [field])
    }
    const kind = f.product_kind
    add('product', kind === 'software' ? 'PASS' : kind === 'other' ? 'FAIL' : 'NEEDS_INFORMATION',
      kind === 'software' ? 'Software-product declaration accepted.' : kind === 'other' ? 'Program is for software products.' : 'Confirm whether the business provides a software product.', ['product_kind'])

    const conflicts: string[] = []
    for (const e of c.evidence) {
      if (e.kind !== 'PROVIDER_OBSERVATION') continue
      const v = e.value
      if (e.field === 'identity_conflict') conflicts.push('Provider returned multiple company candidates.')
      if (e.field === 'funding_usd' && typeof v === 'number' && v > 0 && f.funding_usd !== null && v >= POLICY.funding_max_usd_exclusive && POLICY.funding_max_usd_exclusive > f.funding_usd) {
        conflicts.push('External funding observation crosses the eligibility cap; clarify its date, entity and scope.')
      }
      if (e.field === 'founding_year' && v !== null && f.founding_year !== null && v !== f.founding_year) conflicts.push('Provider founding year differs from the declaration; clarify the meaning and source.')
      if (e.field === 'headcount' && typeof v === 'number' && f.headcount !== null && v >= POLICY.headcount_max_exclusive && POLICY.headcount_max_exclusive > f.headcount) {
        conflicts.push('Provider workforce count crosses the cap; clarify dates and employee/contractor definitions.')
      }
    }
    if (c.domain.includes('collision')) conflicts.push('Provider identity overlaps an existing account on another domain; confirm legal entity before issuing.')
    add('external_consistency', conflicts.length === 0 || c.conflict_waiver ? 'PASS' : 'CONFLICT',
      c.conflict_waiver ? `Operator resolved external observation conflict: ${c.conflict_waiver}` : conflicts.length ? conflicts.join('; ') : 'No material conflict observed in available records. This is not a completeness guarantee.',
      ['funding_usd', 'headcount', 'founding_year', 'identity_conflict'])
    add('research', c.research.status === 'complete' ? 'PASS' : 'NEEDS_INFORMATION',
      c.research.status === 'complete' ? 'Bounded external checks completed; declarations remain labeled.' : 'External research is incomplete. Operator must restore research; applicant declarations cannot bypass this check.')
    c.checks = checks

    const failing = checks.filter((k) => k.status === 'FAIL')
    const needs = checks.filter((k) => k.status === 'NEEDS_INFORMATION')
    if (failing.length > 0) {
      this.setState(c, 'DECLINED', `Application does not meet: ${failing.map((k) => k.rule).join(', ')}`)
      this.message(c, 'decision', 'Startup program decision', failing.map((k) => k.reason).join('\n'))
    } else if (conflicts.length > 0 && !c.conflict_waiver) {
      this.setState(c, 'EXCEPTION', conflicts.join('; '))
      this.message(c, 'information_request', 'Clarification needed', conflicts.join('; '))
    } else if (needs.length > 0) {
      this.setState(c, 'AWAITING_APPLICANT', 'Waiting for accepted missing information or restored research.')
      this.message(c, 'information_request', 'Information needed for your startup application', needs.map((k) => k.reason).join('\n'))
    } else {
      this.issue(c)
    }
  }

  /** backend/service.py issue(): one grant per verified domain, budget rechecked, ledger updated in one step. */
  private issue(c: MockCase) {
    const existing = Object.values(this.state.accounts).find((a) => a.domain === c.domain)
    if (existing && existing.grants.length > 0) {
      c.account_id = existing.id
      c.grant = existing.grants[0]
      this.setState(c, 'DUPLICATE_RESOLVED', 'This verified-domain company already has its program grant. No additional credits issued.')
      this.message(c, 'activation', 'Existing startup benefit located', 'Your company already has this program benefit. No second grant was created.')
      return
    }
    const remaining = BUDGET_CENTS - this.state.allocated_cents
    if (remaining < BENEFIT_CENTS || c.domain.includes('budget')) {
      this.setState(c, 'BUDGET_WAITING', `Eligible under policy but program allocation is exhausted.${c.domain.includes('budget') ? ' (Forced by the "budget" fixture domain.)' : ''}`)
      return
    }
    const at = nowIso()
    const account = existing ?? { id: this.nextId('acct'), domain: c.domain, available_cents: 0, grants: [], usage: [] }
    this.state.accounts[account.id] = account
    const grant: Grant = { id: this.nextId('grant'), amount_cents: BENEFIT_CENTS, created_at: at }
    account.grants.push(grant)
    account.available_cents += BENEFIT_CENTS
    this.state.allocated_cents += BENEFIT_CENTS
    c.account_id = account.id
    c.grant = grant
    this.setState(c, 'ENROLLED', `Issued ${BENEFIT_CENTS} USD cents of promotional product credits in one transaction.`)
    this.message(c, 'activation', 'Your LaunchCloud startup credits are active', `Your account received $${(BENEFIT_CENTS / 100).toFixed(2)} in promotional product credits. This is a demo SaaS balance, not Crustdata credits.`)
  }

  private seedFixtures() {
    const base = { applicant_role: 'Founder', product_kind: 'software' as const, profile_url: null, authority_declared: true, attestation_accepted: true }
    const seed = (input: ApplicationInput, finish = true): MockCase => {
      const c = this.newCase(input, input.domain, input.work_email)
      this.state.cases.push(c)
      c.email_verified = true
      c.verification_attempts = 1
      this.event(c, 'email_verified', 'Mailbox challenge completed through the explicitly simulated demo adapter. (Fixture)')
      c.state = 'RESEARCHING'
      c.research_attempts = 1
      this.event(c, 'research_started', 'Read-only external research started; null values remain unknown. (Mock worker: no provider is called.)')
      if (finish) this.finishResearch(c.id)
      return c
    }
    const orbit = seed({ ...base, company_name: '[Fixture] Orbit Labs', domain: 'orbit-labs.fixture', applicant_name: 'Fixture Applicant A', work_email: 'founder@orbit-labs.fixture', product_description: 'Fixture: API monitoring for developer teams.', founding_year: 2024, headcount: 12, funding_usd: 1_500_000 })
    if (orbit.account_id) {
      const account = this.state.accounts[orbit.account_id]
      account.available_cents -= 100
      account.usage.push({ id: this.nextId('use'), amount_cents: 100, created_at: nowIso() })
      orbit.usage_keys['fixture-usage-1'] = { amount_cents: 100, description: 'Sample API job' }
      this.event(orbit, 'product_used', 'Product action consumed 100 USD cents. (Fixture)')
    }
    seed({ ...base, company_name: '[Fixture] Tidewater AI', domain: 'tidewater-conflict.fixture', applicant_name: 'Fixture Applicant B', work_email: 'ops@tidewater-conflict.fixture', product_description: 'Fixture: ML tooling for maritime logistics.', founding_year: 2023, headcount: 40, funding_usd: 4_000_000 })
    seed({ ...base, company_name: '[Fixture] Granite Robotics', domain: 'granite-robotics.fixture', applicant_name: 'Fixture Applicant C', work_email: 'ceo@granite-robotics.fixture', product_description: 'Fixture: fleet software for warehouse robots.', founding_year: 2022, headcount: 9, funding_usd: null })
    // Nimbus: research exhausted its three transient attempts; the backend then holds the case on the research check.
    const nimbus = seed({ ...base, company_name: '[Fixture] Nimbus Works', domain: 'nimbus-fail.fixture', applicant_name: 'Fixture Applicant D', work_email: 'hello@nimbus-fail.fixture', product_description: 'Fixture: scheduling software for clinics.', founding_year: 2025, headcount: 8, funding_usd: 250_000 }, false)
    nimbus.research_attempts = MAX_RESEARCH_ATTEMPTS
    for (let attempt = 1; attempt <= MAX_RESEARCH_ATTEMPTS; attempt += 1) {
      nimbus.tool_calls.push({ id: this.nextId('tc'), endpoint: '/company/enrich', status: 'unknown', credits_estimate: 2, detail: `Attempt ${attempt}: transport/parse failure. Spend may be uncertain; no blind immediate retry. (Simulated; fixture.)`, created_at: nowIso() })
    }
    nimbus.research = { status: 'partial', configured: true, error: 'Research connection failed. No eligibility inference was made.', retryable: true, retry_after_seconds: 10 }
    this.event(nimbus, 'research_finished', 'Research status: partial')
    this.evaluate(nimbus)
    this.touch(nimbus)
  }

  private programView(): Program {
    return {
      id: 'launchcloud',
      name: 'LaunchCloud Startup Program (mock fixture)',
      policy_version: POLICY_VERSION,
      benefit_cents: BENEFIT_CENTS,
      currency: 'USD',
      budget_cents: BUDGET_CENTS,
      allocated_cents: this.state.allocated_cents,
      remaining_cents: BUDGET_CENTS - this.state.allocated_cents,
      policy: { ...POLICY },
    }
  }

  private accountView(c: MockCase): CreditAccount {
    const account = c.account_id ? this.state.accounts[c.account_id] : undefined
    if (!account) return { account_id: c.account_id, currency: 'USD', available_cents: 0, grants: [], usage: [] }
    return structuredClone({ account_id: account.id, currency: 'USD' as const, available_cents: account.available_cents, grants: account.grants, usage: account.usage })
  }

  // ---------------------------------------------------------------- ApiClient

  async health(): Promise<Health> {
    await delay(80)
    return { status: 'ok', demo_mode: true, research_mode: 'live', model_configured: false, worker_required: true }
  }

  async program(): Promise<Program> {
    await delay()
    return this.programView()
  }

  /** backend/models.py ApplicationInput + service.py create(): same validation, email-domain rule and idempotency outcomes. */
  async createApplication(input: ApplicationInput, opts: { idempotencyKey: string }): Promise<ApplicationCreated> {
    await delay()
    if (!opts.idempotencyKey || opts.idempotencyKey.length < 8 || opts.idempotencyKey.length > 200) throw http(422, 'Provide an Idempotency-Key of 8 to 200 characters.')
    const items: ValidationErrorItem[] = []
    const text = (key: keyof ApplicationInput, min: number, max: number) => {
      const value = input[key]
      if (typeof value !== 'string' || value.length < min) items.push(item(['body', key], `String should have at least ${min} character${min === 1 ? '' : 's'}`))
      else if (value.length > max) items.push(item(['body', key], `String should have at most ${max} characters`))
    }
    text('company_name', 2, 200)
    text('applicant_name', 1, 150)
    text('applicant_role', 1, 150)
    text('product_description', 10, 5000)
    const domain = normalizeDomain(input.domain ?? '')
    if (domain === null) items.push(item(['body', 'domain'], 'Value error, Invalid company domain.'))
    else if (MAILBOX_PROVIDERS.has(domain)) items.push(item(['body', 'domain'], 'Value error, Use the company domain rather than a mailbox provider, social site or URL shortener.'))
    const email = (input.work_email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) items.push(item(['body', 'work_email'], 'Value error, Invalid work email.'))
    if (!['software', 'other', 'unknown'].includes(input.product_kind)) items.push(item(['body', 'product_kind'], "Input should be 'software', 'other' or 'unknown'"))
    if (input.profile_url && !isLinkedInProfile(input.profile_url)) items.push(item(['body', 'profile_url'], 'Value error, Use a public LinkedIn /in/ profile URL without query parameters.'))
    const bounds: Array<[string, string | null]> = [
      ['founding_year', input.founding_year == null ? null : boundedInt(input.founding_year, 1800, 2100)],
      ['headcount', input.headcount == null ? null : boundedInt(input.headcount, 0, 10_000_000)],
      ['funding_usd', input.funding_usd == null ? null : boundedNumber(input.funding_usd, 0, 1e15)],
    ]
    for (const [field, problem] of bounds) if (problem) items.push(item(['body', field], problem))
    if (items.length > 0) throw invalid(items)
    if (domain === null) throw invalid([item(['body', 'domain'], 'Value error, Invalid company domain.')])
    if (!isOnDomain(email, domain)) throw http(422, 'Use an email address on the submitted company domain.')

    const fingerprint = JSON.stringify({ ...input, domain, work_email: email })
    const prior = this.state.create_keys[opts.idempotencyKey]
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw http(409, 'Idempotency key belongs to a different submission.')
      throw http(409, 'Submission already exists. Resume with its saved applicant token; it cannot be recovered using the submission key alone.')
    }
    const c = this.newCase(input, domain, email)
    this.state.cases.push(c)
    this.state.create_keys[opts.idempotencyKey] = { fingerprint, application_id: c.id }
    this.persist()
    return { application_id: c.id, access_token: c.access_token, state: c.state }
  }

  async getCase(applicationId: string, auth: Auth): Promise<CaseResponse> {
    await delay(120)
    return toCase(this.requireAny(applicationId, auth))
  }

  /** backend/service.py verify(): 400 for a wrong code and for expiry or lockout; already-verified cases just return. */
  async verifyEmail(applicationId: string, input: VerificationInput, auth: ApplicantAuth): Promise<CaseResponse> {
    await delay()
    const c = this.requireApplicant(applicationId, auth)
    if (!/^\d{6}$/.test(input.code ?? '')) throw invalid([item(['body', 'code'], "String should match pattern '^\\d{6}$'")])
    if (c.email_verified) return toCase(c)
    if (c.verification_attempts >= 5 || c.code_expires_at < Date.now()) throw http(400, 'Verification expired or locked after five attempts.')
    if (input.code !== c.verification_code) {
      c.verification_attempts += 1
      this.persist()
      throw http(400, 'Incorrect verification code.')
    }
    c.email_verified = true
    c.state = 'RESEARCH_QUEUED'
    this.touch(c)
    this.event(c, 'email_verified', 'Mailbox challenge completed through the explicitly simulated demo adapter.')
    this.enqueue(c)
    this.persist()
    return toCase(c)
  }

  /** backend/service.py response(): null facts are ignored, replies are accepted in any verified non-terminal, non-research state. */
  async respond(applicationId: string, input: ApplicantResponse, auth: ApplicantAuth): Promise<CaseResponse> {
    await delay()
    const c = this.requireApplicant(applicationId, auth)
    const items: ValidationErrorItem[] = []
    const text = (input.text ?? '').trim()
    if (text.length > 10_000) items.push(item(['body', 'text'], 'String should have at most 10000 characters'))
    const urls = input.source_urls ?? []
    if (urls.length > 10) items.push(item(['body', 'source_urls'], 'List should have at most 10 items'))
    else if (urls.some((u) => !isPublicHttps(u))) items.push(item(['body', 'source_urls'], 'Value error, Supporting links must be public HTTPS URLs without credentials or ports.'))
    const facts = input.facts ?? {}
    const problems: Array<[string, string | null]> = [
      ['founding_year', facts.founding_year == null ? null : boundedInt(facts.founding_year, 1800, 2100)],
      ['headcount', facts.headcount == null ? null : boundedInt(facts.headcount, 0, 10_000_000)],
      ['funding_usd', facts.funding_usd == null ? null : boundedNumber(facts.funding_usd, 0, 1e15)],
    ]
    for (const [field, problem] of problems) if (problem) items.push(item(['body', 'facts', field], problem))
    if (items.length > 0) throw invalid(items)
    if (!c.email_verified || TERMINAL_STATES.has(c.state)) throw http(409, 'This application cannot accept fact changes in its current state.')
    if (c.state === 'RESEARCHING' || c.state === 'RESEARCH_QUEUED') throw http(409, 'Research is running. Wait for its information request before replying.')

    const changed = CORRECTABLE.filter((key) => facts[key] !== undefined && facts[key] !== null)
    for (const key of changed) {
      const value = facts[key]
      switch (key) {
        case 'founding_year':
          c.facts.founding_year = value as number
          break
        case 'headcount':
          c.facts.headcount = value as number
          break
        case 'funding_usd':
          c.facts.funding_usd = value as number
          break
        case 'product_kind':
          c.facts.product_kind = value as FactValues['product_kind']
          break
        case 'authority_declared':
          c.facts.authority_declared = Boolean(value)
          break
      }
      this.declare(c, key, value, 'Updated declaration in an authenticated applicant reply; not independently verified.')
    }
    if (input.attestation_accepted) c.facts.attestation_accepted = true
    for (const url of urls) {
      this.addEvidence(c, { field: 'supporting_link', value: url, kind: 'APPLICANT_LINK', source_url: url, source_pointer: null, observed_at: null, note: 'Applicant-supplied link; content/authenticity has not been verified.' })
    }
    this.message(c, 'reply', 'Applicant response', text || 'Structured facts updated.', {}, 'inbound')
    c.conflict_waiver = null
    this.event(c, 'applicant_replied', 'Recorded accepted structured corrections and source links.')
    this.evaluate(c)
    this.touch(c)
    this.persist()
    return toCase(c)
  }

  /** backend/main.py report(): the case wrapped with the policy and explicit limitations. */
  async getReport(applicationId: string, auth: Auth): Promise<unknown> {
    await delay()
    const c = this.requireAny(applicationId, auth)
    return { report_version: '1', evidence_policy: { ...POLICY }, case: toCase(c), limitations: [...REPORT_LIMITATIONS, FIXTURE] }
  }

  async getCredits(applicationId: string, auth: Auth): Promise<CreditAccount> {
    await delay()
    return this.accountView(this.requireAny(applicationId, auth))
  }

  /** backend/service.py use(): idempotent per key and intent; 409 for a different intent, no account or insufficient funds. */
  async postUsage(applicationId: string, input: UsageInput, opts: { idempotencyKey: string }, auth: ApplicantAuth): Promise<CreditAccount> {
    await delay()
    const c = this.requireApplicant(applicationId, auth)
    if (!opts.idempotencyKey || opts.idempotencyKey.length < 8 || opts.idempotencyKey.length > 200) throw http(422, 'Provide an Idempotency-Key of 8 to 200 characters.')
    const items: ValidationErrorItem[] = []
    if (typeof input.amount_cents === 'boolean') items.push(item(['body', 'amount_cents'], 'Value error, Use integer cents, not a boolean.'))
    else if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) items.push(item(['body', 'amount_cents'], 'Input should be greater than 0'))
    else if (input.amount_cents > 50_000) items.push(item(['body', 'amount_cents'], 'Input should be less than or equal to 50000'))
    if (!input.description || input.description.length < 1) items.push(item(['body', 'description'], 'String should have at least 1 character'))
    else if (input.description.length > 500) items.push(item(['body', 'description'], 'String should have at most 500 characters'))
    if (items.length > 0) throw invalid(items)
    if (!(c.state === 'ENROLLED' || c.state === 'DUPLICATE_RESOLVED') || !c.account_id) throw http(409, 'No active product-credit account.')
    const prior = c.usage_keys[opts.idempotencyKey]
    if (prior) {
      if (prior.amount_cents !== input.amount_cents || prior.description !== input.description) throw http(409, 'Idempotency key was used for a different product action.')
      return this.accountView(c)
    }
    const account = this.state.accounts[c.account_id]
    if (account.available_cents < input.amount_cents) throw http(409, 'Insufficient product credits.')
    account.available_cents -= input.amount_cents
    account.usage.push({ id: this.nextId('use'), amount_cents: input.amount_cents, created_at: nowIso() })
    c.usage_keys[opts.idempotencyKey] = { amount_cents: input.amount_cents, description: input.description }
    this.event(c, 'product_used', `Product action consumed ${input.amount_cents} USD cents.`)
    this.touch(c)
    this.persist()
    return this.accountView(c)
  }

  /** backend/main.py inbox(): every outbound message with its payload; the code lives only here. */
  async getDemoInbox(applicationId: string, auth: ApplicantAuth): Promise<DemoInbox> {
    await delay(120)
    const c = this.requireApplicant(applicationId, auth)
    return { demo_mode: true, messages: structuredClone(c.messages.filter((m) => m.direction === 'outbound')) }
  }

  async operatorQueue(auth: OperatorAuth): Promise<OperatorQueue> {
    await delay()
    this.requireOperator(auth)
    const applications = this.state.cases
      .map((c) => ({ id: c.id, company_name: c.company_name, domain: c.domain, work_email: c.work_email, state: c.state, created_at: c.created_at, updated_at: c.updated_at }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return { applications, program: this.programView() }
  }

  /** backend/main.py resolve(): EXCEPTION only; a waiver needs an external_consistency CONFLICT and never covers an entity collision. */
  async operatorResolve(applicationId: string, input: ResolutionInput, auth: OperatorAuth): Promise<CaseResponse> {
    await delay()
    this.requireOperator(auth)
    const items: ValidationErrorItem[] = []
    if (!['request_information', 'waive_conflict', 'decline'].includes(input.action)) items.push(item(['body', 'action'], "Input should be 'request_information', 'waive_conflict' or 'decline'"))
    const reason = input.reason ?? ''
    if (reason.length < 15) items.push(item(['body', 'reason'], 'String should have at least 15 characters'))
    else if (reason.length > 4000) items.push(item(['body', 'reason'], 'String should have at most 4000 characters'))
    if (items.length > 0) throw invalid(items)
    const c = this.find(applicationId)
    if (!c) throw http(404, 'Application not found.')
    if (c.state !== 'EXCEPTION') throw http(409, 'This action is only available for an actual exception.')
    const consistency = c.checks.find((k) => k.rule === 'external_consistency')
    if (input.action === 'waive_conflict') {
      if (!consistency || consistency.status !== 'CONFLICT') throw http(409, 'No external observation conflict is available to resolve.')
      if (consistency.reason.includes('confirm legal entity')) throw http(409, 'Entity collision requires explicit account reconciliation, not an eligibility waiver. MVP leaves it unresolved.')
    }
    this.event(c, 'operator_resolution', `${input.action}: ${reason}`)
    if (input.action === 'decline') {
      this.setState(c, 'DECLINED', `Operator decision: ${reason}`)
      this.message(c, 'decision', 'Startup program decision', `Operator decision: ${reason}`)
    } else if (input.action === 'request_information') {
      this.setState(c, 'AWAITING_APPLICANT', 'Operator requested clarification.')
      this.message(c, 'information_request', 'Additional clarification requested', reason)
    } else {
      c.conflict_waiver = reason
      this.touch(c)
      this.evaluate(c)
    }
    this.persist()
    return toCase(c)
  }

  /** backend/main.py retry(): verified, non-terminal, no active worker lease; attempts are not reset. */
  async operatorRetry(applicationId: string, auth: OperatorAuth): Promise<CaseResponse> {
    await delay()
    this.requireOperator(auth)
    const c = this.find(applicationId)
    if (!c) throw http(404, 'Application not found.')
    if (TERMINAL_STATES.has(c.state) || !c.email_verified) throw http(409, 'Terminal or unverified cases cannot be requeued.')
    if (c.state === 'RESEARCHING') throw http(409, 'Research already has an active worker lease.')
    this.enqueue(c)
    this.setState(c, 'RESEARCH_QUEUED', 'Operator requested a bounded research retry.')
    this.arm(c)
    this.persist()
    return toCase(c)
  }
}

function isOnDomain(email: string, domain: string): boolean {
  const emailDomain = email.split('@')[1] ?? ''
  return emailDomain === domain || emailDomain.endsWith(`.${domain}`)
}
