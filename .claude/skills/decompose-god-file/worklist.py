#!/usr/bin/env python3
"""
worklist.py: every source file over its size limit, worst first.

    python3 .claude/skills/decompose-god-file/worklist.py [--coupled]

Same limits, exclusions and coupling signals as `tests/sop/god-file-ratchet.test.ts`,
which pins the two counts this prints (`godFileCandidates`, `godFileCoupled`). The
ratchet only says the number; this says the names, so the next cut is chosen by
measurement rather than by which file somebody happened to touch (EDS-8's lesson).
Run it from the repo root. `--coupled` lists only the files showing a signal.
"""
import os
import re
import subprocess
import sys

NOT_A_METHOD = {'if', 'for', 'while', 'switch', 'catch', 'return', 'constructor', 'super'}


def limit_for(path: str):
    if '/handlers/' in path:
        return 'handler', 500
    if '/services/' in path:
        return 'service', 400
    if path.endswith('.tsx'):
        return 'component', 350
    if '/utils/' in path or '/helpers/' in path:
        return 'util', 300
    return None


def excluded(path: str) -> bool:
    base = os.path.basename(path)
    if '.test.' in base or '.spec.' in base:
        return True
    if base in ('types.ts', 'interfaces.ts', 'index.ts', 'index.tsx'):
        return True
    return '/config/' in path


def tracked_and_new(root: str) -> list[str]:
    ls = subprocess.run(['git', 'ls-files', root], capture_output=True, text=True, check=True).stdout.split()
    new = subprocess.run(['git', 'ls-files', '-o', '--exclude-standard', root],
                         capture_output=True, text=True, check=True).stdout.split()
    return sorted(set(ls + new))


def measure(path: str):
    kind = limit_for(path)
    if not kind or not os.path.exists(path):
        return None
    src = open(path, encoding='utf8').read()
    lines = len(src.split('\n'))
    if lines <= kind[1]:
        return None
    imports = len(re.findall(r'^import\s+(?!type\b)[^;]+?from\s', src, re.M))
    exports = len(re.findall(r'^export\s+(?:async\s+)?(?:function|const|class)\s+\w+', src, re.M))
    methods = [re.sub(r'\s*\($', '', re.sub(r'^(?:public |private |protected )?(?:async )?', '', m.strip()))
               for m in re.findall(r'^ {4}(?:public |private |protected )?(?:async )?\w+\s*\(', src, re.M)]
    methods = [m for m in methods if m not in NOT_A_METHOD]
    ctor = re.search(r'constructor\s*\(([^)]*)\)', src, re.S)
    ctor_deps = len([x for x in (ctor.group(1) if ctor else '').split(',') if x.strip()])
    signals = []
    if imports > 15:
        signals.append(f'{imports} imports')
    if exports + len(methods) > 10:
        signals.append(f'{exports + len(methods)} public surface')
    if ctor_deps > 7:
        signals.append(f'{ctor_deps} constructor deps')
    return {'file': path, 'lines': lines, 'limit': kind[1], 'kind': kind[0], 'signals': signals}


def main() -> int:
    coupled_only = '--coupled' in sys.argv
    files = [f for f in tracked_and_new('src') if f.endswith(('.ts', '.tsx')) and not excluded(f)]
    if len(files) < 500:
        print(f'only {len(files)} files seen under src; are you at the repo root?', file=sys.stderr)
        return 2
    rows = [r for r in map(measure, files) if r]
    coupled = [r for r in rows if r['signals']]
    shown = coupled if coupled_only else rows
    shown.sort(key=lambda r: r['lines'] / r['limit'], reverse=True)
    for r in shown:
        sig = f"  [{', '.join(r['signals'])}]" if r['signals'] else ''
        print(f"{r['lines'] / r['limit']:4.2f}x  {r['lines']:5} /{r['limit']:<4} {r['file']}{sig}")
    print(f'\n{len(rows)} over their limit (godFileCandidates), {len(coupled)} also coupled (godFileCoupled)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
