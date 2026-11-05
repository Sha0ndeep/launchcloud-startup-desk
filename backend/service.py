import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone

from fastapi import HTTPException

from .db import event, evidence, message, now, uid
from .models import FactCorrections
from .research import Researcher, extract_reply


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def intent(value):
    return digest(json.dumps(value, sort_keys=True))


TERMINAL = {'ENROLLED', 'DUPLICATE_RESOLVED', 'DECLINED'}


class Service:
    def __init__(self, db, settings, researcher=None):
        self.db, self.settings = db, settings
        self.researcher = researcher or Researcher(db, settings)

    def program(self, c=None):
        if c is None:
            with self.db.connect() as conn:
                return self.program(conn)
        row = dict(c.execute('SELECT * FROM program').fetchone())
        row['policy'] = json.loads(row.pop('policy_json'))
        row['currency'] = 'USD'
        row['remaining_cents'] = row['budget_cents'] - row['allocated_cents']
        return row

    def authorize(self, app_id, token, operator=None, applicant_only=False):
        if not applicant_only and operator and hmac.compare_digest(operator, self.settings.operator_token):
            return
        with self.db.connect() as c:
            row = c.execute('SELECT token_hash FROM applications WHERE id=?', (app_id,)).fetchone()
        if not row or not token or not hmac.compare_digest(digest(token), row['token_hash']):
            raise HTTPException(403, 'Invalid applicant credentials.')

    def create(self, model, key, token=None):
        data = model.model_dump()
        email_domain = data['work_email'].rsplit('@', 1)[1]
        if email_domain != data['domain'] and not email_domain.endswith('.' + data['domain']):
            raise HTTPException(422, 'Use an email address on the submitted company domain.')
        body_hash, access, code, app_id = intent(data), secrets.token_urlsafe(32), f'{secrets.randbelow(1000000):06d}', uid()
        with self.db.transaction() as c:
            old = c.execute('SELECT * FROM applications WHERE create_key=?', (key,)).fetchone()
            if old:
                if old['intent_hash'] != body_hash:
                    raise HTTPException(409, 'Idempotency key belongs to a different submission.')
                if not token or not hmac.compare_digest(old['token_hash'], digest(token)):
                    raise HTTPException(409, 'Submission already exists. Resume with its saved applicant token; it cannot be recovered using the submission key alone.')
                return {'application_id': old['id'], 'access_token': token, 'state': old['state']}
            stamp = now()
            c.execute('''INSERT INTO applications (id,token_hash,create_key,intent_hash,state,data_json,policy_version,
                code_hash,code_expires,research_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
                (app_id, digest(access), key, body_hash, 'AWAITING_EMAIL', json.dumps(data), self.program(c)['policy_version'],
                 digest(code), time.time() + 1800, json.dumps({'status': 'pending', 'configured': bool(self.settings.crustdata_api_key), 'error': None}), stamp, stamp))
            for field in ['founding_year', 'headcount', 'funding_usd', 'product_kind', 'authority_declared']:
                if data.get(field) is not None:
                    evidence(c, app_id, field, data[field], 'APPLICANT_DECLARATION', note='Applicant supplied this value; it is not independently verified.')
            message(c, app_id, 'verification', 'Verify your company mailbox',
                    'Demo mailbox only. Enter the single-use code to simulate control of this company inbox.', {'code': code})
            event(c, app_id, 'submitted', 'Application created under policy v1. Verification is pending.')
        return {'application_id': app_id, 'access_token': access, 'state': 'AWAITING_EMAIL'}

    def verify(self, app_id, code):
        error = None
        with self.db.transaction() as c:
            row = c.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
            if row['email_verified']:
                return self.case(app_id, c)
            if row['code_attempts'] >= 5 or row['code_expires'] < time.time():
                error = 'Verification expired or locked after five attempts.'
            elif not hmac.compare_digest(row['code_hash'], digest(code)):
                c.execute('UPDATE applications SET code_attempts=code_attempts+1 WHERE id=?', (app_id,))
                error = 'Incorrect verification code.'
            else:
                c.execute('UPDATE applications SET email_verified=1,state=?,updated_at=? WHERE id=?', ('RESEARCH_QUEUED', now(), app_id))
                event(c, app_id, 'email_verified', 'Mailbox challenge completed through the explicitly simulated demo adapter.')
                self.enqueue(c, app_id)
        if error:
            raise HTTPException(400, error)
        return self.case(app_id)

    def enqueue(self, c, app_id):
        # A running job is never replaced by a second worker while it owns its lease.
        c.execute('''INSERT INTO jobs VALUES (?,?,?,'queued',0,?,NULL,NULL)
            ON CONFLICT(application_id,kind) DO UPDATE SET status='queued',available_at=excluded.available_at
            WHERE jobs.status!='running' ''', (uid(), app_id, 'research', time.time()))

    def response(self, app_id, model):
        changes = model.facts.model_dump(exclude_unset=True, exclude_none=True)
        if not changes and model.text:
            raw = extract_reply(self.settings, model.text)
            try:
                changes = FactCorrections.model_validate(raw).model_dump(exclude_none=True)
            except ValueError:
                changes = {}
        with self.db.transaction() as c:
            row = c.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
            if not row['email_verified'] or row['state'] in TERMINAL:
                raise HTTPException(409, 'This application cannot accept fact changes in its current state.')
            if row['state'] in {'RESEARCHING', 'RESEARCH_QUEUED'}:
                raise HTTPException(409, 'Research is running. Wait for its information request before replying.')
            data = json.loads(row['data_json'])
            data.update(changes)
            if model.attestation_accepted:
                data['attestation_accepted'] = True
            for field, value in changes.items():
                evidence(c, app_id, field, value, 'APPLICANT_DECLARATION', note='Updated declaration in an authenticated applicant reply; not independently verified.')
            for url in model.source_urls:
                evidence(c, app_id, 'supporting_link', url, 'APPLICANT_LINK', source_url=url, note='Applicant-supplied link; content/authenticity has not been verified.')
            message(c, app_id, 'reply', 'Applicant response', model.text or 'Structured facts updated.', direction='inbound')
            c.execute('UPDATE applications SET data_json=?,updated_at=?,conflict_waiver=NULL WHERE id=?', (json.dumps(data), now(), app_id))
            event(c, app_id, 'applicant_replied', 'Recorded accepted structured corrections and source links.')
            self.evaluate(c, app_id)
        return self.case(app_id)

    def run_one(self):
        owner = uid()
        with self.db.transaction() as c:
            job = c.execute('''SELECT * FROM jobs WHERE (status='queued' AND available_at<=?)
                OR (status='running' AND lease_until<?) ORDER BY available_at LIMIT 1''', (time.time(), time.time())).fetchone()
            if not job:
                return False
            # Research can take two bounded 35s calls; lease exceeds the maximum runtime.
            c.execute("UPDATE jobs SET status='running',lease_owner=?,lease_until=?,attempts=attempts+1 WHERE id=?", (owner, time.time() + 120, job['id']))
            app = c.execute('SELECT * FROM applications WHERE id=?', (job['application_id'],)).fetchone()
            if app['state'] in TERMINAL or not app['email_verified']:
                c.execute("UPDATE jobs SET status='done',lease_owner=NULL WHERE id=?", (job['id'],))
                return True
            c.execute('UPDATE applications SET state=?,updated_at=? WHERE id=?', ('RESEARCHING', now(), app['id']))
            event(c, app['id'], 'research_started', 'Read-only external research started; null values remain unknown.')
            data = json.loads(app['data_json'])
        try:
            research, observations, provider_id = self.researcher.run(app['id'], data)
        except Exception:
            research, observations, provider_id = {'status': 'failed', 'configured': bool(self.settings.crustdata_api_key),
                                                   'error': 'Research failed unexpectedly; no facts inferred.'}, [], None
        with self.db.transaction() as c:
            lease = c.execute('SELECT lease_owner FROM jobs WHERE id=?', (job['id'],)).fetchone()
            if lease['lease_owner'] != owner:
                return True
            # Replace provider observations, keeping applicant declarations and audit history.
            c.execute("DELETE FROM evidence WHERE application_id=? AND kind='PROVIDER_OBSERVATION'", (app['id'],))
            for ob in observations:
                evidence(c, app['id'], kind='PROVIDER_OBSERVATION', **ob)
            c.execute('UPDATE applications SET research_json=?,company_provider_id=?,updated_at=? WHERE id=?',
                      (json.dumps(research), provider_id, now(), app['id']))
            if research.get('retryable') and job['attempts'] + 1 < 3:
                delay = max(float(research.get('retry_after_seconds', 5)), 5 * (2 ** job['attempts']))
                c.execute("UPDATE jobs SET status='queued',available_at=?,lease_owner=NULL,lease_until=NULL WHERE id=?", (time.time() + delay, job['id']))
                self.set_state(c, app['id'], 'RESEARCH_QUEUED', f'Transient provider failure; automatic bounded retry scheduled in {delay:g} seconds. Cached successful calls will be reused.')
                return True
            c.execute("UPDATE jobs SET status='done',lease_owner=NULL,lease_until=NULL WHERE id=?", (job['id'],))
            event(c, app['id'], 'research_finished', 'Research status: ' + research['status'])
            self.evaluate(c, app['id'])
        return True

    def evaluate(self, c, app_id):
        row = c.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
        if row['state'] in TERMINAL or not row['email_verified']:
            return
        data, research, program = json.loads(row['data_json']), json.loads(row['research_json']), self.program(c)
        p = program['policy']
        ev = [dict(r) for r in c.execute('SELECT * FROM evidence WHERE application_id=? ORDER BY rowid', (app_id,))]
        checks = []
        def add(rule, status, reason, fields=()):
            checks.append({'rule': rule, 'status': status, 'reason': reason,
                           'evidence_ids': [e['id'] for e in ev if e['field'] in fields]})
        add('mailbox', 'PASS', 'Demo mailbox challenge completed; not real email delivery.')
        add('authority', 'PASS' if data['authority_declared'] else 'NEEDS_INFORMATION',
            'Applicant authority declaration accepted.' if data['authority_declared'] else 'Confirm authorization to apply for this company.', ['authority_declared'])
        add('attestation', 'PASS' if data['attestation_accepted'] else 'NEEDS_INFORMATION',
            'Applicant accepted declaration responsibility under policy v1.' if data['attestation_accepted'] else 'Accept the program declaration policy.')
        for field, label, predicate in [
            ('founding_year', 'Founding year', lambda x: p['founded_year_min'] <= x <= datetime.now(timezone.utc).year),
            ('headcount', 'Full-time employee count', lambda x: x < p['headcount_max_exclusive']),
            ('funding_usd', 'Total funding in USD', lambda x: x < p['funding_max_usd_exclusive']),
        ]:
            value = data.get(field)
            if value is None:
                add(field, 'NEEDS_INFORMATION', f'Provide {label.lower()} and accept responsibility for the declaration.', [field])
            else:
                add(field, 'PASS' if predicate(value) else 'FAIL',
                    f'{label}: {value}. Applicant declaration evaluated under policy v1; not independently verified.', [field])
        kind = data['product_kind']
        add('product', 'PASS' if kind == 'software' else 'FAIL' if kind == 'other' else 'NEEDS_INFORMATION',
            'Software-product declaration accepted.' if kind == 'software' else 'Program is for software products.' if kind == 'other' else 'Confirm whether the business provides a software product.', ['product_kind'])

        conflicts = []
        for e in ev:
            if e['kind'] != 'PROVIDER_OBSERVATION':
                continue
            v, field = json.loads(e['value_json']), e['field']
            if field == 'identity_conflict':
                conflicts.append('Provider returned multiple company candidates.')
            if field == 'funding_usd' and isinstance(v, (int, float)) and v > 0 and data.get(field) is not None:
                if v >= p['funding_max_usd_exclusive'] > data[field]:
                    conflicts.append('External funding observation crosses the eligibility cap; clarify its date, entity and scope.')
            if field == 'founding_year' and v is not None and data.get(field) is not None and v != data[field]:
                conflicts.append('Provider founding year differs from the declaration; clarify the meaning and source.')
            if field == 'headcount' and isinstance(v, (int, float)) and data.get(field) is not None and v >= p['headcount_max_exclusive'] > data[field]:
                conflicts.append('Provider workforce count crosses the cap; clarify dates and employee/contractor definitions.')
        if row['company_provider_id']:
            other = c.execute('SELECT domain FROM accounts WHERE provider_id=? AND domain!=?', (row['company_provider_id'], data['domain'])).fetchone()
            if other:
                conflicts.append('Provider identity overlaps an existing account on another domain; confirm legal entity before issuing.')
        add('external_consistency', 'PASS' if not conflicts or row['conflict_waiver'] else 'CONFLICT',
            'Operator resolved external observation conflict: ' + row['conflict_waiver'] if row['conflict_waiver'] else
            '; '.join(conflicts) if conflicts else 'No material conflict observed in available records. This is not a completeness guarantee.',
            ['funding_usd', 'headcount', 'founding_year', 'identity_conflict'])
        add('research', 'PASS' if research['status'] == 'complete' else 'NEEDS_INFORMATION',
            'Bounded external checks completed; declarations remain labeled.' if research['status'] == 'complete'
            else 'External research is incomplete. Operator must restore research; applicant declarations cannot bypass this check.')
        c.execute('UPDATE applications SET checks_json=?,decision_revision=decision_revision+1,updated_at=? WHERE id=?', (json.dumps(checks), now(), app_id))
        if any(x['status'] == 'FAIL' for x in checks):
            self.set_state(c, app_id, 'DECLINED', 'Application does not meet: ' + ', '.join(x['rule'] for x in checks if x['status'] == 'FAIL'))
            message(c, app_id, 'decision', 'Startup program decision', '\n'.join(x['reason'] for x in checks if x['status'] == 'FAIL'))
        elif conflicts and not row['conflict_waiver']:
            self.set_state(c, app_id, 'EXCEPTION', '; '.join(conflicts))
            message(c, app_id, 'information_request', 'Clarification needed', '; '.join(conflicts))
        elif any(x['status'] == 'NEEDS_INFORMATION' for x in checks):
            self.set_state(c, app_id, 'AWAITING_APPLICANT', 'Waiting for accepted missing information or restored research.')
            body = '\n'.join(x['reason'] for x in checks if x['status'] == 'NEEDS_INFORMATION')
            message(c, app_id, 'information_request', 'Information needed for your startup application', body)
        else:
            self.issue(c, app_id, data, row['company_provider_id'])

    def set_state(self, c, app_id, state, detail):
        c.execute('UPDATE applications SET state=?,updated_at=? WHERE id=?', (state, now(), app_id))
        event(c, app_id, state.lower(), detail)

    def issue(self, c, app_id, data, provider_id):
        p = self.program(c)
        account = c.execute('SELECT * FROM accounts WHERE domain=?', (data['domain'],)).fetchone()
        if account:
            grant = c.execute('SELECT * FROM grants WHERE program_id=? AND account_id=?', (p['id'], account['id'])).fetchone()
            if grant:
                c.execute('UPDATE applications SET account_id=? WHERE id=?', (account['id'], app_id))
                self.set_state(c, app_id, 'DUPLICATE_RESOLVED', 'This verified-domain company already has its program grant. No additional credits issued.')
                message(c, app_id, 'activation', 'Existing startup benefit located', 'Your company already has this program benefit. No second grant was created.')
                return
        amount = p['benefit_cents']
        if p['remaining_cents'] < amount:
            self.set_state(c, app_id, 'BUDGET_WAITING', 'Eligible under policy but program allocation is exhausted.')
            return
        account_id = account['id'] if account else uid()
        if not account:
            c.execute('INSERT INTO accounts VALUES (?,?,?,?,?)', (account_id, data['domain'], provider_id, 0, now()))
        c.execute('INSERT INTO grants VALUES (?,?,?,?,?)', (uid(), account_id, p['id'], amount, now()))
        c.execute('UPDATE accounts SET balance_cents=balance_cents+? WHERE id=?', (amount, account_id))
        c.execute('UPDATE program SET allocated_cents=allocated_cents+? WHERE id=?', (amount, p['id']))
        c.execute('UPDATE applications SET account_id=? WHERE id=?', (account_id, app_id))
        self.set_state(c, app_id, 'ENROLLED', f'Issued {amount} USD cents of promotional product credits in one transaction.')
        message(c, app_id, 'activation', 'Your LaunchCloud startup credits are active',
                f'Your account received ${amount / 100:.2f} in promotional product credits. This is a demo SaaS balance, not Crustdata credits.')

    def case(self, app_id, c=None):
        if c is None:
            with self.db.connect() as conn:
                return self.case(app_id, conn)
        row = c.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Application not found.')
        data = json.loads(row['data_json'])
        result = {k: row[k] for k in ['id', 'state', 'policy_version', 'account_id', 'created_at', 'updated_at']}
        result.update({k: data[k] for k in ['company_name', 'domain', 'work_email']})
        result.update(email_verified=bool(row['email_verified']), facts={k: data.get(k) for k in ['founding_year', 'headcount', 'funding_usd', 'product_kind', 'authority_declared', 'attestation_accepted']},
                      research=json.loads(row['research_json']), checks=json.loads(row['checks_json']))
        for table in ['messages', 'events', 'tool_calls', 'evidence']:
            records = []
            for raw in c.execute(f'SELECT * FROM {table} WHERE application_id=? ORDER BY rowid', (app_id,)):
                item = dict(raw)
                item.pop('application_id', None)
                if table == 'messages':
                    item.pop('payload_json')  # Verification code only through explicit demo inbox.
                if table == 'evidence':
                    item['value'] = json.loads(item.pop('value_json'))
                records.append(item)
            result[table] = records
        grant = c.execute('SELECT id,amount_cents,created_at FROM grants WHERE account_id=?', (row['account_id'],)).fetchone()
        result['grant'] = dict(grant) if grant else None
        return result

    def credits(self, app_id, c=None):
        if c is None:
            with self.db.connect() as conn:
                return self.credits(app_id, conn)
        app = c.execute('SELECT account_id FROM applications WHERE id=?', (app_id,)).fetchone()
        account_id = app['account_id']
        account = c.execute('SELECT * FROM accounts WHERE id=?', (account_id,)).fetchone()
        return {'account_id': account_id, 'currency': 'USD', 'available_cents': account['balance_cents'] if account else 0,
                'grants': [dict(x) for x in c.execute('SELECT id,amount_cents,created_at FROM grants WHERE account_id=?', (account_id,))],
                'usage': [dict(x) for x in c.execute('SELECT id,amount_cents,created_at FROM usage WHERE account_id=? ORDER BY rowid', (account_id,))]}

    def use(self, app_id, body, key):
        data = body.model_dump()
        with self.db.transaction() as c:
            app = c.execute('SELECT * FROM applications WHERE id=?', (app_id,)).fetchone()
            if app['state'] not in {'ENROLLED', 'DUPLICATE_RESOLVED'} or not app['account_id']:
                raise HTTPException(409, 'No active product-credit account.')
            prior = c.execute('SELECT * FROM usage WHERE account_id=? AND idem_key=?', (app['account_id'], key)).fetchone()
            if prior:
                if prior['intent_hash'] != intent(data):
                    raise HTTPException(409, 'Idempotency key was used for a different product action.')
                return self.credits(app_id, c)
            account = c.execute('SELECT * FROM accounts WHERE id=?', (app['account_id'],)).fetchone()
            if account['balance_cents'] < body.amount_cents:
                raise HTTPException(409, 'Insufficient product credits.')
            c.execute('UPDATE accounts SET balance_cents=balance_cents-? WHERE id=?', (body.amount_cents, account['id']))
            c.execute('INSERT INTO usage VALUES (?,?,?,?,?,?,?)', (uid(), account['id'], key, intent(data), body.amount_cents, body.description, now()))
            event(c, app_id, 'product_used', f'Product action consumed {body.amount_cents} USD cents.')
        return self.credits(app_id)
