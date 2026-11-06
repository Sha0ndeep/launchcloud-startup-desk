# Roadmap implementation

Implemented on `codex/adaptive-investigation`, based on GitHub commit `1123f48`.

## Local configuration and startup

Set `CRUSTDATA_API_KEY`, `GROQ_API_KEY`, and optionally `GROQ_MODEL` in the root `.env.local`, which Git ignores.
The default model is `openai/gpt-oss-120b`. Shell variables take precedence. The file is loaded by the launcher,
API and worker; nothing secret goes into frontend variables or the bundle. No automatic provider/model fallback
is enabled. The Groq API cannot establish whether this account is on the Free plan; check the console before
calling the project zero-cost.

```powershell
python run.py
```

If the previous checkout still owns port 8000, run `python run.py --api-port 8001` instead. It runs this checkout's
API and worker with the local keys and connects the frontend to that API. `--reuse-api` connects to an existing
backend without upgrading it; use it only when that backend already runs the new code. SQLite additions are
additive and preserve existing applications, grants and usage. Make a SQLite backup before switching datasets.

## Implemented P0 and supporting P1 work

- Groq replaces the active Anthropic extraction path, using its OpenAI-compatible HTTP API without extra SDKs.
  Numeric candidates pass strict Pydantic validation, exact quote and unit checks, and ambiguity rejection.
  `POST /api/applications/{id}/extract` only previews candidates. Applicants review the populated fields and
  attest again before sending a structured reply. Free text alone never mutates numeric facts.
- Groq can order a narrow list of unresolved fact identifiers. The backend validates the plan and constructs
  all queries itself. Missing/invalid model output uses an explicitly reported deterministic fallback.
  No model has eligibility, balance, SQL, policy, email, or arbitrary URL-fetch tools.
- Investigation first resolves the submitted domain, then searches specifically for unresolved founding-year,
  headcount, funding or identity questions. Complete consistent cases skip follow-up searches. Search leads
  never become financial facts or automatically fill declarations. Company mismatches and ambiguous matches
  become identity exceptions. Conflicts stop for operator resolution.
- Bounds: at most 3 rounds (currently up to 2 are used), 5 calls per round, 10 recorded calls across durable
  attempts, 25 estimated Crustdata credits, a 100-second start deadline plus at most one 35-second in-flight
  call. The worker lease is 180 seconds. Transient provider retries remain separately bounded to 3 attempts.
  Identical calls reuse the 24-hour cache. A failed initial lookup prevents unnecessary follow-up searches.
- Tool audit includes purpose, query arguments, round, latency, status and estimated cost. Groq audit records
  model, purpose, latency, outcome and returned token counts; neither keys nor raw model prompts are logged.
  Groq 429/selected 5xx responses receive at most one retry. Other failures degrade to structured fields or
  deterministic planning. There is no silent switch to another paid model.
- Evidence includes provider field path, retrieval time, effective observation time, source type, domain-match
  label and tool-call reference. Publication date is explicitly unknown when the provider did not supply it.
  Historical observations are retained; only the latest research batch participates in current evaluation.
- Every evaluation stores an immutable policy, fact, check, evidence-ID, outcome and operator-reason snapshot.
  Existing evidence drawers and new operator decision history make these inspectable. Policy rules continue
  to own all eligibility and issuance decisions. Repeated identical clarification messages are suppressed.
- Grant/debit ledger reconciliation is exposed by the backend and shown on the operator policy card.
  Concurrent same-key usage is tested to create one debit. Existing grant, budget, duplicate, collision and
  lease-recovery tests remain intact.

## Validation

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
cd frontend
npm run build
npm run lint
```

All 36 backend tests pass; frontend production build (including typecheck) and lint pass.
Unit tests use fake providers and temporary databases, with no live keys or external spending.
The opt-in provider check uses configured keys and makes bounded real calls:

```powershell
.\.venv\Scripts\python.exe -m backend.live_check --live
```

Observed live results on 6 November 2026: Groq headcount extraction returned 12 with an exact supporting
quote; Acyclic research completed and the synthetic test case enrolled; two identical $1 usage requests left
$499 and one debit; Adside's synthetic founding-year conflict triggered a successful Groq planning call,
targeted Crustdata search and `EXCEPTION` with no grant. Ledger reconciliation passed. These declarations are
test inputs, not claims about these companies, their funding or authority to represent them.

## Remaining future scope

The roadmap's P2 items remain future work: real email, uploads/OCR, registry integrations, external billing,
multi-program/tenant administration, operator accounts and production security/retention controls. Public-page
fetch/authenticity validation and calibrated stale-evidence rules are not implemented; search results remain
leads. The model currently prioritizes unresolved facts; it does not interpret public pages into verified
facts. Account Free-plan quotas/billing status still need verification in the user's Groq console.
