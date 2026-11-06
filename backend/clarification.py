"""Durable automatic conflict clarification before human escalation."""
import json
import re

from .db import event, message, now, uid

MAX_ROUNDS = 2
TERMS = {
    'founding_year': r'\bfound(?:ing|ed)?\b|\bincorporat\w*|\bestablish\w*',
    'headcount': r'\bheadcount\b|\bemployees?\b|\bworkforce\b|\bcontractors?\b',
    'funding_usd': r'\bfund(?:ing|ed)?\b|\braised\b|\binvest\w*',
}


def record_reply(c, app_id, changes, text, source_urls, attested):
    for row in c.execute("SELECT * FROM clarification_requests WHERE application_id=? AND status='pending'", (app_id,)).fetchall():
        fields = set(json.loads(row['fields_json']))
        answered = set(json.loads(row['answered_fields_json']))
        for field in fields:
            explicit = attested and field in changes
            explanation = bool(text.strip() and re.search(TERMS.get(field, r'.+'), text, re.IGNORECASE))
            if explicit or explanation or (field == 'identity' and source_urls):
                answered.add(field)
        complete = fields <= answered
        c.execute('UPDATE clarification_requests SET answered_fields_json=?,status=?,answered_at=? WHERE id=?',
            (json.dumps(sorted(answered)), 'answered' if complete else 'pending', now() if complete else None, row['id']))
        if complete:
            event(c, app_id, 'clarification_answered', 'Applicant addressed the automatic clarification; re-evaluating its conflicts.')


def route(c, app_id, fields, conflicts, checks, data, observations):
    """Return True only after the unresolved conflict has been addressed or the bounded rounds exhausted."""
    topics = set(fields)
    requests = c.execute('SELECT * FROM clarification_requests WHERE application_id=? ORDER BY rowid DESC', (app_id,)).fetchall()
    covering = next((r for r in requests if r['status'] != 'resolved' and topics <= set(json.loads(r['fields_json']))), None)
    if covering and topics <= set(json.loads(covering['answered_fields_json'])):
        c.execute("UPDATE clarification_requests SET status='answered',answered_at=COALESCE(answered_at,?) WHERE id=?", (now(), covering['id']))
        return True
    if covering is None:
        if len(requests) >= MAX_ROUNDS:
            return True
        request_id = uid()
        c.execute('INSERT INTO clarification_requests VALUES (?,?,?,?,?,?,?)',
            (request_id, app_id, json.dumps(sorted(topics)), '[]', 'pending', now(), None))
        event(c, app_id, 'clarification_requested', 'Automatically requested clarification for: ' + ', '.join(sorted(topics)))
    else:
        topics -= set(json.loads(covering['answered_fields_json']))
    lines = ['Please clarify the following differences. Company research is corroboration, not independently verified evidence.']
    for field in sorted(topics):
        values = [json.loads(e['value_json']) for e in observations if e['kind'] == 'PROVIDER_OBSERVATION' and e['field'] == field]
        if field == 'identity':
            lines.append('Company identity is ambiguous or overlaps another account. Explain the legal entity and its relationship to the submitted domain; include a supporting source link if available.')
        else:
            label = {'founding_year': 'founding year', 'headcount': 'full-time headcount', 'funding_usd': 'total funding in USD'}[field]
            detail = f' You declared {data.get(field)}; company research reported {values[-1]}.' if values else ''
            lines.append('Confirm or correct your ' + label + '.' + detail + ' Explain any difference in date, entity or definition in the explanation field.')
    lines.extend(check['reason'] for check in checks if check['status'] == 'NEEDS_INFORMATION')
    lines.append('We will automatically re-evaluate your reply. An operator is involved only if the discrepancy remains unresolved.')
    message(c, app_id, 'information_request', 'Please clarify your startup application', '\n'.join(lines))
    return False


def resolve(c, app_id):
    c.execute("UPDATE clarification_requests SET status='resolved' WHERE application_id=? AND status!='resolved'", (app_id,))


def view(c, app_id):
    rows = c.execute('SELECT * FROM clarification_requests WHERE application_id=? ORDER BY rowid', (app_id,)).fetchall()
    if not rows:
        return None
    latest = dict(rows[-1])
    latest['fields'] = json.loads(latest.pop('fields_json'))
    latest['answered_fields'] = json.loads(latest.pop('answered_fields_json'))
    latest.pop('application_id')
    return {**latest, 'round': len(rows), 'max_rounds': MAX_ROUNDS}
