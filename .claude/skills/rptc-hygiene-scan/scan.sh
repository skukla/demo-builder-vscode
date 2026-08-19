#!/usr/bin/env bash
#
# scan.sh — find rot in the RPTC record itself: the backlog index, where plans live,
# and citations that name a file:line. Four labelled sections:
#
#   1. Backlog index → disk    — links that do not resolve.
#   2. Disk → backlog index    — items with no `####` entry (the direction a
#                                dead-link check structurally cannot see).
#   3. Shipped plans still in plans/ — an overview claiming SHIPPED/COMPLETE while
#                                sitting in the active directory.
#   4. Citations                — `path/file.ts:NN` where the file is gone or NN is
#                                past its end. LIVE surfaces only: research/, dream/
#                                and complete/ are dated records of what was true when
#                                written, and rewriting them would falsify the record
#                                rather than fix a link.
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
found=0
for ov in "$RPTC"/plans/*/overview.md "$RPTC"/plans/*/HANDOFF.md; do
    [ -f "$ov" ] || continue
    if grep -qiE '^\s*(\*\*)?(status|state)(\*\*)?:?.{0,40}(shipped|complete)|^\*\*shipped' "$ov"; then
        echo "  CLAIMS SHIPPED  $(dirname "$ov")"
        grep -m1 -iE 'shipped|complete' "$ov" | cut -c1-96 | sed 's/^/      /'
        found=$((found + 1))
    fi
done
[ "$found" -eq 0 ] && echo "  (none)"
echo "  control: $(ls -d "$RPTC"/plans/*/ 2>/dev/null | wc -l | tr -d ' ') plan dirs scanned"

# Same question aimed at backlog/, which nothing asked until 2026-08-13. Five items there
# declared themselves SHIPPED / LANDED / IMPLEMENTED / RETIRED — one for over a month —
# and the user found them by opening the folder, not by any check. A backlog entry that
# says it is finished is not a backlog entry.
#
# Deliberately stricter than the plans pass above: it anchors on a marker in the first 12
# lines (a status banner), NOT anywhere in the body. Items routinely say "Layer 1 ✅" about
# a sub-part while remaining live, and reporting those would bury the real hits.
echo "  -- backlog items declaring themselves finished --"
bfound=0
for it in "$RPTC"/backlog/*.md "$RPTC"/backlog/*/overview.md; do
    [ -f "$it" ] || continue
    case "$it" in */README.md) continue;; esac
    if head -12 "$it" | grep -qiE '(✅|❌).{0,40}(shipped|landed|implemented|retired|complete|discharged)|^\s*>?\s*\*\*(status|state)\*\*:?\s*(✅|shipped|complete|retired)'; then
        echo "  DECLARES DONE  ${it#"$RPTC"/backlog/}"
        head -12 "$it" | grep -m1 -iE '✅|❌|shipped|landed|implemented|retired' | cut -c1-92 | sed 's/^/      /'
        bfound=$((bfound + 1))
    fi
done
[ "$bfound" -eq 0 ] && echo "  (none)"
echo "  control: $(ls "$RPTC"/backlog/*.md 2>/dev/null | grep -vc README) backlog files scanned"
echo

# ── 4. file:line citations ───────────────────────────────────────────────────
echo "== 4. Citations naming a file:line that cannot resolve =="
python3 - "$RPTC" <<'PY'
import os, re, sys
roots = [os.path.join(sys.argv[1], 'backlog'), os.path.join(sys.argv[1], 'plans'),
         'docs', '.claude/skills']
pat = re.compile(r'\b((?:src|tests|scripts)/[\w./-]+\.(?:ts|tsx|js|mjs|css)):(\d+)\b')
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
echo "== 5. Shipped work still sitting in an ACTIVE backlog section =="
python3 - "$RPTC" <<'PY'
import os, re, sys

rptc = sys.argv[1]
readme = os.path.join(rptc, 'backlog', 'README.md')
if not os.path.exists(readme):
    print("  (no backlog index)"); raise SystemExit(0)
lines = open(readme, encoding='utf-8').read().split('\n')

def first(prefix, default):
    return next((i for i, l in enumerate(lines) if l.startswith(prefix)), default)

start = first('## Active backlog', 0)
end = next((i for i, l in enumerate(lines[start + 1:], start + 1) if l.startswith('## ')), len(lines))

section, active = None, []
for i in range(start, end):
    if lines[i].startswith('### '):
        section = lines[i][4:].strip()
    elif lines[i].startswith('#### '):
        raw = lines[i]
        title = re.sub(r'\s*\(\[.*', '', raw[5:])
        title = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', title).replace('**', '').replace('~~', '').strip(' —,')
        targets = re.findall(r'\]\(([^)]+)\)', raw)
        active.append((section, title, targets, raw))

flagged = 0

# ── Signal 1: TOMBSTONE ────────────────────────────────────────────────────
# An entry in an ACTIVE section that announces its own completion. The item is
# done; the index still files it under work-to-do. This is the cleanup the
# archive sections exist for, and it is what makes the active list read longer
# than it is — 3 of these were sitting in the list on 2026-08-18.
for section, title, targets, raw in active:
    if not ('✅' in raw or 'SHIPPED' in raw or 'RESOLVED' in raw or '~~' in raw):
        continue
    when = re.search(r'(\d{4}-\d{2}-\d{2})', raw)
    print(f"  TOMBSTONE   [{(section or '?')[0]}] {title[:88]}")
    print(f"              announces completion{' on ' + when.group(1) if when else ''}"
          f" — move it to an archive section")
    flagged += 1

# ── Signal 2: ARCHIVED TWIN ────────────────────────────────────────────────
# The item already lives under complete/, so it shipped AND was archived; only
# the index still calls it active. Distinct from a tombstone: nothing in the
# entry admits it, so only the filesystem knows.
complete_names = set()
cdir = os.path.join(rptc, 'complete')
if os.path.isdir(cdir):
    complete_names = {n[:-3] if n.endswith('.md') else n for n in os.listdir(cdir)}

for section, title, targets, raw in active:
    if '✅' in raw or 'SHIPPED' in raw or 'RESOLVED' in raw:
        continue                      # already reported above
    for t in targets:
        base = os.path.basename(t.rstrip('/'))
        base = base[:-3] if base.endswith('.md') else base
        if '/complete/' not in t and base in complete_names:
            print(f"  ARCHIVED TWIN  [{(section or '?')[0]}] {title[:80]}")
            print(f"              index points at {t}, but complete/{base} exists")
            flagged += 1
            break

if not flagged:
    print("  (none)")

# CONTROL. Both halves are named, because either can silently do nothing: an
# empty active span makes signal 1 vacuous, an empty complete/ makes signal 2
# vacuous, and both print "(none)" exactly like a clean record.
broken = []
if not active:
    broken.append("no active entries parsed")
if not complete_names:
    broken.append("complete/ is empty or missing")
print(f"  control: {len(active)} active entries scanned against "
      f"{len(complete_names)} archived item(s)"
      + (f"  ⚠️  CHECK BROKEN — {'; '.join(broken)}" if broken else ""))
PY

echo
echo "== 6. Items citing a file:line whose CODE moved after the item was last updated =="
python3 - "$RPTC" <<'PY'
import os, re, subprocess, sys

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

for name in items:
    item = os.path.join(backlog, name)
    last_touched = git('log', '-1', '--format=%cI', '--', item)
    if not last_touched:
        continue
    scanned += 1
    text = open(item, encoding='utf-8', errors='ignore').read()
    refs = sorted({r for r in (resolve(c) for c in CITE_RE.findall(text)) if r})
    cited_total += len(refs)
    moved = []
    for ref in refs:
        out = git('log', '--oneline', f'--since={last_touched}', '--', ref)
        n = len([l for l in out.split('\n') if l.strip()])
        if n:
            moved.append((n, ref))
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
