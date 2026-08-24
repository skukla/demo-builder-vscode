#!/usr/bin/env bash
# AI-surface coverage scan: which extension features can an AGENT reach?
#
# The extension's feature spine is its handler maps — every webview button
# dispatches into one, and MCP descriptors dispatch into the SAME maps. So
# coverage is computable: a handler type an agent cannot reach is a feature the
# AI surface does not have.
#
# Handler keys come from `handler-keys.mjs`, NOT from a regex over the map body.
# This script used to run its own inline regex that matched any indented
# `key:` inside the brace-matched block, so nested option objects and returned
# literals counted as handlers: `importHandlers` reported ~30 keys — `context`,
# `success`, `data`, `begin`, `code` — where the map has 7. That inflation is
# the exact failure `handler-keys.mjs` was written to fix, and it shipped
# alongside the broken regex without ever being wired in (found 2026-08-24).
# Every figure taken before that date is inflated; re-measure before citing.
#
# Usage: bash .claude/skills/ai-coverage-scan/scan.sh [--list]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Fail loudly if the extractor itself is broken — a scan built on a broken
# extractor reports a clean-looking number.
node .claude/skills/ai-coverage-scan/handler-keys.mjs --self-test >/dev/null

# file<TAB>key for every top-level handler-map key in the repo.
node .claude/skills/ai-coverage-scan/handler-keys.mjs \
    $(find src -path '*/handlers/*.ts' -not -name '*.test.ts' | sort) \
    > /tmp/ai-coverage-keys.tsv

python3 - "${1:-}" <<'PY'
import re, glob, os, sys
from collections import Counter
show_list = sys.argv[1] == '--list' if len(sys.argv) > 1 else False

norm = lambda x: re.sub(r'[-_]', '', x).lower()

# ── The human surface: top-level handler-map keys (from handler-keys.mjs) ─────
human = {}
with open('/tmp/ai-coverage-keys.tsv') as fh:
    for line in fh:
        line = line.rstrip('\n')
        if not line:
            continue
        path, key = line.split('\t', 1)
        human.setdefault(key, os.path.basename(path))

# ── The agent surface: descriptor rows AND directly-registered tools ──────────
# Counting only descriptors overstates the gap by ~30 points.
agent = set()
for f in ['src/mcp-server.ts'] + glob.glob('src/features/ai/server/*.ts'):
    try:
        s = open(f).read()
    except OSError:
        continue
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

# Controls — a broken step must abort, not report a tidy zero.
if not human:
    raise SystemExit('ABORT: found 0 handler types — the extractor is broken, not the codebase.')
if not agent:
    raise SystemExit('ABORT: found 0 agent tools — the tool scan is broken, not the surface.')

print(f'UI-reachable handler types : {len(human)}')
print(f'reachable by an MCP tool   : {len(covered)}')
print(f'uncovered                  : {len(gap)}  ({len(ui)} UI-only, {len(real)} agent-relevant)')
print(f'AGENT-RELEVANT GAP         : {len(real)}  ({round(100*len(real)/len(human))}% of the surface)')
print(f'\ncontrol: {len(human)} map keys read from handler-keys.mjs, {len(agent)} agent tool names found')
print('\nby area:')
for f, c in Counter(human[t] for t in real).most_common():
    print(f'  {c:3d}  {f}')
if show_list:
    print('\nuncovered, agent-relevant:')
    for t in real:
        print(f'  {t:36s} {human[t]}')
PY
