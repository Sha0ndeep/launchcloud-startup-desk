"""
Frontend-verification harness. NOT part of the backend and NOT a backend change.

Runs the real backend application (backend/main.py create_app) with a stub researcher injected
through the same `researcher=` seam that backend/tests/test_workflow.py uses, and runs the real
worker loop (Service.run_one) in a thread of the same process. The stub never contacts Crustdata
or the web; it returns deterministic fixture observations keyed by the applicant's domain so the
frontend can be driven through enrollment, conflict, duplicate, entity-collision and failed-research
paths on a machine without a Crustdata key. Every observation is labeled as a stub in its note.
Research status, checks, states, grants and balances are still produced by the unmodified backend.

Use only for frontend development and verification. It is not a demo of live research.

Run (bash), from a directory where `backend/` is importable, with the backend's own dependencies:

  PYTHONPATH=/path/containing/backend DATABASE_PATH=/tmp/launchcloud-stub.sqlite3 python dev/stub_backend_harness.py

Domain keywords: "conflict" -> provider headcount 100 (crosses the policy cap); "collision" -> provider
company id 777 shared across domains (entity collision, not waivable); "fail" -> the research run
raises and the backend records research status "failed"; anything else -> complete with a provider
headcount observation of 14.
"""
import logging
import os
import threading
import time

import uvicorn

from backend.config import Settings
from backend.db import Database
from backend.main import create_app
from backend.research import Researcher
from backend.service import Service

NOTE = 'STUB observation from the frontend-verification harness; not live provider data.'


class StubResearcher(Researcher):
    def run(self, app_id, data):
        domain = data['domain']
        if 'fail' in domain:
            self.log(app_id, '/company/enrich', 'unknown', 2.0, 'STUB: simulated transport failure.')
            raise RuntimeError('stub transport failure')
        self.log(app_id, '/company/enrich', 'success', 2.0, 'STUB: fixture company record returned; no provider was called.')
        self.log(app_id, '/web/search/live', 'success', 1.0, 'STUB: fixture search lead returned; no provider was called.')
        url = 'https://' + domain
        observations = [
            {'field': 'company_name', 'value': data['company_name'], 'source_url': url, 'source_pointer': 'basic_info.name', 'observed_at': None, 'note': NOTE},
            {'field': 'headcount', 'value': 100 if 'conflict' in domain else 14, 'source_url': url, 'source_pointer': 'headcount.total', 'observed_at': '2026-09-30', 'note': NOTE},
            {'field': 'public_source_lead', 'value': data['company_name'] + ' announces seed round (stub headline)', 'source_url': url + '/press', 'source_pointer': 'results', 'observed_at': None, 'note': 'STUB search lead; not independently verified evidence.'},
        ]
        provider_id = 777 if 'collision' in domain else None
        return {'status': 'complete', 'configured': True, 'error': None, 'retryable': False, 'retry_after_seconds': 5}, observations, provider_id


def main():
    db_path = os.environ.get('DATABASE_PATH', 'launchcloud-stub.sqlite3')
    operator_token = os.environ.get('OPERATOR_TOKEN', 'demo-operator')
    port = int(os.environ.get('PORT', '8000'))
    # The placeholder key only makes /api/health report research_mode "live"; the stub never sends it anywhere.
    settings = Settings(database_path=db_path, demo_mode=True, operator_token=operator_token, crustdata_api_key='STUB-NOT-A-REAL-KEY')
    app = create_app(settings, StubResearcher(Database(db_path), settings))
    worker = Service(Database(db_path), settings, StubResearcher(Database(db_path), settings))

    def loop():
        while True:
            try:
                if not worker.run_one():
                    time.sleep(0.5)
            except Exception:
                logging.exception('stub worker failed')
                time.sleep(1)

    threading.Thread(target=loop, daemon=True).start()
    uvicorn.run(app, host='127.0.0.1', port=port, log_level='info')


if __name__ == '__main__':
    main()
