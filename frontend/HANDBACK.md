# Frontend handback — LaunchCloud Startup Desk

Date: 6 November 2026, updated after the backend source (`backend/`) became available on this machine.
Scope: `frontend/` only. No backend files were created or edited. The shared contract files
(`API_CONTRACT.md`, `integration/api-types.ts`) were not changed. Every backend run used a scratch
`DATABASE_PATH`; the backend owner's `backend/data/launchcloud.sqlite3` was read once (read-only, it held only
the program row) and never written.

## What is delivered

`frontend/` is a complete React 19 + TypeScript 7 + Vite 8 app (no runtime dependencies beyond React):

1. Applicant application form with the evidence policy explained, client-side validation mirroring the backend's
   models (`models.py`) and create rule (work email on the company domain), idempotent submission and explicit
   409 recovery guidance.
2. Applicant status page: mailbox verification with the simulated mailbox (demo mode only), research progress,
   information request with structured fact corrections + explanation + https source links, the research hold
   explained when the backend holds a case on its `research` check, a clarification form while an exception is
   open, policy checks with the backend's rule ids labeled, facts on file, evidence/source drawer, activity
   timeline, final result, JSON export, session panel.
3. Product account: server-reported balance, grant receipt, usage, and the $1.00 sample job with a fresh
   `Idempotency-Key` per click and same-key retry.
4. Operator desk: session-only token field, queue with state filters/search, program allocation, exception and
   budget counts; case page with checks, facts, evidence, messages, tool calls, activity, exception resolution
   (reason required; waive offered only on a CONFLICT and flagged as refused for entity collisions), research
   retry whenever research is incomplete or stalled, read-only credits, export. No routine approve button.
5. Intentional loading, empty, missing-evidence, API-failure, disconnected-backend, budget-waiting, research-hold
   and unresolved-exception states.
6. Separately enabled, clearly labeled mock mode (`npm run dev:mock`) that mirrors the backend's rule ids, hold
   states, status codes and message kinds.
7. `dev/stub_backend_harness.py`: runs the unmodified backend with a stub researcher (the seam the backend's own
   tests use) so enrollment flows can be exercised without a Crustdata key. Labeled; not a backend change.

Run instructions, environment variables and the mock scenarios are in `README.md`. Screenshots are in
`docs/screenshots/` (01–10 mock mode; 11–14 real backend; 15–21 real backend code with the stub researcher).

## Build-check results

Run on Node v24.19.0 / npm 11.16.0, Ubuntu 26.10, after the final change.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm install` | 28 packages, no vulnerabilities reported |
| Typecheck | `npm run typecheck` (`tsc -b`, TypeScript 7.0.2, strict) | pass, 0 errors |
| Lint | `npm run lint` (oxlint 1.x, template rules) | pass, 0 warnings, 0 errors |
| Build | `npm run build` (Vite 8.3.6) | pass: `index.html` 0.62 kB, CSS 20.28 kB, JS 358.87 kB (107.66 kB gzip) |
| Secrets | grep for key-like values in `src/` and env files | none |
| Backend tests | `python -m unittest discover -s backend/tests -v` | 20/20 pass (Python 3.14.8, fastapi 0.128.0, pydantic 2.12.5, uvicorn 0.40.0, httpx 0.28.1, isolated venv) |

## Verified against the real backend (unmodified, no Crustdata key)

Backend started from the directory containing `backend/` with `DEMO_MODE=true OPERATOR_TOKEN=demo-operator`
and a scratch `DATABASE_PATH`, server (`uvicorn backend.main:create_app --factory`) plus the worker
(`python -m backend.worker`). Frontend with `npm run dev` on port 5173. Browser: Chromium in the Claude desktop
pane. No application console errors at any step (only the browser's resource log lines for the deliberate
401/403/409/connection-refused responses).

- `GET /api/health` → status chip shows "Backend online · Demo mode · Research: unconfigured · Extraction model: none".
- Apply (company `www.smoke-ui.example` normalized to `smoke-ui.example`, LinkedIn profile, funding left blank)
  → 201 → status page `AWAITING_EMAIL`; the simulated mailbox shows the backend's `verification` message and code.
- "Use this code" → verify → `RESEARCH_QUEUED` → worker → `AWAITING_APPLICANT` with `funding_usd`
  NEEDS_INFORMATION and `research` NEEDS_INFORMATION (status `unconfigured`). Page shows the request message, the
  funding field pre-selected as requested, and the research-hold notice.
- Structured reply (funding 1,500,000; re-attested) → 200 → funding recorded ($1,500,000); only the `research`
  check remains open → page switches to "Waiting for program research: nothing is needed from you".
- Operator queue with `demo-operator`: counts and $50,000.00 budget from `/api/operator/applications`. Case page
  shows "Held on external research", the full conversation (verification, information requests, applicant reply)
  and offers **Retry research** → 200 `RESEARCH_QUEUED` → worker → `AWAITING_APPLICANT` again (still unconfigured).
- Wrong operator token → 401 "Operator credentials required." rendered with "Change token"; correct token restores
  the queue.
- Product account before enrollment: $0.00, "Not provisioned", sample job disabled with the state explained.
- Export → `/report` JSON downloaded (wrapper `{report_version, evidence_policy, case, limitations}`), success toast.
- Stale applicant session (created against another database) → 403 "Invalid applicant credentials." rendered
  with the recovery explanation and the session panel.
- Scripted checks (`urllib`, same backend): unauthenticated create replay → 409 with the recovery text; wrong code
  → 400; `facts: {headcount: null}` in a reply → 200 and the value unchanged; `http://` source link → 422 on
  `source_urls`; non-LinkedIn `profile_url` → 422 on `profile_url`; email off the company domain → 422 string
  detail; usage before enrollment → 409; resolve with a 1-character reason → 422 on `reason`.

## Verified with the stub-researcher harness (real backend code, fixture observations)

`dev/stub_backend_harness.py` on port 8000 with its own scratch database; the harness injects a labeled stub
researcher and runs the real worker loop. States, checks, grants and balances below were produced by the
unmodified backend code.

- Full-facts case → `ENROLLED`; status page shows the grant receipt ($500.00, grant id, account id).
- Account: two sample jobs → server-reported balance $500.00 → $499.00 → $498.00 with two usage rows.
- Conflict case (declared 40, stub provider 100) → `EXCEPTION` on `external_consistency`. Applicant page shows
  "Clarification needed", the headcount field pre-selected from the reason text, and the clarification form.
  Clarification with explanation + https link → 200, case re-evaluated and still `EXCEPTION` (as designed), the
  reply and link visible on the operator page.
- Operator waive with a reason → confirm dialog → 200 → `ENROLLED`; the `external_consistency` reason now reads
  "Operator resolved external observation conflict: …".
- Same-domain second application → `DUPLICATE_RESOLVED`, linked to the first grant; receipt shown.
- Entity collision (two domains sharing a provider id) → `EXCEPTION`; panel flags that a waiver will be refused;
  waive attempt → backend 409 "Entity collision requires explicit account reconciliation…" rendered inline;
  decline with a reason → `DECLINED`.
- Research run that raises → research status `failed`, case held in `AWAITING_APPLICANT` on the `research` check;
  applicant page shows the hold, operator page shows "Held on external research" and offers **Retry research**.

Not verified: live Crustdata research (no key on this machine, and the frontend must never hold one), the optional
Anthropic extraction path (no model configured), `BUDGET_WAITING` against the backend (would need 100 enrollments
at the $50,000 budget; verified in mock mode only), and the automatic bounded retry timing of transient provider
errors (unit-tested by the backend; verified in mock mode only). No integration tests were written.

## Contract vs backend: mismatches, gaps and questions

Each is handled in the frontend; listed so both owners can decide what to write down. "Backend" below means the
source read on 6 November 2026 (`service.py`, `main.py`, `models.py`).

1. **Research hold state.** The contract does not name it. Backend: research `unconfigured`, `partial` or
   `failed` makes the `research` check NEEDS_INFORMATION and puts the case in `AWAITING_APPLICANT`, sending the
   applicant an information request they cannot satisfy ("Operator must restore research"). The UI detects the
   open `research` check and tells the applicant nothing is needed from them, and tells the operator to restore
   research and requeue. A dedicated state or a `held_on` field would make this explicit.
2. **Rule ids.** Not in the contract. Backend emits `mailbox, authority, attestation, founding_year, headcount,
   funding_usd, product, external_consistency, research`; conflicts appear only on `external_consistency`, whose
   reason text names the fact. The UI labels these ids and parses the reason for the fact to pre-select. Please
   keep the ids stable, or add a `fact` field to checks.
3. **Null facts in replies are ignored** (`exclude_none`), so a fact can never be reset to unknown. The contract
   says omitted facts are preserved but is silent on null. The UI no longer offers "mark unknown".
4. **Replies are accepted in `EXCEPTION` and `BUDGET_WAITING`** (any verified, non-terminal, non-research state);
   the contract implies replies answer information requests. In `EXCEPTION` the backend also sends a
   "Clarification needed" message. The UI offers a labeled clarification form there; a reply clears any operator
   waiver and re-evaluates, so a provider conflict persists until an operator waives it.
5. **`profile_url` is LinkedIn-only** (`https://(www.)linkedin.com/in/…`, no query/fragment) while the contract
   says "optional professional profile URL". Mirrored client-side with a hint.
6. **Work email must be on the company domain or a subdomain** (422 with a string `detail`); not in the contract.
   Mirrored client-side.
7. **Source links must be public https URLs** without credentials or ports, ≤ 2000 chars; the whole list is
   rejected at `body.source_urls`. Mirrored client-side.
8. **Status codes.** Applicant authorization failures and unknown application ids are 403 "Invalid applicant
   credentials." (never 401/404); operator failures are 401; an operator with a wrong token on a case route gets
   the 403 applicant wording. Wrong verification code and expiry/lockout are 400. The UI explains the operator
   case; an operator-specific message from the backend would be clearer.
9. **`/report` is a wrapper** `{report_version, evidence_policy, case, limitations}`, not the bare case. The UI
   downloads whatever is returned; worth stating in the contract.
10. **`funding_usd` is a float** (`1500000.0`) in facts and check reasons; the UI renders dollars. Consider an
    integer in the API or state the type.
11. **Retry is broader than "stalled/failed".** `/retry` accepts any verified non-terminal case without an active
    lease (including `unconfigured` research), and attempts are not reset. The UI offers it when research is
    incomplete, retryable or stalled.
12. **Entity collisions** are refused with 409 and detected by the reason text "confirm legal entity". The UI
    mirrors that string to warn before the attempt; a structured `waivable: false` would be more robust.
13. **Operator resolutions are not `Evidence` items.** The reason is stored as an `operator_resolution` event and
    in the `external_consistency` reason; the contract says "recorded as operator evidence".
14. **No `permitted_actions` on the case.** The UI derives them (resolution only in `EXCEPTION`, waive only with
    a CONFLICT, retry as above) and shows backend refusals verbatim.
15. **Worker is a separate process** (`worker_required: true`); without it verified cases stay `RESEARCH_QUEUED`.
    The operator's stalled notice says so.
16. **`Idempotency-Key` must be 8–200 characters** (422 string detail otherwise); UUIDs comply.
17. **Demo inbox returns every outbound message** (verification, information requests, decisions, activations)
    with `payload`; the contract example shows only the code message. The UI lists them all.
18. **OpenAPI has no response schemas**, and `VerificationInput`, `UsageInput`, `ResolutionInput` are missing from
    `integration/api-types.ts` (defined locally in `src/api/types.ts`).
19. **CORS is fixed to port 5173**; Vite is pinned to it. Another origin needs `CORS_ORIGINS` on the backend.
20. **Verification reissue** does not exist; expired or locked codes require a fresh application (stated under the
    code field).

## Decisions worth knowing

- Routing is a ~60-line pushState router (`src/lib/router.ts`); no React Router, no CSS framework.
- The operator case URL carries the opaque case id (needed for navigation); applicant pages carry nothing.
- Mock mode is an `ApiClient` implementation selected only by `VITE_USE_MOCK_API=true`; production builds with
  the variable unset contain the mock module but never instantiate it. Strip `src/api/mock.ts` and the
  `index.ts` branch if that is undesirable. The mock's sessionStorage key moved to `launchcloud.mock.state.v2`.
- `dev/stub_backend_harness.py` is a Python file inside the frontend folder on purpose: it belongs to frontend
  verification, imports the backend package unchanged, and must never be mistaken for a backend component or a
  demo of live research.
- `.env.mock` ships so `npm run dev:mock` works out of the box; `.env` (real settings) is ignored by git.
