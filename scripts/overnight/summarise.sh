#!/usr/bin/env bash
#
# Read an overnight run's stream-json logs and say what happened, per item.
#
# `--output-format stream-json` emits one JSON object per message, so the night
# is machine-readable. This prints the shape you actually want at breakfast:
# how many turns each goal took, what the evaluator's last verdict was, and what
# landed in git — rather than 40MB of transcript.
#
set -uo pipefail
DIR="${1:?usage: summarise.sh [--keep] <overnight-log-dir>}"

# The raw stream-json is an ARTEFACT, not the record. Two runs left 8.5 MB of
# full session transcript on disk; the commits and the handoff report are what
# anybody reads afterwards. So summarising consumes the logs by default — the
# numbers below are the only part worth keeping — and `--keep` opts out when a
# run needs picking over.
KEEP=0
if [ "$DIR" = "--keep" ]; then KEEP=1; DIR="${2:?usage: summarise.sh [--keep] <dir>}"; fi

python3 - "$DIR" <<'PY'
import json, os, sys, subprocess
d = sys.argv[1]
logs = sorted(f for f in os.listdir(d) if f.endswith('.jsonl'))
if not logs:
    print('no logs in', d); sys.exit(1)

for name in logs:
    path = os.path.join(d, name)
    turns = tools = 0
    last_text = ''
    result = None
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            line = line.strip()
            if not line.startswith('{'):
                continue
            try:
                m = json.loads(line)
            except ValueError:
                continue
            t = m.get('type')
            if t == 'assistant':
                turns += 1
                for blk in (m.get('message', {}).get('content') or []):
                    if blk.get('type') == 'tool_use':
                        tools += 1
                    elif blk.get('type') == 'text' and blk.get('text', '').strip():
                        last_text = blk['text'].strip()
            elif t == 'result':
                result = m

    print('─' * 68)
    print('%-14s turns=%-4d tool-calls=%-5d' % (name.replace('.jsonl', ''), turns, tools))
    if result:
        print('   outcome   :', result.get('subtype') or result.get('is_error') and 'error' or 'ok')
        if result.get('total_cost_usd') is not None:
            print('   cost      : $%.2f' % result['total_cost_usd'])
        if result.get('num_turns') is not None:
            print('   num_turns :', result['num_turns'])
    if last_text:
        print('   last said :', ' '.join(last_text.split())[:220])

print('─' * 68)
# What actually landed. The transcript says what was attempted; git says what stuck.
out = subprocess.run(['git', 'log', '--oneline', '--since', '18 hours ago'],
                     capture_output=True, text=True).stdout.strip()
lines = [l for l in out.split('\n') if l]
print('commits in the last 18h: %d' % len(lines))
for l in lines[:25]:
    print('   ', l)
PY

if [ "$KEEP" -eq 0 ]; then
    rm -rf "$DIR"
    echo
    echo "Logs consumed. Pass --keep to retain them for picking over."
fi
