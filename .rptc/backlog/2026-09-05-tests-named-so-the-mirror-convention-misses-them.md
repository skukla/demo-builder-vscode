---
id: PL-45
kind: fix
area: platform
needs: []
value: high
status: backlog
parent: PL-22
---

# Tests named so the mirror convention misses them

Filed 2026-09-05, from the PL-22 burn-down.

**44 test suites exercise a module that no measurement attributes to them, because their
FILENAME does not start with that module's stem.** 17 of those sit on modules that still
have open gaps, together holding 472 of them. The tests run and pass on every CI build;
they simply count towards nothing.

## HOW BIG IS THE HOLE — measured 2026-09-07, and it is SMALL

Asked before fixing more modules: how many modules are invisible to the mutation
measurement altogether? Answer: **six**, holding about 105 open gaps.

| | |
|---|---|
| Modules in scope (`mutationScope.sourceFiles`) | 859 |
| In the baseline | 612 |
| Unmeasured | 247 — of which 202 contain real logic |
| **Unmeasured but HAVING their own mirroring suite** | **6** |
| Unmeasured with no suite at all | 196 — untested, a different problem |

The six, measured directly:

| module | suites | score | ~open gaps |
|---|---|---|---|
| `core/ui/hooks/useSelectionStep.ts` | 4 | 53.5% | **~80** |
| `features/dashboard/ui/components/DashboardStatusHeader.tsx` | 1 | 0.0% | ~16 |
| `features/dashboard/ui/configure/AppBuilderComponentFieldsSection.tsx` | 1 | 61.3% | ~8 |
| `core/ui/components/feedback/SuccessStateDisplay.tsx` | 1 | 75.0% | ~1 |
| `features/dashboard/ui/configure/storedSecretPayload.ts` | 1 | 100% | 0 |
| `types/webview.ts` | 2 | produced no mutants | 0 |

`useSelectionStep.ts` is the finding: 185 mutants, FOUR test suites, and never once measured.
`DashboardStatusHeader.tsx` at 0% is the other: its only suite is a `.test.ts` that does not
render the component.

**They have NOT been added to the baseline.** Doing so moves the reported total from 51 open
gaps to roughly 156, and whether to take that visibly is the owner's call, not a side effect
of a measurement.

### The count was 17 before it was 6 — and why that matters

**This repository has TWO different definitions of "which suites belong to this module".**
`mutationScope.suitesFor` matches the file's basename stem ANYWHERE in the test tree;
`focusModule.suitesFor` requires the mirror location too. The first says
`commands/configure.ts` has NINE suites — they are the suites in a test DIRECTORY called
`configure/`. The second says zero, correctly.

The first count here used the loose one and reported 17 invisible modules. Six survive the
strict one. The redundancy sweep imports the STRICT matcher from `focusModule.mjs`, so the
284 misattributed tests recorded above are unaffected.

That two matchers disagree, in the same repo, on the question this whole item is about is
itself worth fixing — and is the same class of fault as everything else here.

## THE SAME FAULT RUNS THE OTHER WAY TOO — measured 2026-09-07

The item above is about a suite whose filename misses the module it tests, so its kills count
for nothing. The redundancy sweep found the mirror image: **a suite whose filename MATCHES a
module it does not exercise.**

**284 tests across 52 modules cover none of their module's mutants, in modules holding 30 or
more.** They run, they pass, and they are scored against a file they never reach — which also
means the measurement spends time running suites that cannot affect the result.

The mechanism, confirmed by reading two:

- `pdp404HandlerPublisher.ts` exports ONE function. Its suite imports three more through it;
  those live in `pdp404Snippet.ts`. 35 of its 64 tests score against the wrong file.
- `aiHandlers.ts` re-exports `readMergedAiPrompts` from `./aiPromptHandlers`, and all 45 dead
  tests across its four suites name functions defined there.

Both are re-exports: the filename matches the module the code is imported FROM, not the one
it is defined in. Five of the six worst cases share that shape.

**The other 46 modules do NOT contain a re-export, so a second mechanism exists and has not
been identified.** Finding it is part of this item now. Worst cases:

| dead / tests | mutants | module |
|---|---|---|
| 45 / 91 | 130 | `features/dashboard/handlers/aiHandlers.ts` |
| 35 / 64 | 135 | `features/eds/services/pdp/pdp404HandlerPublisher.ts` |
| 29 / 54 | 89 | `commands/diagnostics.ts` |
| 24 / 65 | 101 | `features/project-creation/handlers/executor.ts` |
| 15 / 31 | 58 | `features/dashboard/services/dashboardStatusService.ts` |
| 12 / 70 | 222 | `features/eds/handlers/storefrontSetup/storefrontSetupHandlers.ts` |

A caution the sweep taught, so this is not re-learned: **coverage of zero mutants is NOT the
same as never executing the file.** A module with few mutants produces zeros trivially — 137
further tests were excluded on exactly that ground. The 284 above are only counted where the
module has 30 or more mutants to cover.

Source: [[PL-49]] Phase 2, `.rptc/plans/test-suite-consolidation/overview.md`.

## MEASURED FOUR TIMES THE SAME DAY — raised to high on this evidence

Filed as a modest cleanup. Four modules met it within hours, and in each the rename ALONE
moved the number before a single test was written:

| Module | Open gaps before | After the rename alone | Recovered |
|---|---|---|---|
| `importHandlers.ts` | 151 | 62 | 59% |
| `dataInstallerWriteClient.ts` | 106 uncovered | 17 | 84% |
| `inExtensionMcpServer.ts` | 83 | 49 | 41% |
| `demoPackageLoader.ts` | 55 | — (closed to 97% with the moved suite) | — |

Between 41% and 84% of a module's apparent gap was tests that already existed, already ran
and already caught those mutants. **Some unknown share of the burn-down's remaining total
is not work, it is misfiling** — which makes this the cheapest item in the queue: seconds
per rename against roughly nine minutes per hundred gaps closed by writing tests.

**The survey below is a FLOOR, not a total.** `demoPackageLoader.ts` was found by a session,
not by the detector: its 297-line suite sat under `project-creation/ui/helpers/` and reached
the module through a re-export barrel. Rule 1 requires the mirror directory, so that whole
shape — right tests, wrong directory — is invisible to the numbers here.

**The per-module half is already shipped.** Every goal session now checks its own module
before measuring (`scripts/mutationQueue.mjs`, from a7fd3e73d). That is what found all four.
What remains is the sweep of modules the burn-down will not reach soon, and the modules
already at zero whose suites still count towards nothing.

**One caution learned the same day:** a session correctly DECLINED to rename three suites
around `readDescriptors.ts` because they are cross-cutting across four descriptor families,
not that module's own. Attributing them would have inflated one file and hidden three. The
check has to reject as well as accept.

## How it surfaced

A burn-down session working `dashboardHandlers.ts` noticed that
`selectProject-navigation.test.ts` tested `handleSelectProject` — a function defined in
`dashboardHandlers.ts` — and renamed it `dashboardHandlers-selectProjectNavigation.test.ts`
so its kills would count. That is one instance of a pattern nobody had looked for.

`suitesFor` in `scripts/focusModule.mjs` finds a module's suites by convention: inside
`tests/<the module's directory>`, any file whose name is the module's stem or begins with
that stem plus `-` or `.`. The convention is fine. What it cannot see is a suite named
after the FUNCTION it tests, or after the scenario, rather than the file.

## The measurement, and the two wrong answers before it

Detector: `scratchpad/orphans.py` (session-local; rewrite it against the tree rather than
trusting the numbers below, which are a snapshot).

A suite counts as uncounted only when ALL of these hold:

1. it lives in the mirror directory of the module it imports;
2. no module in that directory claims it under the stem rule;
3. it imports exactly one module from that directory, so the subject is unambiguous.

**Rule 1 is the one that matters, and leaving it out produced two wrong counts.** A first
pass said 132, counting every suite whose single `@/` import did not match its name — most
of which were importing a TYPE barrel (`@/types/base`), not a module. Excluding types gave
105, still wrong, because a suite that imports a module from ANOTHER feature is a client of
it, not a test of it: that pass flagged `configure-envFiles.test.ts` — written minutes
earlier to test `configure.ts` — as an uncounted test for `ComponentRegistryManager.ts`.
Requiring the mirror directory removes that whole class and gives 44.

Controlled both ways: the known-real case is detected under its old name and correctly NOT
detected under its new one; the two known false positives are excluded.

## Where the still-open ones are

| Module | Open gaps | Uncounted suites |
|---|---|---|
| `importHandlers.ts` | 151 | `brokeredCredentialOffer`, `importScopesHandler`, `importTargetHandler`, `provisionAccsHandler` |
| `dataInstallerWriteClient.ts` | 98 | `exportClient` |
| `inExtensionMcpServer.ts` | 83 | `strictWriteArgs`, `toolAnnotations`, `toolPhaseNarration`, `toolProgressNotifications` |
| `ImportDatapackModal.tsx` | 64 | `watchedActivation` |
| `projectStatusUtils.ts` | 61 | `deploymentSummary` |
| `dashboardHandlers.ts` | 9 | `dashboardHandlersMap`, `navigateBack`, `openIntegrations`, `refreshBlockLibrary`, `showProjectDashboard` |
| `quickEditPublisher.ts` | 6 | `quickEditAnchorMatch` |

Verified by hand: `importTargetHandler.test.ts` (15 tests) and `importScopesHandler.test.ts`
(5 tests) both import the handler map from `importHandlers` and drive it directly.

The remaining 27 are on modules already at zero. Renaming those changes no number and is
not worth doing on its own.

## What it is NOT

**Not a score-inflation trick.** A rename only counts tests that already exercise the
module; it cannot manufacture a kill. The gain is that work already done stops being
invisible.

**Not necessarily a rename.** Two other shapes are possible and should be weighed first:

- teach `suitesFor` to consider a suite's imports as well as its name. Note that
  `focusModule.mjs` records two import-based heuristics tried on 2026-09-03 and rejected —
  but those answered a different question (does this suite EXERCISE the module, used to
  refuse a config), so the precedent is a caution, not a verdict;
- leave the convention alone and accept that a scenario-named suite is not attributed.

Renaming is the cheapest and keeps one rule, at the cost of filenames that read less well.

## Why not now

The burn-down is running and these files are live in it. A rename during a batch invalidates
the incremental cache and rewrites paths a session may be holding — and while measuring
this, a rename in the live worktree crossed a file a session was writing. Do it between
runs, or after the burn-down.

**Whoever picks it up: re-measure first.** Four of the seven live modules are near the
front of the size-ordered queue, so some will be at zero before this is touched, and the
472 will be smaller.

## Shipped so far

- 2026-09-07  Second direction measured 2026-09-07 (from PL-49 Phase 2): 284 tests across 52 mutant-rich modules are scored against a module they never exercise - the mirror image of this item. Confirmed re-export mechanism in 2 by reading; 46 of the 52 have no re-export, so a second mechanism is unidentified.
- 2026-09-07  Attribution fixes 1-3 shipped 2026-09-07: pdp404Snippet (35 tests, rename), appBuilderComponentState (15 tests moved out of dashboardStatusService, 8 weaker duplicates dropped), aiPromptHandlers (31 tests, 2 files renamed). All three consuming modules unchanged. TWO PREVIOUSLY UNMEASURED MODULES NOW IN THE BASELINE with 51 open gaps between them (aiPromptHandlers 45, pdp404Snippet 6) - they had 66 tests all along, credited to the wrong file. Second mechanism identified: a consumer suite testing its dependency's functions (dashboardStatusService), which is likely the common case since 46 of 52 have no re-export.
- 2026-09-07  Sized the invisible set 2026-09-07: 859 modules in scope, 612 measured, 247 unmeasured of which only SIX have their own mirroring suite. Those six hold ~105 open gaps, 80 of them in useSelectionStep.ts (185 mutants, 4 suites, never measured). Not baselined - that decision is the owner's. Also found: mutationScope.suitesFor and focusModule.suitesFor disagree on which suites belong to a module (stem-anywhere vs mirror-location), which inflated the first count from 6 to 17.
