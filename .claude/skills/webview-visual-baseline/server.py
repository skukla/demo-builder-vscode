"""Serve the staged harness AND record every capture that runs against it.

WHY THIS EXISTS. Until 2026-09-10 neither `capture.js` nor `capture-interactions.js`
wrote anything to disk — the fingerprint came back in a tool result and vanished. So
"was a baseline captured for this CSS change?" was a question nothing could answer:
not the gate, not a pre-push check, not the agent an hour later, not the owner. On
2026-09-10 a dashboard CSS regression shipped to a release spot-check because the
interaction capture had been run and the resting one had not, and NOTHING
distinguished running half the instrument from running it.

`python3 -m http.server` cannot do this: it has no POST. The captures run inside the
browser, so they cannot touch the filesystem themselves; they POST here instead, and
this process — which runs on the host, in the repo — writes the record.

THE RECORD IS WRITTEN BY THE CAPTURE, NOT BY WHOEVER REMEMBERS TO. That is the whole
point. A step that has to be remembered is the step that was missed.

Usage (serve.sh does this):
    python3 server.py --port N --stage DIR --repo DIR --sentinel VALUE
"""
import argparse
import datetime
import functools
import http.server
import json
import os
import re
import subprocess
import sys

KINDS = ('resting', 'interaction', 'contrast')


def head_sha(repo):
    try:
        out = subprocess.run(['git', '-C', repo, 'rev-parse', 'HEAD'],
                             capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or None
    except Exception:
        return None


def dirty_paths(repo):
    """Which files are modified right now — the change the capture is evidence about."""
    try:
        out = subprocess.run(['git', '-C', repo, 'status', '--porcelain'],
                             capture_output=True, text=True, timeout=10)
        return [line[3:] for line in out.stdout.splitlines() if line[3:]]
    except Exception:
        return []


class Handler(http.server.SimpleHTTPRequestHandler):
    # set by main()
    repo = None
    sentinel = None
    records_dir = None

    def log_message(self, *a):  # keep the harness quiet, as http.server was
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        # The page is same-origin, but the MCP browser sometimes preflights.
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def _read_records(self):
        out = []
        if not os.path.isdir(self.records_dir):
            return out
        for name in sorted(os.listdir(self.records_dir)):
            if not name.endswith('.json'):
                continue
            try:
                with open(os.path.join(self.records_dir, name), encoding='utf-8') as fh:
                    out.append(json.load(fh))
            except Exception:
                continue
        return out

    def do_OPTIONS(self):
        self._json(204, {})

    def do_GET(self):
        if self.path.split('?')[0] == '/records.json':
            recs = [r for r in self._read_records() if r.get('sentinel') == self.sentinel]
            self._json(200, {
                'sentinel': self.sentinel,
                'kinds': sorted({r.get('kind') for r in recs if r.get('kind')}),
                'records': recs,
            })
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/record':
            self._json(404, {'error': 'only POST /record is accepted'})
            return

        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > 8 * 1024 * 1024:
            self._json(413, {'error': f'bad Content-Length {length}'})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception as exc:
            self._json(400, {'error': f'unparseable body: {exc}'})
            return

        # The sentinel is checked HERE too, not only in the capture. A record
        # written against someone else's harness would be worse than no record.
        if payload.get('sentinel') != self.sentinel:
            self._json(403, {'error': 'sentinel mismatch — this is not your harness'})
            return

        kind = payload.get('kind')
        if kind not in KINDS:
            self._json(400, {'error': f'kind must be one of {KINDS}, got {kind!r}'})
            return

        stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S')
        # The filename is built HERE, never from the client. Nothing a page sends
        # can choose a path.
        safe = re.sub(r'[^A-Za-z0-9_.-]', '', f'{kind}-{stamp}')
        os.makedirs(self.records_dir, exist_ok=True)
        path = os.path.join(self.records_dir, safe + '.json')

        record = {
            'kind': kind,
            'sentinel': self.sentinel,
            'capturedAt': datetime.datetime.now().astimezone().isoformat(),
            'sha': head_sha(self.repo),
            'dirtyPaths': dirty_paths(self.repo),
            'surfaces': payload.get('surfaces') or [],
            'themes': payload.get('themes') or [],
            'widths': payload.get('widths') or [],
            'cells': payload.get('cells'),
            'elements': payload.get('elements'),
            'note': payload.get('note'),
        }
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(record, fh, indent=4)
            fh.write('\n')

        self._json(200, {'recorded': os.path.relpath(path, self.repo), 'kind': kind})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, required=True)
    ap.add_argument('--stage', required=True)
    ap.add_argument('--repo', required=True)
    ap.add_argument('--sentinel', required=True)
    args = ap.parse_args()

    Handler.repo = os.path.abspath(args.repo)
    Handler.sentinel = args.sentinel
    Handler.records_dir = os.path.join(Handler.repo, 'reports', 'visual-baseline')

    handler = functools.partial(Handler, directory=os.path.abspath(args.stage))
    httpd = http.server.ThreadingHTTPServer(('', args.port), handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    sys.exit(main())
