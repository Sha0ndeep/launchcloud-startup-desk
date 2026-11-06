# LaunchCloud Startup Desk

A startup-program operations agent built at ContextCon (IIT Kanpur, 6 November 2026). A fictional SaaS
provider, LaunchCloud, offers **$500 of promotional product credit** to eligible startups. Applications go in;
mailbox verification, company research, deterministic policy checks, applicant information requests, operator
exception handling and a working product-credit ledger come out. The backend owns every decision and balance;
the frontend records what people declare and shows what the backend returns.

Everything here runs on one laptop. The mailbox is a labeled simulation, declarations are labeled as
declarations, and nothing claims to be independently verified payroll or funding.

## Repository layout

| Path | What it is |
| --- | --- |
| `backend/` | Python 3.12+ FastAPI API, SQLite persistence, durable job worker, Crustdata research adapter, policy engine, credit ledger. See [backend/README.md](backend/README.md). |
| `frontend/` | React + TypeScript + Vite interface for applicants and operators. See [frontend/README.md](frontend/README.md) and [frontend/HANDBACK.md](frontend/HANDBACK.md). |
| `integration/api-types.ts` | Shared TypeScript types for the HTTP contract, imported by the frontend. |
| `API_CONTRACT.md` | The HTTP contract (v1) the two sides were built against. |
| `FRONTEND_HANDOFF.md` | The brief the frontend was built from. |
| `STARTUP_PROGRAM_IMPLEMENTATION_PLAN.md` | The overall product and engineering plan. |

## Run it locally

The roadmap implementation is described in [IMPROVEMENTS.md](IMPROVEMENTS.md): Groq candidate extraction,
bounded adaptive investigation, evidence provenance, immutable decision snapshots and ledger reconciliation.

### Windows quick start

With Python 3.12+ and Node.js 22.12+ installed, double-click `start.cmd`, or run from PowerShell:

```powershell
python run.py
```

The launcher creates an isolated `.venv`, installs missing dependencies, and starts the real API, durable
worker and frontend together. It opens http://127.0.0.1:5173 after both HTTP servers are ready. Keep the
terminal open; Ctrl+C stops all three processes. Logs are in `.local/logs/`. If either port 8000 or 5173 is
occupied, the launcher reports it without stopping another application's process. Existing dependencies can
be refreshed with `python run.py --install`; use `--no-browser` to skip opening a browser. The launcher also
works on macOS/Linux.

If a LaunchCloud API **and its worker** are already running on this machine, connect the frontend to them
with `python run.py --reuse-api`. This checks API health and starts only the frontend; stopping the launcher
preserves the existing backend processes. For a separate backend, use `python run.py --api-port 8001`
and set `DATABASE_PATH` to a different SQLite file in the launching shell.

The operator token is `demo-operator` unless you set `OPERATOR_TOKEN` in the launching shell. The API and
worker inherit the same shell configuration and database path. To enable live research, set
`CRUSTDATA_API_KEY` privately in that shell before launching. No key is needed to explore the interface,
submit applications, use the simulated mailbox, or inspect research holds. Eligible cases remain held until
live research is configured; this launcher does not enable frontend fixtures or stub research.

Verified on Windows with Python 3.13.7 and Node.js 22.20.0: all 20 backend tests, frontend typecheck,
production build and lint pass. The separate commands below remain available for development.

### Manual setup

Prerequisites: Python 3.12 or newer (tested with 3.14.8) and Node.js 22.12 or newer (tested with 24.19).
All commands run from the repository root. The backend reads configuration from the shell and the git-ignored root `.env.local`; `backend/.env.example` lists the variables.

Install the backend dependencies once:

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r backend/requirements.txt
```

Terminal 1, the API (port 8000):

```bash
DEMO_MODE=true OPERATOR_TOKEN=demo-operator python -m uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

Terminal 2, the worker. It is a separate process and is required; without it verified cases stay queued:

```bash
DEMO_MODE=true OPERATOR_TOKEN=demo-operator python -m backend.worker
```

Terminal 3, the frontend (port 5173, which is the backend's default CORS allowlist):

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. The operator pages ask for the operator token in a session-only field; the demo
default is `demo-operator`. Change it with `OPERATOR_TOKEN` and never publish it on a public server.

Optional environment variables:

| Variable | Effect |
| --- | --- |
| `CRUSTDATA_API_KEY` | Enables live company research. Without it the backend reports `research_mode: unconfigured` and holds every otherwise-eligible case on its `research` check until an operator restores research and requeues it. No synthetic provider data is ever inserted. |
| `GROQ_API_KEY` and `GROQ_MODEL` | Optional Groq planning and quote-backed extraction previews. Model defaults to `openai/gpt-oss-120b`. Applicants review and confirm structured candidates before any facts change. |
| `DATABASE_PATH` | SQLite file, default `backend/data/launchcloud.sqlite3` (created on first run). |
| `CORS_ORIGINS` | Comma-separated frontend origins, default `http://localhost:5173,http://127.0.0.1:5173`. |

Secrets stay in the shell or git-ignored root `.env.local`. The frontend never reads the Crustdata key, model keys or the operator token from
its build; only `VITE_`-prefixed public variables reach the bundle (`frontend/.env.example`).

## Demo walkthrough

1. **Apply** at `/apply`. Use a work email on the company domain you enter.
2. **Verify the mailbox** at `/status`. In demo mode the six-digit code appears in the labeled simulated
   mailbox on the same page. It proves mailbox control, not legal authority.
3. **Research and evaluation** run in the worker. The status page polls and shows per-rule outcomes, evidence
   with provenance dates, and the activity timeline.
4. **Information request and reply.** Missing or conflicting facts produce one bundled request; the structured
   reply form resumes the case without an operator. Missing funding stays unknown, never zero.
5. **Enrollment and credits.** An eligible case gets one grant receipt. `/account` shows the server-reported
   balance and **Run sample API job ($1.00)**, which consumes credit and proves issuance had an effect.
6. **Operator desk** at `/operator`: queue by state, allocation remaining, exceptions. A case page shows checks,
   facts, evidence, messages, research tool calls with estimated cost, and exception resolution with a
   mandatory reason. There is no routine approve button; ordinary cases need no operator.

Same-domain duplicates link to the existing grant. A provider identity collision across domains cannot be
waived and must be reconciled or declined.

## Frontend-only fixture mode and verification harness

- `cd frontend && npm run dev:mock` runs the interface against an in-browser fixture client with a permanent
  "fixture data" banner. Research outcomes are chosen by the domain you apply with (see `frontend/README.md`).
- `PYTHONPATH=. DATABASE_PATH=/tmp/launchcloud-stub.sqlite3 python frontend/dev/stub_backend_harness.py`
  runs the unmodified backend and worker with a stub researcher injected through the seam the backend's own
  tests use, so enrollment, conflict, duplicate and collision flows can be exercised without a Crustdata key.
  Every stub observation is labeled as such.

## Tests and checks

| Check | Command | Result on 6 November 2026 |
| --- | --- | --- |
| Backend unit tests | `python -m unittest discover -s backend/tests -v` | 43 passed (Python 3.13.7, roadmap implementation) |
| Frontend typecheck | `cd frontend && npm run typecheck` | pass |
| Frontend lint | `cd frontend && npm run lint` | pass |
| Frontend build | `cd frontend && npm run build` | pass |

The backend tests cover issuance, duplicate prevention, budget enforcement, job leases and restart recovery.
[frontend/HANDBACK.md](frontend/HANDBACK.md) records the browser verification of each screen against the real
backend and against the stub harness, with screenshots in `frontend/docs/screenshots/`, plus the list of
contract-versus-backend differences.

The original build did not test live providers. The roadmap implementation has now passed an opt-in live
Crustdata and Groq check: a clean enrollment, a founding-year conflict held for operator review, quote-backed
candidate extraction, and an idempotent debit to $499. These used synthetic applicant declarations and a
temporary database. Groq account billing/free-plan status has not been verified. See [IMPROVEMENTS.md](IMPROVEMENTS.md).

## Supported scope and honest limits

- One provider, one program, one policy version (v1), one shared operator token, applicant sessions.
- Policy v1 explicitly accepts named applicant declarations for founding year, headcount, funding and product
  classification. Decisions read "accepted under policy v1", never "independently verified".
- Research is read-only Crustdata company enrichment and targeted web search with a 24-hour cache, a bounded
  per-application estimated spend, and at most three durable attempts for transient errors. Costs shown are
  estimates, not billing receipts.
- The mailbox is simulated and labeled. Non-demo mode deliberately fails until a real sender exists; no real
  recipients are contacted.
- Not implemented: file uploads or OCR, reissuing expired verification codes, fault-injection endpoints, the
  plan's WITHDRAWN and EXPIRED states, multi-tenant operation, production email, remote billing reconciliation,
  operator login and roles.
- This is a local demonstration, not a production fraud-verification service, and it makes no claim about
  startup coverage or operator-involvement rates without measurement.

## Approaches considered

The plan weighed and chose: an attestation-accepting promotional policy over a strict verified program for the
demo (same engine, one mode implemented fully); a SQLite jobs table with leases over Redis or Celery; a direct
Crustdata HTTP adapter with narrow fields over reparsing MCP output; a database-backed demo inbox over a real
email provider during the event; simple polling over websockets; and one orchestrating workflow with typed
tools over multiple named model agents. The reasoning is in
[STARTUP_PROGRAM_IMPLEMENTATION_PLAN.md](STARTUP_PROGRAM_IMPLEMENTATION_PLAN.md).

## Future work

Measure where automation fails on real anonymized applications before extending features. Then: document
uploads with issuer verification, official registry and partner-roster lookups where permitted, real billing
grants with idempotency and reconciliation, production email with an enforced allowlist, verification-code
reissue, multi-program policy administration, operator accounts, and a frontend summary of research spend on
the queue once the backend exposes it.
