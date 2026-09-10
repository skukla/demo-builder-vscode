"""Proves shell writes reach the path-keyed rules, and reads do not.

Every path-keyed rule matches on `tool_input.file_path`, which only the Write and
Edit tools carry. An agent editing through a redirect, an in-place stream editor, or
a heredoc'd python sends a Bash payload with no path at all — so for most of
2026-09-10 all fifteen routing rules were silent for the session's main editing
style. `router.sh` now extracts the paths a Bash command WRITES to and evaluates the
rules again for each: as Write when the path is new, Edit when it exists.

The false-positive half matters as much as the firing half. A plain read, a search
whose redirect targets the scratchpad, and a test run must all stay quiet; four of
the nine cases exist for that.

ONE BUG THIS FOUND, and it was the case the whole extractor exists for: `router.sh`
flattens newlines out of the command, so a heredoc arrives as a single line and a
line-anchored regex for a `p = '...'` assignment matched nothing. Everything else
passed. A proof covering only the easy shapes reports clean on the one that matters.
"""
import json
import os
import subprocess

ROOT = os.getcwd()

MARKERS = [
    ('line limit for its kind', 'god-file'),
    ('creating a NEW test file', 'test-authoring'),
    ('changing a stylesheet', 'css-baseline'),
    ('Helix / DA.live', 'eds-publish'),
    ('curated directory', 'registry-dir'),
    ('NEW script to scripts/', 'new-instrument'),
    ('creating a NEW UI component', 'reuse-first'),
]


def fired(out):
    for k, v in MARKERS:
        if k in out:
            return v
    return '-' if not out.strip() else 'other'


def run_bash(cmd):
    payload = {'tool_name': 'Bash', 'tool_input': {'command': cmd},
               'session_id': 'sw-' + os.urandom(4).hex()}
    r = subprocess.run(['bash', '.claude/hooks/router.sh'], input=json.dumps(payload),
                       capture_output=True, text=True,
                       env={**os.environ, 'CLAUDE_PROJECT_DIR': ROOT})
    return fired(r.stderr or '')


HANDLER = 'src/features/dashboard/handlers/appBuilderComponentHandlers.ts'
CSS = 'src/core/ui/styles/index.css'
HELIX = 'src/features/eds/services/helix/helixApiClient.ts'

CASES = [
    # THE BUG THIS FIXES: a 910-line handler edited through python.
    ("python3 - <<'PY'\np='" + HANDLER + "'\nopen(p,'w').write(x)\nPY", 'god-file'),
    # a stylesheet edited with an in-place sed
    ("sed -i '' 's/a/b/' " + CSS, 'css-baseline'),
    # a new test file written with a heredoc
    ("cat > tests/features/x/brandNew.test.ts <<'EOF'\nx\nEOF", 'test-authoring'),
    # a DA.live service written through python
    ('python3 -c "open(\'' + HELIX + '\',\'w\').write(1)"', 'eds-publish'),
    # a new member of a curated directory
    ("cat > tests/sop/brand-new-check.test.ts <<'EOF'\nx\nEOF", 'registry-dir'),

    # READS AND SCRATCH WRITES MUST STAY SILENT — the false-positive half.
    ('cat ' + HANDLER, '-'),
    ('grep -rn foo ' + CSS + ' > /tmp/out.txt', '-'),
    ('npx jest --no-coverage tests/sop > /tmp/j.txt 2>&1', '-'),
    ('git log --oneline -5', '-'),
]

bad = 0
for cmd, expect in CASES:
    got = run_bash(cmd)
    ok = got == expect
    bad += 0 if ok else 1
    print(f'  {"OK " if ok else "*** WRONG ***"}  expect={expect:15s} got={got:15s} '
          f'{cmd.splitlines()[0][:50]}')
print(f'\n{len(CASES) - bad}/{len(CASES)} correct')
