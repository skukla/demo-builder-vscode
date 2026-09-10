"""Which repo files does a Bash command WRITE to?

WHY THIS EXISTS. Every path-keyed rule in `rules/` matches on `tool_input.file_path`,
which only the Write and Edit tools carry. An agent that edits through the shell —
`cat > f`, `sed -i`, or a heredoc'd `python3` that opens the file — sends a Bash
payload with no `file_path` at all, so all fifteen routing rules stayed silent for
the most common editing style in this session. Measured 2026-09-10: rule 49 did not
fire on an edit to a 910-line handler because the edit went through python.

CONSERVATIVE BY DESIGN. It reports a path only when the write intent is ATTACHED to
that path, never merely co-present in the command. `grep x src/a.ts > /tmp/out`
writes to /tmp/out, not to src/a.ts, and this says so.

Reads the command on stdin, prints one repo-relative path per line.
"""
import os
import re
import sys

ROOT = os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()

cmd = sys.stdin.read()

paths: list[str] = []


def add(p: str) -> None:
    if not p or p.startswith('-'):
        return
    p = p.strip().strip('\'"')
    if not p or '$' in p or '*' in p:
        return
    full = p if os.path.isabs(p) else os.path.join(ROOT, p)
    full = os.path.normpath(full)
    # Only files inside the repo. /tmp scratch and $SCRATCH are not the subject.
    if not full.startswith(os.path.normpath(ROOT) + os.sep):
        return
    rel = os.path.relpath(full, ROOT)
    if rel not in paths:
        paths.append(rel)


# 1. Redirects: `> path`, `>> path`. Excludes `2>&1`, `>&2` and friends by requiring
#    the target to start with a path character rather than `&`.
for m in re.finditer(r'(?<![0-9&])>>?\s*([\'"]?[\w./@-]+[\'"]?)', cmd):
    add(m.group(1))

# 2. tee, sed -i, and the copy/move destinations.
for m in re.finditer(r'\btee\s+(?:-a\s+)?([\'"]?[\w./@-]+)', cmd):
    add(m.group(1))
for m in re.finditer(r"\bsed\s+-i\s*(?:''|\"\")?\s+(?:-e\s+\S+\s+)?(?:\S*\s+)??([\w./@-]+\.\w+)", cmd):
    add(m.group(1))

# 3. A python open() in write mode, with the path as a literal.
for m in re.finditer(r'open\(\s*[\'"]([^\'"]+)[\'"]\s*,\s*[\'"][wa]', cmd):
    add(m.group(1))

# 4. A python open() in write mode whose path came from a variable assigned a
#    literal earlier in the SAME command — the shape this session writes constantly:
#        p = 'tests/sop/thing.ts'
#        open(p, 'w').write(...)
# NOT line-anchored: router.sh flattens newlines out of the command before this
# runs, so a heredoc'd script arrives as one long line. An `re.M` anchored version
# matched nothing there — and the shape it failed on was the exact one this whole
# extractor exists for. Caught by the proof, not by reading.
assigned = dict(re.findall(r'(?:^|[\s;(])(\w+)\s*=\s*[\'"]([^\'"\n]+)[\'"]', cmd))
for m in re.finditer(r'open\(\s*(\w+)\s*,\s*[\'"][wa]', cmd):
    if m.group(1) in assigned:
        add(assigned[m.group(1)])

# 5. pathlib and shutil destinations.
for m in re.finditer(r'\bshutil\.(?:copyfile|copy|move)\([^,]+,\s*[\'"]([^\'"]+)[\'"]', cmd):
    add(m.group(1))

for p in paths:
    print(p)
