"""
Remove selectors that target Spectrum by a BARE class name.

Adobe ships hashed class names — the real DOM class measured in the running
bundle on 2026-09-08 is `o7Xu8a_spectrum-Button`. A selector written
`.spectrum-Button` requires a class token exactly equal to `spectrum-Button` and
therefore matches nothing. These have been inert since Spectrum began hashing,
somewhere before 3.16 (3.16 ships `Dniwja_`, 3.17 `o7Xu8a_`).

`[class*="spectrum-"]` substring selectors are NOT touched: those still match,
and whether to keep them is a separate decision.

Two cases:
  every selector in the rule is dead  -> delete the whole rule
  only some are dead                  -> delete those selectors, keep the rule

Index-based like the !important strip, for the same reason: a text-rebuilding
version of that script silently deleted 806 lines. `verify()` proves the output
is the input minus exactly the spans chosen.
"""

import re
from pathlib import Path

SHEETS = [
    'src/core/ui/styles/custom-spectrum.css',
    'src/core/ui/styles/wizard.css',
    'src/core/ui/styles/vscode-theme.css',
    'src/core/ui/styles/index.css',
    'src/core/ui/styles/reset.css',
    'src/core/ui/styles/tokens.css',
    'src/features/data-installer/ui/styles/data-installer.css',
    'src/features/eds/ui/styles/eds-steps.css',
    'src/features/eds/ui/styles/connect-services.css',
    'src/features/prerequisites/ui/styles/prerequisites.css',
]

BARE_SPECTRUM = re.compile(r'(?<![\w-])\.spectrum-[\w-]+')
ATTR_SELECTOR = re.compile(r'\[class[\*\^\$]?=')
COMMENT = re.compile(r'/\*.*?\*/', re.S)


def mask_comments(text: str) -> str:
    return COMMENT.sub(lambda m: ' ' * len(m.group(0)), text)


def is_dead(part: str) -> bool:
    """Bare .spectrum-X with no attribute-selector escape hatch."""
    return bool(BARE_SPECTRUM.search(part)) and not ATTR_SELECTOR.search(part)


def spans_to_drop(text: str) -> tuple[list[tuple[int, int]], int, int]:
    """Byte spans to delete, plus (whole rules, trimmed selectors) counts."""
    masked = mask_comments(text)
    drops: list[tuple[int, int]] = []
    whole = trimmed = 0

    for m in re.finditer(r'([^{}]+)\{[^{}]*\}', masked):
        sel_start, sel_end = m.start(1), m.end(1)
        selector = text[sel_start:sel_end]
        if selector.strip().startswith('@'):
            continue

        # split on commas, keeping each part's absolute offsets
        parts = []
        pos = sel_start
        for chunk in selector.split(','):
            parts.append((pos, pos + len(chunk), chunk))
            pos += len(chunk) + 1

        dead = [p for p in parts if is_dead(p[2])]
        if not dead:
            continue

        if len(dead) == len(parts):
            # Start at the SELECTOR, not at m.start(). The negated-brace group reaches
            # backwards over any preceding comment (masked to spaces but still
            # inside the span), so deleting from m.start() takes the comment
            # documenting the neighbouring rule with it. Caught by the fixture on
            # 2026-09-08 before this touched a real file.
            first = sel_start
            while first < sel_end and masked[first].isspace():
                first += 1
            drops.append((first, m.end()))
            whole += 1
        else:
            for a, b, _ in dead:
                # take the trailing comma with the selector so the list stays valid
                end = b + 1 if b < len(text) and text[b] == ',' else b
                start = a
                # if this was the LAST part, drop the PRECEDING comma instead
                if end == b and text[a - 1] == ',':
                    start = a - 1
                drops.append((start, end))
                trimmed += 1

    drops.sort()
    merged: list[tuple[int, int]] = []
    for a, b in drops:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged, whole, trimmed


def apply(text: str, spans: list[tuple[int, int]]) -> str:
    out, prev = [], 0
    for a, b in spans:
        out.append(text[prev:a])
        prev = b
    out.append(text[prev:])
    return ''.join(out)


def verify(original: str, result: str, spans: list[tuple[int, int]]) -> None:
    """The result must be the original minus exactly those spans, and nothing else."""
    rebuilt = apply(original, spans)
    assert rebuilt == result, 'apply() is not reproducible'
    # every retained character, in order, must be untouched
    kept = ''.join(
        original[a:b]
        for a, b in zip([0] + [b for _, b in spans], [a for a, _ in spans] + [len(original)])
    )
    assert kept == result, 'content outside the removed spans changed'
    # braces must still balance
    masked = mask_comments(result)
    assert masked.count('{') == masked.count('}'), 'unbalanced braces after removal'


def main() -> None:
    tw = tt = 0
    for f in SHEETS:
        p = Path(f)
        if not p.exists():
            continue
        original = p.read_text()
        spans, whole, trimmed = spans_to_drop(original)
        if not spans:
            continue
        result = apply(original, spans)
        verify(original, result, spans)
        p.write_text(result)
        tw += whole
        tt += trimmed
        print(f'  {f:52} {whole:3} whole rule(s), {trimmed:3} selector(s) trimmed')
    print(f'TOTAL: {tw} rules deleted, {tt} dead selectors trimmed from surviving rules')


if __name__ == '__main__':
    main()
