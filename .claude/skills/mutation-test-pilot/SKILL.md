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

## If it takes minutes instead of seconds, check the temp directories

Stryker copies the working tree into a sandbox per test-runner process. Neither
config set `ignorePatterns`, so each run copied the OTHER run's temp directory —
and its own leftovers — into all four sandboxes.

Found 2026-09-01: `.stryker-tmp` at 6.5GB and `.stryker-tmp-pl22` at 5.5GB,
315,000 files between them, from runs that had not cleaned up. The pilot could
not finish in ten minutes against a 35-second baseline, and the log filled with
Babel parse warnings about `.d.ts` files inside the OLD sandboxes — which is the
tell, because a `.d.ts` in a temp dir is not something a pilot over four source
files should be reading at all.

Both configs now carry `ignorePatterns`. After deleting the two directories the
pilot ran in **29s and reproduced 93.37% exactly**, module for module — which is
also what proves the ignore list did not change what gets mutated.

A CLEAN RUN CLEANS UP AFTER ITSELF — verified 2026-09-01, both the pilot and the
sample completed normally and left nothing behind. So residue is not the normal
state, and finding some means a previous run did not finish. That is the useful
reading: gigabytes in a temp dir are a record of interruptions, not of usage.

`cleanTempDir` is `'always'` in both configs since 2026-09-02 — the docs define `true`
as "delete after a SUCCESSFUL run", so a failed run used to leave its sandbox behind.
`'always'` covers failure; it cannot cover a hard kill, so the next paragraph still
holds.

A KILLED RUN ORPHANS ITS WHOLE SANDBOX. Interrupting the sample (Ctrl-C, a session
ending, a timeout) left **1.0GB** behind in one go — so this is not slow accumulation
over months, it is one gigabyte per interrupted run. Delete the temp dir before
re-running after any interruption.

The directories are gitignored, so nothing warns you they are growing. If a run
feels slow, look there first:

```bash
du -sh .stryker-tmp .stryker-tmp-pl22 2>/dev/null
```

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

**But compare PER MODULE, never on the overall percentage.** The sample picks its
modules by a deterministic stride across every source file that has a test, so
adding or removing tests reshuffles which modules it lands on. On 2026-09-01 the
overall figure read 70.73% against a recorded 59.29% — and that comparison was
worthless, because the set had changed (`spectrumTokens`, `integrationCardModel` and
`importProgress` were in; `envMerge` was out). Nothing had improved by eleven points.

`scripts/checkMutationBaseline.mjs` is the authority: it keeps a PER-MODULE baseline,
compares only modules present in both runs, and prints regressions by name. Its
verdict on that same run was the real answer — eleven modules identical, one
regression — and the regression was a genuine finding.

## The pilot's 93% does NOT generalise — 2026-08-30, PL-22

`npm run test:mutation:sample` mutates seven modules chosen by a deterministic stride
across all 423 source files that have a test, plus `envMerge.ts` as a control.

**59.29%**, 1,329 mutants, 16m15s, 372 survivors, 169 uncovered.

| Module | Score | awaits | Survivors |
|---|---|---|---|
| `envMerge.ts` (control, a pilot module) | **100%** | 0 | 0 |
| `commerceCredentialStore.ts` | 95.65% | 5 | 1 |
| `codePatchRegistry.ts` | 84.54% | 2 | 14 |
| `claudeCodeFootprint.ts` | 83.33% | 11 | 16 |
| `mcpSocketPath.ts` | 77.78% | 0 | 2 |
| `daLiveAuthPrompt.ts` | 67.04% | 15 | 53 |
| `siteTools.ts` | 57.33% | 11 | 93 |
| `installHandler.ts` | **41.77%** | 41 | 193 |

The control reproduced its pilot score exactly, so the harness is sound and the gap is
real: **93% on the pilot, 59% on a representative sample.**

**Why, and it is not simply "those tests are worse."** The pilot's four modules average
106 lines, 2 imports and ONE await; two are pure functions. The sample averages 335
lines, 6 imports and 12 awaits. The score falls almost monotonically as `await` count
rises. What mutation testing is measuring here is that **async, heavily-mocked code is
much harder to constrain with tests** — a mock answers the same whatever it is handed,
so mutating the code under it often changes nothing the test can see. That is the same
finding as the repo's standing rule about a mock not seeing a malformed call, arrived
at from the other direction.

So read the pilot's 93% as what good coverage looks like on easy code, not as the
repo's number. The honest headline is the 59%.

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

## Expanding scope has ONE trap, and it produces a plausible number

Stryker mutates the files in `mutate` and runs the tests its **jest config** selects.
Those are two separate hand-maintained lists. Add a file to `mutate` and forget its
test suite, and Stryker reports that file at **0% with every mutant in the "no
coverage" column** — which reads exactly like a module with no real tests.

That happened on 2026-08-30 running the PL-22 sample. Seven of eight files scored 0%,
the eighth (a pilot file, in both lists) scored 100%, and the whole run finished in
19 seconds. The honest reading of that report is "this codebase has almost no
coverage". The true reading is "the run never executed those tests".

Two things to take from it:

- **A fast run is the tell.** Mutation testing re-runs suites once per mutant. If a
  1,300-mutant run finishes in under a minute, it did not run them.
- **The control passed.** A known-good pilot file was included precisely to prove the
  harness worked, and it did — while every other number was meaningless. A control
  proves the tool works, not that you aimed it right.

`tests/sop/mutation-config-pairing.test.ts` now fails the build when a mutated module
has no test selected, for every Stryker config in the repo.

**Never run `gate` or a plain jest run while Stryker is live** without the ignore
patterns in place: the sandbox under `.stryker-tmp*/` is a full copy of the repo, so
jest finds two of every manual mock and its file listings go wrong in ways that look
like real failures. `jest.config.js` ignores `<rootDir>/.stryker-tmp` for exactly this;
it did not until the same day, so the trap was live for this pilot too.

## Related

- `test-strategy-scan` — the census-based read of the suite; this is the empirical one
- `gate` — do the tests pass (run first; a red suite makes the score meaningless)
- ADR-016 — the three-tier test strategy, which names mutation testing as the measure

## Getting more out of it — the 2026-09-02 research

`.rptc/research/stryker-for-this-repo/research.md` is the sourced pass over what
StrykerJS offers that we do not use, checked against our own numbers. The headline:
**mutants can be IGNORED, not just excluded** — a `// Stryker disable <mutator>: reason`
comment keeps the mutant visible in the report while removing it from the score, which
is the honest answer for declaration tables whose values are constrained by a
source-scanning enforcer instead of a unit test.

It also records, with the doc quote that proves it, why those enforcers CANNOT simply
be added to the mutation run: the sandbox never contains `.git`, both derive their file
list from `git ls-files`, and a throwing test counts as a killed mutant.
