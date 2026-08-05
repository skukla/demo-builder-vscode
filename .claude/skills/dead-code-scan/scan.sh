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
echo "== Doc drift: docs naming symbols that no longer exist =="
# Existence, not reachability — a one-way check with no reference loop to defeat
# it. `git log -S` then splits the two classes deterministically: a symbol with
# commit history under src/ once existed and was deleted (real drift), while zero
# history means it was only ever illustrative or aspirational (ignore).
# Code fences, CHANGELOG, research/complete and ADRs are skipped: examples and
# point-in-time records, not claims about code that exists now.
python3 - "$ROOT" <<'PY'
import re, glob, subprocess, sys
root = sys.argv[1]
docs = [d for d in glob.glob(f'{root}/**/*.md', recursive=True) + glob.glob('docs/**/*.md', recursive=True)
        if not any(x in d for x in ('/research/', '/complete/', '/adr/', 'CHANGELOG'))]
defined = {l.split()[-1] for l in subprocess.run(
    ['grep','-rhoE','(export (async )?function|export const) [A-Za-z_][A-Za-z0-9_]*',
     root,'--include=*.ts','--include=*.tsx'], capture_output=True, text=True).stdout.splitlines()}
found = False
for d in docs:
    body = re.sub(r'```.*?```', '', open(d, errors='ignore').read(), flags=re.S)
    for name in sorted(set(re.findall(r'`(handle[A-Z][A-Za-z0-9]*)`', body))):
        if name in defined:
            continue
        n = len(subprocess.run(['git','log','--oneline','-S',name,'--',root],
                               capture_output=True, text=True).stdout.splitlines())
        if n:
            print(f'  {d}: {name} — existed in {n} commit(s), now gone')
            found = True
if not found:
    print('  (none)')
PY
