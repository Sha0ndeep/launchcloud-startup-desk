# LaunchCloud Startup Desk — frontend

React + TypeScript + Vite interface for the ContextCon startup-program operations agent. It implements
[`../API_CONTRACT.md`](../API_CONTRACT.md) v1 against the Python/FastAPI backend in `backend/`. The backend owns
every decision, state transition, evidence item, message and balance; this interface only records what people
declare and shows what the backend returns.

Shared contract types are imported from [`../integration/api-types.ts`](../integration/api-types.ts) through the
`@contract` alias (see `vite.config.ts` and `tsconfig.app.json`). The `integration/` folder must sit beside
`frontend/`, exactly as in the handoff layout.

## Requirements

- Node.js 22.12+ or 24+ (tested with Node v24.19.0 and npm 11.16.0). Vite 8 does not run on older Node.
- The backend reachable at `VITE_API_BASE_URL` (default `http://127.0.0.1:8000`) for real data, or the
  labeled mock mode below for UI work without a backend.

## Run

```bash
npm install
```

```bash
npm run dev
```

The dev server is pinned to **port 5173 with `strictPort`** because the backend's default CORS allowlist is
`http://localhost:5173` and `http://127.0.0.1:5173` only. If 5173 is busy, free it rather than letting Vite pick
another port, or add the new origin to the backend's `CORS_ORIGINS`.

### Backend, on this machine (bash)

The backend is a Python package named `backend`; run it from the directory that contains `backend/` so the
package imports resolve. It needs Python 3.12+ with `fastapi`, `uvicorn`, `pydantic` and `httpx`
(`backend/requirements.txt`). The server does not load `.env` files; set variables in the shell.

```bash
DEMO_MODE=true OPERATOR_TOKEN=demo-operator DATABASE_PATH=/tmp/launchcloud.sqlite3 python -m uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

```bash
DEMO_MODE=true OPERATOR_TOKEN=demo-operator DATABASE_PATH=/tmp/launchcloud.sqlite3 python -m backend.worker
```

The worker is a separate process and is required: without it, verified cases stay in `RESEARCH_QUEUED`. Without
`CRUSTDATA_API_KEY` the backend reports `research_mode: "unconfigured"`, runs no external calls and holds every
otherwise-eligible case on its `research` check (state `AWAITING_APPLICANT`) until an operator restores research
and requeues the job. That is the backend's intended behaviour, not a frontend defect.

When the frontend runs on a different machine from the backend, set `VITE_API_BASE_URL` to the backend's real
reachable address and add the frontend's origin to the backend's `CORS_ORIGINS`. `localhost` on one device is
not the other device.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc -b` over the app and the Vite config (strict, no emit) |
| `npm run lint` | `oxlint` with the Vite template rules (React hooks, fast refresh) |
| `npm run build` | typecheck, then production build into `dist/` |
| `npm run preview` | serve `dist/` on port 5173 |
| `npm run dev:mock` | dev server in frontend-only fixture mode (below) |

## Environment variables (public, build-time)

Copy `.env.example` to `.env` and adjust. Only `VITE_`-prefixed variables reach the bundle; nothing secret
belongs in them. The Crustdata key, model keys and the operator token are never read by the frontend.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Backend origin. Every route is `<base>/api/...`. |
| `VITE_USE_MOCK_API` | `false` | `true` swaps the HTTP client for the in-browser fixture client. |

## Mock mode (frontend development fixtures)

`npm run dev:mock` loads `.env.mock`, which sets `VITE_USE_MOCK_API=true`. The whole app then runs against
`src/api/mock.ts`: an in-browser simulation that mirrors the backend's rule ids, hold states, status codes and
message kinds (as read in `backend/` on 6 November 2026), with seeded fixture cases, timers that move cases through
research, a fixture ledger and a fixture operator token (`demo-operator`). A persistent banner marks every screen as
fixture data. Nothing in mock mode is real research, real mail or real credit. Its budget is $2,000.00 (smaller than
the backend's $50,000.00) so budget exhaustion is reachable.

Fixture research outcomes are driven by the domain you apply with:

| Domain contains | Behaviour |
| --- | --- |
| anything else | research completes; provider observations of headcount 14 and funding 0 (labeled "not proof of no funding") |
| `conflict` | provider headcount 100 crosses the cap → `external_consistency` CONFLICT → `EXCEPTION` |
| `collision` | provider identity overlaps another domain → `EXCEPTION`; the backend refuses a waiver (409) |
| `multimatch` | several provider matches → `EXCEPTION` |
| `unconfigured` | no research provider → held on the `research` check in `AWAITING_APPLICANT` |
| `fail` | first attempt is a transient failure; the backend's bounded automatic retry runs after 5 s and succeeds |
| `alwaysfail` | three transient failures, then held on the `research` check; **Retry research** requeues it |
| `budget` | evaluation ends in `BUDGET_WAITING` |
| same domain as an enrolled case | `DUPLICATE_RESOLVED`, linked to the existing grant |

Seeded fixture cases: `[Fixture] Orbit Labs` (enrolled, one $1.00 usage), `[Fixture] Tidewater AI`
(`tidewater-conflict.fixture`, exception), `[Fixture] Granite Robotics` (funding unknown, information requested)
and `[Fixture] Nimbus Works` (`nimbus-fail.fixture`, held on research after three failed attempts; an operator
retry succeeds). Mock state persists in `sessionStorage` for the tab; close the tab to reset.

## Verification harness (real backend code, stub research)

`dev/stub_backend_harness.py` runs the **unmodified** backend application and worker with a stub researcher
injected through the same seam the backend's own tests use. It never contacts Crustdata or the web; it returns
fixture observations keyed by domain (`conflict`, `collision`, `fail`, otherwise headcount 14) so enrollment,
exception, duplicate and collision flows can be exercised on a machine without a Crustdata key. Every observation is
labeled as a stub. It is a frontend verification tool, not a backend change and not a demo of live research.

```bash
pip install -r backend/requirements.txt
```

```bash
PYTHONPATH=. DATABASE_PATH=/tmp/launchcloud-stub.sqlite3 python frontend/dev/stub_backend_harness.py
```

## Screens and routes

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | Entry, program policy as reported by `GET /api/program`, what is real in the demo |
| `/apply` | applicant | Application form with the evidence policy explained; `POST /api/applications` with an `Idempotency-Key` |
| `/status` | applicant | Mailbox verification (with the simulated mailbox while the backend reports demo mode), information request and structured reply, clarification while an exception is open, checks, facts, evidence drawer, activity timeline, final result, JSON export |
| `/account` | applicant | Server-reported promotional balance, grant receipt, usage, and **Run sample API job ($1.00)** |
| `/operator` | operator | Token gate (session-only field), queue with state filters and search, allocation, exception and budget counts |
| `/operator/cases/:id` | operator | Checks, facts, evidence, messages, tool-call summary, activity; exception resolution with a mandatory reason; research retry; read-only credits; export |

There is no routine "approve" button anywhere. Operators resolve genuine exceptions
(`request_information`, `waive_conflict`, `decline`) and requeue stalled, failed or unconfigured research.

## How the client behaves

- **One typed client** (`src/api/client.ts`) behind the `ApiClient` interface; `src/api/index.ts` picks the
  HTTP or mock implementation. Pages never call `fetch`.
- **Auth contexts are separate.** The applicant session (`application_id` + access token) and the operator
  token live in `sessionStorage` under different keys and are sent as `Authorization: Bearer` and
  `X-Operator-Token`. Neither ever appears in a URL. The operator case route carries only the opaque case id.
- **Idempotency.** Submitting the form mints a key per payload fingerprint and reuses it for retries of the
  same payload; a changed payload is a new intent and gets a new key. Each click of the sample job mints a new
  key; its "retry" reuses the same key. See `src/api/idempotency.ts`.
- **Polling.** A case is polled every 2 s while `RESEARCH_QUEUED`/`RESEARCHING`, every 5 s while waiting on a
  person or budget, never after `ENROLLED`, `DECLINED` or `DUPLICATE_RESOLVED`. Polling pauses in hidden tabs
  and backs off after transport errors. Nothing triggers research from the frontend.
- **After every mutation** the UI applies the case the backend returned and then refetches. Toasts only
  announce confirmed responses; 400, 401, 403, 409, 422, 429, 5xx and network failures render inline with the
  backend's `detail`, including per-field 422 messages (nested `facts.*` locations map to the reply fields).
- **Backend rules mirrored client-side** so most mistakes are caught before a request: the work email must be on
  the company domain or a subdomain; the optional profile URL must be a public `https://www.linkedin.com/in/…`
  link; supporting links must be public https URLs; a reply cannot reset a fact to unknown because the backend
  ignores null facts. The backend remains the authority and its refusals are shown verbatim.
- **Research hold.** When the backend holds a case on its `research` check (provider unconfigured, partial or
  failed), the applicant page says nothing more is needed from them and the operator page explains that research
  must be restored and offers **Retry research**.
- **Exceptions.** The backend accepts applicant replies while an exception is open; the status page offers a
  labeled "clarification" form whose result is recorded for the operator. Only an operator resolves a conflict.
- **Money.** `*_cents` fields are integer USD cents (`50000` renders as `$500.00`). `funding_usd` and the policy
  funding cap are whole US dollars (the backend returns them as floats). Crustdata costs are labeled research
  credits and shown only on the operator tool-call table.
- **Labels that matter.** Declarations render as "applicant declaration accepted under policy v1", never
  "verified". The simulated mailbox is labeled as a demo adapter and is only shown while `GET /api/health`
  reports `demo_mode: true`. Research failure is explained as never being an eligibility failure. Missing
  numbers are shown as unknown, never zero.

## Project layout

```
src/
  api/        contract types (re-exported from ../integration), errors, HTTP client, idempotency, mock client
  components/ domain components (checks, evidence drawer, timeline, mailbox, credits, policy) and ui/ primitives
  hooks/      usePolling, useCase, useProgram, health context
  lib/        router, session storage, money/date formatting, state metadata, facts, timeline, toasts
  pages/      Home, Apply, Status, Account, OperatorGate, OperatorQueue, OperatorCase, NotFound
  styles/     global.css (dark navy workspace, cyan/green highlights)
dev/          stub_backend_harness.py (verification harness, see above)
docs/screenshots/  walkthrough captured in mock mode
```

`node_modules/` and `dist/` are not part of the handback.
