#!/usr/bin/env python3
"""AI-surface coverage: handler types an agent cannot reach, after triage.

Called by scan.sh, which first writes every handler-map key to a TSV.

    python3 coverage.py <keys.tsv> [--list]
    python3 coverage.py --self-test

WHY THERE IS A TRIAGE FILE (AI-1r). Matching handler names against tool names
cannot tell "no tool exists" from "the tool is called something else", and it
cannot tell a feature from the message channel talking to itself. On 2026-08-29
it reported a 34% gap; read handler by handler on 2026-10-03, most of it was one
of those two. `triage.json` records each reading, with a reason:

    aliases     handler -> the tool that does the same job under another name
    exclusions  handlers an agent has no business calling
    gaps        handlers read and judged a REAL gap

Anything uncovered and in none of the three is UNTRIAGED: a handler added since
the last reading. That is the number to act on. A rising count means "read these
handlers", never "build these tools".

THE FILE IS CHECKED, because a list nothing checks rots. An alias naming a tool
that no longer exists, an entry for a handler that is gone or is now covered by
name, an entry in two lists, or an entry with no reason is a STALE row: printed,
and the scan exits 1.
"""
import glob
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
TRIAGE = os.path.join(HERE, 'triage.json')

# A UI verb at the start of a handler name: navigation and display, which an
# agent has no business calling. Crude on purpose; `exclusions` is the precise list.
UI = re.compile(r'^(navigate|open|show|close|select|toggle|set|focus|scroll|'
                r'dismiss|cancel|back|goto|view|expand|collapse|copy)', re.I)


def norm(name):
    """`check-auth`, `check_auth` and `checkAuth` are one name."""
    return re.sub(r'[-_]', '', name).lower()


def read_human(tsv):
    """Handler key -> the file whose map holds it (first one wins)."""
    human = {}
    with open(tsv) as fh:
        for line in fh:
            line = line.rstrip('\n')
            if line:
                path, key = line.split('\t', 1)
                human.setdefault(key, os.path.basename(path))
    return human


def read_agent(sources):
    """(tool names and dispatched types, handler keys a tool dispatches by hand)."""
    agent, dispatched = set(), set()
    for f in sources:
        try:
            s = open(f).read()
        except OSError:
            continue
        agent |= set(re.findall(r"type:\s*'([a-zA-Z][a-zA-Z0-9-]*)'", s))
        agent |= set(re.findall(r"registerTool\(\s*['\"]([a-z0-9_]+)", s))
        agent |= set(re.findall(r"tool:\s*['\"]([a-z0-9_]+)['\"]", s))
        agent |= set(re.findall(r"server\.tool\(\s*['\"]([a-z0-9_]+)", s))
        # A directly-registered tool that calls a handler map itself, e.g.
        # `dispatchHandler(edsHandlers, ctx, 'github-oauth', {})` inside sign_in.
        dispatched |= set(re.findall(
            r"dispatchHandler\(\s*\w+\s*,\s*\w+\s*,\s*'([a-zA-Z][a-zA-Z0-9-]*)'", s))
    return agent, dispatched


def classify(human, agent, dispatched, triage):
    """Sort every handler key into one bucket, and name every stale triage row.

    Returns a dict of lists: covered, dispatched, aliased, ui, excluded, gaps,
    untriaged, stale. `stale` holds sentences; the rest hold handler keys.
    """
    agent_n = {norm(a) for a in agent}
    dispatched_n = {norm(d) for d in dispatched}
    aliases = triage.get('aliases', {})
    exclusions = triage.get('exclusions', {})
    gaps = triage.get('gaps', {})
    out = {k: [] for k in ('covered', 'dispatched', 'aliased', 'ui', 'excluded',
                           'gaps', 'untriaged', 'stale')}

    lists = (('aliases', aliases), ('exclusions', exclusions), ('gaps', gaps))
    for name, entries in lists:
        for key, entry in entries.items():
            if not str(entry.get('reason', '')).strip():
                out['stale'].append(f'{name}: "{key}" has no reason')
            if key not in human:
                out['stale'].append(f'{name}: "{key}" is not a handler key any more')
            elif norm(key) in agent_n:
                out['stale'].append(f'{name}: "{key}" is now covered by name; delete the row')
            elif norm(key) in dispatched_n:
                out['stale'].append(f'{name}: "{key}" is now dispatched by a tool; delete the row')
    for key in aliases:
        tool = aliases[key].get('tool', '')
        if tool not in agent:
            out['stale'].append(f'aliases: "{key}" names tool "{tool}", which does not exist')
    seen = Counter(k for _, entries in lists for k in entries)
    for key, n in seen.items():
        if n > 1:
            out['stale'].append(f'"{key}" is in {n} lists; it belongs in one')

    for key in human:
        if norm(key) in agent_n:
            out['covered'].append(key)
        elif norm(key) in dispatched_n:
            out['dispatched'].append(key)
        elif key in aliases:
            out['aliased'].append(key)
        elif key in exclusions:
            out['excluded'].append(key)
        elif key in gaps:
            out['gaps'].append(key)
        elif UI.match(key):
            out['ui'].append(key)
        else:
            out['untriaged'].append(key)
    return out


def report(human, agent, result, triage, show_list):
    total = len(human)
    reachable = len(result['covered']) + len(result['dispatched']) + len(result['aliased'])
    not_for_agent = len(result['ui']) + len(result['excluded'])
    pct = lambda n: round(100 * n / total)
    print(f'UI-reachable handler types : {total}')
    print(f'reachable by an MCP tool   : {reachable}  ({len(result["covered"])} by name, '
          f'{len(result["dispatched"])} dispatched by a tool, {len(result["aliased"])} under another name)')
    print(f'not for an agent           : {not_for_agent}  ({len(result["ui"])} UI verbs, '
          f'{len(result["excluded"])} listed exclusions)')
    print(f'REAL GAP (read and judged) : {len(result["gaps"])}  ({pct(len(result["gaps"]))}% of the surface)')
    print(f'UNTRIAGED                  : {len(result["untriaged"])}'
          + ('  <- handlers nobody has read yet; read them, then add a row to triage.json'
             if result['untriaged'] else ''))
    print(f'\ncontrol: {total} map keys read from handler-keys.mjs, {len(agent)} agent tool names found, '
          f'{sum(len(triage.get(k, {})) for k in ("aliases", "exclusions", "gaps"))} triage rows read')
    if result['gaps']:
        print('\nreal gaps:')
        for key in sorted(result['gaps']):
            print(f'  {key:30s} {human[key]:36s} {triage["gaps"][key]["reason"]}')
    if result['untriaged']:
        print('\nuntriaged:')
        for key in sorted(result['untriaged']):
            print(f'  {key:30s} {human[key]}')
    if show_list:
        print('\ndispatched by a tool:')
        for key in sorted(result['dispatched']):
            print(f'  {key:30s} {human[key]}')
        print('\nunder another name:')
        for key in sorted(result['aliased']):
            entry = triage['aliases'][key]
            print(f'  {key:30s} -> {entry["tool"]:28s} {entry["reason"]}')
        print('\nlisted exclusions:')
        for key in sorted(result['excluded']):
            print(f'  {key:30s} {triage["exclusions"][key]["reason"]}')
    if result['stale']:
        print('\nSTALE TRIAGE ROWS (fix triage.json):')
        for line in result['stale']:
            print(f'  {line}')


def self_test():
    """Controls: each way the triage could hide a gap, or lie, must be caught."""
    human = {'getProjects': 'a.ts', 'log': 'a.ts', 'resetProject': 'a.ts',
             'brandNew': 'a.ts', 'startDemo': 'a.ts', 'github-oauth': 'a.ts',
             'openBrowser': 'a.ts'}
    agent = {'list_projects', 'start_demo'}
    dispatched = {'github-oauth'}
    good = {
        'aliases': {'getProjects': {'tool': 'list_projects', 'reason': 'same read'}},
        'exclusions': {'log': {'reason': 'channel plumbing'}},
        'gaps': {'resetProject': {'reason': 'no tool resets a headless project'}},
    }
    failures = []

    def check(name, ok):
        print(f'  {"ok  " if ok else "FAIL"} {name}')
        if not ok:
            failures.append(name)

    r = classify(human, agent, dispatched, good)
    check('a name match is covered', r['covered'] == ['startDemo'])
    check('a handler a tool dispatches by hand is covered', r['dispatched'] == ['github-oauth'])
    check('an alias counts as reachable', r['aliased'] == ['getProjects'])
    check('an exclusion is not a gap', r['excluded'] == ['log'])
    check('a judged gap stays a gap', r['gaps'] == ['resetProject'])
    check('a UI verb is not a gap', r['ui'] == ['openBrowser'])
    check('a handler in no list is UNTRIAGED, never hidden', r['untriaged'] == ['brandNew'])
    check('a sound triage has no stale rows', r['stale'] == [])

    def stale_with(**change):
        triage = json.loads(json.dumps(good))
        for section, rows in change.items():
            triage[section].update(rows)
        return classify(human, agent, dispatched, triage)['stale']

    check('an alias to a tool that does not exist is stale',
          any('does not exist' in s for s in stale_with(
              aliases={'brandNew': {'tool': 'no_such_tool', 'reason': 'x'}})))
    check('a row for a handler that is gone is stale',
          any('not a handler key' in s for s in stale_with(
              exclusions={'deletedHandler': {'reason': 'x'}})))
    check('a row for a handler now covered by name is stale',
          any('covered by name' in s for s in stale_with(
              gaps={'startDemo': {'reason': 'x'}})))
    check('a row with no reason is stale',
          any('no reason' in s for s in stale_with(exclusions={'brandNew': {'reason': ' '}})))
    check('a handler in two lists is stale',
          any('in 2 lists' in s for s in stale_with(exclusions={'resetProject': {'reason': 'x'}})))

    print(f'\n  {13 - len(failures)} passed, {len(failures)} failed')
    return 1 if failures else 0


def main(argv):
    if '--self-test' in argv:
        return self_test()
    tsv = argv[1]
    show_list = '--list' in argv
    human = read_human(tsv)
    agent, dispatched = read_agent(['src/mcp-server.ts'] + glob.glob('src/features/ai/server/*.ts'))
    # Controls: a broken step must abort, not report a tidy zero.
    if not human:
        raise SystemExit('ABORT: found 0 handler types — the extractor is broken, not the codebase.')
    if not agent:
        raise SystemExit('ABORT: found 0 agent tools — the tool scan is broken, not the surface.')
    with open(TRIAGE) as fh:
        triage = json.load(fh)
    result = classify(human, agent, dispatched, triage)
    report(human, agent, result, triage, show_list)
    return 1 if result['stale'] else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
