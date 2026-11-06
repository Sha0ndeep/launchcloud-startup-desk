# Frontend handoff — paste the prompt below into the other device

You are implementing the FRONTEND ONLY for a ContextCon startup-program operations agent. Another developer is implementing the Python/FastAPI backend. Work in `frontend/`; do not create or edit backend files. Read `API_CONTRACT.md` first. Do not change that contract unilaterally. If it is not present on your device, ask the human to transfer it together with this prompt.

## Product context

Product name: LaunchCloud Startup Desk. The customer is a SaaS provider. Its agent receives startup applications, verifies mailbox control, researches the business using Crustdata/web sources, applies explicit rules, requests missing information, resumes on replies, and issues promotional product credits. Only genuine unresolved exceptions need operator judgment.

The demo policy accepts timestamped applicant declarations for selected eligibility facts. Display “Applicant declaration accepted under policy v1,” not “independently verified.” Missing funding is unknown, not zero. Crustdata is professional/company intelligence, not a payroll or funding auditor. Public-record conflicts trigger clarification; they do not establish fraud. Issued credits belong to the fictional SaaS provider, not Crustdata.

The backend owns every decision, state transition, evidence item, message and balance. Never invent a successful response, auto-approve on the frontend, calculate an alternative authoritative balance, or generate real company evidence. Fixtures are allowed only in a clearly labeled, separately enabled frontend development mode.

## Your assignment

Build a polished React + TypeScript + Vite interface with these flows:

1. Applicant application form: company name/domain, work email, applicant name/role, product description, optional professional profile URL, product_kind (`software`, `other`, `unknown`), founding_year/headcount/funding_usd (nullable), authority declaration and eligibility attestation. Explain the evidence policy.
2. Applicant status page: mailbox verification, outstanding information request, reply form with structured fact corrections plus a text explanation, evidence/source drawer, check outcomes, readable audit timeline, and final result.
3. Operator dashboard: application queue, status filters, program allocation remaining, credits issued and exceptions. No routine “approve application” button. Ask for an operator token in a session-only field; do not embed private credentials in the bundle.
4. Operator case page: checks/evidence/messages/events/tool-call summaries. Exception resolution UI requires an explicit reason; only backend-permitted actions should be offered.
5. Demo mailbox: show team-controlled inbox messages and single-use verification code only while the backend reports demo mode. This is explicitly a simulated mailbox, not proof that a real email was delivered. The backend returns message payloads.
6. Product account: display server-reported available promotional balance, original grant receipt, and a “Run sample API job ($1)” action that calls the usage endpoint with a fresh idempotency key and then refreshes server state.
7. JSON case export button. Loading, empty, missing evidence, API failure, disconnected backend, budget waiting and unresolved exception states must look intentional.

## Implementation instructions

- API base: `VITE_API_BASE_URL`, default `http://127.0.0.1:8000`. Use `/api` routes in API_CONTRACT.md.
- Make one typed API client; keep it replaceable. Poll case details about every 2 seconds while active; stop on terminal states. Never trigger `research` on every render.
- Store application ID and applicant access token in sessionStorage for the local demo, never in URLs. Applicant requests use `Authorization: Bearer <access_token>`. Operator requests use `X-Operator-Token` entered by the operator. Keep applicant and operator contexts separate.
- Generate and retain an `Idempotency-Key` for each submission or product-usage intent, reusing it for network retries of the same intent. A new user action gets a new key.
- After every mutation, use returned/refetched backend state. Handle 401, 403, 409, 422, 429 and network errors without showing a false success toast.
- Amounts are integer USD cents. Render `$500.00` from 50000. Crustdata API costs, if shown, are separately labeled research credits.
- Initial development does not require a Crustdata key. NEVER request or expose it in the frontend. No model API secrets belong here.
- No uploads in contract v1: use structured replies and supporting source URLs. The backend will later support attachments if time permits. Do not make the MVP depend on PDF upload/OCR.
- React Router is optional; use a small explicit routing structure. Avoid large design frameworks or heavyweight dependencies unless already installed.
- Use a clear dark/navy operator workspace with restrained cyan/green highlights, readable evidence cards and a compact activity stream. The product should feel like an operations desk, not a generic chatbot. Responsive laptop-first layout; accessible labels, keyboard navigation and visible errors.
- Real external outreach is prohibited during the event. Use the explicit demo mailbox. Do not connect to real recipients.

## Completion and handback

Verify the UI against the actual backend if reachable. Run TypeScript/build checks. Return your changed files or a frontend-only git commit, exact run commands, required public environment variables, and any contract mismatches. Do not include node_modules, secrets, build outputs or fictional claims about integration tests you did not run.

Start by creating the typed client and layouts using the supplied API contract; then implement application submission, verification, reply, queue and credit-consumption flows in that order.
