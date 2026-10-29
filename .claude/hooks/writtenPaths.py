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

Reads the command on stdin, prints one path per line: repo-relative, or absolute
when the command starts by changing folder.

A LEADING `cd <dir> &&` MOVES THE BASE (PL-83). Relative paths after it are the
folder's, not the session's: a session rooted in the main checkout that runs
`cd <worktree> && python3 ... open('src/x.ts','w')` writes the WORKTREE's file.
Joined to the session's folder instead, the god-file rule measured the main
checkout's 426-line copy of a file that was 293 lines where it was being edited
(2026-10-18). Those paths are printed absolute, and the router uses them as given.
A `cd` this cannot read (a variable, a later `cd`) reports nothing rather than guess.
"""
import os
import re
import sys

ROOT = os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd()

cmd = sys.stdin.read()

paths: list[str] = []

# The folder relative paths belong to: the session's, unless the command opens with a cd.
BASE = ROOT
ABSOLUTE = False
lead = re.match(r'\s*cd\s+([\'"]?)([^\s\'";&|]+)\1\s*(?:&&|;)', cmd)
if lead:
    target = os.path.expanduser(lead.group(2))
    if '$' in target:
        sys.exit(0)
    BASE = os.path.normpath(target if os.path.isabs(target) else os.path.join(ROOT, target))
    ABSOLUTE = True


def in_checkout(folder: str) -> bool:
    """A git checkout holds the folder: a cd into /tmp scratch is not the subject."""
    while folder != os.path.dirname(folder):
        if os.path.exists(os.path.join(folder, '.git')):
            return True
        folder = os.path.dirname(folder)
    return False


if ABSOLUTE and not in_checkout(BASE):
    sys.exit(0)
if re.search(r'(?:&&|;|\|\|)\s*cd\s', cmd[lead.end() if lead else 0:]):
    sys.exit(0)


def add(p: str) -> None:
    if not p or p.startswith('-'):
        return
    p = p.strip().strip('\'"')
    if not p or '$' in p or '*' in p:
        return
    full = p if os.path.isabs(p) else os.path.join(BASE, p)
    full = os.path.normpath(full)
    # Only files inside the checkout. /tmp scratch and $SCRATCH are not the subject.
    if not full.startswith(BASE + os.sep):
        return
    out = full if ABSOLUTE else os.path.relpath(full, ROOT)
    if out not in paths:
        paths.append(out)


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
