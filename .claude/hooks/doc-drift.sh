#!/usr/bin/env bash
# Stop hook — flag docs that NAME a symbol which no longer exists.
#
# Why automatic: this is the one half of dead-code detection that mechanizes
# cleanly. "Does this thing the docs name still exist?" is a one-way check —
# nothing can fake a definition into being — unlike "does anything REACH this?",
# where dead code references dead code and defeats any pattern match.
#
# Why a hook and not a skill: the scans are pull-only and depend on someone
# remembering to look, which is the failure this repo already named in
# rules/30-reuse-first.rule. On 2026-08-05 a doc claimed the AI surface's "Refresh"
# action called `inspect-mcp`; there is no Refresh action, and that stale sentence
# was the strongest argument for KEEPING dead code. Docs that lie outlive the code
# they describe.
#
# `git log -S` splits the two classes deterministically: commit history under src/
# means the symbol existed and was deleted (real drift); zero history means it was
# only ever an illustrative example (ignore). Validated at 7 hits, all genuine.
#
# Advisory (always exits 0) and silent when clean — ~0.3s. Blocking would be wrong:
# a stale doc is worth fixing, never worth halting on.
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$DIR" || exit 0

# Only when this turn touched code or docs — no point scanning after a config edit.
changed=$( { git diff --name-only --diff-filter=ACMRD; git diff --cached --name-only --diff-filter=ACMRD; } 2>/dev/null \
  | grep -E '\.(ts|tsx|md)$' | head -1 )
[ -z "$changed" ] && exit 0

python3 - <<'PY'
import re, glob, subprocess
docs = [d for d in glob.glob('src/**/*.md', recursive=True) + glob.glob('docs/**/*.md', recursive=True)
        if not any(x in d for x in ('/research/', '/complete/', '/adr/', 'CHANGELOG'))]
defined = {l.split()[-1] for l in subprocess.run(
    ['grep', '-rhoE', '(export (async )?function|export const) [A-Za-z_][A-Za-z0-9_]*',
     'src', '--include=*.ts', '--include=*.tsx'], capture_output=True, text=True).stdout.splitlines()}

hits = []
for d in docs:
    body = re.sub(r'```.*?```', '', open(d, errors='ignore').read(), flags=re.S)
    for name in sorted(set(re.findall(r'`(handle[A-Z][A-Za-z0-9]*)`', body))):
        if name in defined:
            continue
        n = len(subprocess.run(['git', 'log', '--oneline', '-S', name, '--', 'src'],
                               capture_output=True, text=True).stdout.splitlines())
        if n:
            hits.append(f'  {d}: {name} (existed in {n} commit(s), now gone)')
if hits:
    print('[doc-drift] docs name symbols that no longer exist:')
    print('\n'.join(hits))
    print('  Fix the doc or restore the symbol — a doc describing absent code is how')
    print('  deleted things come back.')
PY
exit 0
