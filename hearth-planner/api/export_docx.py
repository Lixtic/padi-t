"""POST /api/export-docx  { "title": "...", "content": "<markdown>" }  ->  .docx download

Uses the same GES layout builder as the Django app (lib/ges_docx_export.py).
"""
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
from ges_docx_export import build_ges_lesson_docx  # noqa: E402

MAX_BYTES = 300_000
DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_response(405)
        self.send_header('Allow', 'POST')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return self._json(400, {'error': 'bad_request', 'message': 'Empty request.'})
        if length > MAX_BYTES:
            return self._json(413, {'error': 'too_large', 'message': 'The document is too large to export.'})

        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {'error': 'bad_request', 'message': 'Invalid request.'})

        content = str(payload.get('content') or '').strip()
        title = str(payload.get('title') or 'GES Lesson Plan').strip()[:150] or 'GES Lesson Plan'
        if not content:
            return self._json(400, {'error': 'bad_request', 'message': 'There is nothing to export yet.'})

        try:
            data = build_ges_lesson_docx(
                title, content, portrait=(payload.get('layout') == 'portrait'),
                teacher=str(payload.get('teacher') or '').strip()[:80], school=str(payload.get('school') or '').strip()[:100])
        except Exception as exc:  # never leak internals to the client
            print('export failed:', repr(exc), file=sys.stderr)
            return self._json(500, {'error': 'export_failed', 'message': 'Could not build the Word document.'})

        safe = re.sub(r'[^A-Za-z0-9._-]+', '_', title).strip('_')[:80] or 'GES_Lesson_Plan'
        self.send_response(200)
        self.send_header('Content-Type', DOCX_TYPE)
        self.send_header('Content-Disposition', 'attachment; filename="%s.docx"' % safe)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
