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

# PATH references — the other axis of guidance rot. The 2026-07 DX audit found
# 30-35% of ~9,000 guidance lines stale, mostly paths pointing at moved or
# deleted files. Same deterministic split as symbols: a missing path WITH git
# history existed and was moved/deleted (real drift); one with no history was
# only ever illustrative (ignored).
import os
guidance = docs + [p for p in ('CLAUDE.md', 'tests/README.md') if os.path.exists(p)]
PATH_RE = re.compile(r'`((?:src|docs|tests|scripts|media|\.claude|\.rptc)/[A-Za-z0-9_./-]+)`')
path_hits = []
seen = set()
HISTORICAL = re.compile(
    r'migrated from|migration from|absorbed|the former|now gone|both directories are gone|'
    r'was deleted|retired|renamed from|replaced|used to|previously|superseded',
    re.I)
for d in guidance:
    body = re.sub(r'```.*?```', '', open(d, errors='ignore').read(), flags=re.S)
    lines = body.splitlines()
    for ref in sorted(set(PATH_RE.findall(body))):
        ref = ref.rstrip('/').split('#')[0]
        if (d, ref) in seen or os.path.exists(ref):
            continue
        # Same split the symbol check makes: a path mentioned only in
        # historically-framed sentences is record, not a live claim.
        mentions = [l for l in lines if ref in l]
        if mentions and all(HISTORICAL.search(l) for l in mentions):
            continue
        seen.add((d, ref))
        # A gitignored path (e.g. .rptc/prompt.md) is deliberately absent from
        # the tree, and referencing it is usually the point — not drift.
        if subprocess.run(['git', 'check-ignore', '-q', ref]).returncode == 0:
            continue
        n = len(subprocess.run(['git', 'log', '--oneline', '-1', '--', ref],
                               capture_output=True, text=True).stdout.splitlines())
        if n:
            path_hits.append(f'  {d}: {ref} (tracked once, now gone)')
if path_hits:
    print('[doc-drift] guidance references paths that no longer exist:')
    print('\n'.join(path_hits))
    print('  Fix the reference (the file moved or was deleted) and refresh the')
    print("  doc's Last-verified marker while you are there.")
PY
exit 0
