#!/usr/bin/env bash
# AI-surface coverage scan: which extension features can an AGENT reach?
#
# The extension's feature spine is its handler maps — every webview button
# dispatches into one, and MCP descriptors dispatch into the SAME maps. So
# coverage is computable: a handler type an agent cannot reach is a feature the
# AI surface does not have.
#
# Usage: bash .claude/skills/ai-coverage-scan/scan.sh [--list]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
python3 - "${1:-}" <<'PY'
import re, glob, os, sys, subprocess
from collections import Counter
SKILL_DIR = os.path.join('.claude', 'skills', 'ai-coverage-scan')
show_list = sys.argv[1] == '--list' if len(sys.argv) > 1 else False

# Handler keys come from handler-keys.mjs — a character-level parser that tracks
# brace depth and skips strings, template literals and comments.
#
# This replaced an in-file regex on 2026-08-16. That regex brace-matched the MAP
# correctly and then matched `^\s+key:` across the whole block, so it also
# counted object properties inside handler BODIES — `auth: context.authManager`,
# and `success`/`data`/`context`/`error` in returned objects. Measured: it
# reported 23 handlers in importHandlers where the map has 7, and inflated the
# agent-relevant gap from 68 to 83. A line-based depth counter was tried as the
# fix and failed its own control, because handler bodies span lines.
def handler_keys(path):
    out = subprocess.run(
        ['node', os.path.join(SKILL_DIR, 'handler-keys.mjs'), path],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        sys.exit(f'handler-keys.mjs failed on {path}: {out.stderr.strip()}')
    return [l.split('\t', 1)[1] for l in out.stdout.splitlines() if '\t' in l]

norm = lambda x: re.sub(r'[-_]', '', x).lower()

human = {}
for f in sorted(set(glob.glob('src/**/handlers/*.ts', recursive=True))):
    for k in handler_keys(f):
        human.setdefault(k, os.path.basename(f))

# Agent-reachable names come from BOTH descriptor rows AND directly-registered
# tools. Counting only descriptors overstates the gap by ~30 points.
agent = set()
for f in ['src/mcp-server.ts'] + glob.glob('src/features/ai/server/*.ts'):
    try: s = open(f).read()
    except OSError: continue
    agent |= set(re.findall(r"type:\s*'([a-zA-Z][a-zA-Z0-9-]*)'", s))
    agent |= set(re.findall(r"registerTool\(\s*['\"]([a-z0-9_]+)", s))
    agent |= set(re.findall(r"tool:\s*['\"]([a-z0-9_]+)['\"]", s))
    agent |= set(re.findall(r"server\.tool\(\s*['\"]([a-z0-9_]+)", s))
agentN = {norm(a) for a in agent}

covered = [t for t in human if norm(t) in agentN]
gap = sorted(t for t in human if norm(t) not in agentN)
UI = re.compile(r'^(navigate|open|show|close|select|toggle|set|focus|scroll|'
                r'dismiss|cancel|back|goto|view|expand|collapse|copy)', re.I)
ui   = [t for t in gap if UI.match(t)]
real = [t for t in gap if not UI.match(t)]

if not human:
    raise SystemExit('ABORT: found 0 handler types — the extractor is broken, not the codebase.')

print(f'UI-reachable handler types : {len(human)}')
print(f'reachable by an MCP tool   : {len(covered)}')
print(f'uncovered                  : {len(gap)}  ({len(ui)} UI-only, {len(real)} agent-relevant)')
print(f'AGENT-RELEVANT GAP         : {len(real)}  ({round(100*len(real)/len(human))}% of the surface)')
print('\nby area:')
for f, c in Counter(human[t] for t in real).most_common():
    print(f'  {c:3d}  {f}')
if show_list:
    print('\nuncovered, agent-relevant:')
    for t in real:
        print(f'  {t:36s} {human[t]}')
PY
