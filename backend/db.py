import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .config import POLICY


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid4().hex


SCHEMA = '''
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS evidence_details (evidence_id TEXT PRIMARY KEY, details_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tool_call_details (tool_call_id TEXT PRIMARY KEY, details_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_runs (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL, model TEXT NOT NULL, purpose TEXT NOT NULL,
 outcome TEXT NOT NULL, latency_ms INTEGER NOT NULL, usage_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policy_versions (version TEXT PRIMARY KEY, policy_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decision_snapshots (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL, policy_version TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS program (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, policy_version TEXT NOT NULL,
 policy_json TEXT NOT NULL, benefit_cents INTEGER NOT NULL,
 budget_cents INTEGER NOT NULL, allocated_cents INTEGER NOT NULL DEFAULT 0,
 CHECK(allocated_cents >= 0 AND allocated_cents <= budget_cents)
);
CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, create_key TEXT UNIQUE NOT NULL,
 intent_hash TEXT NOT NULL, state TEXT NOT NULL, data_json TEXT NOT NULL,
 policy_version TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0,
 code_hash TEXT NOT NULL, code_expires REAL NOT NULL, code_attempts INTEGER NOT NULL DEFAULT 0,
 research_json TEXT NOT NULL, checks_json TEXT NOT NULL DEFAULT '[]',
 company_provider_id INTEGER, conflict_waiver TEXT, decision_revision INTEGER NOT NULL DEFAULT 0,
 account_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 field TEXT NOT NULL, value_json TEXT NOT NULL, kind TEXT NOT NULL,
 source_url TEXT, source_pointer TEXT, observed_at TEXT, retrieved_at TEXT NOT NULL, note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 type TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 direction TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
 payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tool_calls (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), endpoint TEXT NOT NULL,
 status TEXT NOT NULL, credits_estimate REAL NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 kind TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 available_at REAL NOT NULL, lease_until REAL, lease_owner TEXT,
 UNIQUE(application_id, kind)
);
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY, domain TEXT UNIQUE NOT NULL, provider_id INTEGER,
 balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS grants (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
 program_id TEXT NOT NULL REFERENCES program(id), amount_cents INTEGER NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(program_id, account_id)
);
CREATE TABLE IF NOT EXISTS usage (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
 idem_key TEXT NOT NULL, intent_hash TEXT NOT NULL, amount_cents INTEGER NOT NULL,
 description TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(account_id, idem_key)
);
CREATE TABLE IF NOT EXISTS cache (
 fingerprint TEXT PRIMARY KEY, payload_json TEXT NOT NULL, fetched_at REAL NOT NULL
);
'''


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc, tb):
        try:
            return super().__exit__(exc_type, exc, tb)
        finally:
            self.close()


class Database:
    def __init__(self, path):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as c:
            c.executescript(SCHEMA)
            c.execute('INSERT OR IGNORE INTO program VALUES (?,?,?,?,?,?,?)',
                      ('launchcloud', 'LaunchCloud Startup Program', 'v1', json.dumps(POLICY), 50000, 5000000, 0))
            c.execute('INSERT OR IGNORE INTO policy_versions SELECT policy_version,policy_json FROM program')

    def connect(self):
        c = sqlite3.connect(self.path, timeout=15, isolation_level=None, factory=ClosingConnection)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        c.execute('PRAGMA busy_timeout=15000')
        return c

    @contextmanager
    def transaction(self):
        c = self.connect()
        try:
            c.execute('BEGIN IMMEDIATE')
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise
        finally:
            c.close()


def event(c, app_id, kind, detail):
    c.execute('INSERT INTO events VALUES (?,?,?,?,?)', (uid(), app_id, kind, detail, now()))


def evidence(c, app_id, field, value, kind, source_url=None, source_pointer=None, observed_at=None, note='',
             tool_call_id=None, source_type=None, match_status=None):
    eid = uid()
    c.execute('INSERT INTO evidence VALUES (?,?,?,?,?,?,?,?,?,?)',
              (eid, app_id, field, json.dumps(value), kind, source_url, source_pointer, observed_at, now(), note))
    c.execute('INSERT INTO evidence_details VALUES (?,?)', (eid, json.dumps({
        'tool_call_id': tool_call_id, 'source_type': source_type or ('applicant_declaration' if kind == 'APPLICANT_DECLARATION' else 'provider_observation' if kind == 'PROVIDER_OBSERVATION' else 'applicant_supplied'),
        'match_status': match_status, 'source_published_at': None,
        'fact_status': 'declared' if kind == 'APPLICANT_DECLARATION' else 'externally_supported' if field != 'public_source_lead' else 'unverified_lead',
    })))
    return eid


def message(c, app_id, kind, subject, body, payload=None, direction='outbound'):
    if kind == 'information_request' and direction == 'outbound':
        previous = c.execute("SELECT subject,body FROM messages WHERE application_id=? AND kind='information_request' AND direction='outbound' ORDER BY rowid DESC LIMIT 1", (app_id,)).fetchone()
        if previous and previous['subject'] == subject and previous['body'] == body:
            return
    c.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)',
              (uid(), app_id, direction, kind, subject, body, json.dumps(payload or {}), now()))
