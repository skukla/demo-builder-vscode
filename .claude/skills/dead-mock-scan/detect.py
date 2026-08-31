#!/usr/bin/env python3
"""
Two halves of the same question: does this jest.mock do anything?

STATIC half (`detect`) — mocks that are redundant by construction, found without
running anything. Today that is one rule and it is exact: a BARE automock of a
module `jest.config.js` already redirects through `moduleNameMapper`. The mapping
happens first, so the automock line changes nothing.

  jest.mock('vscode');                    <- redundant, the mapper already handles it
  jest.mock('vscode', () => ({ ... }));   <- NOT redundant, a factory overrides the mapping

That distinction is the whole rule. Conflating them would report 174 findings where
there are 45, and 129 of them would be deliberate overrides someone wrote on purpose.

DYNAMIC half (`verify`) — the only way to answer the question in general. Delete the
mock, run the suite, see whether anything notices. Slow (one suite run per mock), so
it is scoped to a pattern rather than swept over the tree.

  Probing one mock at a time is not enough. Twice — meshVerifier and componentManager
  — a service-locator mock and the line wiring a fake into it were BOTH dead, because
  the subject takes that fake by constructor. Remove either alone and the other keeps
  it alive. So `verify` reports the set as well as the parts.

  A run that never happened reads exactly like a failing one. Three verdicts were
  wrong that way in one session, so every result asserts a `Tests:` summary line
  before it is believed, and says NO SUMMARY rather than guessing.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from glob import glob

REPO = os.getcwd()


def mapped_modules() -> set[str]:
    """Exact `^name$` keys in jest.config.js's moduleNameMapper."""
    cfg = open(os.path.join(REPO, "jest.config.js"), encoding="utf-8").read()
    return set(re.findall(r"'\^([\w./@-]+)\$':", cfg))


def test_files(root: str) -> list[str]:
    out: list[str] = []
    for pat in ("*.test.ts", "*.test.tsx", "*.testUtils.ts", "*.testUtils.tsx"):
        out += glob(os.path.join(root, "**", pat), recursive=True)
    return sorted(set(out))


def strip_comments(src: str) -> str:
    """
    Blank out comments, preserving offsets so slices into the original stay valid.

    Found by this scan's own first run: it reported `tests/sop/test-family-setup.test.ts`
    for a `jest.mock('vscode')` written inside a DOCBLOCK — a sentence about the rule,
    not a call. A detector that reads prose as code will keep finding whatever the
    documentation happens to mention, which is the worst kind of false positive
    because the text usually describes a real instance somewhere else.
    """
    out = list(src)
    for m in re.finditer(r"/\*[\s\S]*?\*/|//[^\n]*", src):
        for i in range(m.start(), m.end()):
            if out[i] != "\n":
                out[i] = " "
    return "".join(out)


def mock_calls(src: str):
    """Every jest.mock in `src` as (module, start, end_of_line, has_factory)."""
    src = strip_comments(src)
    for m in re.finditer(r"jest\.mock\(\s*'([^']+)'", src):
        i = m.start()
        j = src.index("(", i)
        depth = 0
        k = j
        while k < len(src):
            if src[k] == "(":
                depth += 1
            elif src[k] == ")":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        body = src[j : k + 1]
        has_factory = "," in body
        yield m.group(1), i, src.find("\n", k) + 1, has_factory


def detect(root: str) -> int:
    mapped = mapped_modules()
    hits = []
    scanned = 0
    for f in test_files(root):
        scanned += 1
        src = open(f, encoding="utf-8").read()
        for mod, _s, _e, has_factory in mock_calls(src):
            if mod in mapped and not has_factory:
                hits.append((os.path.relpath(f, REPO), mod))

    print(f"== Redundant automocks under {root}/ ==")
    print(
        "   A bare jest.mock of a module moduleNameMapper already redirects. The mapping\n"
        "   wins either way, so the line does nothing. Verified 2026-08-31 on a sample of\n"
        "   five: every one removed with its suite still green."
    )
    if hits:
        for f, mod in hits:
            print(f"   {f}  ->  jest.mock('{mod}')")
    else:
        print("   (none)")
    print()

    # CONTROL. Both directions, because either failure prints a clean-looking report.
    print("== CONTROL ==")
    print(f"   scanned {scanned} test files under {root}/")
    if scanned == 0:
        print("   *** scanned NOTHING — the glob is wrong, not the tree ***")
        return 1
    if not mapped:
        print("   *** parsed NO moduleNameMapper keys — the config regex broke ***")
        return 1
    print(f"   parsed {len(mapped)} moduleNameMapper keys: {', '.join(sorted(mapped))}")
    print(f"   {len(hits)} redundant automock(s)")
    print()
    print("   Reported, never applied: exit code says nothing. Read the list.")
    return 0


def run_suite(pattern: str) -> tuple[int, str | None, int | None]:
    """Exit code, the `Tests:` line, and the TOTAL it reports.

    The total is carried separately because a run whose suites failed to LOAD
    reports a smaller total, and a smaller total reads like a smaller failure.
    Removing one mock here dropped 34 tests to "6 passed, 6 total" — three suites
    never ran at all, which is a bigger fact than any count of failures.
    """
    r = subprocess.run(
        ["npx", "jest", "--no-coverage", pattern], capture_output=True, text=True
    )
    out = r.stdout + r.stderr
    summary = next((l for l in out.split("\n") if l.startswith("Tests:")), None)
    total = None
    if summary:
        m = re.search(r"(\d+) total", summary)
        total = int(m.group(1)) if m else None
    return r.returncode, summary, total


def strip_mocks(files: list[str], mods: list[str]) -> int:
    removed = 0
    for f in files:
        src = open(f, encoding="utf-8").read()
        for mod in mods:
            for m_mod, s, e, _ in list(mock_calls(src)):
                if m_mod == mod:
                    src = src[:s] + src[e:]
                    removed += 1
                    break
        open(f, "w", encoding="utf-8").write(src)
    return removed


def verify(file_glob: str, pattern: str, mods: list[str]) -> int:
    files = sorted(glob(file_glob, recursive=True))
    if not files:
        print(f"   *** no files matched {file_glob} ***")
        return 1

    base_rc, base_summary, base_total = run_suite(pattern)
    print(f"== Verify: {len(files)} file(s), {len(mods)} module(s) ==")
    if base_summary is None:
        print("   *** BASELINE has no summary — the suite does not run. Fix that first ***")
        return 1
    if base_rc != 0:
        print(f"   *** BASELINE is already failing: {base_summary}. Fix that first ***")
        return 1
    print(f"   baseline  {base_summary}")
    print()

    def probe(label: str, subset: list[str]) -> None:
        backups = [(f, f + ".deadmockbak") for f in files]
        for f, b in backups:
            shutil.copy(f, b)
        n = strip_mocks(files, subset)
        rc, summary, total = run_suite(pattern)
        for f, b in backups:
            shutil.move(b, f)
        if n == 0:
            print(f"   {label:<50} NOT PRESENT")
        elif summary is None:
            print(f"   {label:<50} *** NO SUMMARY — run did not happen ***")
        else:
            verdict = "needed" if rc else "DEAD"
            note = ""
            if total is not None and base_total is not None and total < base_total:
                note = f"   <- {base_total - total} test(s) VANISHED: suites failed to load"
            print(f"   {label:<50} {verdict:<8} ({n} removed)  {summary}{note}")

    for mod in mods:
        probe(mod, [mod])
    if len(mods) > 1:
        print()
        probe("ALL OF THEM TOGETHER", mods)
        print(
            "\n   The set matters: a mock and the line that uses it can both be dead while\n"
            "   each keeps the other alive. Two families were only visible this way."
        )
    return 0


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == "--verify":
        if len(args) < 4:
            print("usage: detect.py --verify '<file-glob>' '<jest-pattern>' <module>...")
            return 2
        return verify(args[1], args[2], args[3:])
    return detect(args[0] if args else "tests")


if __name__ == "__main__":
    sys.exit(main())
