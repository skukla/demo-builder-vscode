"""
Strip `!important` from declarations that sit INSIDE a cascade layer.

ADR-018 §2: those exist to compensate for our own `@layer theme` wrapper, which put
every plain rule we write below Spectrum's unlayered ones. Once vendor CSS sits in a
layer BELOW ours, a normal declaration wins on its own.

Scoped to LAYERED declarations deliberately. The three unlayered sheets carry 17
between them, and an unlayered `!important` may be beating one of OUR layered rules
rather than Spectrum's — a different question.

INDEX-BASED BY CONSTRUCTION. A first version walked the text with a character
buffer and dropped the buffer whenever it met a comment, silently deleting 806
lines from utilities.css. This version never rebuilds the text: it finds the
byte span of each `!important` to remove and deletes exactly those spans, so the
only possible edit is the one intended. `verify()` then proves it.
"""
import re
import subprocess
from pathlib import Path

# EVERY tracked stylesheet, enumerated rather than listed. The hand-written list
# this replaced named SIX files and was written when there were nine; the
# migration ended with 33, so it would have swept a fifth of the corpus and
# reported a total that looked like the whole job.
SHEETS = [
    f for f in subprocess.check_output(['git', 'ls-files', '*.css'], text=True).split()
    if 'node_modules' not in f
]

COMMENT = re.compile(r'/\*.*?\*/', re.S)
IMPORTANT = re.compile(r'\s*!important')


def mask_comments(text: str) -> str:
    """Same length, comments blanked — so indices stay valid."""
    return COMMENT.sub(lambda m: ' ' * len(m.group(0)), text)


def layered_spans(text: str) -> list[tuple[int, int]]:
    """Byte spans of every `!important` that sits inside an @layer block."""
    masked = mask_comments(text)
    depth = 0
    layer_depths: list[int] = []
    # `prefers-reduced-motion` is the ONE legitimate !important in a layered sheet.
    # reset.css sits in `@layer reset`, the LOWEST layer, and its reduced-motion
    # block exists to override everything above it. Strip that and accessibility
    # reduced-motion silently stops working — no test fails, nothing renders wrong,
    # and the people it matters to are not in the room.
    reduced_depths: list[int] = []
    spans: list[tuple[int, int]] = []
    last_break = 0

    i = 0
    while i < len(masked):
        ch = masked[i]
        if ch == '{':
            head = re.split(r'[};]', masked[last_break:i])[-1].strip()
            depth += 1
            if head.startswith('@layer'):
                layer_depths.append(depth)
            if 'prefers-reduced-motion' in head:
                reduced_depths.append(depth)
            last_break = i + 1
        elif ch == '}':
            if layer_depths and layer_depths[-1] == depth:
                layer_depths.pop()
            if reduced_depths and reduced_depths[-1] == depth:
                reduced_depths.pop()
            depth -= 1
            last_break = i + 1
        elif ch == ';':
            if layer_depths and not reduced_depths:
                for m in IMPORTANT.finditer(masked, last_break, i):
                    spans.append(m.span())
            last_break = i + 1
        i += 1
    return spans


def apply(text: str, spans: list[tuple[int, int]]) -> str:
    out = []
    prev = 0
    for a, b in spans:
        out.append(text[prev:a])
        prev = b
    out.append(text[prev:])
    return ''.join(out)


def verify(original: str, result: str, spans: list[tuple[int, int]]) -> None:
    """The result must be the original with EXACTLY those spans deleted."""
    assert apply(original, spans) == result, 'apply() is not reproducible'
    removed = len(spans)
    assert result.count('!important') == original.count('!important') - removed, (
        'the !important count did not fall by exactly the number of spans removed'
    )
    # every surviving character of the original, minus the spans, is present in order
    kept = ''.join(original[a:b] for a, b in zip(
        [0] + [b for _, b in spans], [a for a, _ in spans] + [len(original)]))
    assert kept == result, 'content outside the removed spans changed'


def main() -> None:
    total = 0
    for f in SHEETS:
        p = Path(f)
        if not p.exists():
            print(f'  MISSING {f}')
            continue
        original = p.read_text()
        spans = layered_spans(original)
        result = apply(original, spans)
        verify(original, result, spans)
        if spans:
            p.write_text(result)
        total += len(spans)
        print(f'  {f:52} removed {len(spans):5}  lines {len(original.splitlines())} -> {len(result.splitlines())}')
    print(f'TOTAL removed from layered declarations: {total}')


if __name__ == '__main__':
    main()
