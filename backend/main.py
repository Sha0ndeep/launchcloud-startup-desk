import hmac
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings
from .db import Database, event, message, now
from .models import ApplicationInput, ResolutionInput, ResponseInput, UsageInput, VerificationInput
from .service import Service, TERMINAL


def create_app(settings=None, researcher=None):
    settings = settings or Settings.from_env()
    # There is deliberately no fake production email adapter.
    if not settings.demo_mode:
        raise RuntimeError('This MVP only supports the explicitly labeled demo mailbox. Configure a real authenticated sender before enabling production mode.')
    if not settings.operator_token:
        raise RuntimeError('OPERATOR_TOKEN must not be empty.')
    db = Database(settings.database_path)
    service = Service(db, settings, researcher)
    app = FastAPI(title='LaunchCloud Startup Desk', version='1.0.0',
                  description='Demo startup-program operations. Credits are fictional provider product credits. Evidence trust is explicit.')
    app.state.service = service
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_credentials=False,
                       allow_methods=['GET', 'POST'], allow_headers=['Authorization', 'X-Operator-Token', 'Idempotency-Key', 'Content-Type'])

    def token(auth):
        return auth[7:] if auth and auth.startswith('Bearer ') else None

    def operator(value):
        if not value or not hmac.compare_digest(value, settings.operator_token):
            raise HTTPException(401, 'Operator credentials required.')

    def key(value):
        if not value or not 8 <= len(value) <= 200:
            raise HTTPException(422, 'Provide an Idempotency-Key of 8 to 200 characters.')
        return value

    def auth(app_id, authorization, operator_token, applicant_only=False):
        service.authorize(app_id, token(authorization), operator_token, applicant_only)

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'demo_mode': settings.demo_mode,
                'research_mode': 'live' if settings.crustdata_api_key else 'unconfigured',
                'model_configured': bool(settings.anthropic_api_key and settings.anthropic_model), 'worker_required': True}

    @app.get('/api/program')
    def program():
        return service.program()

    @app.post('/api/applications', status_code=201)
    def create(body: ApplicationInput, idempotency_key: str | None = Header(default=None), authorization: str | None = Header(default=None)):
        return service.create(body, key(idempotency_key), token(authorization))

    @app.get('/api/applications/{app_id}')
    def get_case(app_id: str, authorization: str | None = Header(default=None), x_operator_token: str | None = Header(default=None)):
        auth(app_id, authorization, x_operator_token)
        return service.case(app_id)

    @app.post('/api/applications/{app_id}/verify-email')
    def verify(app_id: str, body: VerificationInput, authorization: str | None = Header(default=None)):
        auth(app_id, authorization, None, True)
        return service.verify(app_id, body.code)

    @app.post('/api/applications/{app_id}/responses')
    def respond(app_id: str, body: ResponseInput, authorization: str | None = Header(default=None)):
        auth(app_id, authorization, None, True)
        return service.response(app_id, body)

    @app.get('/api/applications/{app_id}/report')
    def report(app_id: str, authorization: str | None = Header(default=None), x_operator_token: str | None = Header(default=None)):
        auth(app_id, authorization, x_operator_token)
        return {'report_version': '1', 'evidence_policy': service.program()['policy'], 'case': service.case(app_id),
                'limitations': ['Demo mailbox does not deliver real email.', 'Accepted declarations are not independent verification.',
                                'Search snippets and source links are research leads, not authenticated documents.',
                                'External research costs shown are estimates.']}

    @app.get('/api/applications/{app_id}/credits')
    def credits(app_id: str, authorization: str | None = Header(default=None), x_operator_token: str | None = Header(default=None)):
        auth(app_id, authorization, x_operator_token)
        return service.credits(app_id)

    @app.post('/api/applications/{app_id}/usage')
    def usage(app_id: str, body: UsageInput, authorization: str | None = Header(default=None), idempotency_key: str | None = Header(default=None)):
        auth(app_id, authorization, None, True)
        return service.use(app_id, body, key(idempotency_key))

    @app.get('/api/applications/{app_id}/demo-inbox')
    def inbox(app_id: str, authorization: str | None = Header(default=None)):
        auth(app_id, authorization, None, True)
        with db.connect() as c:
            messages = []
            for row in c.execute("SELECT * FROM messages WHERE application_id=? AND direction='outbound' ORDER BY rowid", (app_id,)):
                record = dict(row)
                record.pop('application_id')
                record['payload'] = json.loads(record.pop('payload_json'))
                messages.append(record)
        return {'demo_mode': True, 'messages': messages}

    @app.get('/api/operator/applications')
    def queue(x_operator_token: str | None = Header(default=None)):
        operator(x_operator_token)
        with db.connect() as c:
            rows = []
            for row in c.execute('SELECT * FROM applications ORDER BY created_at DESC'):
                d = json.loads(row['data_json'])
                rows.append({'id': row['id'], 'state': row['state'], 'created_at': row['created_at'], 'updated_at': row['updated_at'],
                             **{k: d[k] for k in ['company_name', 'domain', 'work_email']}})
        return {'applications': rows, 'program': service.program()}

    @app.post('/api/operator/applications/{app_id}/resolve')
    def resolve(app_id: str, body: ResolutionInput, x_operator_token: str | None = Header(default=None)):
        operator(x_operator_token)
        with db.transaction() as c:
            row = c.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
            if not row:
                raise HTTPException(404, 'Application not found.')
            if row['state'] != 'EXCEPTION':
                raise HTTPException(409, 'This action is only available for an actual exception.')
            event(c, app_id, 'operator_resolution', body.action + ': ' + body.reason)
            if body.action == 'decline':
                service.set_state(c, app_id, 'DECLINED', 'Operator decision: ' + body.reason)
                message(c, app_id, 'decision', 'Startup program decision', 'Operator decision: ' + body.reason)
            elif body.action == 'request_information':
                service.set_state(c, app_id, 'AWAITING_APPLICANT', 'Operator requested clarification.')
                message(c, app_id, 'information_request', 'Additional clarification requested', body.reason)
            else:
                checks = json.loads(row['checks_json'])
                if not any(ch['rule'] == 'external_consistency' and ch['status'] == 'CONFLICT' for ch in checks):
                    raise HTTPException(409, 'No external observation conflict is available to resolve.')
                # Different-domain identity collisions cannot be waived into a second grant.
                if 'confirm legal entity' in next(ch['reason'] for ch in checks if ch['rule'] == 'external_consistency'):
                    raise HTTPException(409, 'Entity collision requires explicit account reconciliation, not an eligibility waiver. MVP leaves it unresolved.')
                c.execute('UPDATE applications SET conflict_waiver=?,updated_at=? WHERE id=?', (body.reason, now(), app_id))
                service.evaluate(c, app_id)
        return service.case(app_id)

    @app.post('/api/operator/applications/{app_id}/retry')
    def retry(app_id: str, x_operator_token: str | None = Header(default=None)):
        operator(x_operator_token)
        with db.transaction() as c:
            row = c.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
            if not row:
                raise HTTPException(404, 'Application not found.')
            if row['state'] in TERMINAL or not row['email_verified']:
                raise HTTPException(409, 'Terminal or unverified cases cannot be requeued.')
            running = c.execute("SELECT 1 FROM jobs WHERE application_id=? AND status='running'", (app_id,)).fetchone()
            if running:
                raise HTTPException(409, 'Research already has an active worker lease.')
            service.enqueue(c, app_id)
            service.set_state(c, app_id, 'RESEARCH_QUEUED', 'Operator requested a bounded research retry.')
        return service.case(app_id)

    return app
