"""Opt-in live provider smoke check. Uses a temporary DB and synthetic applicant declarations.

Run: python -m backend.live_check --live
Makes bounded Crustdata/Groq requests using locally configured credentials. No real mail or billing.
"""
import argparse
from dataclasses import replace
import json
from pathlib import Path
import tempfile

from fastapi.testclient import TestClient

from .config import Settings
from .llm import extract_candidates
from .main import create_app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', required=True, help='Explicitly allow bounded live provider calls.')
    parser.parse_args()
    settings = Settings.from_env()
    if not settings.crustdata_api_key or not settings.groq_api_key:
        raise SystemExit('Both CRUSTDATA_API_KEY and GROQ_API_KEY are required for this opt-in check.')
    output = {'synthetic_applicants': True, 'real_mail': False, 'free_plan_verified': False}
    output['extraction'] = extract_candidates(settings, 'We currently have 12 full-time employees.')
    with tempfile.TemporaryDirectory() as directory:
        app = create_app(replace(settings, database_path=str(Path(directory) / 'test.sqlite3')))
        with TestClient(app) as client:
            cases = []
            for index, (domain, year, headcount) in enumerate([('acyclic.dev', 2026, 2), ('adside.ai', 2025, 1)]):
                body = {'company_name': '[LIVE TEST] ' + domain, 'domain': domain,
                    'applicant_name': 'Synthetic tester', 'applicant_role': 'Not a company representative; local test only',
                    'work_email': 'launchcloud-demo-test@' + domain,
                    'product_description': 'Synthetic local demo software application; declarations are test inputs only.',
                    'product_kind': 'software', 'founding_year': year, 'headcount': headcount,
                    'funding_usd': 250000, 'authority_declared': True, 'attestation_accepted': True}
                response = client.post('/api/applications', json=body, headers={'Idempotency-Key': f'live-smoke-{index}'})
                response.raise_for_status()
                created = response.json()
                app_id, headers = created['application_id'], {'Authorization': 'Bearer ' + created['access_token']}
                code = client.get(f'/api/applications/{app_id}/demo-inbox', headers=headers).json()['messages'][0]['payload']['code']
                client.post(f'/api/applications/{app_id}/verify-email', json={'code': code}, headers=headers).raise_for_status()
                app.state.service.run_one()
                case = app.state.service.case(app_id)
                initial_state = case['state']
                if (case.get('clarification') or {}).get('status') == 'pending':
                    client.post(f'/api/applications/{app_id}/responses', headers=headers,
                        json={'facts': {'founding_year': year}, 'text': 'Synthetic test: we reassert the founding year to exercise persistent-conflict escalation.',
                              'attestation_accepted': True}).raise_for_status()
                    case = app.state.service.case(app_id)
                if case['state'] == 'ENROLLED':
                    for _ in range(2):
                        client.post(f'/api/applications/{app_id}/usage', headers={**headers, 'Idempotency-Key': 'live-same-usage'},
                            json={'amount_cents': 100, 'description': 'Synthetic sample job'}).raise_for_status()
                cases.append({'domain': domain, 'initial_state': initial_state, 'state': case['state'], 'clarification': case.get('clarification'), 'research': case['research'],
                    'tool_calls': case['tool_calls'], 'credits': app.state.service.credits(app_id),
                    'model_runs': case['model_runs'], 'snapshot_count': len(case['decisions'])})
            output['cases'] = cases
            output['ledger_reconciled'] = app.state.service.program()['ledger_reconciled']
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
