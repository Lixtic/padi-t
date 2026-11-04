"""POST /api/export_docx  { "title": "...", "content": "<markdown>" }  ->  .docx download

Uses the same GES layout builder as the Django app (lib/ges_docx_export.py).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
from ges_docx_export import build_ges_lesson_docx  # noqa: E402

MAX_BYTES = 300_000
DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'


def _response(start_response, status, content_type, body, extra_headers=None):
    headers = [
        ('Content-Type', content_type),
        ('Cache-Control', 'no-store'),
        ('Content-Length', str(len(body))),
    ]
    if extra_headers:
        headers.extend(extra_headers)
    start_response(status, headers)
    return [body]


def _json(start_response, status, payload):
    body = json.dumps(payload).encode('utf-8')
    return _response(start_response, str(status), 'application/json; charset=utf-8', body)


def app(environ, start_response):
    if environ.get('REQUEST_METHOD') != 'POST':
        return _response(start_response, '405 Method Not Allowed', 'text/plain; charset=utf-8', b'', [('Allow', 'POST')])

    try:
        length = int(environ.get('CONTENT_LENGTH') or 0)
    except ValueError:
        length = 0
    if length <= 0:
        return _json(start_response, 400, {'error': 'bad_request', 'message': 'Empty request.'})
    if length > MAX_BYTES:
        return _json(start_response, 413, {'error': 'too_large', 'message': 'The document is too large to export.'})

    try:
        payload = json.loads(environ['wsgi.input'].read(length).decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return _json(start_response, 400, {'error': 'bad_request', 'message': 'Invalid request.'})

    content = str(payload.get('content') or '').strip()
    title = str(payload.get('title') or 'GES Lesson Plan').strip()[:150] or 'GES Lesson Plan'
    if not content:
        return _json(start_response, 400, {'error': 'bad_request', 'message': 'There is nothing to export yet.'})

    try:
        data = build_ges_lesson_docx(
            title, content, portrait=(payload.get('layout') == 'portrait'),
            teacher=str(payload.get('teacher') or '').strip()[:80], school=str(payload.get('school') or '').strip()[:100]
        )
    except Exception as exc:  # never leak internals to the client
        print('export failed:', repr(exc), file=sys.stderr)
        return _json(start_response, 500, {'error': 'export_failed', 'message': 'Could not build the Word document.'})

    safe = re.sub(r'[^A-Za-z0-9._-]+', '_', title).strip('_')[:80] or 'GES_Lesson_Plan'
    return _response(
        start_response, '200 OK', DOCX_TYPE, data,
        [('Content-Disposition', 'attachment; filename="%s.docx"' % safe)],
    )
