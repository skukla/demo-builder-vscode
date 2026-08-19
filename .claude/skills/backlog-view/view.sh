#!/usr/bin/env bash
# Render the RPTC backlog index as a readable list. Read-only, offline, ~0.1s.
#
# Usage:
#   bash .claude/skills/backlog-view/view.sh              # active backlog, grouped
#   bash .claude/skills/backlog-view/view.sh A            # one section by letter
#   bash .claude/skills/backlog-view/view.sh --full       # include hooks (2-line entries)
#   bash .claude/skills/backlog-view/view.sh mesh         # only items matching a term
set -euo pipefail
RPTC="${RPTC_DIR:-.rptc}"
python3 - "$RPTC" "${@:-}" <<'PY'
import pathlib, re, sys

rptc = pathlib.Path(sys.argv[1])
args = [a for a in sys.argv[2:] if a]
full = '--full' in args
filters = [a for a in args if not a.startswith('--')]
readme = rptc / 'backlog' / 'README.md'
if not readme.exists():
    print(f"no backlog index at {readme}")
    raise SystemExit(1)

lines = readme.read_text().split('\n')

def index_of(prefix, default):
    for i, l in enumerate(lines):
        if l.startswith(prefix):
            return i
    return default

start = index_of('## Active backlog', 0)
end = index_of('## Recently shipped — 2026-08', len(lines))
# The archive heading carries a date that will move; fall back to any later `## `.
if end <= start:
    end = next((i for i, l in enumerate(lines[start + 1:], start + 1)
                if l.startswith('## ')), len(lines))

section, shown, hidden, shipped_n = None, 0, 0, 0
want = (filters[0].upper() if filters and len(filters[0]) == 1 and filters[0].isalpha()
        else None)
term = filters[0].lower() if filters and not want else None
buffer = []

for i in range(start, end):
    l = lines[i]
    if l.startswith('### '):
        section = l[4:].strip()
        buffer.append(('section', section))
    elif l.startswith('#### '):
        title = l[5:]
        title = re.sub(r'\s*\(\[.*', '', title)          # trailing ([`file`](path)) citation
        title = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', title)  # inline [text](link) -> text
        title = title.replace('**', '').replace('~~', '').strip(' —,')
        is_shipped = '✅' in title or 'SHIPPED' in title or title.startswith('~~')
        slug = ''
        m = re.search(r'\]\(([^)]+)\)', l)
        if m:
            slug = m.group(1)
        hook = ''
        for j in range(i + 1, min(i + 7, end)):
            if lines[j].strip() and not lines[j].startswith('#'):
                hook = re.sub(r'\s+', ' ', lines[j].strip())
                break
        buffer.append(('item', (section, title, hook, slug, is_shipped)))

for kind, payload in buffer:
    if kind == 'section':
        continue
    section, title, hook, slug, is_shipped = payload
    letter = section[0] if section else '?'
    if want and letter != want:
        hidden += 1
        continue
    if term and term not in (title + ' ' + hook + ' ' + slug).lower():
        hidden += 1
        continue
    if is_shipped:
        shipped_n += 1

printed_section = None
for kind, payload in buffer:
    if kind != 'item':
        continue
    section, title, hook, slug, is_shipped = payload
    letter = section[0] if section else '?'
    if want and letter != want:
        continue
    if term and term not in (title + ' ' + hook + ' ' + slug).lower():
        continue
    if section != printed_section:
        print(f"\n{section}")
        print('─' * min(len(section), 74))
        printed_section = section
    mark = '✓' if is_shipped else '•'
    clean = title
    print(f"  {mark} {clean}")
    if full and hook and not is_shipped:
        print(f"      {hook[:150]}")
    shown += 1

scope = (f"section {want}" if want else f'matching "{term}"' if term else 'active backlog')
print(f"\n  {shown} shown ({shipped_n} already shipped, still listed), {hidden} filtered out — {scope}")
# CONTROL: a zero from a parser that never found the section reads exactly like an
# empty backlog. Prove the file was actually walked.
print(f"  control: {len(lines)} index lines read, {len(buffer)} headings parsed, "
      f"range {start}..{end}"
      + ("  ⚠️  RANGE EMPTY — parser found no items" if not buffer else ""))
PY
