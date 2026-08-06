#!/usr/bin/env bash
#
# scan.sh — shortlist dead / abandoned code under ROOT. Two labelled sections:
#   1. Unused exports (via `npx ts-prune`, filtered to ROOT). A `(used in module)`
#      suffix means the symbol is referenced internally but never imported elsewhere
#      — a candidate to un-export, not necessarily to delete.
#   2. Abandonment markers — comments/identifiers that self-declare code as obsolete
#      (deprecated, legacy, superseded, "to be removed", …). Tests are excluded.
#
# Signal only, not a verdict: ts-prune reports entry points (extension.ts,
# mcp-server.ts), dynamic-import / DI-registered / config-registered symbols as
# "unused" though they are live. Triage each per SKILL.md before deleting.
#
# Usage: bash scan.sh [ROOT=src]

set -uo pipefail
ROOT="${1:-src}"

echo "== Unused exports (ts-prune, filtered to ${ROOT}/) =="
npx ts-prune 2>/dev/null | grep -E "^${ROOT}/" || echo "  (none)"
echo

echo "== Abandonment markers (deprecated / legacy / superseded / to be removed) =="
grep -rniE '\b(deprecated|superseded|legacy|obsolete|no longer used|dead code|to be removed|kept for now)\b' \
    "$ROOT" --include='*.ts' --include='*.tsx' \
    | grep -vE '\.(test|spec)\.tsx?:' \
    || echo "  (none)"

echo
echo "== Doc drift: comments and docs naming symbols that no longer exist =="
# Existence, not reachability — a one-way check with no reference loop to defeat it.
#
# Covers COMMENTS in .ts/.tsx as well as .md, and every CamelCase symbol rather than
# only `handle*`. The narrower earlier version reported "(none)" against a tree
# carrying ~89 real stale references, because comment drift and component/class names
# both fell outside what it looked at (2026-08-06).
#
# Three sets:
#   ever    — every symbol ever DEFINED under ROOT, from one pass over git history
#             (~0.7s; a per-name `git log -G` was ~40min and is why this is inverted)
#   present — every identifier appearing in non-comment code today. Deliberately
#             weaker than "is exported": class methods, re-exports and object
#             properties all count. Using the export list here flagged live methods
#             like getCurrentProject as deleted.
#   gone    — ever - present, restricted to distinctive names (>=2 internal capitals
#             or handle*), which drops prose words like "Handler" and "Button".
#
# Output splits present-tense claims from historically-framed ones ("the former X",
# "replaces X"). Only the first group is drift; the second is accurate history.
# Code fences, CHANGELOG, research/complete and ADRs are skipped: examples and
# point-in-time records, not claims about code that exists now.
python3 - "$ROOT" <<'PY'
import re, glob, subprocess, sys
root = sys.argv[1]
DEF = r'(export (async )?(function|const|class|interface|type)|function|class)'

# Capture the DEFINED NAME, not the last token of the line: `+export function
# foo(a) {` ends in `{`, and a bare `l.split()[-1]` silently harvested that.
NAME = re.compile(r'^\+ *' + DEF + r' ([A-Za-z_][A-Za-z0-9_]*)')
ever = set()
for l in subprocess.run(
        ['git','log','--all','-p','--unified=0','--diff-filter=AM','--',f'{root}/*.ts',f'{root}/*.tsx'],
        capture_output=True, text=True).stdout.splitlines():
    m = NAME.match(l)
    if m:
        ever.add(m.group(m.lastindex))
# Component files export a symbol named for the file — count historical BASENAMES.
# Keeping full paths here made every doc that cites a path look like stale drift.
# Split on the FIRST dot, not the last: `AdobeProjectStep.refactored.tsx` must
# yield `AdobeProjectStep`, and stripping only the extension left the remnant.
ever |= {n.rsplit('/', 1)[-1].split('.')[0] for n in subprocess.run(
    ['git','log','--all','--diff-filter=A','--name-only','--format=','--',f'{root}/*.ts',f'{root}/*.tsx'],
    capture_output=True, text=True).stdout.split()
    if n.endswith(('.ts','.tsx'))}

src = glob.glob(f'{root}/**/*.ts', recursive=True) + glob.glob(f'{root}/**/*.tsx', recursive=True)
present = set()
for f in src:
    body = open(f, errors='ignore').read()
    present |= set(re.findall(r'\b[A-Za-z_][A-Za-z0-9_]{3,}\b',
                              re.sub(r'//[^\n]*|/\*.*?\*/', '', body, flags=re.S)))
    present.add(f.split('/')[-1].rsplit('.',1)[0])

def distinctive(n):
    return n.startswith('handle') or sum(1 for c in n[1:] if c.isupper()) >= 2
gone = {n for n in ever if n not in present and distinctive(n)}

# CONTROL (SKILL.md step 0). Three checks, because each catches a break the others
# cannot see — every one of them corresponds to a bug this script actually shipped:
#  - negative: live symbols must not flag. A broken `present` floods the output
#    (defining "present" as the export list flagged live class methods).
#  - positive: a synthetic deleted symbol must flag. A broken `gone` silently
#    reports "(none)" — how the earlier version hid ~89 real findings.
#  - shape: `ever` must hold bare identifiers. Harvesting whole diff lines or full
#    paths produced entries like `src/features/.../foo` and `registerProjectTools(`,
#    which the other two checks pass straight through, since neither ever inspects
#    what an entry LOOKS like.
live = sorted(n for n in present if distinctive(n) and n in ever)[:300]
leaked = [n for n in live if n in gone]
SENTINEL = 'ScanSelfTestDeletedSymbol'
positive_ok = SENTINEL in {n for n in (ever | {SENTINEL}) if n not in present and distinctive(n)}
# Hyphens are legal: `ever` holds file basenames (mcp-proxy) as well as identifiers.
# What must never appear is a path separator, a call paren, or a dotted remnant —
# the three shapes that harvesting bugs produced.
malformed = sorted(n for n in ever if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]*', n))[:5]
if leaked or not positive_ok or malformed:
    print('  *** CONTROL FAILED — output below is noise, do not act on it ***')
    if leaked:          print(f'      live symbols flagged as deleted: {leaked[:5]}')
    if not positive_ok: print('      the check cannot flag a known-deleted symbol')
    if malformed:       print(f'      non-identifier entries harvested: {malformed}')

docs = [d for d in glob.glob(f'{root}/**/*.md', recursive=True) + glob.glob('docs/**/*.md', recursive=True)
        if not any(x in d for x in ('/research/', '/complete/', '/adr/', 'CHANGELOG'))]
HIST = re.compile(r'\b(former|formerly|renamed|was |used to|previously|supersedes?|superseded|'
                  r'replaces?|replaced|re-homed|retired|extracted from|split from|moved from|'
                  r'inlined from|old |no longer|deleted|removed|until )\b', re.I)
RX = re.compile(r'\b(' + '|'.join(map(re.escape, sorted(gone, key=len, reverse=True))) + r')\b') if gone else None

live_hits, hist_hits = [], []
if RX:
    for f in src:
        for i, line in enumerate(open(f, errors='ignore').read().split('\n'), 1):
            if not re.match(r'\s*(//|\*|/\*)', line):
                continue
            m = RX.search(line)
            if m:
                (hist_hits if HIST.search(line) else live_hits).append((f, i, m.group(1)))
    for d in docs:
        body = re.sub(r'```.*?```', '', open(d, errors='ignore').read(), flags=re.S)
        for i, line in enumerate(body.split('\n'), 1):
            m = RX.search(line)
            if m:
                (hist_hits if HIST.search(line) else live_hits).append((d, i, m.group(1)))

if live_hits:
    for f, i, n in sorted(live_hits):
        print(f'  {f}:{i} — {n} (defined once under {root}/, absent now)')
else:
    print('  (none)')
if hist_hits:
    print(f'  … plus {len(hist_hits)} historically-framed mention(s) — accurate history, not drift')
PY
