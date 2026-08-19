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
