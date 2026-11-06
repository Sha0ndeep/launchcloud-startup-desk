# LaunchCloud API contract v1

Backend owner: this device. Frontend owner: other device. Frontend lives in `frontend/`; backend in `backend/`. API base `http://127.0.0.1:8000`. All API routes below have `/api` prefix. JSON is snake_case; timestamps ISO 8601 UTC; identifiers opaque strings; amounts integer USD cents. Backend-generated OpenAPI is available at `/openapi.json` and interactive docs at `/docs`.

## Authorization

Applicant: `Authorization: Bearer <access_token>` returned ONCE at application creation. Operator: `X-Operator-Token`. Local demo default operator token is `demo-operator`; override through backend environment. Never put the Crustdata/model key in the frontend. Applicant tokens cannot read other applications. Operator token is not applicant identity.

## Public

- `GET /api/health` -> `{status:"ok",demo_mode:true,research_mode:"live"|"unconfigured",model_configured:boolean,worker_required:true}`.
- `GET /api/program` -> `{id,name,policy_version,benefit_cents,currency:"USD",budget_cents,allocated_cents,remaining_cents,policy:{founded_year_min,headcount_max_exclusive,funding_max_usd_exclusive,accept_attestations,description}}`.
- `POST /api/applications`, required `Idempotency-Key` header, body:

```json
{"company_name":"Example Labs","domain":"examplelabs.com","applicant_name":"Asha","work_email":"asha@examplelabs.com","applicant_role":"Founder","product_description":"We build an API monitoring product.","product_kind":"software","profile_url":null,"founding_year":2025,"headcount":null,"funding_usd":null,"authority_declared":true,"attestation_accepted":true}
```

Response 201: `{application_id,access_token,state:"AWAITING_EMAIL"}`. Retain token. If the first response is lost, an unauthenticated replay returns 409 rather than leaking a previously issued token; the UI should explain the recovery limitation instead of silently creating a duplicate. Authenticated identical replay can recover its own application.

## Applicant and operator case routes

- `GET /api/applications/{id}`: requires matching applicant token OR operator token. Response case object described below.
- `POST /api/applications/{id}/verify-email`: applicant only, `{code:"123456"}` -> case. Expiry/attempt checks enforced server-side. The backend schedules research.
- `POST /api/applications/{id}/responses`: applicant only, `{text:"We have 12 full-time employees and raised $2m.",facts:{headcount:12,funding_usd:2000000},source_urls:[],attestation_accepted:true}` -> case. Facts can contain `founding_year`, `headcount`, `funding_usd`, `product_kind`, `authority_declared`; omitted facts preserve existing values. Text without structured corrections may be extracted if a model is configured; otherwise the backend asks for structured corrections. Source links are supplied evidence, not automatically trusted content.
- `GET /api/applications/{id}/report`: same authorization -> JSON export of case.
- `GET /api/applications/{id}/credits`: same authorization -> `{account_id,currency:"USD",available_cents,grants:[{id,amount_cents,created_at}],usage:[{id,amount_cents,created_at}]}`. Can be zero before enrollment.
- `POST /api/applications/{id}/usage`: applicant only, required `Idempotency-Key`, `{amount_cents:100,description:"Sample API job"}` -> credit-account response. Only enrolled/duplicate-resolved authorized case may consume. Insufficient funds => 409. An idempotency key reused with a different intent => 409.
- `GET /api/applications/{id}/demo-inbox`: applicant only, demo mode only -> `{demo_mode:true,messages:[{id,kind,subject,body,created_at,payload:{code?:string}}]}`. Explicit test adapter; never call it real email delivery.

## Operator

- `GET /api/operator/applications` -> `{applications:[{id,company_name,domain,work_email,state,created_at,updated_at}],program:<program object>}`.
- `POST /api/operator/applications/{id}/resolve`: `{action:"request_information"|"waive_conflict"|"decline",reason:"Required specific operator explanation"}` -> case. Resolves actual exceptions; cannot waive mailbox verification, authorization declaration, duplicate constraints or budget. Reason recorded as operator evidence. Automatic rerun of evaluation follows.
- `POST /api/operator/applications/{id}/retry`: `{}` -> case. Requeues a stalled/failed research job; must not issue duplicate credits. No fake evidence or automatic approval.

## Case response

```json
{"id":"opaque","company_name":"Example Labs","domain":"examplelabs.com","work_email":"asha@examplelabs.com","state":"AWAITING_APPLICANT","policy_version":"v1","email_verified":true,"facts":{"founding_year":2025,"headcount":null,"funding_usd":null,"product_kind":"software","authority_declared":true,"attestation_accepted":true},"checks":[{"rule":"headcount","status":"NEEDS_INFORMATION","reason":"Provide current full-time headcount.","evidence_ids":[]}],"evidence":[{"id":"opaque","field":"headcount","value":14,"kind":"PROVIDER_OBSERVATION","source_url":"https://examplelabs.com","source_pointer":"headcount.total","observed_at":null,"retrieved_at":"2026-11-06T00:00:00+00:00","note":"Provider observation; not certified payroll."}],"messages":[{"id":"opaque","direction":"outbound","kind":"information_request","subject":"Information needed","body":"Please provide...","created_at":"..."}],"events":[{"id":"opaque","type":"information_requested","detail":"...","created_at":"..."}],"tool_calls":[{"endpoint":"/company/enrich","status":"success","credits_estimate":2.0,"detail":"Company profile retrieved","created_at":"..."}],"research":{"status":"complete","configured":true,"error":null},"grant":null,"account_id":null,"created_at":"...","updated_at":"..."}
```

Check statuses: PASS / FAIL / NEEDS_INFORMATION / CONFLICT.

States: AWAITING_EMAIL, RESEARCH_QUEUED, RESEARCHING, AWAITING_APPLICANT, EXCEPTION, DECLINED, BUDGET_WAITING, ENROLLED, DUPLICATE_RESOLVED. Research failure metadata can coexist with AWAITING_APPLICANT; failure is never eligibility failure. A state does not guarantee a real external email was sent.

`grant`, when present: `{id,amount_cents,created_at}`. Case includes `account_id` when provisioned or linked to an existing authorized company account.

Errors use FastAPI's `{detail: string|array}`. Display them; do not fabricate fallback verdicts. Optional new fields may be added; existing required fields/routes will remain stable unless both owners agree.


## Roadmap additions (backward-compatible v1 extensions)

`POST /api/applications/{id}/extract` takes `{ "text": "We have 12 full-time employees." }`,
with applicant bearer authorization. Only verified active cases may preview extraction. It returns
`{status, candidates: [{field, value, quote}], requires_confirmation: true}`. This endpoint does not
change facts, checks, decisions or balances. The applicant must review candidates and explicitly submit
confirmed structured facts through `/responses` with the eligibility attestation. Plain free text is
recorded unchanged but never automatically applied to numeric facts. At most ten model attempts per
case are permitted for extraction; provider retries consume that allowance. Model errors return an
empty candidate list with a status, so structured corrections remain usable.

`Research` adds `plan`, `rounds`, `planner_status`, `unresolved_facts`, `conflicting_facts`, `limits`
and `stop_reason`. Research may complete with unresolved declaration requirements or an operator
conflict; completion means bounded research finished, not that eligibility passed. Search snippets
are leads and cannot fill funding/headcount declarations. Missing or mismatched company identity
requires operator resolution. Tool calls add purpose, arguments, round and latency. Evidence adds
source type, match status, tool-call reference, support label and nullable source publication date.

Case responses add immutable `decisions` (policy/fact/check/evidence snapshots) and `model_runs`(model/outcome/latency/token-count telemetry without raw prompts). Program adds `ledger_reconciled`.
Health adds `model_provider` and `model`; `model_configured` reports configuration, not live validation.
Historical records without the added provenance metadata remain readable.

### Automatic conflict clarification

An initial policy-evidence conflict uses `AWAITING_APPLICANT`, with an automatically generated bundled
request, before any operator exception. Case `clarification` contains `id`, `status` (`pending`, `answered`,
`resolved`), `fields`, `answered_fields`, `round`, `max_rounds`, `created_at` and nullable `answered_at`.
Confirmed fact corrections require `attestation_accepted: true` (422 otherwise). The backend re-evaluates
every reply. Corrected consistent facts proceed automatically; a conflict that persists after its requested
topic is addressed becomes `EXCEPTION`. Unrelated or partial replies do not prematurely escalate unanswered
topics. Research retries preserve pending requests. At most two rounds can introduce new conflict topics;
exhausting this bound requires operator review. There are no real outbound emails in demo mode.
