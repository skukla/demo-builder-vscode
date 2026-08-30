---
name: mutation-test-pilot
description: Run the Stryker mutation-testing pilot — the only instrument that measures whether the tests would CATCH a defect, rather than whether they executed a line. Use at a release cut, after writing tests for a module you care about, or when coverage looks good and you want to know if it means anything.
---

# Mutation-Test Pilot

Coverage says a line RAN. It cannot say an assertion would have noticed the line
being wrong. Mutation testing answers that directly: it changes the source in
small ways (flip a condition, delete a `trim()`, blank a string literal) and
re-runs the tests. A mutant that survives is a defect your suite would ship.

ADR-016 names mutation testing as how test effectiveness gets measured. This is
that instrument.

## Run it

```bash
npm run test:mutation        # ~35s over the pilot scope
```

Config: `stryker.config.json` (what to mutate) + `jest.stryker.config.js` (which
tests to run). Report: `reports/mutation/mutation.json`, gitignored.

## Baseline — 2026-08-30, first real run

**93.37%**, 166 mutants over 4 modules, 33 seconds, 11 survivors.

| Module | Score | Survivors |
|---|---|---|
| `sanitization.ts` | 97.06% | 1 |
| `meshStatusResolver.ts` | 90.77% | 6 |
| `projectOwnership.ts` | 90.91% | 4 |
| `envMerge.ts` | **100%** | 0 |

Compare a new run against this table. A score that DROPS means a change went in
that the tests do not constrain.

## What the first run proved, and why it is the argument for the tool

`envMerge.ts` opened at **78.26%** — the worst of the four — and its tests had
been written the same day, deliberately, with a criterion stated in advance. Line
coverage was high. Five mutants survived anyway:

- `rawLine.trim()` → `rawLine` (a whitespace-only line stored an empty key)
- `if (key)` → `if (true)` (a line like `=orphan` stored an empty key)
- `key.trim()` and `valueParts.join('=').trim()` both deleted
- the trailing `+ '\n'` deleted

Every one is a real input a hand-edited `.env` produces, and not one test noticed.
Five targeted tests took it to 100%. **The lesson is not that those tests were
careless — it is that reading your own tests cannot find this, and coverage will
not tell you.**

## Reading survivors — a survivor is a LEAD, not a bug

Three things a surviving mutant can mean. Decide which before acting:

1. **A real gap** — the behaviour matters and nothing asserts it. Write the test.
   All five `envMerge` survivors were this.
2. **An equivalent mutant** — the change cannot alter observable behaviour, so no
   test could kill it. Leave it, and say why.
3. **Dead defensiveness** — common with `?.`. A surviving `authService?.` → 
   `authService.` means either the null path deserves a test, or the `?.` is
   guarding against something that cannot happen. Both are cheap to settle by
   reading the callers; do not guess which from the report.

The 11 current survivors, classified as leads for whoever picks this up:

- **`sanitization.ts` L61** — the replacement string in
  `value.replace(/[\n\r[\]()]/g, '')` can be mutated freely. Nothing asserts those
  characters are REMOVED rather than substituted. This one strips log-injection
  characters, so it is worth a test on merit, not just on score.
- **`meshStatusResolver.ts`** — four string literals (`'.env'`, `'utf-8'`, and the
  `missingFields` contents twice) plus a conditional. Nothing asserts WHICH fields
  are reported missing, only that some are.
- **`projectOwnership.ts`** — three optional-chaining mutants and an empty `catch`.
  Category 3 above; read the callers before writing tests.

## Scope is deliberate — do not point this at the repo

Stryker runs the related tests once per mutant. Over 1198 suites that is hours,
not seconds, and the pilot exists to be run often enough to matter.

`jest.stryker.config.js` narrows the run to the four suites covering the four
mutated modules. That is not only a speed choice — **it is what makes a crash
attributable.** Pointed at the full `jest.config.js`, the dry run executed the
whole suite inside a bare node child process, where an unhandled promise rejection
is FATAL rather than a warning. One leaked rejection anywhere killed the run with
`Something went wrong in the initial test run`, naming neither the test nor the
reason.

That is also how the pilot found its first real bug before scoring anything:
`componentUpdater-core.test.ts` started two updates, awaited the one that resolves,
and left the already-rejected one unhandled until the next line. Jest tolerated it
for as long as the test existed. Fixed by attaching both assertions before awaiting
either.

**To add a module:** add it to `mutate` in `stryker.config.json` AND add its suite
to `testMatch` in `jest.stryker.config.js`. Nothing enforces that pair — if you add
only the first, the module is mutated with no tests to kill anything and scores 0
for the wrong reason.

## When to expand the scope

Good candidates are pure, decision-carrying, and already well tested — that is
where a surviving mutant is most informative. Timer-heavy modules are poor
candidates: mutations that break a delay tend to hit `timeoutMS` and report as
timeouts rather than as survivors.

## Related

- `test-strategy-scan` — the census-based read of the suite; this is the empirical one
- `gate` — do the tests pass (run first; a red suite makes the score meaningless)
- ADR-016 — the three-tier test strategy, which names mutation testing as the measure
