# LaunchCloud: two-minute demo recording script

Use one complete applicant story, one short persistent-conflict branch, and a brief montage of safeguards.
The additional outcome catalogue below is a recording reference, not extra narration to squeeze into two minutes.

The 246-word voiceover and main branching examples were checked against the current implementation.
An offline rehearsal of the real backend with explicitly synthetic research verified correction -> enrollment,
persistent conflict -> exception, decline, budget hold, duplicate linking, and the $499 balance. See
[`DEMO_EXPECTED_OUTPUTS.json`](DEMO_EXPECTED_OUTPUTS.json). This rehearsal did not make new live provider calls.

## Recording setup

- Main video: the real backend, Crustdata and Groq at http://127.0.0.1:5173. The upgraded API is on port 8001.
- Use a new demo database for the recording so existing grants do not turn the intended enrollment into a duplicate.
  After stopping the current launcher, run from the repository root:

```powershell
$env:DATABASE_PATH = Join-Path (Get-Location) '.local/video-demo-01.sqlite3'
python run.py --api-port 8001
```

Use a new filename for another rehearsal; do not delete the working database. The configured keys load from
the ignored root `.env.local`. Do not film that file or terminals containing credentials.

- Pre-fill the form; film the submission rather than typing every field in real time.
- Record real research, then cut out waiting. Show a small “research wait shortened” caption if compressing it.
- Use separate browser tabs for the successful and persistent-conflict applications. Applicant tokens are tab-local;
  submitting another application in the same tab replaces the stored applicant session.
- Pre-stage the second case at its automatic clarification request before assembling the final cut.
- Keep an overlay visible: “Demo applicant declarations · simulated mailbox · promotional test credits.”
- Failure/budget clips may use explicit fixtures. Keep their fixture banner visible and label those clips “simulated scenario.”

## Main example: copy these inputs

This is a synthetic application using a real company domain. These declarations do not claim to represent
the company or establish its actual funding, authority, or eligibility. Our earlier live Crustdata test returned
Adside founding year 2026 and headcount 1. Rehearse the live lookup before recording; provider observations may change.

| Form field | Input |
|---|---|
| Company name | `[TEST] Adside — demo recording` |
| Company domain | `adside.ai` |
| Product description | `Synthetic demo application for an AI advertising software product. Applicant facts are test declarations only.` |
| Product kind | `Software product` |
| Applicant name | `LaunchCloud Demo Tester` |
| Applicant role | `Synthetic applicant — local demo only` |
| Work email | `launchcloud-demo-test@adside.ai` |
| LinkedIn profile | Leave blank |
| Founding year | `2025` — deliberate test mismatch |
| Full-time headcount | `1` |
| Total funding | Leave blank — deliberately unknown |
| Authority declaration | Checked for this synthetic demo |
| Eligibility attestation | Checked for this synthetic demo |

After research, paste this into the reply explanation:

```text
Synthetic demo declaration: We were founded in 2026. Our total funding is USD 250000.
```

Click **Suggest corrections from explanation**. Expected candidates are `founding_year: 2026` and
`funding_usd: 250000`, with exact supporting quotes. Model wording/quote spans may differ. Review the fields;
if a candidate is omitted, enter it manually. Re-check the attestation, then send the reply.

Expected path:

```text
AWAITING_EMAIL -> RESEARCH_QUEUED -> RESEARCHING
-> AWAITING_APPLICANT (automatic founding-year clarification + funding request)
-> ENROLLED -> $500.00 promotional balance -> sample job -> $499.00
```

This assumes the live research completes, the provider returns the rehearsed company identity/year, and no
prior grant exists in the selected database. Groq preview alone must leave case facts and balances unchanged.

## Two-minute shot list and exact voiceover

The voiceover is approximately 250 words. Read conversationally; leave the remaining time for clicks and transitions.

| Time | Screen / action | Say |
|---|---|---|
| 0:00–0:12 | Home page, then a pre-filled application. | “Startup programs spend time checking companies, chasing missing information, and managing benefits. LaunchCloud automates that workflow, with a clear evidence trail and human review for unresolved exceptions.” |
| 0:12–0:27 | Submit the main Adside test application. Briefly highlight 2025 and blank funding. | “Here’s a synthetic test application using a real company domain. I’ve deliberately entered a conflicting founding year and left funding unknown. The system records these as applicant declarations, rather than verified facts.” |
| 0:27–0:42 | Use the simulated mailbox code. Cut to completed research; open one provider evidence record. | “The mailbox challenge is simulated. After verification, the agent researches the company through Crustdata. Each observation keeps its source and date. Missing funding stays unknown; a search result doesn’t turn it into zero.” |
| 0:42–1:02 | Automatic clarification card. Paste the reply, request Groq suggestions, show quotes, confirm and send. | “The founding year disagrees, so LaunchCloud automatically asks the applicant to clarify. Groq suggests structured corrections with exact supporting quotes. These are only suggestions: the applicant reviews and confirms them before anything changes.” |
| 1:02–1:16 | Enrollment receipt, product account, click the $1 sample job once. | “The correction resolves the discrepancy. The deterministic policy engine re-evaluates the case and issues one five-hundred-dollar promotional grant. A sample API job consumes one dollar, and the server reports four hundred ninety-nine remaining.” |
| 1:16–1:38 | Separate pre-staged persistent-conflict case. Reassert 2025 and submit; switch to operator case. | “In this separate test, the applicant keeps the conflicting founding year after clarification. Only now does the case reach the operator. The operator sees the conflicting evidence, the investigation history, and the permitted actions. Every manual resolution needs a reason.” |
| 1:38–1:51 | Three pre-recorded cards: declined, duplicate linked, research hold. Label any fixture footage. | “Other outcomes are explicit: an ineligible application is declined, a duplicate links to its existing grant, and a research outage holds enrollment. The system preserves unknowns and failures instead of inventing success.” |
| 1:51–2:00 | Operator queue / evidence overview and final title. | “LaunchCloud investigates, asks, re-evaluates, and activates benefits. Routine work stays automatic; unresolved conflicts get human judgment.” |

Suggested title card: **“LaunchCloud — investigate, clarify, decide, activate.”**

## Second case: persistent conflict

Create this in a separate tab. It can use the same company domain because unresolved conflicts are evaluated
before any same-domain duplicate grant is linked.

- Company name: `[TEST] Adside — persistent conflict`.
- Use the same main inputs, but funding is `250000` from the start; founding year remains `2025`.
- Verify through its own simulated mailbox.
- Expected initial result: **Automatic clarification requested**, state `AWAITING_APPLICANT`; no operator resolution panel.
- In the reply, provide/confirm founding year `2025` and use:

```text
Synthetic demo declaration: We still declare founding year 2025 and request a review of this difference.
```

- Re-attest and send. Expected: `EXCEPTION` / **Operator review**; the unresolved discrepancy is preserved and no new grant is issued.
- Open this case in the operator desk. Show evidence and decision history; a waiver is unnecessary for the video.
- Do not try both “corrected” and “persistent” endings on one application: enrollment is terminal.

## Workflow outcome catalogue

For live rows below, start from the main example and apply the stated changes. For ordinary clean eligibility,
use founding year `2026`, headcount `1`, funding `250000`, software product, and checked declarations.
Provider success, identity match, available allocation and no pre-existing benefit are required for a fresh grant.

| Output / screen | Example input or trigger | Expected result |
|---|---|---|
| `AWAITING_EMAIL` / Awaiting mailbox verification | Submit a valid application; do not verify yet. | Simulated verification message and six-digit code. No research job runs and no grant is issued. |
| `RESEARCH_QUEUED` / Research queued | Enter the correct code from this application's inbox. | Worker job is queued. Mailbox is marked simulated-verified; no grant yet. This state may be very brief. |
| `RESEARCHING` / Researching | Worker claims the queued job. | Read-only investigation begins; activity/tool audit updates. Capture the real transition or pre-record it. |
| `AWAITING_APPLICANT` / Information requested | Founding year 2026, headcount 1, funding blank. | Funding remains unknown; a request asks for funding. Sending an attested structured funding value of 250000 allows re-evaluation. |
| `AWAITING_APPLICANT` / Automatic clarification requested | Founding year 2025 while provider reports 2026. | Conflict is explained and clarification is requested automatically. Operator resolution is not available yet. |
| Automatic resolution | Reply with founding year 2026 and funding 250000; re-attest. | `ENROLLED` and one $500 grant, provided all other checks pass. If this domain already has a grant, `DUPLICATE_RESOLVED` instead. |
| Still waiting after an unrelated reply | While founding-year clarification is pending, reply only with funding 250000 and explanation “Funding supplied.” | Founding-year question stays pending; no premature operator escalation. In the UI, set founding-year action to “Keep current value” so it is not inadvertently reasserted. |
| `EXCEPTION` / Operator review | After the automatic request, explicitly confirm founding year 2025 again while provider still reports 2026. | Persistent conflict reaches the operator. No new grant. A reason is required for any manual resolution. |
| `ENROLLED` / Enrolled | All clean eligibility inputs; matched company, complete research, available budget, fresh domain benefit. | One grant receipt for 50000 cents and $500.00 balance. |
| Product action success | On a newly enrolled account, click “Run sample API job ($1.00)” once. | One usage entry for 100 cents; balance $500.00 -> $499.00. A second deliberate click is a new job and produces $498.00. |
| `DECLINED` / Declined | Change just one clean input: headcount `50`, funding `10000000`, founding year `2020`, or product kind “Not a software product.” | That policy rule fails; no new grant. These thresholds are exact: fewer than 50, below $10M, founded 2021 or later. |
| `DUPLICATE_RESOLVED` / Linked to an existing grant | Submit and verify a second consistent application for an already enrolled domain. | Same existing account/grant is linked. No new $500 allocation. If its balance was $499, it remains $499. |
| `BUDGET_WAITING` / Waiting for program budget | Eligible application when remaining program allocation is below $500. For a predictable screenshot use fixture domain `video-budget.example`. | No grant yet. State is a budget hold, not a decline. The live app has no form field or admin endpoint to force the budget. |
| Identity clarification, then identity exception | Provider returns multiple candidates or a mismatched company/domain. Use fixture domain `video-multimatch.example`. | Automatic request asks about identity. A meaningful identity explanation/source that leaves the mismatch unresolved produces `EXCEPTION`; no grant. |
| Cross-domain identity collision | Two different domains resolve to an already-benefited provider identity. Fixture: `video-collision.example`. | Automatic clarification first; if overlap persists, operator review. Attempted identity-collision waiver is refused with 409; a second grant is not created. |
| Research not configured / research hold | Provider key is absent in the research process. Fixture domain `video-unconfigured.example`. | `AWAITING_APPLICANT` with research marked unconfigured; applicant cannot bypass it by supplying declarations. The UI says the program must restore research. |
| Transient failure and recovery | Provider connection error/429/5xx, then success. Fixture domain `video-fail.example`. | Bounded automatic retries; successful calls are cached. Once recovered, policy evaluation resumes. No invented evidence during the failure. |
| Persistent research failure / hold | Provider remains unavailable for the bounded attempts. Fixture domain `video-alwaysfail.example`. | Research remains partial/failed and enrollment is held. Operator can repair configuration/provider access and retry; the case is not declined merely for an outage. |
| Rejected source / no company match | Live enrichment cannot establish the submitted company identity. | Clarification, then unresolved identity exception after an answer; no automatic grant based solely on an unconfirmed company lookup. |

## Groq and validation outputs

| Output | Example input / precondition | Expected behavior |
|---|---|---|
| Quote-backed suggestion | Explanation: `We currently have 12 full-time employees.`; Groq configured; active verified case. | Preview candidate `headcount: 12` with exact supporting quote. Facts and balances remain unchanged until an attested structured reply is sent. |
| Ambiguous extraction | Explanation: `Around 15 employees including contractors.` | No accepted numeric correction. A model may return no candidates or the validator may reject them. Use the structured fields to clarify full-time employees. |
| Ungrounded/malformed model output | Fake model fixture returns a quote absent from the reply, invalid JSON, extra approval fields, or a boolean as a number. | Empty candidates/rejected output; no fact or balance change. This needs a controlled fixture, not a reliable natural-language “trigger.” |
| Groq unavailable/rate-limited | Missing Groq key or a controlled 401/403/429/5xx response. | Without a key, the UI requires structured corrections; failed extraction leaves them usable. 429/selected 5xx responses get at most one model retry. No automatic paid-model fallback. |
| Invalid application | Domain `adside.ai` but email `demo@example.com`; or a negative/non-numeric headcount. | Inline validation; direct invalid API requests receive 422. No successful application submission. |
| Unchecked declarations | Leave authority or eligibility attestation unchecked in the application form. | Submission is blocked with a field-level explanation. The UI does not treat unchecked declarations as a submitted eligible case. |
| Wrong verification code | Enter any six-digit code different from that application's current code. | 400 / incorrect code. After five wrong attempts, or expiry, verification locks/expires. This version requires a fresh application; it has no resend endpoint. |
| Corrections not re-attested | Attempt to send corrected structured facts without confirming the reply attestation. | UI blocks submission; direct API request returns 422. Corrections cannot silently clear a conflict. |
| Wrong operator token | Enter an incorrect token at the operator gate. | Operator access refused (401); no resolution takes place. |
| Missing/stale applicant session | Open a status/account page in a fresh tab with no session, or use an invalid applicant token. | No-application/recovery UI, or 403 for invalid credentials. No applicant token recovery from the application ID alone. |
| Backend disconnected | Stop the API while the frontend remains available, or point a separately recorded fixture at an unavailable backend. | Backend unreachable / retry UI; no false success toast. |
| Product usage before enrollment | Attempt usage for a case without an active credit account. | UI button disabled; direct API returns 409. |
| Insufficient product credits | On a $499 account, API requests a $500 debit (50000 cents). | 409, no debit. Use an API test/fixture; the UI sample button always costs only $1. |
| Same-key retry | Replay one identical usage API intent with the same idempotency key. | Same ledger result; no second debit. Two UI clicks intentionally generate different keys and are not an idempotency replay. |
| Operator requests more evidence | On an escalated case, choose Request information and provide a specific 15+ character reason. | `AWAITING_APPLICANT`, with the recorded request. A subsequent reply is evaluated again. |
| Operator resolves a permitted conflict | On an escalated case, choose Waive conflict and document the actual source/date/entity reconciliation with a 15+ character reason. | Policy evaluation runs again; a grant is issued only if all other rules, duplicates and budget checks allow it. A waiver is not a general approval button. |
| Operator declines | On an escalated case, choose Decline and enter a supported 15+ character reason. | `DECLINED`, with the operator reason in the audit trail. |
| Automatic clarification bound reached | A controlled fixture introduces new conflict topics after two automatic clarification rounds. | `EXCEPTION`; no endless requests and no new grant. An unresponsive applicant alone does not start a countdown to operator escalation. |

WITHDRAWN/EXPIRED application states, real email delivery, file-upload/OCR verification and real billing are not
implemented outcomes. Only the mailbox challenge itself can expire in the current product.

## Supplemental fixture clips

The live backend is not controlled by words such as “budget” or “fail” in a domain. Those switches work only
in the clearly labeled frontend mock client. For optional fixture footage, stop the live launcher and run:

```powershell
cd frontend
npm run dev:mock
```

Use this fixture-only baseline: company `[Fixture] Video Labs`, chosen scenario domain, email
`demo@<same-domain>`, software product, founding year 2026, headcount 14, funding 250000, checked declarations.
Choose `video-budget.example`, `video-fail.example`, `video-alwaysfail.example`, `video-unconfigured.example`,
`video-multimatch.example` or `video-collision.example` according to the table. Use a fresh tab/session to reset
the fixture dataset; its $2,000 budget is deliberately smaller than the live program's $50,000 budget.

The fixture client reports no extraction model, so record the Groq candidate preview with the actual backend.
Keep “fixture data” banners in the recording. Return to the repository root and restart the live launcher
after recording supplemental clips.

## Final edit checklist

1. The main cut is 2:00 or less. Extra outcomes are a short montage, not a tutorial for every branch.
2. No API keys, applicant access tokens or private terminals appear.
3. Mailbox and local promotional-credit simulation labels stay visible.
4. Real Crustdata observations and synthetic applicant declarations are clearly distinguished.
5. The operator appears after a substantive clarification leaves a conflict unresolved.
6. A grant receipt and actual server balance change are visible.
7. Research/model waits are edited for time, not presented as measured instant performance.
8. No claims of independently verified funding, real paid benefits, or verified Groq free-plan billing.

## What the company-research claim means

The live implementation calls Crustdata `/company/enrich` for company/domain identity and available founding,
headcount and funding fields. It uses `/web/search/live` for targeted leads when policy-relevant facts are
missing or conflict. Stored live results from our Adside test included company name Adside.ai, founding year
2026, and headcount 1 (headcount observation dated 14 September 2026). These are provider observations.

It does not query all Crustdata datasets, authenticate funding/payroll records, validate supporting documents,
or cross-check official registries. Web search snippets remain leads. Founding-year disagreements and
headcount/funding observations that cross policy caps prompt clarification; every small numeric difference
is not automatically a policy conflict. The video should say “researches and corroborates,” not “fully verifies.”
