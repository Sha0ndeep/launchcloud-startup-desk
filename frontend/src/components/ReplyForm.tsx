import { useId, useState, type FormEvent } from 'react'
import { api, type ApplicantAuth } from '../api'
import { toApiError, validationFieldErrors, type ApiError } from '../api/errors'
import { LIMITS, PRODUCT_KINDS, type ApplicantResponse, type CaseResponse, type ProductKind } from '../api/types'
import { CORRECTABLE_FACTS, FACT_LABELS, PRODUCT_KIND_LABELS, formatFactValue, requestedFacts, type CorrectableFact } from '../lib/facts'
import { pushToast } from '../lib/toastStore'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { ErrorNotice } from './ui/ErrorNotice'
import { Field } from './ui/Field'
import { Notice } from './ui/Notice'
import { describedBy } from '../lib/a11y'

/** The backend ignores null facts in a reply (omitted or null both preserve the stored value), so a fact is either kept or set. */
type Mode = 'keep' | 'set'
interface FactEdit {
  mode: Mode
  value: string
}
type Edits = Record<CorrectableFact, FactEdit>

interface Props {
  kase: CaseResponse
  auth: ApplicantAuth
  modelConfigured: boolean | null
  onCase: (c: CaseResponse) => void
  /** 'request': answering an information request. 'clarification': adding context while an operator reviews an exception. */
  context?: 'request' | 'clarification'
}

const COPY = {
  request: { submit: 'Send reply', footnote: 'The case resumes automatically; no operator action is needed for an ordinary reply.' },
  clarification: { submit: 'Send clarification', footnote: 'Recorded for the operator and re-evaluated by the backend; only an operator can resolve a conflict with provider records.' },
} as const

function initialEdits(kase: CaseResponse): Edits {
  const requested = requestedFacts(kase.checks)
  const edits = {} as Edits
  for (const key of CORRECTABLE_FACTS) {
    const current = kase.facts[key]
    const asString = current === null || current === undefined ? '' : String(current)
    edits[key] = { mode: requested.has(key) ? 'set' : 'keep', value: key === 'product_kind' && !asString ? 'unknown' : asString }
  }
  return edits
}

function parseInteger(raw: string): number | 'invalid' {
  const t = raw.trim().replace(/,/g, '')
  if (!/^\d+$/.test(t)) return 'invalid'
  return Number(t)
}

function parseMoney(raw: string): number | 'invalid' {
  const t = raw.trim().replace(/[$,\s]/g, '')
  if (t === '') return 'invalid'
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : 'invalid'
}

/** Backend rule (models.py ResponseInput): public HTTPS URLs without credentials or ports, at most 2000 characters. */
function sourceUrlProblem(value: string): string | null {
  if (value.length > 2000) return 'At most 2000 characters.'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'Enter a full https:// URL.'
  }
  if (url.protocol !== 'https:') return 'Supporting links must use https://.'
  if (url.username || url.password || url.port) return 'Remove credentials and port numbers from the link.'
  if (!url.hostname.includes('.')) return 'Use a public web address.'
  return null
}

/** Maps FastAPI locations such as `facts.headcount` onto this form's field keys. */
function mapServerErrors(errors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, message] of Object.entries(errors)) out[key.replace(/^facts\./, '')] = message
  return out
}

/** Structured corrections plus a text explanation and supporting source URLs (contract v1: no uploads). */
export function ReplyForm({ kase, auth, modelConfigured, onCase, context = 'request' }: Props) {
  const idBase = useId()
  const [edits, setEdits] = useState<Edits>(() => initialEdits(kase))
  const [text, setText] = useState('')
  const [urls, setUrls] = useState<string[]>([''])
  const [attestation, setAttestation] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const requested = requestedFacts(kase.checks)
  const copy = COPY[context]

  const setEdit = (key: CorrectableFact, patch: Partial<FactEdit>) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }))

  const build = (): { body: ApplicantResponse; errors: Record<string, string> } => {
    const errors: Record<string, string> = {}
    const facts: NonNullable<ApplicantResponse['facts']> = {}
    let changes = 0
    for (const key of CORRECTABLE_FACTS) {
      const edit = edits[key]
      if (edit.mode === 'keep') continue
      changes += 1
      switch (key) {
        case 'founding_year': {
          const n = parseInteger(edit.value)
          if (n === 'invalid' || n < LIMITS.foundingYear.min || n > LIMITS.foundingYear.max) errors[key] = `Enter a four-digit year between ${LIMITS.foundingYear.min} and ${LIMITS.foundingYear.max}.`
          else facts.founding_year = n
          break
        }
        case 'headcount': {
          const n = parseInteger(edit.value)
          if (n === 'invalid' || n > LIMITS.headcount.max) errors[key] = 'Enter a whole number of full-time employees (0 or more).'
          else facts.headcount = n
          break
        }
        case 'funding_usd': {
          const n = parseMoney(edit.value)
          if (n === 'invalid') errors[key] = 'Enter total funding raised in USD (0 or more).'
          else facts.funding_usd = n
          break
        }
        case 'product_kind':
          facts.product_kind = (PRODUCT_KINDS as readonly string[]).includes(edit.value) ? (edit.value as ProductKind) : 'unknown'
          break
        case 'authority_declared':
          facts.authority_declared = edit.value === 'true'
          break
      }
    }
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean)
    cleanUrls.forEach((u, index) => {
      const problem = sourceUrlProblem(u)
      if (problem) errors[`source_urls.${index}`] = problem
    })
    if (cleanUrls.length > LIMITS.sourceUrls.max) errors.source_urls = `At most ${LIMITS.sourceUrls.max} links.`
    if (text.length > LIMITS.replyText.max) errors.text = `At most ${LIMITS.replyText.max.toLocaleString('en-US')} characters.`
    if (changes === 0 && cleanUrls.length === 0 && text.trim() === '') errors.form = 'Provide at least one correction, a supporting link, or an explanation.'
    if (!attestation) errors.attestation_accepted = 'Re-confirm the eligibility attestation for this reply.'
    const body: ApplicantResponse = { attestation_accepted: attestation }
    if (Object.keys(facts).length > 0) body.facts = facts
    if (cleanUrls.length > 0) body.source_urls = cleanUrls
    if (text.trim() !== '') body.text = text.trim()
    return { body, errors }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const { body, errors } = build()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api.respond(kase.id, body, auth)
      onCase(updated)
      pushToast({ tone: 'success', title: 'Reply recorded by the backend', message: `Backend state is now ${updated.state}.` })
      setEdits(initialEdits(updated))
      setText('')
      setUrls([''])
      setAttestation(false)
    } catch (err) {
      const apiErr = toApiError(err)
      setError(apiErr)
      const fe = mapServerErrors(validationFieldErrors(apiErr))
      if (Object.keys(fe).length > 0) setFieldErrors((prev) => ({ ...prev, ...fe }))
    } finally {
      setBusy(false)
    }
  }

  const factInput = (key: CorrectableFact) => {
    const edit = edits[key]
    const id = `${idBase}-${key}`
    const err = fieldErrors[key]
    if (edit.mode !== 'set') return null
    if (key === 'product_kind') {
      return (
        <select id={id} className="select" value={edit.value || 'unknown'} onChange={(e) => setEdit(key, { value: e.target.value })} aria-invalid={!!err} aria-describedby={describedBy(id, false, !!err)}>
          {PRODUCT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {PRODUCT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      )
    }
    if (key === 'authority_declared') {
      return (
        <select id={id} className="select" value={edit.value === 'true' ? 'true' : 'false'} onChange={(e) => setEdit(key, { value: e.target.value })} aria-invalid={!!err}>
          <option value="true">Yes — I am authorized to apply for this company</option>
          <option value="false">No</option>
        </select>
      )
    }
    const isMoney = key === 'funding_usd'
    return (
      <input
        id={id}
        className="input"
        inputMode={isMoney ? 'decimal' : 'numeric'}
        placeholder={key === 'founding_year' ? 'e.g. 2024' : key === 'headcount' ? 'e.g. 12' : 'e.g. 2000000'}
        value={edit.value}
        onChange={(e) => setEdit(key, { value: e.target.value })}
        aria-invalid={!!err}
        aria-describedby={describedBy(id, true, !!err)}
      />
    )
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label={context === 'clarification' ? 'Add a clarification' : 'Reply to information request'}>
      {modelConfigured === false && (
        <Notice tone="info" compact title="Structured corrections required">
          This backend has no extraction model configured, so free text alone is not interpreted. Use the structured fields below; the explanation is recorded alongside them.
        </Notice>
      )}
      <fieldset className="fieldset">
        <legend>Fact corrections</legend>
        <p className="muted">
          Facts you leave on "Keep current value" are not sent, so the backend keeps them; a reply cannot reset a fact to unknown. Each change is recorded as a timestamped
          applicant declaration under policy {kase.policy_version}.
        </p>
        <div className="fact-grid">
          {CORRECTABLE_FACTS.map((key) => {
            const edit = edits[key]
            const id = `${idBase}-${key}`
            return (
              <div key={key} className={`fact-row ${fieldErrors[key] ? 'field-error' : ''}`.trim()}>
                <div className="fact-row-head">
                  <span className="fact-row-label">{FACT_LABELS[key]}</span>
                  {requested.has(key) && <Badge tone="warning">Requested</Badge>}
                  <span className="muted fact-row-current">Current: {formatFactValue(key, kase.facts[key])}</span>
                </div>
                <div className="fact-row-controls">
                  <label className="visually-hidden" htmlFor={`${id}-mode`}>
                    {FACT_LABELS[key]} action
                  </label>
                  <select id={`${id}-mode`} className="select select-sm" value={edit.mode} onChange={(e) => setEdit(key, { mode: e.target.value as Mode })}>
                    <option value="keep">Keep current value</option>
                    <option value="set">Provide / correct</option>
                  </select>
                  {edit.mode === 'set' && (
                    <label className="visually-hidden" htmlFor={id}>
                      New {FACT_LABELS[key]}
                    </label>
                  )}
                  {factInput(key)}
                </div>
                {key === 'funding_usd' && edit.mode === 'set' && (
                  <p className="field-hint" id={`${id}-hint`}>
                    Total raised to date in USD (not cents). Unknown is not zero.
                  </p>
                )}
                {fieldErrors[key] && (
                  <p className="field-message" role="alert">
                    {fieldErrors[key]}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </fieldset>

      <Field id={`${idBase}-text`} label="Explanation" hint="Describe definitions, dates or entity details that explain the numbers (for example contractors vs. full-time, or a different legal entity). Recorded as your message." error={fieldErrors.text}>
        <textarea id={`${idBase}-text`} className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.replyText.max} aria-describedby={describedBy(`${idBase}-text`, true, !!fieldErrors.text)} />
      </Field>

      <fieldset className="fieldset">
        <legend>Supporting source links (optional, up to {LIMITS.sourceUrls.max})</legend>
        <p className="muted">
          Public https pages that support your corrections: a press release, registry entry or investor announcement. Recorded as applicant-supplied links; not
          automatically trusted. Uploads are not supported in this version.
        </p>
        <div className="stack-sm">
          {urls.map((value, index) => {
            const id = `${idBase}-url-${index}`
            const err = fieldErrors[`source_urls.${index}`]
            return (
              <div key={id} className={`row ${err ? 'field-error' : ''}`.trim()}>
                <label className="visually-hidden" htmlFor={id}>
                  Source link {index + 1}
                </label>
                <input id={id} className="input" type="url" placeholder="https://" value={value} onChange={(e) => setUrls((u) => u.map((v, i) => (i === index ? e.target.value : v)))} aria-invalid={!!err} />
                <Button size="sm" variant="ghost" onClick={() => setUrls((u) => (u.length === 1 ? [''] : u.filter((_, i) => i !== index)))} aria-label={`Remove link ${index + 1}`}>
                  Remove
                </Button>
                {err && (
                  <p className="field-message" role="alert">
                    {err}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        {urls.length < LIMITS.sourceUrls.max && (
          <Button size="sm" variant="ghost" onClick={() => setUrls((u) => [...u, ''])}>
            Add another link
          </Button>
        )}
        {fieldErrors.source_urls && (
          <p className="field-message" role="alert">
            {fieldErrors.source_urls}
          </p>
        )}
      </fieldset>

      <div className={`checkbox-row ${fieldErrors.attestation_accepted ? 'field-error' : ''}`.trim()}>
        <input id={`${idBase}-attest`} type="checkbox" checked={attestation} onChange={(e) => setAttestation(e.target.checked)} aria-invalid={!!fieldErrors.attestation_accepted} />
        <label htmlFor={`${idBase}-attest`}>
          I confirm the corrections above are accurate to the best of my knowledge and re-accept the program's eligibility attestation under policy {kase.policy_version}.
        </label>
      </div>
      {fieldErrors.attestation_accepted && (
        <p className="field-message" role="alert">
          {fieldErrors.attestation_accepted}
        </p>
      )}
      {fieldErrors.form && (
        <p className="field-message" role="alert">
          {fieldErrors.form}
        </p>
      )}
      {error && <ErrorNotice error={error} />}
      <div className="row">
        <Button type="submit" variant="primary" loading={busy}>
          {copy.submit}
        </Button>
        <span className="muted">{copy.footnote}</span>
      </div>
    </form>
  )
}
