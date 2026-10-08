#!/usr/bin/env python3
"""
proveMove.py: is a decomposition a MOVE, or did the code change on the way?

    python3 .claude/skills/decompose-god-file/proveMove.py <ref> <old-file> <new-file>... \
        [--rename old=new ...]

For every top-level function and class method in each NEW file (working tree), find
the function of the same name in the OLD file as it was at <ref> (a commit, usually
HEAD or HEAD~1), and compare their bodies after normalising what a move legitimately
changes: whitespace and line wrapping, and `this.x` / `deps.x` / a bare `x` reaching
the same collaborator. Anything else is reported as a difference for a reader.

Why: a split proves itself by its tests passing unchanged, but a test suite that
never constrained a line cannot see that line changing. On 2026-10-08 the sign-in
flow (86 lines, a browser round-trip no test drives) was moved and the only proof it
was unchanged was a reader diffing it by hand. This is that diff, so the next split
does not depend on someone remembering to do it.

Output: one line per function (`same` / `DIFFERS` / `new` / `not in old`), the
unified diff for each DIFFERS, and exit 1 if anything differs. A function that is
genuinely new (a helper the split introduced) is listed as `new` and does not fail.

Control: run it with --control; it plants a one-token change into a copy of a moved
function and must report DIFFERS, or the comparison is not reading anything.
"""
import argparse
import difflib
import re
import subprocess
import sys

FN = re.compile(
    r'^(?P<indent>[ \t]*)(?:export\s+)?(?:default\s+)?(?:public |private |protected |static |readonly )*'
    r'(?:async\s+)?(?:function\s+)?(?P<name>[A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(',
    re.M,
)
NOT_A_FUNCTION = {'if', 'for', 'while', 'switch', 'catch', 'return', 'constructor', 'super',
                  'await', 'new', 'typeof', 'import', 'export', 'else', 'do', 'try'}


def functions(src: str) -> dict[str, str]:
    """name -> body text (from the opening brace to its match)."""
    out: dict[str, str] = {}
    for m in FN.finditer(src):
        name = m.group('name')
        if name in NOT_A_FUNCTION:
            continue
        # Skip calls: a definition's `(` is followed, after the parameter list, by `{` or `: type {`.
        depth, i = 1, m.end()
        while i < len(src) and depth:
            depth += src[i] == '('
            depth -= src[i] == ')'
            i += 1
        rest = src[i:i + 200]
        body_at = re.match(r'\s*(?::\s*[^{;=]+?)?\s*\{', rest)
        if not body_at:
            continue
        start = i + body_at.end() - 1
        depth, j = 0, start
        while j < len(src):
            depth += src[j] == '{'
            depth -= src[j] == '}'
            j += 1
            if depth == 0:
                break
        if name not in out:  # first definition wins; overloads share a name
            out[name] = src[start:j]
    return out


def normalise(body: str) -> list[str]:
    body = re.sub(r'\b(?:this|deps|self)\.', '', body)
    # A moved function reads its collaborators off `deps` instead of `this`; the
    # destructure that does so is not a change.
    body = re.sub(r'const\s*\{[^}]*\}\s*=\s*deps;', '', body)
    body = re.sub(r'\s+', ' ', body)
    # Trailing commas only appear where the formatter wrapped a line.
    body = re.sub(r',\s*([)\]}])', r'\1', body)
    body = re.sub(r'\(\s+', '(', body)
    # Re-split on statement boundaries so the diff is readable.
    return [s.strip() for s in re.split(r'(?<=[;{}])', body) if s.strip()]


def at_ref(ref: str, path: str) -> str:
    return subprocess.run(['git', 'show', f'{ref}:{path}'], capture_output=True, text=True, check=True).stdout


def compare(old: dict[str, str], new_files: dict[str, dict[str, str]], renames: dict[str, str]) -> int:
    differs = 0
    for path, fns in new_files.items():
        print(f'== {path}')
        for name, body in fns.items():
            old_name = renames.get(name, name)
            if old_name not in old:
                print(f'   new         {name}')
                continue
            a, b = normalise(old[old_name]), normalise(body)
            if a == b:
                print(f'   same        {name}' + (f'  (was {old_name})' if old_name != name else ''))
                continue
            differs += 1
            print(f'   DIFFERS     {name}' + (f'  (was {old_name})' if old_name != name else ''))
            for line in difflib.unified_diff(a, b, 'old', 'new', lineterm='', n=0):
                print('      ' + line)
    return differs


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('ref')
    p.add_argument('old_file')
    p.add_argument('new_files', nargs='+')
    p.add_argument('--rename', action='append', default=[], metavar='OLD=NEW')
    p.add_argument('--control', action='store_true', help='plant a change and require DIFFERS')
    a = p.parse_args()
    renames = {}
    for r in a.rename:
        old, new = r.split('=', 1)
        renames[new] = old

    old = functions(at_ref(a.ref, a.old_file))
    if not old:
        print(f'no functions found in {a.old_file} at {a.ref}; nothing compared', file=sys.stderr)
        return 2
    new_files = {f: functions(open(f).read()) for f in a.new_files}
    if not any(new_files.values()):
        print('no functions found in the new files; nothing compared', file=sys.stderr)
        return 2

    if a.control:
        # Take the first function that exists in both, change one token, expect DIFFERS.
        for path, fns in new_files.items():
            for name, body in fns.items():
                if renames.get(name, name) in old and normalise(old[renames.get(name, name)]) == normalise(body):
                    planted = {path: {name: body.replace('(', '( /*planted*/ 1 +', 1)}}
                    n = compare(old, planted, renames)
                    print('control: ' + ('DIFFERS reported, comparison is live' if n else 'FAILED, planted change not seen'))
                    return 0 if n else 1
        print('control: no identical function to plant into', file=sys.stderr)
        return 2

    n = compare(old, new_files, renames)
    print(f'\n{n} function(s) differ beyond a move' if n else '\nevery matched function is a pure move')
    return 1 if n else 0


if __name__ == '__main__':
    sys.exit(main())
