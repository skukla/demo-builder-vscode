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
import re, glob, os, sys
from collections import Counter
show_list = sys.argv[1] == '--list' if len(sys.argv) > 1 else False

def blocks(s):
    """Body of every `export const X = defineHandlers({...})`, brace-matched."""
    for m in re.finditer(r'export const (\w+) = defineHandlers\(\{', s):
        st = m.end() - 1; d = 0
        for i, ch in enumerate(s[st:], st):
            if ch == '{': d += 1
            elif ch == '}':
                d -= 1
                if d == 0:
                    yield s[st:i]; break

# Handler keys use BOTH conventions: unquoted camelCase and quoted kebab-case.
# Matching only one silently halves the count.
KEY = re.compile(r"^\s+(?:'([a-z][a-zA-Z0-9-]*)'|([a-z][a-zA-Z0-9]*))\s*:", re.M)
norm = lambda x: re.sub(r'[-_]', '', x).lower()

human = {}
for f in sorted(set(glob.glob('src/**/handlers/*.ts', recursive=True))):
    for blk in blocks(open(f).read()):
        for m in KEY.finditer(blk):
            human.setdefault(m.group(1) or m.group(2), os.path.basename(f))

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
