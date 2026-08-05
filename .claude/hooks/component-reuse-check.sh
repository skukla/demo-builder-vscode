#!/usr/bin/env bash
# Stop hook — flag markup that reimplements a component instead of importing it.
#
# The gap this fills: reuse-first-router fires on NEW .tsx files, so recreation
# inside an EXISTING file is invisible to it, and the extraction scan only speaks at
# 3+ sites. Between them sits the common case — someone hand-rolls a component's
# innards in a file that already exists, at one or two sites, and nothing notices.
#
# Real instance (found 2026-08-05 by the first codebase-sweep, months after it
# landed): commerceStepBodies.tsx and BlockLibrariesStepContent.tsx both render
# `choice-card-name` + `choice-card-description` — ChoiceCard.tsx's internal markup —
# and NEITHER imports ChoiceCard.
#
# Signal: a class whose kebab prefix maps to a real PascalCase component file, used
# in a file that does not import that component. That is narrow on purpose. Flagging
# every shared class would fire on layout utilities like page-container-padded, which
# are correct reuse, and a hook that cries wolf gets ignored — which is the failure
# this whole set of hooks exists to fix.
#
# Advisory (exit 0): sometimes the answer IS to use the raw markup, because the
# component carries an affordance the caller does not want. That is a judgement, not
# a violation.
DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$DIR" || exit 0

files=$( { git diff --name-only --diff-filter=ACMR; git diff --cached --name-only --diff-filter=ACMR; } 2>/dev/null \
  | grep -E '\.tsx$' | grep -v '/tests/' | sort -u )
[ -z "$files" ] && exit 0

python3 - $files <<'PY'
import re, subprocess, sys, os, glob

changed = sys.argv[1:]
# component name -> defining file, from every component file in the tree
components = {}
for p in glob.glob('src/**/*.tsx', recursive=True):
    base = os.path.basename(p)[:-4]
    if base[:1].isupper():
        components[base] = p

def kebab(name):
    return re.sub(r'(?<!^)(?=[A-Z])', '-', name).lower()

# OWNERSHIP IS PER CLASS, PROVEN BY USE — not inferred from the filename, and not
# inherited across a prefix family. Two false-positive classes were measured on the
# first run (2026-08-05, 3 real of 6):
#   - `empty-state-text` looked like EmptyState's; EmptyState renders no such class.
#   - `sidebar-action-tile` looked like Sidebar's; Sidebar renders only `sidebar-view`.
#     Owning one class in a family does not mean owning the family.
# A component owns EXACTLY the classes it renders whose names it prefixes. NO
# sole-renderer condition: a first attempt required the component to be the only
# renderer, which deleted both real findings — `choice-card-name` has three
# renderers precisely BECAUSE it is being duplicated. A uniqueness test is defeated
# by the very thing it is meant to detect.
owned = {}
for n, path in components.items():
    pre = kebab(n)
    for cls in set(re.findall(r'className="([a-z][a-z0-9-]+)"', open(path, errors='ignore').read())):
        if cls.startswith(pre):
            owned[cls] = (n, path)

hits = []
for f in changed:
    if not os.path.exists(f):
        continue
    body = open(f, errors='ignore').read()
    for cls in set(re.findall(r'className="([a-z][a-z0-9-]+)"', body)):
        if cls not in owned:
            continue
        comp, path = owned[cls]
        if os.path.abspath(path) == os.path.abspath(f):
            continue                              # the component's own file
        if re.search(rf'\b{comp}\b', body):
            continue                              # already imports/uses it
        hits.append((f, cls, comp, path))
if hits:
    print('[component-reuse] markup using a component\'s classes without using the component:')
    for f, cls, comp, path in sorted(set(hits)):
        print(f'  {f}: "{cls}" belongs to {comp} ({path})')
    print('  Use the component, or extract the shared part. If the component carries an')
    print('  affordance you deliberately do not want, say so in a comment so the next')
    print('  reader does not "fix" it.')
PY
exit 0
