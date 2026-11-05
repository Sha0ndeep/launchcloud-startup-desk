# LaunchCloud backend

Backend half of the two-device build. Frontend uses `../API_CONTRACT.md`. There is no frontend implementation here.

## Run locally

From the repository root in PowerShell:

```powershell
python -m pip install -r backend/requirements.txt
$env:DEMO_MODE='true'
$env:OPERATOR_TOKEN='choose-a-local-operator-token'
$env:CRUSTDATA_API_KEY='<set privately in your shell>'
python -m uvicorn backend.main:create_app --factory --host 127.0.0.1 --port 8000
```

In another terminal, set the same `DATABASE_PATH` and `CRUSTDATA_API_KEY`, then:

```powershell
python -m backend.worker
```

Set `DATABASE_PATH` on both processes to the same absolute path if they have different working directories. `.env.example` documents environment variables; the server does not implicitly load `.env` files. No credentials are embedded in source.

Health: http://127.0.0.1:8000/api/health. Interactive API reference: http://127.0.0.1:8000/docs. OpenAPI: http://127.0.0.1:8000/openapi.json.

Default CORS origins are localhost/127.0.0.1 port 5173. Override `CORS_ORIGINS` with a comma-separated list. Keep the backend local by default. A frontend on a different device must configure the actual reachable backend address and corresponding CORS origin; `localhost` on the other device is not this machine.

## What works

- Applications with opaque applicant tokens and a separate operator token.
- Explicitly simulated mailbox, single-use six-digit verification codes, expiration and five-attempt lockout.
- Separate durable worker with job leases and restart recovery.
- Direct read-only Crustdata company enrichment and targeted web search with bounded estimated spend and a 24-hour cache.
- Source-linked provider observations, applicant declarations, per-rule checks and activity history.
- Structured applicant corrections and optional quote-validated numeric extraction from replies through Anthropic (requires both ANTHROPIC_API_KEY and ANTHROPIC_MODEL).
- Declarative eligibility policy, conflicts/clarification, supported declines and an operator exception route.
- Transactional product-credit issuance, budget enforcement, same-domain duplicate handling, idempotent product consumption.
- JSON case export and actual product-credit balance.

## Honest MVP limitations

This is a local demonstration, not a production fraud-verification service. The mailbox is simulated and explicitly labeled; it does not independently establish real mailbox control. The frontend must not label simulated messages as delivered email. Non-demo mode deliberately fails until a real sender is implemented.

Program policy v1 explicitly accepts selected applicant declarations. They are not independently verified funding/payroll. If external research is unconfigured or fails, enrollment is held; no synthetic provider data is inserted. Supply structured missing facts in the applicant reply form. Optional model extraction never makes eligibility decisions.

Web search results are stored as leads, not verified financial evidence. Page retrieval/authenticity checks, file uploads/OCR, automated registry confirmation, production email, reissuing expired verification challenges, remote billing reconciliation and multi-tenant operation remain follow-on work. Applications with expired codes need a fresh submission in this version.

Confirmed same-domain accounts share one benefit. Provider identity collisions across domains require manual entity reconciliation; a simple waiver cannot issue a second grant. No assertion of global legal-entity deduplication is made.

Research costs in tool calls are estimates, not provider billing receipts. A connection failure may have been charged. API errors remain visible. Transient connection/429/5xx errors get at most three durable attempts with backoff; successful cached calls are reused. Persistent/configuration errors stop for explicit repair; there is no infinite retry loop.

The operator token is a demo shared secret; production operator login/roles are not implemented. Applicant tokens belong in session storage and request headers, not URLs. Do not expose a demo operator token on a public server.

## Tests

```powershell
python -m unittest discover -s backend/tests -v
```

Tests use temporary SQLite databases and deterministic, explicitly mocked research. They consume no Crustdata credits and do not establish live company-data accuracy.
