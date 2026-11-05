import { useId, useState, type FormEvent } from 'react'
import { api } from '../api'
import { toApiError, validationFieldErrors, type ApiError } from '../api/errors'
import { clearIdempotencyKey, getOrCreateIdempotencyKey, stableFingerprint } from '../api/idempotency'
import { LIMITS, PRODUCT_KINDS, type ApplicationInput, type ProductKind } from '../api/types'
import { EvidencePolicyNotes } from '../components/EvidencePolicyNotes'
import { ProgramPolicyCard } from '../components/ProgramPolicyCard'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ErrorNotice } from '../components/ui/ErrorNotice'
import { Field } from '../components/ui/Field'
import { Link } from '../components/ui/Link'
import { Notice } from '../components/ui/Notice'
import { useProgram } from '../hooks/useProgram'
import { PRODUCT_KIND_LABELS } from '../lib/facts'
import { navigate, routes } from '../lib/router'
import { saveApplicantSession, useApplicantSession } from '../lib/session'
import { pushToast } from '../lib/toastStore'
import { describedBy } from '../lib/a11y'

interface FormState {
  company_name: string
  domain: string
  applicant_name: string
  work_email: string
  applicant_role: string
  product_description: string
  product_kind: ProductKind
  profile_url: string
  founding_year: string
  headcount: string
  funding_usd: string
  authority_declared: boolean
  attestation_accepted: boolean
}

const INITIAL: FormState = {
  company_name: '',
  domain: '',
  applicant_name: '',
  work_email: '',
  applicant_role: '',
  product_description: '',
  product_kind: 'unknown',
  profile_url: '',
  founding_year: '',
  headcount: '',
  funding_usd: '',
  authority_declared: false,
  attestation_accepted: false,
}

const INTENT = 'create-application'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]{2,}$/

/** Mirrors backend/models.py normalize_domain: scheme, "www." and paths are dropped; the backend also rejects mailbox providers and private suffixes. */
function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/\.$/, '')
}

/** Backend rule (service.py create): the work email must be on the company domain or one of its subdomains. */
function isOnDomain(email: string, domain: string): boolean {
  const emailDomain = email.split('@')[1]?.toLowerCase() ?? ''
  return emailDomain === domain || emailDomain.endsWith(`.${domain}`)
}

/** Backend rule (models.py profile_valid): https LinkedIn /in/ profile without query or fragment. */
function isLinkedInProfile(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'linkedin.com' || url.hostname === 'www.linkedin.com') && url.pathname.startsWith('/in/') && url.search === '' && url.hash === ''
  } catch {
    return false
  }
}

function parseInteger(raw: string): number | null | 'invalid' {
  const t = raw.trim().replace(/,/g, '')
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : 'invalid'
}

function parseMoney(raw: string): number | null | 'invalid' {
  const t = raw.trim().replace(/[$,\s]/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : 'invalid'
}

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {}
  const name = f.company_name.trim()
  if (name.length < LIMITS.companyName.min || name.length > LIMITS.companyName.max) e.company_name = `Between ${LIMITS.companyName.min} and ${LIMITS.companyName.max} characters.`
  if (!DOMAIN_PATTERN.test(normalizeDomain(f.domain))) e.domain = 'Enter the company web domain, for example examplelabs.com.'
  const applicant = f.applicant_name.trim()
  if (applicant.length < LIMITS.applicantName.min || applicant.length > LIMITS.applicantName.max) e.applicant_name = 'Enter your name.'
  const email = f.work_email.trim()
  if (!EMAIL_PATTERN.test(email) || email.length > LIMITS.workEmail.max) e.work_email = 'Enter a valid work email address.'
  else if (!e.domain && !isOnDomain(email, normalizeDomain(f.domain))) e.work_email = `Use an address on ${normalizeDomain(f.domain)} or one of its subdomains; the backend rejects other addresses.`
  const role = f.applicant_role.trim()
  if (role.length < LIMITS.applicantRole.min || role.length > LIMITS.applicantRole.max) e.applicant_role = 'Enter your role at the company.'
  const description = f.product_description.trim()
  if (description.length < LIMITS.productDescription.min || description.length > LIMITS.productDescription.max) e.product_description = `Between ${LIMITS.productDescription.min} and ${LIMITS.productDescription.max.toLocaleString('en-US')} characters.`
  if (f.profile_url.trim() !== '' && !isLinkedInProfile(f.profile_url.trim())) {
    e.profile_url = 'Enter a public LinkedIn profile URL such as https://www.linkedin.com/in/your-name (https, no query string), or leave it blank.'
  }
  const year = parseInteger(f.founding_year)
  if (year === 'invalid' || (year !== null && (year < LIMITS.foundingYear.min || year > LIMITS.foundingYear.max))) e.founding_year = `Enter a four-digit year, or leave blank if unknown.`
  const headcount = parseInteger(f.headcount)
  if (headcount === 'invalid' || (headcount !== null && headcount > LIMITS.headcount.max)) e.headcount = 'Enter a whole number of full-time employees, or leave blank if unknown.'
  const funding = parseMoney(f.funding_usd)
  if (funding === 'invalid') e.funding_usd = 'Enter total funding in USD (0 or more), or leave blank if unknown.'
  if (!f.authority_declared) e.authority_declared = 'You must declare that you are authorized to apply on behalf of the company.'
  if (!f.attestation_accepted) e.attestation_accepted = 'You must accept the eligibility attestation.'
  return e
}

function toPayload(f: FormState): ApplicationInput {
  const year = parseInteger(f.founding_year)
  const headcount = parseInteger(f.headcount)
  const funding = parseMoney(f.funding_usd)
  return {
    company_name: f.company_name.trim(),
    domain: normalizeDomain(f.domain),
    applicant_name: f.applicant_name.trim(),
    work_email: f.work_email.trim().toLowerCase(),
    applicant_role: f.applicant_role.trim(),
    product_description: f.product_description.trim(),
    product_kind: f.product_kind,
    profile_url: f.profile_url.trim() === '' ? null : f.profile_url.trim(),
    founding_year: year === 'invalid' ? null : year,
    headcount: headcount === 'invalid' ? null : headcount,
    funding_usd: funding === 'invalid' ? null : funding,
    authority_declared: f.authority_declared,
    attestation_accepted: f.attestation_accepted,
  }
}

export function ApplyPage() {
  const idBase = useId()
  const session = useApplicantSession()
  const program = useProgram()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [usedKey, setUsedKey] = useState<string | null>(null)

  const policyVersion = program.data?.policy_version ?? 'v1'
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const fid = (key: keyof FormState) => `${idBase}-${key}`

  const emailDomain = form.work_email.includes('@') ? form.work_email.split('@')[1]?.trim().toLowerCase() : ''
  const companyDomain = normalizeDomain(form.domain)
  const domainMismatch = Boolean(emailDomain && companyDomain && !isOnDomain(form.work_email.trim(), companyDomain))

  const performSubmit = async () => {
    const errors = validate(form)
    setFieldErrors(errors)
    const first = Object.keys(errors)[0]
    if (first) {
      document.getElementById(fid(first as keyof FormState))?.focus()
      return
    }
    const payload = toPayload(form)
    const key = getOrCreateIdempotencyKey(INTENT, stableFingerprint(payload))
    setUsedKey(key)
    setSubmitting(true)
    setError(null)
    try {
      const created = await api.createApplication(payload, { idempotencyKey: key })
      clearIdempotencyKey(INTENT)
      saveApplicantSession({
        applicationId: created.application_id,
        accessToken: created.access_token,
        companyName: payload.company_name,
        workEmail: payload.work_email,
        createdAt: new Date().toISOString(),
      })
      pushToast({ tone: 'success', title: 'Application created', message: `Backend state: ${created.state}. Next: enter the verification code issued to your work mailbox.` })
      navigate(routes.status)
    } catch (err) {
      const apiErr = toApiError(err)
      setError(apiErr)
      const fe = validationFieldErrors(apiErr)
      if (Object.keys(fe).length > 0) {
        setFieldErrors(fe)
        const firstServer = Object.keys(fe)[0]
        document.getElementById(fid(firstServer as keyof FormState))?.focus()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void performSubmit()
  }

  const textField = (key: keyof FormState, label: string, opts: { hint?: string; required?: boolean; type?: string; placeholder?: string; autoComplete?: string; maxLength?: number; inputMode?: 'numeric' | 'decimal' | 'email' | 'url' | 'text' }) => {
    const id = fid(key)
    const err = fieldErrors[key]
    return (
      <Field id={id} label={label} hint={opts.hint} error={err} required={opts.required}>
        <input
          id={id}
          className="input"
          type={opts.type ?? 'text'}
          inputMode={opts.inputMode}
          placeholder={opts.placeholder}
          autoComplete={opts.autoComplete ?? 'off'}
          maxLength={opts.maxLength}
          value={String(form[key])}
          onChange={(e) => update(key, e.target.value as FormState[typeof key])}
          aria-invalid={!!err}
          aria-describedby={describedBy(id, !!opts.hint, !!err)}
          required={opts.required}
        />
      </Field>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Applicant</p>
          <h1>Apply for LaunchCloud startup credits</h1>
          <p className="lead">One application per company. The backend decides; this form only records what you declare.</p>
        </div>
      </header>

      {session && (
        <Notice
          tone="warning"
          title={`This browser tab already holds an application${session.companyName ? ` for ${session.companyName}` : ''}.`}
          actions={
            <Link to={routes.status} className="btn btn-secondary btn-sm">
              Open it
            </Link>
          }
        >
          Submitting a new application replaces the stored access token, and the earlier application cannot be reopened from this tab afterwards. The backend
          issues each access token exactly once.
        </Notice>
      )}

      <div className="layout-2col">
        <form className="col-main stack" onSubmit={submit} noValidate aria-label="Startup application">
          <Card title="Company">
            <div className="grid-2">
              {textField('company_name', 'Company name', { required: true, placeholder: 'Example Labs', autoComplete: 'organization', maxLength: LIMITS.companyName.max })}
              {textField('domain', 'Company web domain', { required: true, placeholder: 'examplelabs.com', hint: companyDomain && companyDomain !== form.domain.trim() ? `Will be sent as ${companyDomain}` : 'Public company domain, not a mailbox provider such as gmail.com. Your work email must be on this domain or a subdomain.', inputMode: 'url' })}
            </div>
            <Field id={fid('product_description')} label="Product description" required hint="What the product does and who uses it. Evaluated against the program's software-startup rule." error={fieldErrors.product_description}>
              <textarea
                id={fid('product_description')}
                className="textarea"
                rows={4}
                maxLength={LIMITS.productDescription.max}
                value={form.product_description}
                onChange={(e) => update('product_description', e.target.value)}
                aria-invalid={!!fieldErrors.product_description}
                aria-describedby={describedBy(fid('product_description'), true, !!fieldErrors.product_description)}
                required
              />
            </Field>
            <Field id={fid('product_kind')} label="Product kind" required hint="Choose 'Software product' if your company sells software. 'Unknown' leads to a clarification question." error={fieldErrors.product_kind}>
              <select id={fid('product_kind')} className="select" value={form.product_kind} onChange={(e) => update('product_kind', e.target.value as ProductKind)} aria-describedby={describedBy(fid('product_kind'), true, false)}>
                {PRODUCT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PRODUCT_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card title="Applicant">
            <div className="grid-2">
              {textField('applicant_name', 'Your name', { required: true, autoComplete: 'name', maxLength: LIMITS.applicantName.max })}
              {textField('applicant_role', 'Your role', { required: true, placeholder: 'Founder, CEO, Head of Ops…', autoComplete: 'organization-title', maxLength: LIMITS.applicantRole.max })}
              {textField('work_email', 'Work email', { required: true, type: 'email', inputMode: 'email', placeholder: 'you@examplelabs.com', autoComplete: 'email', hint: 'A single-use verification code is issued to this address. In demo mode it lands in the simulated mailbox.', maxLength: LIMITS.workEmail.max })}
              {textField('profile_url', 'LinkedIn profile URL (optional)', { type: 'url', inputMode: 'url', placeholder: 'https://www.linkedin.com/in/…', hint: 'The backend accepts only a public LinkedIn /in/ profile (https) in v1. Corroboration only; it does not replace the authority declaration.' })}
            </div>
            {domainMismatch && (
              <Notice tone="warning" compact title="Work email is not on the company domain">
                The backend accepts only a work email on the company domain or one of its subdomains and rejects the application otherwise. Use that address, or correct
                the domain.
              </Notice>
            )}
          </Card>

          <Card title="Eligibility facts" subtitle={`Leave anything you do not know blank. Blank means unknown, never zero. Declarations are accepted under policy ${policyVersion}, timestamped, and not labeled "verified".`}>
            <div className="grid-3">
              {textField('founding_year', 'Founding year', { inputMode: 'numeric', placeholder: 'e.g. 2024', hint: program.data ? `Rule: founded in ${program.data.policy.founded_year_min} or later.` : undefined })}
              {textField('headcount', 'Full-time headcount', { inputMode: 'numeric', placeholder: 'e.g. 12', hint: program.data ? `Rule: fewer than ${program.data.policy.headcount_max_exclusive}. Full-time employees, not contractors.` : 'Full-time employees, not contractors.' })}
              {textField('funding_usd', 'Total funding raised (USD)', { inputMode: 'decimal', placeholder: 'e.g. 2000000', hint: program.data ? `Rule: below $${program.data.policy.funding_max_usd_exclusive.toLocaleString('en-US')}. Whole US dollars, all rounds to date.` : 'Whole US dollars, all rounds to date.' })}
            </div>
          </Card>

          <Card title="Declarations">
            <div className={`checkbox-row ${fieldErrors.authority_declared ? 'field-error' : ''}`.trim()}>
              <input id={fid('authority_declared')} type="checkbox" checked={form.authority_declared} onChange={(e) => update('authority_declared', e.target.checked)} aria-invalid={!!fieldErrors.authority_declared} aria-describedby={fieldErrors.authority_declared ? `${fid('authority_declared')}-error` : undefined} />
              <label htmlFor={fid('authority_declared')}>
                <strong>Authority declaration.</strong> I am authorized to apply for this program on behalf of the company named above. This is recorded as a declaration; a professional profile corroborates but does not replace it.
              </label>
            </div>
            {fieldErrors.authority_declared && (
              <p className="field-message" id={`${fid('authority_declared')}-error`} role="alert">
                {fieldErrors.authority_declared}
              </p>
            )}
            <div className={`checkbox-row ${fieldErrors.attestation_accepted ? 'field-error' : ''}`.trim()}>
              <input id={fid('attestation_accepted')} type="checkbox" checked={form.attestation_accepted} onChange={(e) => update('attestation_accepted', e.target.checked)} aria-invalid={!!fieldErrors.attestation_accepted} aria-describedby={fieldErrors.attestation_accepted ? `${fid('attestation_accepted')}-error` : undefined} />
              <label htmlFor={fid('attestation_accepted')}>
                <strong>Eligibility attestation.</strong> The facts I declared are accurate to the best of my knowledge as of today. I understand the program accepts them under policy {policyVersion} as timestamped declarations, may ask for clarification if public records disagree, and issues promotional product credits only, which are not cash and not transferable.
              </label>
            </div>
            {fieldErrors.attestation_accepted && (
              <p className="field-message" id={`${fid('attestation_accepted')}-error`} role="alert">
                {fieldErrors.attestation_accepted}
              </p>
            )}
          </Card>

          {error && (
            <ErrorNotice error={error} onRetry={error.status === 0 || error.status === 429 || error.status >= 500 ? () => void performSubmit() : undefined} retryLabel="Retry with the same idempotency key">
              {error.status === 409 && (
                <p>
                  A 409 means the backend already holds an application for this submission. The access token for it was issued exactly once and is not re-shown, so
                  it cannot be recovered from here. If you keep the earlier tab open, use it; otherwise contact the program operator with your company domain rather than
                  submitting a duplicate.
                </p>
              )}
              {usedKey && (error.status === 0 || error.status === 429 || error.status >= 500) && (
                <p className="muted">
                  Retrying reuses idempotency key <span className="mono">{usedKey.slice(0, 8)}…</span>, so the backend will not create a second application for the same submission.
                </p>
              )}
            </ErrorNotice>
          )}

          <div className="row">
            <Button type="submit" variant="primary" loading={submitting}>
              Submit application
            </Button>
            <span className="muted">You will be taken to your status page to verify your mailbox.</span>
          </div>
        </form>

        <aside className="col-side stack">
          <ProgramPolicyCard program={program.data} error={program.error} loading={program.loading} onRetry={program.refresh} />
          <EvidencePolicyNotes policyVersion={policyVersion} />
        </aside>
      </div>
    </div>
  )
}
