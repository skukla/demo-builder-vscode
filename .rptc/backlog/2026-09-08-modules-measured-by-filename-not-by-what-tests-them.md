---
id: PL-50
kind: question
area: platform
needs: []
value: high
status: open
parent: PL-11
---

# 160 modules are measured against the suites that share their NAME, not the suites that run them

**The question: are these tested-but-invisible, or genuinely untested?** The two need opposite
responses, and nothing measured so far distinguishes them. That is why this is a question and
not a chore.

## What is true today

A module is paired with a suite by FILENAME — `focusModule.suitesFor` looks for
`<stem>.test.ts` or `<stem>-<topic>.test.ts` in the mirror directory. Everything else about
the mutation programme rests on that one rule, and every attribution failure found on
2026-09-07 came from it:

| shape | example | where it went |
|---|---|---|
| A suite scored against a module it never runs | `pdp404HandlerPublisher.test.ts` tested `pdp404Snippet` through a re-export | [[PL-45]], fixed |
| A suite that carries a module's name and tests something else | `DashboardStatusHeader-layout.test.ts` read the STYLESHEET, so Stryker matched no tests and reported 0% | [[PL-45]], fixed |
| **A module well tested through a CONSUMER's suite, never measured at all** | `agentsMdSections.ts` — 480 lines, sixteen section builders, exercised by the 81 tests filed under `aiContextWriter` | **this item** |

The third shape is invisible to the sweep that found the first two, by construction: that
scan asked which modules HAVE a mirroring suite and no baseline row. A module in this
category has no suite of its own by definition.

## The measurement

**160 modules** export a function or a class, have no suite of their own, and appear in no
baseline row. Barrels (`index.tsx`) and type-only files are excluded. The largest:

| lines | exports | module |
|---|---|---|
| 655 | 13 | `features/eds/ui/steps/repoSelectionInline.helpers.tsx` |
| 629 | 1 | `features/eds/services/daLive/daLiveBlockLibraryOperations.ts` |
| 581 | 1 | `core/utils/progressUnifier/ProgressUnifier.ts` |
| 480 | 16 | `features/project-creation/services/aiBundle/agentsMdSections.ts` |
| 410 | 1 | `features/authentication/services/adobeEntityReads.ts` |
| 408 | 4 | `features/eds/services/storefront/storefrontRepublishService.ts` |

`agentsMdSections` is the one that shows why it matters: those 480 lines become an AI agent's
instructions inside a user's repository, and a mutation score has never been taken of them.

## Why NOT to work through them module by module

Each fix would be "invent a mirroring suite for it" — a lot of work for modules that may
already be thoroughly tested. `agentsMdSections` has 81 tests exercising it right now. Doing
that 160 times treats the symptom 160 times and leaves the rule that caused it intact.

## ANSWERED 2026-09-08 — and CORRECTED the same day

The first answer posted here was measured against TRUNCATED suite lists — six of thirteen
consumer suites for one module, three of twelve for another — and reported as if complete.
That biased every score low and every gap count high. Re-measured against the full sets:

| module | score | mutants | ~gaps | how the tests reach it |
|---|---|---|---|---|
| `repoSelectionInline.helpers` | 62.61% | 337 | 91 | exercised through 8 consumer suites |
| `adobeEntityReads` | 57.14% | 259 | 70 | exercised through 13 |
| `agentsMdSections` | 54.55% | 385 | 57 | exercised through 5 |
| `storefrontRepublishService` | 31.29% | 163 | 75 | `jest.mock`ed by 10 of 12 — the other 2 do run it |
| `daLiveBlockLibraryOperations` | **0.00%** | 386 | 289 | **replaced by an injected double; never executed** |

**What the first version got wrong, kept here because the direction of the error is the
lesson:** it claimed TWO of five are never executed by any test. Only one is.
`storefrontRepublishService` read 0.00% because the three suites sampled all happened to be
among the ten that mock it; with all twelve it scores 31.29%. A truncated sample of mockers
is indistinguishable from a module nothing runs.

### What survives, and is now measured properly

**It is not a visibility problem.** Where the code runs, the four exercised modules average
**51%** — against 90%+ for the measured set, whose floor the burn-down drove to zero open
gaps. Measuring these exposes real work rather than confirming existing quality, so a tooling
change alone does not answer the question.

**One module is never executed anywhere.** `daLiveBlockLibraryOperations` — 386 mutants,
replaced by a hand-injected double at an ADR-015 seam where the suite asserts the CONSUMER
forwards calls. That is a legitimate thing to assert and it leaves the forwarded-to module
unrun. Neither branch of the original question anticipated this case, and for it the question
is not "measure this" but "is anything testing this code at all".

**Mocking is why a consumer suite is not proof of coverage.** Ten of twelve suites naming
`storefrontRepublishService` replace it. "A test imports the module" and "a test exercises
the module" are different claims, and only the second is worth anything here.

### The size — an order of magnitude, and biased high

582 gaps across five probes, a mean of **116 per module**. Over 160 modules that is roughly
**18,600**, against the 17,475 the original burn-down began from. Two reasons not to plan
against that figure: the sample is the LARGEST five modules, and the per-module gap count
here is crude — survivors plus uncovered minus string mutants, where the real `openGaps` also
subtracts ledgered equivalents and excludes another category. Both push the estimate high.

## The experiment that answered this## The experiment that answered this — about an hour

Take five or six of the largest and measure each against its CONSUMER's suites rather than
its own. `focusModule` refuses a module with no suites — "Refusing to write a config that
would report a confident zero" — so the config has to be written by hand for the probe.

- **If they score well**, this is a visibility problem, and the answer is a tooling change:
  attribute a module to the suites that COVER it. Stryker already computes exactly that; what
  the filename rule decides is only which suites to RUN.
- **If they score badly**, it is a real coverage hole across 160 modules and deserves its own
  sized programme, not a tooling fix.

Do not start the experiment while a mutation queue is running — the focus configs are single
generated files and two runs starve each other.

## What this is not

Not [[PL-45]], which is shipped: that closed the two shapes where a suite exists and is
misfiled. Not the "196 modules with no suite at all" line recorded there either — that count
was taken with a looser filter and did not ask whether tests reach the module anyway.

## Shipped so far

- nothing; the deciding measurement has not been taken.
- 2026-09-08  ANSWERED 2026-09-08: both. Five largest probed against the suites that reach them. Where the code runs it averages 45% (agentsMdSections 54.55, repoSelectionInline.helpers 50.15, adobeEntityReads 31.27) against 90%+ for the measured set - so measuring exposes real work, not existing quality. Two of five are never executed by ANY test: storefrontRepublishService is jest.mocked by 10 of 12 consumers, daLiveBlockLibraryOperations is replaced by an injected double at an ADR-015 seam. Mean 146 gaps/module; over 160 modules that is ~23,000, larger than the burn-down's original 17,475 - order of magnitude only, the sample is the largest five and biased high.
- 2026-09-08  CORRECTED 2026-09-08: the first answer used truncated suite lists (6 of 13, 3 of 12) reported as complete, biasing scores low and gaps high. Full sets: repoSelectionInline.helpers 62.61 (was 50.15), adobeEntityReads 57.14 (was 31.27), storefrontRepublishService 31.29 (was 0.00), agentsMdSections 54.55 unchanged, daLiveBlockLibraryOperations 0.00 unchanged. RETRACTED: 'two of five are never executed' - only ONE is. storefrontRepublishService read 0% because all three sampled suites were among the ten that mock it. Mean gaps 116 not 146; extrapolation ~18,600 not ~23,000, still biased high.
- 2026-09-08  CORRECTED AGAIN: `daLiveBlockLibraryOperations` is NOT the one module nothing executes. Jest coverage of that module driven by ONLY the five `daLiveContentOperations-*` suites that construct the real facade: 90.22% statements, 75.86% branch, 96.96% functions. The 0.00% came from the delegation suite, which does inject a double - the same shape as the `storefrontRepublishService` retraction one line above, made twice in one day. So ZERO of the five probed modules are unexecuted; all five are unATTRIBUTED. That strengthens the case for step 3 (fix attribution) and weakens the 'is anything testing this at all' framing. It has a mirrored suite and a baseline row now: 81.87%, 42 open gaps.
- 2026-09-08  SIZED 2026-09-08 (step 2): ~4,657 open gaps across 180 modules, not ~18,600 across 160. 18 modules probed, 3 from each of 6 size strata drawn by stride (not the top five), 1,938 mutants, 741 real openGaps; stratified total 4,657, SE 881, mean 26/module against the largest-five probe's 116. Population rebuilt from the TypeScript AST rather than a regex: 180 not 160, because the old filter wanted an exported function/class (dropping classes with async methods and no branches) and excluded index.tsx as a barrel - eight are in the population and projects-dashboard/ui/index.tsx is 365 lines of webview entry. Population is 16,495 code lines, so 18,600 gaps was more than one per line. Suite sets came from jest --listTests --findRelatedTests, never a truncation; the probe harness was proved first by reproducing claudeCodeFootprint's pinned row exactly (92.36%). FOUR modules scored 0.00% and all four were verified, not assumed: configure.ts and manageSiteAccess.ts each kept 11 suites and 176 tests green with execute() throwing on line 1 (both bare-automocked by commandManager.testUtils.ts), showPromptsPicker.ts is the same shape, and integrationsSurface/index.tsx has no suite at all - run beside projectsRoot.ts, which scored 50%% in the same measurement as an in-run control. 226 of the sample's 741 gaps sit in those four. 19 population modules are bare-automocked somewhere in tests/ - a lead, only three verified.
- 2026-09-08  DESIGNED 2026-09-08 (step 3): proposal at .rptc/plans/unmeasured-fifth/attribution-design.md. Recommend the filename rule FIRST, jest's --findRelatedTests as the FALLBACK — SAFE-TO-LAND. Keying everything on jest's graph is Option 2 and is NEEDS-THE-OWNER on cost: measured census over 809 modules puts mean suites/module at 2.2 -> 81.6, and a cost model fitted to four real Stryker runs (and controlled against the sweep log's 289.7 measured minutes, 6% error) puts a full sweep at ~76 hours against 4.8 today. Two A/B re-measures under BOTH rules returned identical scores and identical open gaps (addonUpdateChecker 72.86/0, configSyncService 71.30/0) for 7.9x and 40.9x the wall time, so the wider rule buys no accuracy where a row already exists. The fallback makes 165 of the 180 refused modules measurable (~20 hours, once) and leaves all 629 rows byte-identical; 15 have no related suite at all and stay refused. Landing it also requires mutation-config-pairing's covered() to stop grepping suite text — 81 of the 165 have no related suite that mentions the module's stem.
- 2026-09-08  feat(mutation): fall back to jest's import graph when no suite mirrors a module (`bb9def80d`)
- 2026-09-08  docs(mutation): propose attribution by jest's graph as a FALLBACK, not a replacement (`6c05b165c`)
- 2026-09-08  docs(mutation): size the unmeasured fifth at ~4,700 gaps, not ~18,600 (`9fb59e5fd`)
- 2026-09-08  test(eds): re-measure the block-library module and triage what is left (`af57b69eb`)
- 2026-09-08  test(eds): close the six block-library gaps a test could still close (`27d91da5a`)
- 2026-09-08  chore(overnight): gate the attribution change on UF-04's own verdict (`0a57f41b8`)
- 2026-09-08  docs(backlog): daLiveBlockLibraryOperations was not unexecuted — it was unattributed (`71b110eb4`)
- 2026-09-08  test(eds): close the argument gaps the first mutation run found, and pin the baseline (`5185ab9bc`)
- 2026-09-08  test(eds): cover the sheet read-merge-rewrite pair and the CDN doc-page copy (`0a50a3440`)
- 2026-09-08  test(eds): cover block-library creation and the three doc-page writers (`89f10b66e`)
- 2026-09-08  test(eds): give daLiveBlockLibraryOperations a suite under its own name (`b0da98486`)
- 2026-09-08  chore(overnight): queue the unmeasured fifth — consequence first, design last (`dc0e89dfd`)
- 2026-09-08  docs(backlog): correct PL-50 — I truncated the suite lists and reported it as complete (`644957183`)
- 2026-09-08  docs(backlog): PL-50 answered — both, and two modules are never executed at all (`4dbf2187a`)
- 2026-09-07  docs(backlog): PL-50 — 160 modules are measured by filename, not by what runs them (`aaa722e92`)
