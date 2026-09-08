---
id: PL-48
kind: chore
area: platform
needs: []
value: high
status: active
parent: PL-11
---

# Read the most repetitive suites. Consolidation is the excuse, not the point.

Measured 2026-09-07 by the redundancy sweep that ran straight after [[PL-22]] reached zero.
The sweep completed all 609 modules and its own summary
(`reports/mutation/redundancy/summary.jsonl`) partitions **21,429 tests** exactly three ways:

| | | |
|---|---|---|
| Catch something no other test catches | 8,073 | 38% |
| **Catch things, but nothing uniquely** | **12,564** | **59%** |
| Catch nothing at all | 792 | 4% — that is [[PL-49]] |

This item is the middle row — and, just as importantly, what not to do with it.

An earlier draft of this item cited 7,599 of 15,227 from a partial log parse midway through
the run. Those numbers were real but incomplete; these are the sweep's own totals.

## RESCOPED 2026-09-07, after three files — the ranking is a reading order, not a worklist

This item was filed to consolidate the suites with the highest redundancy. Three of them have
now been examined and the premise has failed twice while the exercise paid twice, so the item
is restated to match what it actually delivers.

**What consolidation does NOT do — measured, not argued.** Phase 1 turned `fieldValidation`'s
three suites into tables: 647 lines became 322 and every assertion got stronger. The
redundancy metric did not move by one point. 90 tests became 99, still 100% redundant, the
minimal covering set still 6. `it.each` emits one test per row and the rows still overlap in
what they catch, so this kind of consolidation cannot move the number and never could.

**And two of the three top candidates were not repetition at all.** They were arithmetic:

| candidate | ranked | what it actually was |
|---|---|---|
| `adobeEntityService` | 50 / 51 | a 76-LINE FACTORY with two decisions. Its 51 tests assert "fetch organizations via SDK" and "fall back to CLI" — the behaviour of `AdobeEntityFetcher`, which already has fourteen suites at 100%. 51 tests crossing two decisions reads as 98% redundant and means nothing |
| `promiseUtils` | 33 / 35 | genuine repetition — five tests re-testing three behaviours under domain names |
| `fieldValidation` | 84 / 90 | genuine repetition — one test written ninety times with different data |

A high ratio means "many tests, few decisions". That happens when a suite repeats itself AND
when a module simply has little to decide, and the number cannot tell them apart. Only reading
can.

**What reading them actually found**, none of it visible in any metric:

- **A production defect.** `withTimeout` never checked `signal.aborted`, so an
  already-aborted AbortSignal was ignored and the caller waited out the whole timeout —
  reaching a THIRTY-MINUTE timeout on project creation, reporting a timeout for a build the
  user had cancelled.
- **Three vacuous assertions.** `expect(result.timedOut || result.cancelled || result.result).toBeTruthy()`
  is true for every outcome. One carried a comment describing the defect above instead of
  failing on it. Two more accepted either outcome of a zero timeout.
- **An uncovered decision** in `fieldValidation` — composition order — and two dispatcher
  tests that would have passed with a broken switch label, because a VALID value cannot
  distinguish routing from fall-through.
- **A dead module.** Following what `adobeEntityService` constructs found `adobeEntitySelector`,
  which had a suite and had never been measured, and eight more like it.

**So the item is now: read the most repetitive suites, highest ratio first, and fix what
reading finds.** Consolidation still happens where the repetition is real — it is how you are
forced to read every case — but it is the method, not the goal, and the metric it was
supposed to move will not move.

**Done is no longer a list of files.** It is: each candidate below either read and acted on,
or read and recorded as arithmetic. Stop when two consecutive candidates yield nothing.

## What the number actually means

Mutation testing breaks the source on purpose — flips a comparison, empties a function body,
swaps a literal — then runs the tests. A test that fails has CAUGHT that change.

The "minimal set" is the smallest group of tests that still catches every change any test
caught. Everything else is reported droppable: removing it would not alter the module's
mutation result.

`accsDiscoveryConfig.ts` is the worked example, small enough to read in full — 19 tests
against 56 possible changes:

- emptying the function body at line 94 makes **10 different tests fail**
- but **24 of the 56 changes are caught by exactly one test each**

So 9 of the 19 are droppable, and that is a true statement about the score and a misleading
one about the tests.

## Scope: the outliers only — about 3% of that 12,564

This item does NOT propose working through the 59%. The modules it names hold 384 redundant
tests, and the redundancy is too spread out for any plan to reach much more: 111 modules hold
half of it, 277 hold 80%.

**~59% is also normal here.** Median redundancy across the 527 modules with ten or more tests
is **58%** (middle half 44–71%), so the typical module already looks like the headline
number. The targets below sit at 90–100%, the 95th percentile and above. No benchmark says
what a healthy ratio is, so the extremes are the only part that can be acted on without
inventing a threshold.

## Why deleting on this metric would be wrong

**Those 10 tests are not checking the same thing.** They assert different outcomes — a
return value, an error message, which service was selected — and merely happen to run
through the same line. Mutation testing only ever asks "did some test fail?"; it cannot ask
"was the right thing checked?". Overlap in what BREAKS a test is not overlap in what it
VERIFIES.

**And the set is not unique.** It is built greedily: take the test catching the most, then
the next. A different starting order yields a different set of the same size. The metric
therefore reports HOW MUCH slack exists and never WHICH tests are the slack. Any plan that
needs a specific list of tests to remove cannot be built on this number.

## What to do instead: consolidate the outliers

The actionable signal is the RATIO per file, not the total. Ten tests failing on one change
means ten tests driving the same path with different inputs. That is repetition, and its
cost is maintenance — when that code changes, all ten need editing. The fix is to merge them
into one table-driven test, which removes the future work and loses no assertion.

Ranked by ratio, minimum 25 tests, from the final summary:

| redundant / tests | | module |
|---|---|---|
| 90 / 90 | **100%** | `core/validation/fieldValidation.ts` |
| 50 / 51 | 98% | `features/authentication/services/adobeEntityService.ts` |
| 78 / 81 | 96% | `features/project-creation/services/aiBundle/aiContextWriter.ts` |
| 33 / 35 | 94% | `core/utils/promiseUtils.ts` |
| 33 / 35 | 94% | `features/eds/services/patches/patchTargetPolicy.ts` |
| 24 / 26 | 92% | `features/eds/services/pdp/pdpUrlEncoding.ts` |
| 39 / 43 | 91% | `core/state/transientStateManager.ts` |
| 37 / 41 | 90% | `features/project-creation/services/sanitization.ts` |

**`fieldValidation.ts` is 90 of 90 — every single test, no exceptions.** Not one of its
tests catches anything the others do not, which for a pure validation module is the exact
signature of one test written ninety times with different data. It is the obvious first
target and the cheapest proof of the method.

Then `adobeEntityService.ts` and `promiseUtils.ts`: small, pure, and enough to establish the
pattern before anything touches an 81-test bundle writer.

## The fast-follow slice: fieldValidation, 90 tests against 21 decisions

Stated precisely, because the raw ratio undersells it. `core/validation/fieldValidation.ts`
is 109 lines that generate **21 mutable decisions**, and it has **90 tests** spread over
three suite files (16 + 35 + 39). The minimal catching set is **6**.

Six tests catch everything the ninety catch.

That is not a metric artefact — it is 90 tests written against 21 decisions, which is what
input-variation testing looks like when nobody consolidates it. The three suites are already
split by function (dispatcher, commerce URL, project name), so the shape is there: each
becomes one table-driven test per function with the cases as data.

**The slice:** consolidate those three suites, re-measure the module, and require the open
gap count to still read zero. One module, a few hours, and it establishes both the method
and the proof step for everything after it.

Do NOT set a target of 6 tests. The minimal set is what the SCORE needs; the readable set is
larger, because cases worth naming for a human are worth keeping even when another test
already catches the same decision. The goal is removing repetition, not reaching a number.

Then `adobeEntityService.ts` (50 of 51) and `promiseUtils.ts` (33 of 35) as the second and
third, before anything touches an 81-test bundle writer.

## A caution the same normalisation raises

The redundancy count is inflated by the same thing that inflates [[PL-49]]'s: a module with
few mutable decisions and many tests will report high redundancy whatever the tests do. Judge
a candidate by decisions-per-test, not by the raw percentage — `fieldValidation` survives
that check (21 decisions, 90 tests) and is a real finding; something with 5 decisions and 20
tests probably is not.

## The safety net, which is new as of today

[[PL-22]] left every module at zero open gaps, so a consolidation is now FALSIFIABLE:
re-measure the module afterwards and the gap count must still read zero. If it moves, the
tests removed were load-bearing and the change is wrong. Before this week there was no
baseline to check against and this work would have been guesswork.

Do that per module, not per batch — the module is the unit the ratchet measures.

## Done means

Each module in the table is either consolidated with its gap count still zero, or has one
line recorded saying why its repetition is worth keeping. Not "the 50% is gone" — that
number will barely move, and it is not the goal.

## The plan

`.rptc/plans/test-suite-consolidation/overview.md` sequences this item with
[[PL-49]]: Phase 1 is this item's pilot, Phase 3 its continuation, and the gate between them
decides whether Phase 3 happens at all.

## Shipped so far

- nothing yet; measured and specified 2026-09-07.
- 2026-09-07  Phase 1 shipped: fieldValidation consolidated, 647 lines -> 322, ratchet held (95.24%, 0 survivors). Finding: the redundancy metric did NOT move (90 tests/90 redundant -> 99/99, minimal cover 6 both times) — it.each emits one test per row, so consolidation cannot reduce the 59%. Value is lines, maintenance and assertion strength; reading the cases also found one uncovered decision and three weak assertions.
- 2026-09-07  docs(plan): Phase 1 answered the gate — continue, but not for the reason the plan gave (`cbc826510`)
- 2026-09-07  test(validation): fieldValidation as data — half the lines, and the metric did not move (`177402a0f`)
- 2026-09-07  docs(plan): state the ceiling — this reaches 3% of the 59%, and that is the right amount (`fa6ea7547`)
- 2026-09-07  docs(plan): the workplan for consolidating what the suite actually constrains (`0ce1494ec`)
- 2026-09-06  docs(backlog): the sweep's FINAL totals — and two claims in the first draft were wrong (`13e18001c`)
- 2026-09-06  docs(backlog): PL-48 and PL-49 — what the redundancy sweep found, and what not to do with it (`fa2bbd6c6`)
- 2026-09-08  Rescoped 2026-09-07 after three candidates. Consolidation does not move the redundancy metric - measured in Phase 1, where 647 lines became 322 and the number did not shift a point. Two of three top candidates were arithmetic (many tests crossing few decisions), not repetition. But reading them found a production defect in withTimeout (an already-aborted AbortSignal ignored, on a 30-minute project-creation timeout), three vacuous assertions, an uncovered decision, and a dead module. The item is now: read the most repetitive suites highest-ratio-first and fix what reading finds; consolidation is the method, not the goal.
- 2026-09-08  Candidate 5, aiContextWriter.ts (78/81) — ARITHMETIC, recorded, nothing consolidated. The module is a 40-line composer plus a 3-line writer: 12 mutants, already 100% with zero open gaps before this. Its 81 tests are not repetition — they assert the CONTENT of agentsMdSections.ts (644 lines, 16 section builders), which has no suite of its own, so focusModule finds no mirror for it and it has NEVER been mutation-measured. That misfiling is what produces the ratio. Reading the 81 found six assertions that could not fail or could not fail usefully, and one uncovered decision: nothing asserted the built-in arm of the block-library type ternary, and the custom arm was asserted by toContain('custom'), which is satisfied 3x by unrelated Storefront and PDP prose. Collapsing the ternary to always-custom passed 33/33 before and fails now (control run both ways). Also fixed: toContain('do not') (satisfied 5x in a headless doc with no PDP section at all), two not.toContain injection assertions true of any mangling, a bare toBeDefined on the mkdir call, and a test whose name claimed an ordering nothing asserted. aiContextWriter held at 100.00%, 0 open gaps.
- 2026-09-08  Candidate 6, transientStateManager.ts (39/43) — the ratio was DEAD CODE, not repetition. Eight of eleven public methods had zero callers in src/: setWithTTL, getWithTTL, has, remove, isNotificationDismissed, dismissNotification, getPreferredLogChannel, setPreferredLogChannel. The class shipped whole from a plan in .rptc/complete/ in Nov 2025 with 43 tests; production adopted get and set only, nine months later, in the data installer. Deleted the dead API, the TTLValue interface and the constructor's setKeysForSync call — all three sync keys are written only by the deleted helpers, and whatsNew.dismissed was written by nothing, ever. 150 lines -> 46. The three-suite family and its .testUtils collapsed to one table-driven suite: 43 tests -> 20, and get's '!== undefined' guard is now pinned against all four falsy-but-stored values (0, empty string, false, null) where before only null was covered. Also fixed a test whose name said the opposite of its assertion ('should return default value when stored value is null' asserted toBeNull) and dropped 'should not throw when removing non-existent key', an assertion that could not fail. Held at 100.00%, 0 open gaps; 39 mutants -> 6 because the module shrank.
- 2026-09-08  FOLLOW-UP FOUND 2026-09-07, do not lose: agentsMdSections.ts is 644 lines and sixteen section builders, has NO mirroring suite, and therefore appears in NO baseline row - yet it IS tested, by the 81 tests filed under aiContextWriter. That is a THIRD attribution shape, distinct from the two PL-45 closed: not a suite scored against the wrong module, and not an untested module, but a module that is well tested through a CONSUMER's suite and so is never measured. It matters because those 644 lines become an agent's instructions inside a user's repo. The earlier invisible-module sweep could not see it: that scan required suitesFor(module) to be non-empty, and this module has no suite of its own by definition.
- 2026-09-08  Candidate 3, ProjectCard.tsx (35/40) — ARITHMETIC, recorded, nothing consolidated. The card is a 115-line composition shell. Its own decisions are five conditional renders, two prop defaults, one aria-label join, one disjunction and one ternary; every string it shows is computed elsewhere (getRuntimeSummary, getDeploymentSummary, getBrandStackSummary, getProjectDisplayName) and every gesture it handles is decided in useProjectSelectHandlers. Its 40 tests are not one rule against forty inputs — they are forty distinct behaviours, most of them belonging to those collaborators. There is no table to build: the inputs vary in kind, not in value. NOTE for the attribution question candidate 5 opened: useProjectSelectHandlers has NO suite of its own, so the seven interaction tests here are its only coverage — the same consumer's-suite shape as agentsMdSections, in a much smaller module. Reading the 40 found two assertions that could not fail (queryByText('CitiSignal')/('API Mesh') against a fixture that selected no package, so the card's only descriptive slot did not render at all and no mutation could have made either appear), three too weak to catch a mutant (two toBeGreaterThanOrEqual(1) in a test whose name promises a green dot it never checked; stringContaining on the aria-label, which passed on the name alone and so could not tell the join from no join), a test whose click was wrapped in `if (menuButton)` and would have passed on a card with no kebab at all, and one uncovered decision: `disabled={isRunning || !actions.onRenameSubmit}` had only its isRunning arm tested. 40 tests -> 41. ProjectCard 93.55% -> 100.00%, 0 open gaps throughout; the two survivors were the pin indicator's alignItems and color, both knowable exactly and neither asserted.
- 2026-09-08  Candidate 4, configGenerator.ts (76/87) — REAL REPETITION, converted. Two rules were each written once per environment (mapBackendToEnvironmentType 5x, generateHeaders 5x, the config.json header pass-through 3x, the mesh-config store-scope extraction 2x, the commerce-core-endpoint fork 5x, addon and package no-op injection 7x) and every one became an it.each table whose rows are the inputs and whose labels are the old test names. Assertions went from a few named keys to the WHOLE object: toStrictEqual on the entire headers block, on the entire extracted params, on the exact sidekick plugin list, and byte-identity against a named baseline for 'injects nothing'. CROSS-FILE DUPLICATION was the real find: five tests in configGenerator.test.ts (three commerce-core-endpoint, two commerce-assets-enabled) were the same cases configGenerator-environmentAndFailure.test.ts already owned with better names and two extra rows — deleted from the older suite, and the one rationale only the older copy carried (the storefront routes cs headers off the EXISTENCE of commerce-core-endpoint) was moved across. THREE UNCOVERED DECISIONS, each confirmed by a mutant probe that passed 87/87 before and fails now: the isAccs guards that drop the PaaS catalog endpoint, API key and environment id (only observable against a manifest that still CARRIES the PaaS keys — the shape after a backend switch, which no fixture had), and buildConfigGeneratorParams' daLiveSite -> repoName fallback, which is the only thing supplying a site on manifests where the loader stripped the equal copy. A DEAD FIXTURE KEY: ADOBE_COMMERCE_CATALOG_SERVICE_ENDPOINT appears nowhere in src/ — the real key is PAAS_CATALOG_SERVICE_ENDPOINT — so the golden migrated-mesh project set a catalog endpoint nothing read; removing it left the snapshot byte-identical, which is the proof it was inert. A DEAD MOCK: jest.mock('@/core/constants') stubbed isMeshComponentId as id.includes('mesh') and supplied nothing else, so COMPONENT_IDS came through undefined; the real predicate answers every id in that suite identically, and deleting it changed nothing. Also fixed: two assertions that could not fail (not.toHaveProperty on x-api-key and Magento-Environment-Id, after a toEqual had already pinned the exact cs object), two bare toBeDefined standing in for 'gracefully handles an unknown id', three toContain on the sidekick plugin ids, one toContain on the escaped store-url, and one Object.keys(...).not.toContain. 87 tests -> 87. configGenerator 89.71% -> 92.57%, survivors 17 -> 12, open gaps 0 -> 0. The family ledger reason said 'four suites' when six exist and claimed one mocked module when there are now none — corrected.
- 2026-09-08  Candidate PL48-05, envVarExtraction.ts (34/39) — the ratio was a DUPLICATE of a module nobody called. Reading the module first, as the method says, found two things the metric cannot show. (1) `core/utils/` held TWO .env parsers: `parseEnvContent`, private inside envVarExtraction.ts, and `parseEnvFile` in envParser.ts, which has five production callers. Same job, different spelling — a regex against an indexOf scan. Fuzzed against each other over 200k inputs plus 30 hand-written cases, they agreed on everything except a line carrying an interior line-terminator character (CR, U+2028, U+2029): `trim()` does not remove those and `/(.*)$/` cannot cross them, so the regex copy dropped the WHOLE variable where the live parser keeps its value. (2) `extractEnvVars`/`extractEnvVarsSync` have NEVER had a caller in this repo's history — `git log -S` over src/ returns only the declaring file and a barrel retired by ADR-022, and the repo's own dead-code scan already listed both exports as unused (unannotated, unlike its neighbours in the same output). The archived plan that created it (`.rptc/complete/fix-compilation-errors/step-02.md`) records why: it was written to satisfy a compile error for a caller expecting `extractEnvVars(config, vars)` — a different signature that never materialised. So the module and its 39 tests were deleted, not consolidated. Its cases moved to `envParser.test.ts`, against the parser that is actually reached: 6 tests -> 37, all `it.each` tables whose rows are the inputs and whose expectations are the exact record (`toStrictEqual`, derived by running the parser, every one passing first time). Also fixed while reading: an assertion that could not fail (`expect(result.KEY).toBeDefined()` under the name 'should handle multiline values in quotes' — the exact answer is `{ KEY: '"line1' }` and is now asserted), a partial assertion in the Docker .env case that checked 3 of 5 keys, a suite with no `jest.clearAllMocks` whose sync error test leaked its throwing implementation into the next test, and a second way of reaching the same mock (`let mockFs: any = require('fs')` beside the `readFileSyncMock` the shared testUtils already exported). A WRONGLY ADJUDICATED EQUIVALENT MUTANT went with it: the ledger row for that regex argued the `$` anchor was unkillable because "the subject is one trimmed line, so it holds no newline" — false, since `trim()` removes only LEADING and TRAILING whitespace, and `KEY=before\rafter` distinguishes the two spellings exactly. Deleted with the code it described. Net: -134 lines of src, -3 test files, -1 baseline row, -1 equivalents row, -1 credential-fixture ceiling. envParser.ts held at 100.00%, 40 killed, 0 open gaps (the deleted module's 48 mutants and its 1 ledgered equivalent leave the ratchet entirely). Full suite green: 1553 suites, 29394 tests.
- 2026-09-08  Candidate PL48-06, instanceId.ts (27/31) — REAL REPETITION, converted. Four groups were each one rule written once per input: the slug boundary cases (9), the reserved-id classes (7), the collision/invalid names (7) and the minting cases (6). All became `it.each` tables whose rows are the inputs and whose labels are the old test names. Assertions went from partial to whole: `buildReservedIds` is now pinned to the EXACT set (`toEqual(new Set(...))`) instead of a `.has()` probe, which cannot fail on a domain that over-reserves and so rejects names the SC is entitled to use; `evaluateInstanceName` is pinned with `toStrictEqual({ message })` against the exact copy instead of `toBeUndefined()` on the instance plus `toMatch(/already used/i)` on the text. DEAD CODE IN src/: `buildReservedIds` unioned `...MESH_COMPONENT_IDS` on top of `...Object.values(COMPONENT_IDS)`, but MESH_COMPONENT_IDS is DEFINED as three COMPONENT_IDS members, so the line could never add an id — a provable no-op. Removed; the new exact-set test is what makes the redundancy visible, and a separate test still pins the guarantee callers rely on (every mesh id is reserved). AN UNCOVERED DECISION COMBINATION: `mintInstance` has a fallback stem and a collision suffix, and no test reached both at once — a label with no usable letters whose stem is already taken. It is now a row, and it records the asymmetry the code actually has: the id suffixes off the stem (`custom-integration-2`) while the display name suffixes off the label the SC typed (`123 2`). ATTRIBUTION, the same shape candidates 3 and 5 found: `deriveInstanceId` is a one-line delegation to `normalizeProjectName`, so eight of its nine tests assert a subject declared in `core/validation/normalizers.ts`, which has its own nine tests for it — that misfiling is most of the ratio. The rows were kept (the slug becomes a folder path and a state key, so the boundary is worth naming here) and the one case testing this module's OWN decision, the `.trim()`, was relabelled to say why it matters: without it the normalizer turns the trailing space into a hyphen it then keeps, `order-sync-`. 31 tests -> 37. instanceId held at 100.00%, 39 killed, 1 timeout, 0 survived, 0 open gaps — unchanged, and the mutant count stayed at 40, which is the proof the deleted spread carried no decision.
- 2026-09-07  test(project-creation): instanceId is real repetition — and one union that could never add an id (`75dd66403`)
- 2026-09-07  refactor(core): delete the .env reader nothing ever called, and its duplicate parser (`419bf8de1`)
- 2026-09-07  test(eds): configGenerator is real repetition — and one rule owned by two suites (`08740c3b2`)
- 2026-09-07  test(projects-dashboard): ProjectCard is arithmetic — and two assertions that could not fail (`2aebdb5fe`)
- 2026-09-07  refactor(state): transientStateManager's 91% was dead code, not repetition (`042b268d8`)
- 2026-09-07  test(project-creation): aiContextWriter is arithmetic — and the ternary nothing tested (`c14a30c5f`)
- 2026-09-07  chore(overnight): queue PL-48's six remaining candidates as goal sessions (`a3db5ef11`)
- 2026-09-07  test(sop): ban the assertion that accepts either outcome — the scan PL-48 was pointing at (`9d4eddcf3`)
- 2026-09-07  test(project-creation): sanitization as data — and five assertions that could not fail (`8c7d51999`)
- 2026-09-07  docs(backlog): rescope PL-48 — the ranking is a reading order, not a worklist (`8ac63f0ad`)
- 2026-09-07  fix(core): honour an AbortSignal that is already aborted when withTimeout is called (`bc1ae71ee`)
- 2026-09-07  chore(mutation): eight more modules enter the baseline — my invisible-set filter was wrong (`90fcfd2b2`)
