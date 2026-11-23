#!/usr/bin/env bash
#
# scan.sh — find rot in the RPTC record itself: the backlog index, where plans live,
# and citations that name a file:line. Seven labelled sections:
#
#   1. Backlog index → disk    — links that do not resolve.
#   2. Disk → backlog index    — items with no `####` entry (the direction a
#                                dead-link check structurally cannot see).
#   3. Shipped plans still in plans/ — an overview claiming SHIPPED/COMPLETE while
#                                sitting in the active directory, and backlog items
#                                whose banner says they are done.
#   4. Citations                — `path/file.ts:NN` where the file is gone or NN is
#                                past its end. LIVE surfaces only: research/, dream/
#                                and complete/ are dated records of what was true when
#                                written, and rewriting them would falsify the record
#                                rather than fix a link.
#   5. Done work still live     — a live item whose body says it is done, or whose twin
#                                is already in complete/.
#   6. Code moved               — items citing a file:line whose code changed after the
#                                item was last updated.
#   7. Leftovers                — finished items whose own body still names work.
#
# Each section reads its files in one process (PL-109): the scan took 18 s when it
# started a process per file, and the pipeline's turn-end check stops it at 45.
#
# Signal only, not a verdict. §3 in particular needs a human: "claims shipped" and
# "is shipped" are different, and only a person should move a plan. Triage per SKILL.md.
#
# Every section ends with a CONTROL line proving the check ran, because "(none)" from
# a check that never executed reads exactly like a clean result — the failure this
# repo's CLAUDE.md names for `|| echo "none"`.
#
# Usage: bash scan.sh [RPTC_DIR=.rptc]

set -uo pipefail
RPTC="${1:-.rptc}"
BACKLOG="$RPTC/backlog"

# ── 1 + 2. The backlog index, both directions ────────────────────────────────
python3 - "$BACKLOG" <<'PY'
import os, re, sys
d = sys.argv[1]
readme = os.path.join(d, 'README.md')
if not os.path.exists(readme):
    print(f"== Backlog index ==\n  (no {readme}) "); raise SystemExit

s = open(readme, encoding='utf-8').read()
links = [l for l in re.findall(r'\]\(([^)]+)\)', s) if not l.startswith(('http', '#'))]

print("== 1. Backlog index -> disk (links that do not resolve) ==")
dead = [l for l in links if not os.path.exists(os.path.join(d, l))]
for l in dead:
    print(f"  DEAD  {l}")
if not dead:
    print("  (none)")
probe = links + ['__control_missing__.md']
n = len([l for l in probe if not os.path.exists(os.path.join(d, l))])
print(f"  control: {len(links)} links checked; injecting one broken link yields {n} dead "
      f"({'OK' if n == len(dead) + 1 else 'CHECK BROKEN'})")
print()

print("== 2. Disk -> backlog index (items with no #### entry) ==")
# A #### heading's own links are what make an item findable. A mention buried in
# another entry's prose is a sub-slice, not an item — those are reported separately.
entry, prose = set(), set()
for line in s.split('\n'):
    targets = {l.split('/')[0] for l in re.findall(r'\]\(([^)]+)\)', line)}
    (entry if line.startswith('#### ') else prose).update(targets)

items = {f for f in os.listdir(d) if f != 'README.md'}
orphan = sorted(items - entry - prose)
slices = sorted((items & prose) - entry)
for f in orphan:
    print(f"  UNINDEXED  {f}")
if not orphan:
    print("  (none)")
for f in slices:
    print(f"  sub-slice  {f}  (linked inside another entry, not its own item — usually fine)")
n = len(sorted((items | {'__control_ghost__'}) - entry - prose))
print(f"  control: {len(items)} items checked; adding a phantom yields {n} unindexed "
      f"({'OK' if n == len(orphan) + 1 else 'CHECK BROKEN'})")
PY
echo

# ── 3. Plans that say they shipped but still sit in plans/ ───────────────────
echo "== 3. Plans claiming SHIPPED/COMPLETE while still in plans/ =="
# One python pass over every file (PL-109): the loop it replaced started a head and a
# grep per backlog file, about 900 processes, which is most of why the scan took 18 s and
# the pipeline's turn-end check (45 s limit) could stop it whole.
python3 - "$RPTC" <<'PY'
import glob, os, re, sys

rptc = sys.argv[1]

# Print the line that ACTUALLY triggered it, not a looser re-search. The evidence used
# to be the first loose `shipped|complete` match anywhere in the file, so a plan flagged
# on a `**SHIPPED**` heading at line 251 was reported with prose from line 18 that merely
# contained the word "completely". The finding was right and the evidence pointed
# somewhere else, which costs more time than no evidence would.
PLAN = re.compile(r'^\s*(\*\*)?(status|state)(\*\*)?:?.{0,40}(shipped|complete)|^\*\*shipped', re.I)
found = 0
for name in ('overview.md', 'HANDOFF.md'):
    for ov in sorted(glob.glob(os.path.join(rptc, 'plans', '*', name))):
        lines = open(ov, encoding='utf-8', errors='ignore').read().split('\n')
        hit = next((i for i, line in enumerate(lines) if PLAN.search(line)), None)
        if hit is None:
            continue
        print(f"  CLAIMS SHIPPED  {os.path.dirname(ov)}")
        print(f"      {f'{hit + 1}:{lines[hit]}'[:96]}")
        found += 1
if not found:
    print("  (none)")
print(f"  control: {len(glob.glob(os.path.join(rptc, 'plans', '*', '')))} plan dirs scanned")

# Same question aimed at backlog/, which nothing asked until 2026-08-13. Five items there
# declared themselves SHIPPED / LANDED / IMPLEMENTED / RETIRED — one for over a month —
# and the user found them by opening the folder, not by any check. A backlog entry that
# says it is finished is not a backlog entry.
#
# Deliberately stricter than the plans pass above: it anchors on a marker in the first 12
# lines (a status banner), NOT anywhere in the body. Items routinely say "Layer 1 ✅" about
# a sub-part while remaining live, and reporting those would bury the real hits.
print("  -- backlog items declaring themselves finished --")
DONE = re.compile(r'(✅|❌).{0,40}(shipped|landed|implemented|retired|complete|discharged)'
                  r'|^\s*>?\s*\*\*(status|state)\*\*:?\s*(✅|shipped|complete|retired)', re.I)
EVIDENCE = re.compile(r'✅|❌|shipped|landed|implemented|retired', re.I)
backlog = os.path.join(rptc, 'backlog')
files = sorted(glob.glob(os.path.join(backlog, '*.md'))) + sorted(glob.glob(os.path.join(backlog, '*', 'overview.md')))
bfound = 0
for it in files:
    if it.endswith('/README.md'):
        continue
    head = open(it, encoding='utf-8', errors='ignore').read().split('\n')[:12]
    if not any(DONE.search(line) for line in head):
        continue
    print(f"  DECLARES DONE  {os.path.relpath(it, backlog)}")
    # A banner that says only "complete" matches DONE and not EVIDENCE: no evidence line
    # then, as the grep it replaced printed none, rather than stopping the section.
    evidence = next((line for line in head if EVIDENCE.search(line)), None)
    if evidence is not None:
        print(f"      {evidence[:92]}")
    bfound += 1
if not bfound:
    print("  (none)")
print(f"  control: {len([f for f in glob.glob(os.path.join(backlog, '*.md')) if 'README' not in f])} backlog files scanned")
PY
echo

# ── 4. file:line citations ───────────────────────────────────────────────────
echo "== 4. Citations naming a file:line that cannot resolve =="
python3 - "$RPTC" <<'PY'
import os, re, sys
roots = [os.path.join(sys.argv[1], 'backlog'), os.path.join(sys.argv[1], 'plans'),
         'docs', '.claude/skills']
# The lookbehind, not \b: `/` IS a word boundary, so `\bsrc/` matched the TAIL of
# `node_modules/@stryker-mutator/jest-runner/dist/src/jest-test-runner.js:67` and
# reported a vendor file as a missing repo file. Expanding the citation to its full
# path made it worse — one false hit became three. A citation must START at a
# non-path character to be a citation into this repo.
pat = re.compile(r'(?<![\w./-])((?:src|tests|scripts)/[\w./-]+\.(?:ts|tsx|js|mjs|css)):(\d+)\b')
# Skill docs illustrate with placeholder paths (src/a/foo.ts, src/features/x/old.ts).
# Reporting a scan's own examples trains people to ignore it.
PLACEHOLDER = re.compile(r'/(foo|bar|baz|qux|old|new|thing|example)\.[a-z]+$|/[a-z]/')

checked = bad = 0
for root in roots:
    if not os.path.isdir(root):
        continue
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith('.md'):
                continue
            p = os.path.join(dirpath, f)
            for m in pat.finditer(open(p, encoding='utf-8', errors='ignore').read()):
                target, line = m.group(1), int(m.group(2))
                if PLACEHOLDER.search(target):
                    continue
                checked += 1
                if not os.path.exists(target):
                    print(f"  GONE       {target}:{line}   (cited in {p})"); bad += 1
                else:
                    n = sum(1 for _ in open(target, encoding='utf-8', errors='ignore'))
                    if line > n:
                        print(f"  PAST END   {target}:{line} (file has {n} lines, in {p})"); bad += 1
if not bad:
    print("  (none)")
print(f"  control: {checked} file:line citations checked "
      f"({'OK' if checked else 'CHECK BROKEN — pattern matched nothing'})")
PY

echo
echo "== 5. Done work still registered as live (status vs body vs archive) =="
# Rewritten 2026-08-27 (PL-7): the old parser read the README's hand-written
# '#### ' entries, a format `backlog.mjs sync` retired — it parsed ZERO active
# entries and its own control said CHECK BROKEN. One tool, one parse, one
# truth: this now consumes `backlog.mjs list --json`, the same read every
# other consumer uses, and inspects item BODIES the CLI deliberately does not.
python3 - "$RPTC" <<'PY'
import json, os, re, subprocess, sys

rptc = os.path.abspath(sys.argv[1])
repo = os.path.dirname(rptc)
# The backlog CLI is the dev-pipeline plugin's; the installer records its folder in
# this clone's git config.
root = subprocess.run(['git', '-C', repo, 'config', '--get', 'dev-pipeline.root'],
                      capture_output=True, text=True).stdout.strip()
cli = os.path.join(root, 'lib', 'backlog.mjs')
try:
    raw = subprocess.run(['node', cli, 'list', '--json'], capture_output=True,
                         text=True, timeout=30, cwd=repo)
    items = json.loads(raw.stdout)
except Exception as exc:  # noqa: BLE001 - a broken read must say so, not pass
    print(f"  control: 0 items read  ⚠️  CHECK BROKEN — {exc}")
    raise SystemExit(0)

TERMINAL = {'shipped', 'dropped', 'superseded'}
live = [i for i in items if i.get('status') not in TERMINAL]

complete_names = set()
cdir = os.path.join(rptc, 'complete')
if os.path.isdir(cdir):
    complete_names = {n[:-3] if n.endswith('.md') else n for n in os.listdir(cdir)}

flagged = 0

# ── Signal 1: BODY TOMBSTONE ───────────────────────────────────────────────
# A LIVE-status item whose body announces its own completion. The prose says
# done; the frontmatter still files it as work-to-do — the exact rot the old
# README check watched, relocated to where truth now lives. Only unambiguous
# announcements count: a '## Shipped so far' log line is progress, and a
# SUB-section marked SHIPPED is one slice of a multi-part item landing (the
# first live run flagged AI-1e's "## 1. … — SHIPPED" candidate this way), so
# only the H1 TITLE line and standalone status lines are signals.
DONE_RE = re.compile(r'^# .*\b(SHIPPED|RESOLVED|SUPERSEDED)\b|^(SHIPPED|RESOLVED)\b',
                     re.MULTILINE)
for item in live:
    path = os.path.join(repo, item['path'])
    try:
        body = open(path, encoding='utf-8').read()
    except OSError:
        continue
    body = body.split('---', 2)[-1]          # skip frontmatter
    hit = DONE_RE.search(body)
    if hit:
        print(f"  BODY TOMBSTONE  {item['id']:>7}  {item['title'][:70]}")
        print(f"                  status={item['status']} but the body says "
              f"\"{hit.group(0).strip()[:50]}\" — set a terminal status or fix the prose")
        flagged += 1

# ── Signal 2: ARCHIVED TWIN ────────────────────────────────────────────────
# A LIVE-status item whose basename also exists under complete/ — it shipped
# and was archived, and only the backlog copy still claims to be work.
for item in live:
    base = os.path.basename(item['path'])
    base = base[:-3] if base.endswith('.md') else base
    if base in complete_names:
        print(f"  ARCHIVED TWIN   {item['id']:>7}  {item['title'][:70]}")
        print(f"                  complete/{base} exists while status={item['status']}")
        flagged += 1

if not flagged:
    print("  (none)")

# CONTROL. Either half can silently do nothing: zero live items makes signal 1
# vacuous, an empty complete/ makes signal 2 vacuous — and both print "(none)"
# exactly like a clean record.
broken = []
if not live:
    broken.append("no live items parsed")
if not complete_names:
    broken.append("complete/ is empty or missing")
print(f"  control: {len(live)} live item(s) of {len(items)} scanned against "
      f"{len(complete_names)} archived item(s)"
      + (f"  ⚠️  CHECK BROKEN — {'; '.join(broken)}" if broken else ""))
PY


echo "== 6. Items citing a file:line whose CODE moved after the item was last updated =="
python3 - "$RPTC" <<'PY'
import os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

rptc = sys.argv[1]
backlog = os.path.join(rptc, 'backlog')
if not os.path.isdir(backlog):
    print("  (no backlog dir)"); raise SystemExit(0)

def git(*args):
    try:
        r = subprocess.run(['git', *args], capture_output=True, text=True, timeout=15)
        return r.stdout.strip() if r.returncode == 0 else ''
    except Exception:
        return ''

# LINE-NUMBERED citations only. A bare filename is background reference; a
# `file.ts:NN` is a specific claim about specific code, and it is the claim that
# goes stale. Restricting to these is what keeps the section actionable — the
# unrestricted version flagged 17 of 35 items, most of them old entries naming
# hot files, which is drift rather than staleness.
CITE_RE = re.compile(r'\b([A-Za-z0-9_/.-]+?\.(?:ts|tsx|json)):\d+')

# Bare filenames are the COMMON citation style ("`deleteHandler.ts:29-33`"), not
# the exception — an earlier draft required a src/ prefix and missed the one item
# already known to be stale. Resolve them, but only when unambiguous: two files
# with the same basename means we cannot tell which was meant, and guessing would
# manufacture findings.
bare_index = {}
for dirpath, dirnames, files in os.walk('src'):
    dirnames[:] = [d for d in dirnames if d != 'node_modules']
    for f in files:
        bare_index.setdefault(f, []).append(os.path.join(dirpath, f))

def resolve(cite):
    if os.path.exists(cite):
        return cite
    hits = bare_index.get(os.path.basename(cite), [])
    return hits[0] if len(hits) == 1 else None

items = sorted(f for f in os.listdir(backlog) if f.endswith('.md') and f != 'README.md')
scanned = cited_total = flagged = 0
findings = []

# Every item's last commit from ONE git call, not one per item (PL-109: about 440
# processes, most of the scan's 18 s). `--cc` lists a merge's files when it differs from
# every parent, which is when a one-path `git log` shows the merge too; without it a merge
# that last touched an item was missed. The output matched the old per-item calls line for
# line on 2026-11-23's tree. A folder log simplifies history over the whole folder, so a
# merge where an item matches both parents but the folder matches only one could give a
# different last-touched time; none was found, and the old calls are one git log each.
def commit_times(folder):
    """Each file's commit times, newest first, keyed by its path under the folder."""
    times = {}
    # The folder, not each file by name: git takes 2.5 s to match 440 names and 0.1 s
    # to walk the folder. Run from inside it, and key by the path under the folder (git
    # prints repo-root paths, and the folder's own prefix comes off), so RPTC_DIR can be
    # given in any form. Unquoted, so an unusual name still matches. Not --relative: with
    # --cc it stopped listing the merge that last touched one item.
    prefix = git('-C', folder, 'rev-parse', '--show-prefix')
    out = git('-C', folder, '-c', 'core.quotePath=false', 'log', '--cc',
              '--format=%x00%ct', '--name-only', '--', '.')
    stamp = None
    for line in out.split('\n'):
        if line.startswith('\x00'):
            stamp = int(line[1:])
        elif line.strip().startswith(prefix) and stamp is not None:
            times.setdefault(line.strip()[len(prefix):], []).append(stamp)
    return times

item_paths = {os.path.join(backlog, name): name for name in items}
item_times = commit_times(backlog)
cited = {}
for path, name in item_paths.items():
    if not item_times.get(name):
        continue
    text = open(path, encoding='utf-8', errors='ignore').read()
    cited[name] = sorted({r for r in (resolve(c) for c in CITE_RE.findall(text)) if r})
# Cited files get one call EACH, as before: a log over many paths at once simplifies
# history across all of them, and it counted three more commits on src/extension.ts than
# the one-path log does. They run side by side, since each waits on its own git process.
def ref_commit_times(ref):
    return ref, [int(t) for t in git('log', '--format=%ct', '--', ref).split('\n') if t.strip()]

with ThreadPoolExecutor(max_workers=8) as pool:
    ref_times = dict(pool.map(ref_commit_times, sorted({ref for refs in cited.values() for ref in refs})))

for path, name in item_paths.items():
    if name not in cited:
        continue
    scanned += 1
    last_touched = max(item_times[name])
    refs = cited[name]
    cited_total += len(refs)
    # `git log --since=<the item's last commit>` counts commits at or after that moment.
    moved = [(n, ref) for ref in refs if (n := sum(1 for t in ref_times.get(ref, []) if t >= last_touched))]
    if moved:
        findings.append((sum(n for n, _ in moved), name, sorted(moved)))

# Fewest commits first: a single targeted commit on cited code is far more likely
# to BE the fix than twenty commits of ambient churn.
findings.sort()
for _, name, moved in findings:
    flagged += 1
    print(f"  CODE MOVED  {name}")
    for n, ref in moved[:3]:
        print(f"              {ref}  ({n} commit{'s' if n != 1 else ''} since the item was last updated)")
    if len(moved) > 3:
        print(f"              …and {len(moved) - 3} more")

if not flagged:
    print("  (none)")

broken = []
if not scanned:
    broken.append("no committed backlog items found")
elif not cited_total:
    broken.append("no file:line citations resolved")
print(f"  control: {scanned} committed item(s) scanned, {cited_total} line-numbered citation(s) resolved"
      + (f"  ⚠️  CHECK BROKEN — {'; '.join(broken)}" if broken else ""))
print("  NOTE: advisory, ordered fewest-commits-first. It says the ground moved,")
print("        never that the item is wrong. Read the code before acting.")
PY

echo
echo "== 7. Finished items whose own body still names work =="
# PL-39. The detector lives in the backlog CLI (`leftovers`), next to the parse
# every other consumer uses; this section only runs it, so the sweep reads it.
# Advisory: a sentence about remaining work needs a child item or a rewording,
# never a deletion. The CLI prints its own control line.
REPO_ROOT="$(cd "$(dirname "$RPTC")" && pwd)"
PIPELINE_ROOT="$(git -C "$REPO_ROOT" config --get dev-pipeline.root)"
if ! (cd "$REPO_ROOT" && node "$PIPELINE_ROOT/lib/backlog.mjs" leftovers); then
    echo "  control: 0 items read  ⚠️  CHECK BROKEN — backlog.mjs leftovers did not run"
fi
