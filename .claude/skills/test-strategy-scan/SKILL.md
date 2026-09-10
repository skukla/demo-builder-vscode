---
name: test-strategy-scan
description: The release-cut read of the test suite's STRATEGY — not whether tests pass (that is `gate`), but whether they are testing the right things the right way. Runs the three censuses (craft, queue, ledger) and interprets them against verdicts already paid for. Use at a release cut, before a large test refactor, or when asked "is our test suite actually any good?".
---

# Test-Strategy Scan

`gate` proves the tests PASS. This proves they are worth passing.

It runs three instruments over the whole suite and reconciles their output. All
three are already registered in `tests/sop/toolingRegistry.ts`; this skill is the
release-cut procedure that runs them together and — the load-bearing part — says
which of their numbers mean something.

## When to use
- At a release cut, alongside `codebase-sweep` and `dream`.
- Before starting a large test refactor, to pick the lane worth working.
- When someone asks whether the suite is testing the right things.

## When NOT to use
- "Do the tests pass" — that is `gate`.
- Duplicated test code — that is `code-duplication-scan` (and read its
  overlapping-range false positive first).
- Whether the suite builds the same fake N different ways — that is
  `test-divergence-scan`, a different question.

## Procedure

```bash
H=.rptc/plans/pattern-conformance-audit/harness

node $H/craft-census.mjs      # every suite vs the ADR-016 craft patterns
node $H/test-census.mjs       # the conversion queue's witness coverage
node $H/check-ledger.mjs      # every src file has an adjudicated DI verdict
```

**Capture each exit code into a variable. Never read one through a pipe.**
`check-ledger.mjs` exits 1 on an unreconciled ledger, and piping it through
`tail` reports `tail`'s 0 — which happened on 2026-08-30 and turned a real
failure into a clean-looking all-clear for several minutes. `craft-census`
self-tests its detectors on every run and says so (`selftests: all detectors
fired`); if that line is missing, the census proved nothing.

Then read the output against the table below before acting on any number.

## Which numbers mean something

This is why the skill exists. Three of these columns have been measured and found
NOT to track defects, and each cost real time before that was established. Do not
open a worklist from a column marked *not a defect metric*.

| Signal | Verdict | Why |
|---|---|---|
| `theater` | **REAL** — act on it | A suite that asserts nothing, or asserts its own mock. Was 2, now 1 |
| `nondeterminism` | **REAL** — act on it | Order- or clock-dependent tests. 26 |
| `realWaits` | **REAL** — act on it | Wall-clock sleeps in tests. 16 |
| `doubleStyle: module-wall` / `wall+partial` | **REAL** — the conversion debt | 73 + 20. These are suites mocking whole modules where handed-in fakes would do. This is the lane worth working |
| jscpd self-clones in `tests/` | **PARTLY REAL — check the arithmetic** | 15 reported = 12 real + 3 false positives. A pair whose two ranges OVERLAP in one file is never duplication; see `code-duplication-scan` |

Two columns that used to sit here are **gone**, retired 2026-08-30 with the owner's
approval rather than left in the table as warnings:

- **`logicInTests`** — deleted from `craft-census.mjs`. It matched `for`/`while` at
  the start of a line, which is a shape, not a defect. The reasoning and the bar any
  replacement must clear are recorded in the census file's header.
- **`throw-style`** — never a census column; it was a phase-6 work item
  ("throw-style normalized") in the convergence plan, and it has been struck from
  there. It measured whether a suite used `rejects.toThrow` versus a try/catch, which
  is setup style and says nothing about what a suite would catch.

So the flags the census now emits are exactly the ones worth acting on. If a future
column earns a "not a defect metric" verdict, delete it too — a known-bad number that
stays in the output gets acted on by whoever did not read this file.

**The pattern, four times now in this codebase: a count of what code LOOKS like is
not a count of what is WRONG with it.** Before working any census column, ask what
defect it would catch and whether a clean file could score badly. If a good change
can move the number the wrong way, the number is describing style.

That test is not hypothetical — it is how `logicInTests` was caught. Extracting a
duplicated block into a helper is unambiguously an improvement, and it ADDS a
function to a test file, which the detector counts against you. Two instruments in
the same program then give opposite verdicts on the same commit.

## Reconciling the three

They answer different questions and their totals are not comparable:

- **craft-census** — 1198 suites, all of them. Denominator: every suite.
- **test-census** — only the conversion queue (12 files). `WITNESS: 12` means every
  queued file has a suite that would fail if the conversion broke its collaborator
  calls. That is the precondition for converting it, not a quality score.
- **check-ledger** — 1001 rows across four patterns, reconciled against the
  denominators in `denominators.sh`. It is a COMPLETENESS check: it does not care
  whether a verdict is good, only that every unit has one and every `exempt`
  carries evidence rather than an IOU.

A new source file with no ledger row fails `check-ledger` and nothing else. That is
the intended catch — it fired on `envMerge.ts` the day it was created.

## Acting on findings

Standard repo rule: a census hit is a LEAD. Open the file before sentencing it.
Verified and in reach → fix in the same turn; verified and out of reach → name it
with `file:line` and let the owner choose.

For the one lane that is unambiguously worth working — `module-wall` (73) — the
per-file recipe is the batch recipe in
`.rptc/plans/architecture-test-convergence/overview.md`: witness check FIRST, then
convert, then simplify the suite, then delete the ledger rows, then gate. Reversing
that order ratifies silent breakage as the baseline.

## Related

- `gate` — do the tests pass (run this first; a red suite makes every census moot)
- `code-duplication-scan` — copy-paste in the tests, and its false-positive class
- `test-divergence-scan` — how many different ways the suite builds the same fake
- `tests/sop/toolingRegistry.ts` — all three instruments' registered rows
- ADR-016 — the three-tier test strategy these censuses measure against
