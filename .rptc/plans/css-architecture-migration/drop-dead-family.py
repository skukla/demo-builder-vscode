"""
Delete a whole class family from a stylesheet, when nothing uses it.

Companion to `drop-dead-spectrum-selectors.py`, and deliberately more cautious,
because the two prove deadness by different means:

  bare `.spectrum-*`   dead by CSS SEMANTICS — Spectrum ships hashed names, so
                       the selector cannot match. Provable from the selector.
  a whole family       dead by ABSENCE — no component names the class. Absence
                       is weaker evidence, so this script REFUSES to run on a
                       family it can find any mention of.

    python3 drop-dead-family.py <sheet> <prefix> [<prefix> ...]

`verify()` proves the output is the input minus exactly the spans chosen, and the
braces still balance. The refusal check runs first, so a family with even one
mention stops the script rather than producing a diff someone has to read.
"""

import re
import subprocess
import sys
from pathlib import Path

COMMENT = re.compile(r'/\*.*?\*/', re.S)


def mask_comments(text: str) -> str:
    return COMMENT.sub(lambda m: ' ' * len(m.group(0)), text)


def mentions_in_source(prefix: str) -> list[str]:
    """
    Every mention of `<prefix>-` in ts/tsx, EXCLUDING comment lines.

    A family is only deletable when this is empty. Comments are excluded because
    `.architecture-*` is named in six of them — "architecture-duplication scan",
    "architecture-dependent" — and none is a class use. That distinction is the
    whole check: counting comments would refuse a dead family, and ignoring
    non-comments would delete a live one.
    """
    # Search the BARE prefix, not `prefix-`. A family's head class often has no
    # suffix: `.architecture-badge` IS the whole class name, so grepping
    # `architecture-badge-` found nothing and reported a LIVE rule dead. Caught
    # 2026-09-09 before it deleted the "Coming Soon" badge's only rule.
    out = subprocess.run(
        ['grep', '-rn', '--include=*.ts', '--include=*.tsx', prefix, 'src'],
        capture_output=True, text=True,
    ).stdout.strip()
    if not out:
        return []
    real = []
    for line in out.split('\n'):
        try:
            _, _, code = line.split(':', 2)
        except ValueError:
            continue
        stripped = code.strip()
        if stripped.startswith(('//', '*', '/*')):
            continue
        # The prefix must appear as a whole CLASS token — either exactly, or
        # carrying a `-suffix`. Without this the bare grep also matches
        # `architecture-duplication` in prose and every path containing the word.
        whole = rf'(?<![\w-]){re.escape(prefix)}(?![\w])'
        suffixed = rf'(?<![\w-]){re.escape(prefix)}-[\w-]+'
        if not (re.search(whole, code) or re.search(suffixed, code)):
            continue
        real.append(line)
    return real


def spans_for(text: str, prefixes: list[str]) -> list[tuple[int, int]]:
    """Byte spans of every rule whose FIRST class starts with one of the prefixes."""
    masked = mask_comments(text)
    drops: list[tuple[int, int]] = []
    for m in re.finditer(r'([^{}]+)\{[^{}]*\}', masked):
        sel_start, sel_end = m.start(1), m.end(1)
        selector = text[sel_start:sel_end]
        if selector.strip().startswith('@'):
            continue
        classes = re.findall(r'\.([A-Za-z_][\w-]*)', selector)
        if not classes:
            continue
        if not any(classes[0].startswith(p + '-') or classes[0] == p for p in prefixes):
            continue
        # start at the selector, not at m.start(), or the preceding comment goes too
        first = sel_start
        while first < sel_end and masked[first].isspace():
            first += 1
        drops.append((first, m.end()))
    drops.sort()
    merged: list[tuple[int, int]] = []
    for a, b in drops:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def apply(text: str, spans: list[tuple[int, int]]) -> str:
    out, prev = [], 0
    for a, b in spans:
        out.append(text[prev:a])
        prev = b
    out.append(text[prev:])
    return ''.join(out)


def verify(original: str, result: str, spans: list[tuple[int, int]]) -> None:
    kept = ''.join(
        original[a:b]
        for a, b in zip([0] + [b for _, b in spans], [a for a, _ in spans] + [len(original)])
    )
    assert kept == result, 'content outside the removed spans changed'
    masked = mask_comments(result)
    assert masked.count('{') == masked.count('}'), 'unbalanced braces after removal'


def main() -> None:
    sheet, prefixes = sys.argv[1], sys.argv[2:]
    if not prefixes:
        print('usage: drop-dead-family.py <sheet> <prefix> [<prefix> ...]')
        sys.exit(2)

    # REFUSE FIRST. A family with any non-comment mention is not dead.
    for p in prefixes:
        hits = mentions_in_source(p)
        if hits:
            print(f'REFUSED: .{p}-* is mentioned in source, outside comments:')
            for h in hits[:8]:
                print('   ' + h[:100])
            sys.exit(1)
        print(f'  .{p}-*  no non-comment mention in src/ — deletable')

    path = Path(sheet)
    original = path.read_text()
    spans = spans_for(original, prefixes)
    result = apply(original, spans)
    verify(original, result, spans)
    path.write_text(result)
    print(f'\nremoved {len(spans)} rule(s) from {sheet}')
    print(f'lines {len(original.splitlines())} -> {len(result.splitlines())}')


if __name__ == '__main__':
    main()
