---
name: test-divergence-scan
description: Measure how many DIFFERENT ways the test suite builds the same fake — the "every test does it its own way" problem. Run at release cuts alongside the other scans. Proposes, never applies.
---

# test-divergence-scan

**The question**: not "is there duplication" — the clone scan answers that — but
**does every suite invent its own version of a thing the suite has already
solved?**

A logger fake written thirty different ways is thirty chances for one of them to
drift from what the real logger does, and thirty edits when the real one gains a
method. The cost is not the typing; it is that no single edit can fix them all,
and that a suite quietly asserting against a wrong-shaped fake looks exactly like
a passing test.

## Run it

    node .claude/skills/test-divergence-scan/scan.mjs tests

Exit 2 means a probe matched nothing at all — read that as BROKEN, never as
clean. Each probe prints its control counts first for exactly this reason.

## Reading the output

Three numbers per collaborator:

- **suites importing a shared builder** — the good path
- **suites hand-rolling one inline** — the divergence
- **DISTINCT hand-rolled shapes** — the actual finding

The ratio that matters is **shapes to inline uses**. Thirty suites all writing
the *same* three-line fake is untidy but harmless. Thirty suites writing
twenty-six *different* fakes means nobody knows what the fake is supposed to
look like, and the next one will be different again.

Watch **shapes used exactly once** — a shape with one user is a shape nobody
agreed to.

## Baseline (measured 2026-08-28, 1,288 files)

| Collaborator | shared | inline | distinct shapes | most common covers | used once |
|---|---|---|---|---|---|
| HandlerContext | 165 | 4 | 3 | 78% | 2 |
| CommandExecutor | 80 | 81 | 5 | 54% | 2 |
| Logger | 210 | 341 | 30 | 33% | 9 |
| StateManager | 47 | 48 | 26 | 14% | 17 |
| Project fixture | 78 | 38 | 32 | 13% | 25 |

**HandlerContext is the proof the cure works.** 165 suites import
`createMockHandlerContext`; four hand-roll. Not because those authors were more
disciplined, but because a shared builder exists, is findable, and covers the
need. Where that is true, divergence collapses on its own.

**StateManager and Project fixtures are the opposite.** Twenty-six shapes across
forty-eight uses; thirty-two shapes across thirty-eight. Seventeen and
twenty-five of those are used exactly once. That is close to "every suite
invents its own", and it is where a shared builder is missing.

## What this does NOT show, and why that matters

The 2026-08-28 run found **zero wrong Project fixtures in the corpus**. Nine
files matched a `components: [...]` array — the known-wrong invented shape — and
reading all nine showed every one legitimate: block libraries have their own
`components` array (a different domain concept), one file deliberately exercises
a legacy manifest, and one contains the string inside a comment *documenting* the
mistake after it was fixed.

So this is a **risk** finding, not a defect finding. Say it that way. The
mechanism has bitten once (`projectStatusTool.test.ts` guessed the Project shape
and three tests failed against the real accessors), it is documented in
`mcp-tool-authoring` and `webview-test-authoring`, and it is currently contained.

Reporting nine defects here would have been wrong, and the only thing that
prevented it was opening all nine files. A grep hit is a lead.

## Fixing what it finds

Not by writing a rule telling people to share. HandlerContext shows what
actually works: **provide the builder, put it where the suites already look, and
make it cover the real shape.** Suites converge on it without being told.

Order by shapes-used-once, since those are the least considered:
Project fixture (25), StateManager (17), Logger (9).

## Relationship to the other scans

- `code-duplication-scan` finds copy-pasted LOGIC. This finds *divergent* copies
  of the same intent, which jscpd cannot see because they are not similar enough.
- `component-extraction-scan` is the UI equivalent for markup.
- The split-family ledger (`tests/sop/test-family-setup.test.ts`) covers a
  narrower case: suites of ONE module not sharing setup. This one is corpus-wide
  and does not care whether two suites are related.
