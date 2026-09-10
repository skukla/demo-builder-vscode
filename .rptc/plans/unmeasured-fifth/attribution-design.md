# What a module should be measured against — a proposal

**Step 3 of [the unmeasured fifth](overview.md). Design only: nothing in `scripts/`, no config
and no baseline row was changed to write this.** Four Stryker runs and one census were taken to
measure it; every file they created has been deleted and `git status` is clean apart from this
document.

## The answer, first

Attribution should key on **jest's own inverse dependency graph** — the same
`jest --listTests --findRelatedTests <module>` step 2 already used — **but only where the
filename rule finds nothing.**

Keying *everything* on it is the more obviously correct rule and it costs **15.8× more per
sweep: 4.8 hours becomes about 76** (arithmetic in §4). On the two modules where both rules were
actually run today it bought nothing at all — same score, same open gaps, 7.9× and 40.9× the
wall time.

Using it as a **fallback** makes **165 of the 180 modules the instrument refuses today**
measurable, leaves all 629 existing baseline rows byte-identical (provable in seconds, not by
re-measuring), and costs about **20 hours once** for the modules that have no measurement at all
right now.

## 1. What the rule is today, and everything that rests on it

A module is measured against the suites that share its filename in its mirror directory —
`scripts/focusModule.mjs:46-65`, plus `strayedSuites` at `:81-96` for a suite that sits in the
wrong folder and no same-named module could claim. A module with no such suite is refused
outright (`scripts/focusModule.mjs:257-265`) rather than measured at a confident zero.

Four things read that rule:

| where | what it does with it |
|---|---|
| `scripts/focusModule.mjs:46` | the rule itself; generates `mutate` + `testMatch` |
| `scripts/mutationSweep.mjs:33,139-142` | logs `skip-no-suite` and moves on (31 such rows in the sweep log) |
| `scripts/mutationRedundancySweep.mjs:29,54` | picks the suites to probe for redundancy |
| `tests/sop/mutation-config-pairing.test.ts:38-66` | **a second copy of the same rule**, enforcing that every mirroring suite is selected |

`focusModule.mjs:266-274` already records that two attempts to check whether a selected suite
actually *exercises* the module were tried on 2026-09-03 and both were wrong. That is the right
finding and it points at the fix: no text heuristic can see an import graph, but jest can.

## 2. Stryker already narrows — so the filename rule's only real defect is omission

Every Stryker config in this repo runs with `enableFindRelatedTests: true` and
`coverageAnalysis: "perTest"` (`stryker.focus.config.json:8,20`; the same two settings in
`stryker.config.json`, `stryker.pl22.config.json` and `stryker.redundancy.config.json`).

That flag is not decoration. In the runner:

- the **dry run** hands jest the mutated files as `--findRelatedTests`
  (`node_modules/@stryker-mutator/jest-runner/dist/src/jest-test-runner.js:67-69`);
- each **mutant run** hands it the single sandbox file (`:92-94`);
- jest answers by walking the **inverse dependency graph** — `findRelatedTests` →
  `resolveInverse`, filtered by `isTestFilePath` so it still respects `testMatch`
  (`node_modules/@jest/core/build/index.js:522-551`), and the walk is transitive over the whole
  file set (`node_modules/jest-resolve-dependencies/build/index.js:103-150`).

Two consequences, and they decide the shape of the fix:

**Errors of inclusion are already free.** A suite named for a module it never imports is never
run — jest drops it before the dry run. The census below found 23 such suites across 16 modules
(the PL-45 shape, still on disk), and none of them can be affecting any score. The one way that
shape *does* bite is when it leaves a module with no related suite at all in `testMatch`, which
is the "0% in 19 seconds" failure `jest.focus.config.js:9-12` describes.

**Errors of omission are the whole defect.** Stryker can only ever narrow the set the jest
config selects. A suite that covers the module and is not in `testMatch` cannot be chosen, and
the mutants it would have killed are reported as uncovered.

### Can the attribution be inverted, as the plan asks?

**No — not for free.** Stryker's per-test coverage is computed *during the dry run, over exactly
the tests the jest config selected*. It is not a pre-existing map of the whole suite waiting to
be read the other way round. Asking "which tests cover this mutant?" across the whole suite
means putting the whole suite in the config and running it, which is Option 3 below and costs
what Option 2 costs.

## 3. What was measured

### The census — 809 modules, both rules, ~7 minutes

For every module: `node node_modules/.bin/jest --listTests --findRelatedTests <module>`,
compared against `suitesFor()` imported from `scripts/focusModule.mjs`. The 809 are the 629
baseline rows plus the 180 that `node scripts/mutationScope.mjs --list blocked` reports.

| | modules | mean suites | median | p90 | max | total suite-selections |
|---|---|---|---|---|---|---|
| filename rule, measured modules | 629 | 2.2 | 1 | 5 | 18 | **1,397** |
| jest-related, measured modules | 629 | 81.6 | 35 | 186 | 828 | **51,353** |
| jest-related, refused modules | 180 | 80.3 | 27 | 231 | 676 | 14,452 |

- **600 of the 629** measured modules have more related suites than mirroring ones; 27 have
  exactly the same set; 2 have fewer.
- **16 modules carry 23 mirroring suites jest says are unrelated** — including
  `DashboardStatusHeader-layout.test.ts`, the stylesheet suite PL-45 already found, and six of
  the `-predicates` / `.helpers` shape, where a suite named for a component tests the helper
  module beside it. As established above, these cost nothing today — but one of them shows both
  halves of the problem in a single file. `BrandGallery.helpers.test.ts` is counted as a
  mirroring suite of `BrandGallery.tsx`, where it contributes nothing, while the module it
  actually tests — `brandGalleryHelpers.ts` — has no mirroring suite of its own and is therefore
  one of the 180 the instrument refuses. `projectsDashboardHelpers.ts` is the same pair.
  One misfiled name loses a module at both ends.
- **165 of the 180 refused modules have at least one related suite** (mean 87.6, median 34).
  The remaining **15 have none**: eight webview entry points (seven `*/ui/index.tsx` plus
  `dashboard/ui/main.tsx`), `mcp-proxy.ts`, `mcpToolServer.ts`, two `*Types.ts` files, and three
  hooks.
  Those are a test-writing job, not an attribution one, and the fallback rule refuses them for
  the honest reason.

### The A/B — two modules, both rules, real Stryker runs

Probe configs were written at the repo root (the trap step 2 documents), run, and deleted.
`incremental: false` in both, `concurrency: 4`, `timeoutMS: 20000` — otherwise identical to
`stryker.focus.config.json`.

| module | rule | suites | tests in dry run | tests/mutant | wall | score | openGaps |
|---|---|---|---|---|---|---|---|
| `updates/services/addonUpdateChecker.ts` (70 mutants) | filename | 2 | 24 | 7.03 | **13 s** | 72.86% | 0 |
| same | jest-related | 24 | 341 | 7.20 | **103 s** | 72.86% | 0 |
| `eds/services/configSyncService.ts` (108 mutants) | filename | 1 | 22 | 7.21 | **17 s** | 71.30% | 0 |
| same | jest-related | 137 | 1,993 | 25.38 | **695 s** | 71.30% | 0 |

Both scores match their pinned baseline rows exactly. **7.9× and 40.9× the time for an
identical answer.**

One thing moved that the score hid: in the wide `configSyncService` run, five mutants went from
Killed to Timeout (76/1 → 71/6). The score held only because Stryker counts a timeout as
detected. A wide run sits nearer the 20-second wall, and at a tighter timeout those five would
have read as survivors and the score would have *fallen*.

### The cost model, and the control that makes it trustworthy

The four runs fit `time ≈ 12 s + 0.05 s × (suites × mutants)`.

Applied to today's rule across the 629 baseline modules (Σ suites×mutants = **218,006**) it
predicts **307 minutes**. `reports/mutation/sweep-log.jsonl` records the real sweep:
**289.7 minutes** over 651 measured runs. **6% high** — that agreement is the model's control,
and without it the numbers below would be arithmetic about nothing.

Σ suites×mutants under the jest-related rule is **5,331,758** — 24.5× more work:

| scenario | Σ suites×mutants | modelled | note |
|---|---|---|---|
| today, 629 modules | 218,006 | 307 min ≈ **5.1 h** | measured 289.7 min |
| all 629 on jest-related | 5,331,758 | 4,569 min ≈ **76 h** | **15.8×** |
| the 165 fallback modules only | 1,416,296 | 1,213 min ≈ **20 h** | one-time; they have no measurement today |

## 4. The options

### Option 1 — filename rule first, jest-related as the fallback ✅ RECOMMENDED

`suitesFor()` keeps its current body. When it returns nothing, and only then, the suite set
comes from `jest --listTests --findRelatedTests <module>`. `focusModule.mjs:257-265` keeps
refusing — but now only the 15 modules nothing reaches.

- **Fixes** the third shape, which is the one this item is about: a module tested only through
  a consumer's suite and therefore never measured. 165 modules, `agentsMdSections.ts` among
  them.
- **Does not touch** any of the 629 rows: for every module that has a mirroring suite the rule
  is byte-identical, so no existing measurement changes cost or meaning.
- **Costs** ~20 hours of unattended sweep for work that cannot be done at all today, and
  nothing for work that can.
- **One other file has to change with it.** `tests/sop/mutation-config-pairing.test.ts:96-104`
  decides "is this module covered?" by grepping the selected suites' *text* for the module's
  stem. For **81 of the 165** fallback modules no related suite mentions the stem — measured —
  so that enforcer goes red the first time the focus config targets one. It has to ask jest the
  same question the rule now asks. Its own CONTROL cases (`:174-200`) keep the mirror half
  honest while that happens.

**SAFE-TO-LAND.** The control is §5 below: an equality check over all 629 baseline modules that
runs in seconds, with a positive control that fails if the comparison is blind, plus an exact-
equality re-measure of a sample and the full jest suite for the two copies of the rule.

### Option 2 — key every module on the jest-related set

Delete the filename rule; `suitesFor()` becomes a wrapper around jest's resolver for everything.
Cleaner to describe, and it drops the 23 dead suite entries as a side effect.

**NEEDS-THE-OWNER — cost.** Every future sweep goes from a measured **4.8 hours to ~76**, and a
single module from ~30 seconds to ~4 minutes at the mean (the `configSyncService` probe: 17 s →
695 s). That is a standing decision about every measurement from now on, not a one-off.

It *also* changes the meaning of the 628 rows — see §6 — but cost is the binding reason, and on
the evidence available (2 of 629 modules re-measured under both rules) it buys no accuracy for
modules that already have a row.

### Option 3 — one whole-repo run, attribute from Stryker's per-test coverage

Put the entire test tree in `testMatch`, mutate everything, and read per-module rows out of the
one report — `summarise()` is already keyed by file (`scripts/mutationBaseline.mjs:139`), so
nothing downstream changes.

**NEEDS-THE-OWNER — cost.** It is not cheaper than Option 2: the per-mutant runs are the same
work, because `mutantRun` narrows to the same related tests either way
(`jest-test-runner.js:92-94`). It only replaces 629 small dry runs with one large one. Against
that it loses the property `scripts/mutationSweep.mjs:16-26` was built for — a sweep that can be
stopped and resumed, skipping what is already pinned. A 76-hour run that must complete in one
piece is worse than 629 that need not.

## 5. How to prove the new set is right

For **Option 1**, three checks, all runnable:

1. **Equality control (seconds).** For all 629 paths in `reports/mutation/baseline.json`, assert
   `newSuitesFor(m)` deep-equals the old `suitesFor(m)`. Any difference is a bug, not an
   improvement — the fallback is defined never to fire for these modules.
   **Its positive control:** `newSuitesFor('src/features/project-creation/services/aiBundle/agentsMdSections.ts')`
   must be non-empty while the old rule returns `[]`. Without it, an implementation that simply
   always called the old rule would pass check 1 perfectly.
2. **Score control (~5 minutes).** Re-measure three pinned modules under the config generated
   before and after, and require the `summarise()` rows to be **exactly equal** — score, killed,
   survived, noCoverage, timeout, openGaps. Not "no score rose": *equal*. Worked today, and
   these are the numbers a later session can compare against:
   `addonUpdateChecker` 72.86% / 0 gaps under both rules; `configSyncService` 71.30% / 0 gaps
   under both.
3. **The full jest suite**, because the rule exists in two places
   (`focusModule.mjs:46` and `mutation-config-pairing.test.ts:38`) and the redundancy sweep
   imports the first.

For **Options 2 and 3**, the control the plan asks for — re-measure a sample under both rules
and show no score rose without a coverage reason — **is necessary and not sufficient, and today
proves it**: two modules were re-measured under both rules and neither moved at all. A small
sample of a change whose whole point is that scores rise will mostly show nothing and pass. The
sufficient form is mechanical and the report already carries the data: for every mutant whose
status improved, the new report must name a `killedBy`/`coveredBy` test that the old config did
not select. Both fields are present per mutant, alongside a `testFiles` map, in the JSON reporter
output.

## 6. What happens to the 628 rows

**Under Option 1: nothing.** Byte-identical suite sets, proved by check 1 in seconds rather than
by a 76-hour re-measure.

**Under Options 2 and 3**, every row is a measurement of a different suite set. Two things are
worth knowing before deciding:

- **PL-22's zero survives.** `openGaps` counts behavioural survivors and behavioural uncovered
  mutants identically (`scripts/mutationBaseline.mjs:172-185`). Adding tests can only move a
  mutant NoCoverage → Killed/Survived/Timeout or Survived → Killed/Timeout, never the reverse.
  So `openGaps` can only fall or hold. No module that reads zero today can start reading more.
- **The score floor does not.** The 629 pinned scores would describe a narrower suite set than
  the one being run, so `compare()`'s "score FELL" rule (`scripts/mutationBaseline.mjs:298-303`)
  stops being like-for-like. Making them comparable again *is* the 76-hour run.

Two hazards that only show up on a wide set, both observed or grounded in the code:

- `summarise()` totals only Killed / Survived / NoCoverage / Timeout
  (`scripts/mutationBaseline.mjs:158-168`). A mutant that turns into a runtime error under a
  wider set leaves the denominator entirely and moves the score by an amount nothing explains.
  It did not happen in either probe — both totals held at 108 and 70 — but nothing prevents it.
- More tests per mutant means longer mutant runs. Five of `configSyncService`'s kills became
  timeouts at 137 suites.

## 7. What this does not fix

- **A module replaced by a `jest.mock` or an injected double.** `--findRelatedTests` reads a
  *static* graph: a suite that imports a module and then mocks it is still "related". Widening
  the set runs more suites that do not execute the code. `storefrontRepublishService.ts` is the
  worked example — mocked by 10 of the 12 suites that name it (PL-50) — and the census gives it
  110 related suites. Its score stays honest (the mutants read uncovered) but no rule change
  makes it *measurable*; that is test design, and `dead-mock-scan` is the instrument for it.
- **The 15 modules nothing reaches.** Listed in §3. Somebody has to write a test.
- **Whether a selected suite ASSERTS anything about the module.** Unchanged, and
  `focusModule.mjs:266-274` already says why every attempt to check it statically was wrong.
- **Score borrowing inside a GROUP.** `focusModule` can focus several modules at once, and the
  dry run hands jest *all* of them together (`jest-test-runner.js:67-69`), so the coverage map is
  built from the union of their related suites. That is the mechanism behind the owner's
  observation that `diagnosticsReport` reads 43.12% beside its sibling and 41.53% alone: the
  higher figure is real coverage the narrow rule could not see on its own, and the fallback rule
  does not change it either way. If a row's score should not depend on what it was measured
  beside, the fix is to stop grouping or to record the group on the row — a separate change,
  cheap, and worth doing before any of the three options above.

## The verdict

RECOMMENDATION-VERDICT: SAFE-TO-LAND

Options 2 and 3 are both NEEDS-THE-OWNER, and both for the same reason: cost. 4.8 hours becomes
about 76, permanently.

## Reproducing the numbers

```bash
# the census (~7 min): every module, both rules
node node_modules/.bin/jest --listTests --findRelatedTests <src/path/to/module.ts>
node -e "import('./scripts/focusModule.mjs').then(m => console.log(m.suitesFor('<src/path>')))"

# the module population the fallback would newly reach
node scripts/mutationScope.mjs --list blocked      # 180; 165 have a related suite

# the A/B: a probe config pair at the repo ROOT (never in /tmp, never absolute rootDir),
# jest config requiring './jest.config.js', incremental false, then `npx stryker run`
```
