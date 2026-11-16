#!/usr/bin/env python3
"""Read and edit the three line-keyed ledgers without hand-written JSON.

Reflect proposal 5 (2026-11-16, owner accepted): sessions edited these ledgers with inline
Python five to eleven times a session, and a re-dump with the wrong settings once rewrote
unrelated escapes. This keeps each file byte-for-byte in its own format.

Ledgers (the NAME argument):
  mutation  scripts/mutation-equivalents.ledger.json  entries: [{module, anchors, line?, ...}]
  errors    tests/sop/user-facing-errors.ledger.json   rawMessageToUser: {"file:line": reason}
  progress  tests/sop/progress-surface.ledger.json     directProgress / blockingDialogs:
                                                       {"file:line": reason}

Usage:
  ledger.py list NAME [TEXT]            rows, optionally only those containing TEXT
  ledger.py check NAME                  duplicates and stale rows; exit 1 on any
  ledger.py add NAME JSON               append a row (mutation: the entry object;
                                        keyed: {"section", "key", "reason"})
  ledger.py remove NAME ID              mutation: the entry index; keyed: SECTION:file:line
  ledger.py move NAME ID NEW            re-key a row whose code moved: mutation ID is the
                                        index and NEW the line; keyed ID is SECTION:file:line
                                        and NEW the new file:line
Any edit takes --dry-run to print what would change and write nothing.
"""

import json
import os
import sys

# LEDGER_ROOT points the tool at a copy of the repo (its tests, and dry runs on a copy).
ROOT = os.environ.get('LEDGER_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# path, ensure_ascii (each file's own measured format; indent 4 and a final newline for all)
LEDGERS = {
    'mutation': ('scripts/mutation-equivalents.ledger.json', True),
    'errors': ('tests/sop/user-facing-errors.ledger.json', False),
    'progress': ('tests/sop/progress-surface.ledger.json', True),
}
KEYED_SECTIONS = {'errors': ['rawMessageToUser'], 'progress': ['directProgress', 'blockingDialogs']}


class LedgerError(Exception):
    """A refused request: printed, exit 2, nothing written."""


def load(name):
    if name not in LEDGERS:
        raise LedgerError(f'unknown ledger {name!r}; one of {", ".join(LEDGERS)}')
    path, _ = LEDGERS[name]
    dupes = []

    def pairs(items):
        seen = {}
        for k, v in items:
            if k in seen:
                dupes.append(k)
            seen[k] = v
        return seen

    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return json.load(f, object_pairs_hook=pairs), dupes


def save(name, data, dry):
    path, ascii_only = LEDGERS[name]
    text = json.dumps(data, indent=4, ensure_ascii=ascii_only) + '\n'
    if dry:
        print(f'dry run: {path} not written')
        return
    with open(os.path.join(ROOT, path), 'w', encoding='utf-8') as f:
        f.write(text)
    print(f'wrote {path}')


def source_lines(rel):
    full = os.path.join(ROOT, rel)
    if not os.path.isfile(full):
        return None
    with open(full, encoding='utf-8') as f:
        return f.read().split('\n')


def rows(name, data):
    """(id, summary) for every row."""
    if name == 'mutation':
        for i, e in enumerate(data['entries']):
            yield str(i), f"{e['module']}:{e.get('line', '-')} {e['anchors']}"
    else:
        for section in KEYED_SECTIONS[name]:
            for key in data[section]:
                yield f'{section}:{key}', key


def check(name, data, dupes):
    problems = [f'duplicate key {k}' for k in dupes]
    if name == 'mutation':
        seen = set()
        for i, e in enumerate(data['entries']):
            ident = (e['module'], tuple(e['anchors']), e.get('line'))
            if ident in seen:
                problems.append(f'entry {i}: duplicate of an earlier entry')
            seen.add(ident)
            lines = source_lines(e['module'])
            if lines is None:
                problems.append(f"entry {i}: {e['module']} does not exist")
                continue
            # The ledger suite's own rule (mutation-equivalents-ledger.test.ts): an anchor is a whole
            # trimmed line. With `line`, that line must be the anchor; without, exactly one line is.
            for anchor in e['anchors']:
                if 'line' in e:
                    at = lines[e['line'] - 1].strip() if 0 < e['line'] <= len(lines) else None
                    if at != anchor:
                        hits = [n for n, text in enumerate(lines, 1) if text.strip() == anchor]
                        problems.append(f"entry {i}: line {e['line']} is not the anchor (it is on {hits or 'no line'})")
                else:
                    hits = [n for n, text in enumerate(lines, 1) if text.strip() == anchor]
                    if len(hits) != 1:
                        problems.append(f"entry {i}: anchor resolves to {len(hits)} lines in {e['module']}")
    else:
        for section in KEYED_SECTIONS[name]:
            for key in data[section]:
                rel, _, line = key.rpartition(':')
                lines = source_lines(rel)
                if lines is None:
                    problems.append(f'{section}:{key}: file does not exist')
                elif not line.isdigit() or not 1 <= int(line) <= len(lines):
                    problems.append(f'{section}:{key}: past the end of the file ({len(lines)} lines)')
    return problems


def keyed_target(name, data, ident):
    section, _, key = ident.partition(':')
    if section not in KEYED_SECTIONS[name]:
        raise LedgerError(f'unknown section {section!r}; one of {", ".join(KEYED_SECTIONS[name])}')
    return data[section], key


def edit(name, op, args, dry):
    data, _ = load(name)
    if op == 'add':
        row = json.loads(args[0])
        if name == 'mutation':
            ident = (row['module'], tuple(row['anchors']), row.get('line'))
            if any((e['module'], tuple(e['anchors']), e.get('line')) == ident for e in data['entries']):
                raise LedgerError('refused: an identical entry is already there')
            data['entries'].append(row)
        else:
            table, key = keyed_target(name, data, f"{row['section']}:{row['key']}")
            if key in table:
                raise LedgerError(f'refused: {key} is already there')
            table[key] = row['reason']
        print(f'added to {name}')
    elif op == 'remove':
        if name == 'mutation':
            removed = data['entries'].pop(int(args[0]))
            print(f"removed entry {args[0]} ({removed['module']})")
        else:
            table, key = keyed_target(name, data, args[0])
            if key not in table:
                raise LedgerError(f'refused: {key} is not there')
            del table[key]
            print(f'removed {args[0]}')
    elif op == 'move':
        if name == 'mutation':
            entry = data['entries'][int(args[0])]
            print(f"entry {args[0]}: line {entry.get('line', '-')} -> {args[1]}")
            entry['line'] = int(args[1])
        else:
            section, _, key = args[0].partition(':')
            table, key = keyed_target(name, data, args[0])
            if key not in table or args[1] in table:
                raise LedgerError(f'refused: {key} must be there and {args[1]} must not')
            # Rebuilt in order, so the moved row keeps its place.
            data[section] = {(args[1] if k == key else k): v for k, v in table.items()}
            print(f'{section}: {key} -> {args[1]}')
    save(name, data, dry)


def main(argv):
    dry = '--dry-run' in argv
    argv = [a for a in argv if a != '--dry-run']
    if len(argv) < 2 or argv[0] not in ('list', 'check', 'add', 'remove', 'move'):
        print(__doc__)
        return 2
    op, name, rest = argv[0], argv[1], argv[2:]
    try:
        if op == 'list':
            data, _ = load(name)
            shown = [f'{i}  {s}' for i, s in rows(name, data) if not rest or rest[0] in s]
            print('\n'.join(shown))
            print(f'{len(shown)} row(s)')
            return 0
        if op == 'check':
            data, dupes = load(name)
            problems = check(name, data, dupes)
            print('\n'.join(problems) if problems else f'{name}: no duplicates, no stale rows')
            return 1 if problems else 0
        need = {'add': 1, 'remove': 1, 'move': 2}[op]
        if len(rest) != need:
            raise LedgerError(f'{op} takes {need} argument(s)')
        edit(name, op, rest, dry)
        return 0
    except (LedgerError, ValueError, KeyError, IndexError) as error:
        print(f'ledger: {error}')
        return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
