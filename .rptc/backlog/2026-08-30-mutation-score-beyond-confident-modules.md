---
id: PL-22
kind: question
area: platform
parent: PL-11
needs: [PL-9]
value: med
status: open
layer: A
---

# 93% was the ceiling, not the norm — mutation scores fall as async density rises

**Answered 2026-08-30: no.** It stays open because answering it started a burn-down that
is not finished, and because the thresholds the answer implies are proposed rather than
ratified. See "What keeps this open".

## The answer

The pilot's 93.37% came from four modules picked because we believed they were well
tested. Pointed at eight modules picked for importance instead, the same instrument
scored **59.29%** — 1,329 planted defects, 16m15s. So 93% was the ceiling, not the norm.

Two qualifications on that headline number, both found afterwards and both recorded here
rather than quietly dropped:

- **59.29% is understated.** The run's jest config named 12 of installHandler's 13 suites
  and 1 of integrationCardModel's 5, so mutants counted as uncovered were merely unrun.
  Corrected, integrationCardModel went 42.96% → 91.90% — it had never been badly tested.
  `tests/sop/mutation-config-pairing.test.ts` now fails when a mutated module's suites are
  not all named, so this cannot recur.
- **The answer survives the correction.** The corrected distribution still runs from
  43.77% to 100%, which is the finding.

**The cause is structural, not carelessness.** Across the measured modules, score
correlates with async density at **r = −0.72**. A mock cannot see a malformed call — it
answers the same however it is invoked — so a mutant in *how* a collaborator is called
survives unless the test asserts the arguments. Four production defects in this repo hid
in exactly that gap with twelve tests staying green.

## What is measured now

**610 of 622 measurable modules — 98% — pinned in `reports/mutation/baseline.json`**
(sweep completed 2026-09-03; `npm run test:mutation:sweep`, resumable, skips a pinned
module so a re-measure can never silently lower a floor). The 12 unpinned: 11 have no
test suite at all; 1 has a suite named for it that never touches it.

| Tier | n | Median score | 25th–75th | At proposed floor | Done (0 gaps) | Open gaps |
|---|---|---|---|---|---|---|
| pure | 286 | 79.6% | 58.7–93.0 | 96 (34%) | 57 (20%) | 4,775 |
| mixed | 109 | 65.5% | 52.2–77.5 | 23 (21%) | 3 (3%) | 3,744 |
| orchestration | 215 | 63.4% | 44.1–73.5 | 68 (32%) | 11 (5%) | 8,956 |
| **all** | **610** | **69.2%** | 52.3–84.5 | 187 (31%) | 71 (12%) | **17,475** |

**17,475 real gaps** — surviving or uncovered mutants that are not wording changes and not
recorded as equivalent. By area, ranked: eds 3,926 (103 modules) · project-creation
2,257 · dashboard 1,521 · ai 1,242 · data-installer 909 · core/ui 812 · authentication
812 · prerequisites 775 · updates 734 · components 731 · projects-dashboard 617 · mesh 532.

Worst twelve by open gaps: `daLiveContentCopy.ts` 437 (6.31%), `dashboard/commands/
configure.ts` 262, `projects-dashboard/handlers/dashboardHandlers.ts` 205,
`RepoSelectionInline.tsx` 201, `envFileGenerator.ts` 194, `useWizardState.ts` 186,
`projectDeletionService.ts` 183, `useComponentConfig.ts` 181,
`adobeWorkspaceCredentials.ts` 178, `ReviewStep.tsx` 166, `createProject.ts` 163,
`prerequisites/handlers/shared.ts` 152.

## What the burn-down has moved

Four modules were worked end to end, each score change tied to commits that added tests:

| Module | First pinned | Now | Notes |
|---|---|---|---|
| `prerequisites/handlers/installHandler.ts` | 41.77% | **71.16%** | six commits; ~8 points of the rise was the config correction above, the rest new tests |
| `eds/handlers/daLive/daLiveAuthPrompt.ts` | 67.04% | **82.58%** | dipped 0.19 when dead code was deleted — tested code removed, not coverage lost |
| `ai/server/siteTools.ts` | 57.33% | **69.20%** | complete at 69.2%: one survivor left, triaged |
| `core/state/stateManager.ts` | 56.49% | **66.88%** | |

Barely started: `authenticationService.ts` 39.25% → 43.77%, `componentUpdater.ts`
44.60% → 46.34%. Unmoved by design: `updateManager.ts` at 51.40%, whose 17 misses are all
one swallowed log line — killable only by asserting log text, which the ratchet exists to
refuse to reward.

## Thresholds — RATIFIED 2026-09-03: tiers as measured, floors as targets, `openGaps` as the gate

One number cannot fit, so the plan proposes three, by tier. `tierOf()` in
`scripts/mutationScope.mjs` assigns them mechanically: no `await` is pure, async density
above 4% is orchestration, the rest is mixed.

| Tier | Observed (n) | Median | Proposed floor | Currently passing |
|---|---|---|---|---|
| pure | 77.8 · 88.2 · 91.9 · 94.4 · 100 · 100 (6) | 93.2% | **90%** | 4 of 6 |
| mixed | 69.2 · 84.5 (2) | 76.9% | **80%** | 1 of 2 |
| orchestration | 43.8 · 46.3 · 51.4 · 66.9 · 71.2 · 82.6 · 83.3 · 95.7 (8) | 69.0% | **70%** | 4 of 8 |

The plan's own table lists pure as n=5 with a 94.4% median; it omits `spectrumTokens.ts`
at 88.24%. Recomputed over all six, the median is 93.2% — which still supports a 90% floor,
but two of six modules fail it rather than one of five.

### Why the floors must not be the gate

The baseline records `highValueSurvivors` beside each score — surviving mutants that are
not wording-only. That field, not the score, is what the plan's definition of "done"
actually describes. **The two disagree on 7 of the 16 pinned modules.**

| Module | Score vs floor | High-value survivors |
|---|---|---|
| `prerequisites/handlers/installHandler.ts` | **PASS** 71.16% | **55** — the most of any module |
| `updates/services/updateManager.ts` | FAIL 51.40% | 52 |
| `core/utils/mcpSocketPath.ts` | **FAIL** 77.78% | **0** — finished |
| `ai/server/siteTools.ts` | **FAIL** 69.20% | **1** — finished |

`installHandler` cleared its floor after six commits of test work while holding more real
untested decisions than `updateManager`, which fails its floor. Ratifying the floors as a
pass/fail gate would grade those two the wrong way round.

`mcpSocketPath` additionally **cannot reach 90%**: it has 9 mutants, so the only attainable
scores near the floor are 77.8%, 88.9% and 100%. A hard floor on a small module is
unreachable by arithmetic, not by neglect.

### The recommendation

- **Ratify the tier model.** It is mechanical, objective, and grounded — score correlates
  with async density at r = −0.72.
- **Ratify the floors as TARGETS** — what a properly worked module of that tier should
  reach. `mixed` stays provisional at n=2.
- **Do NOT gate on the floors.** Gate on `highValueSurvivors` falling to zero, which the
  baseline already records and the ratchet already guards. A module is done when every
  remaining survivor is triaged as equivalent or wording-only — a file at 69% can be done
  and a file at 85% can be neglected.

### The same question at 610 modules

The 16-module medians the floors were fitted to were the BEST-tested code in the repo,
not the middle of it. At 610: the pure median is 79.6% against a 90% floor (34% pass),
mixed 65.5% against 80% (21%), orchestration 63.4% against 70% (32%). Ratified as a gate
today, the floors would fail two modules in three.

And the floor still answers the wrong question. Across 610 modules the floor verdict and
"zero open gaps" **disagree on 126** — 121 modules clear their floor with real gaps
left, 5 fall short of it with none. The recommendation stands and is now grounded in
the full set rather than sixteen: the tiers are right, the floors are targets, and
`openGaps` is the gate.

## What keeps this open

1. ~~Nothing is ratified yet.~~ **Ratified 2026-09-03** in the shape stated at the top of
   `.rptc/plans/mutation-scope-and-thresholds/overview.md`: tiers as measured, floors as
   targets, `openGaps` zero as done, the per-change ratchet unchanged.
2. ~~The burn-down is at 3.2%.~~ **The map exists — 98% measured.** What remains is
   working it: 17,475 open gaps, 71 modules done. The plan's step 6 says order by
   consequence, not score; the area table above is the input to that ordering.
3. ~~115 React files are invisible to the instrument.~~ **FIXED 2026-09-03**, and it was
   156 files rather than 115 — the 115 `.tsx` sources plus 41 `.ts` sources whose suites
   are all React suites, a group no count had included. The focused runner now picks its
   jest project from the module's suites instead of always using the node one. Measurable
   set: 466 -> **622**.
4. **70 files have no tests at all.** A coverage question, not a mutation one. (The plan
   says 72; `mutationScope.mjs` reports 70 and 120-with-no-own-suite as of today.)

The plan states PL-22 closes once every included module is measured and ratcheted, at
which point the cadence drops to release cuts.

## Tooling that now exists

`scripts/focusModule.mjs` (one module in 1–3 minutes), `scripts/mutationWorklist.mjs`,
`scripts/mutationScope.mjs` + `scripts/mutation-scope.ledger.json`,
`stryker.focus.config.json` + `jest.focus.config.js`, and the pairing enforcer above.

## Related

- `.claude/skills/mutation-test-pilot/SKILL.md` — how to run it, how to read survivors,
  and the three things a surviving mutant can mean (real gap / equivalent mutant /
  dead defensiveness)
- ADR-016 — names mutation testing as how test effectiveness is measured
- PL-11 — the convergence programme this belongs to

## Shipped so far

- 2026-08-30  Filed. The pilot and its 93.37% baseline landed the same day
  (`c4118338e`); this asks the question that number cannot answer on its own.
- 2026-08-30  docs(plan): file PL-22 — does 93% hold outside the modules we already trusted? (`0c1b8bf7e`)
- 2026-08-30  Sample run mis-scoped: 7 of 8 modules had no test selected (jest config hard-codes the pilot's 4 paths), reported 0% in 19s. Fixed with jest.pl22.config.js + tests/sop/mutation-config-pairing.test.ts; real run in flight.
- 2026-08-30  ANSWERED: no. Pilot 93.37% (4 pure modules, mean 1 await); representative 8-module sample 59.29% (1329 mutants, 16m15s). Control envMerge reproduced 100% exactly. Score falls monotonically with await count: installHandler (41 awaits) 41.77%. Finding: async+mocked code is what tests fail to constrain.
- 2026-08-30  test(mutation): PL-22 answered — the pilot's 93% does not generalise (`48b61956e`)
- 2026-08-30  test(prerequisites): cover the plugin install path, untested until now (`385d7d6ff`)
- 2026-08-30  test(prerequisites): assert what installHandler's mocks already record (`8568d532e`)
- 2026-08-30  test(mutation): ratchet the score before improving it, and guard against gaming it (`0fd0974ce`)
- 2026-08-31  feat(tooling): widen the mutation sample to the UI layer, and split duplication into two floors (`3ab1d0328`)
- 2026-08-31  2026-08-31  Mutation numbers CORRECTED, not improved: jest.pl22.config.js named 12 of installHandler's 13 suites and 1 of integrationCardModel's 5. integrationCardModel 42.96% -> 91.90% (comes off the target list, was never badly tested); installHandler 49.17% -> 57.12% and remains the real worst, its NoCoverage 112 -> 36 converting into Survived. Ten unmoved modules are the control. Baseline carries _supersedes + _correction so this cannot be counted as progress. mutation-config-pairing now requires EVERY suite for a mutated module.
- 2026-08-31  chore(health): snapshot, with the mutation half marked as a correction (`3b0223654`)
- 2026-08-31  docs(backlog): record the mutation correction against PL-22 (`02cfbea46`)
- 2026-09-03  Item rewritten to lead with the ANSWER rather than the question. Documents: the 59.29% representative sample and the two qualifications on it (config undercount, corrected); r=-0.72 async correlation; the 16 pinned modules (min 43.77, median 83.33) = 3.2% of the 507-file included set; the four modules the burn-down moved (installHandler 41.77->71.16, daLiveAuthPrompt 67.04->82.58, siteTools 57.33->69.20, stateManager 56.49->66.88); the three PROPOSED tier floors (pure 90 / mixed 80 / orchestration 70) marked unratified; and the four things keeping it open.
- 2026-09-03  Thresholds assessed against the data rather than accepted from the plan. Finding: the tier model is sound (mechanical, r=-0.72) but the floors are the WRONG GATE — floor verdict and highValueSurvivors disagree on 7 of 16 pinned modules. installHandler PASSES at 71.16% holding 55 high-value survivors (most of any module) while updateManager FAILS at 51.40% holding 52; mcpSocketPath FAILS the 90% pure floor at 77.78% with ZERO high-value survivors and cannot reach 90% at all (9 mutants, steps of 11.1pt). Also corrected the plan's pure tier: n=6 not n=5 (spectrumTokens 88.24 omitted), median 93.2 not 94.4. Recommendation recorded: ratify tiers + floors-as-targets, gate on highValueSurvivors. Title now states the answer.
- 2026-09-03  feat(mutation): make "finished" recordable, and a sweep that can measure all 507 (`6017a6c15`)
- 2026-09-03  fix(mutation): a per-file jest environment defeats Stryker — decide it in config instead (`b59512bd1`)
- 2026-09-03  feat(mutation): the runner picks its jest project, unblocking a third of the codebase (`c3dadd694`)
- 2026-09-03  Baseline sweep COMPLETE: 610 of 622 included modules pinned (98%). Tally across runs: 11 skipped (no mirrored suite), 1 name-only suite that never exercises its module (DashboardStatusHeader.tsx — Stryker 'No tests were executed', now filed as a skip rather than a failure), 0 timeouts. Three runner defects found and fixed on the way: React modules unmeasurable (jest project chosen from suites now; +156 files), @jest-environment docblocks defeating Stryker's coverage hook (61 files, decided in jest.config.js now, enforcer added), and openGaps ignoring uncovered mutants (4 modules read finished that no test entered). Two text heuristics for 'does the suite exercise the module' were tried and both refused modules that measure fine; that decision is left to Stryker. 48 early rows being re-measured for the uncovered breakdown.
- 2026-09-03  feat(mutation): the full baseline — 610 of 622 modules measured, 17,475 open gaps (`6b692c330`)
- 2026-09-03  RATIFIED by the owner 2026-09-03: tiers as measured (tierOf, async density); floors 90/80/70 are targets not a gate; done = openGaps 0 (survivors killed or in the equivalents ledger with a reason); per-change ratchet unchanged. Next: the burn-down pass, ordered by consequence, run as a goal queue.
- 2026-09-03  feat(mutation): ratify the tiers and the gate, and generate the burn-down queue (`102a9cf47`)
- 2026-09-03  test(updates): bring updateExecutor to zero open mutation gaps (`1c7ab26a5`)
- 2026-09-03  fix(overnight): cut the branch from HEAD, verify goals after checkout, never exit 0 having run nothing (`7b5c00af2`)
- 2026-09-03  test(updates): bring checkUpdates to zero open mutation gaps (`1aa446690`)
- 2026-09-03  test(updates): bring templateSyncService to zero open mutation gaps (`23b3aae84`)
- 2026-09-03  fix(updates): a failed component update reported "rollback failed" even when the rollback worked (`f83e47d89`)
- 2026-09-03  fix(tests): assert the injected clone URL by part, not as a credential-shaped literal (`06f45af6a`)
- 2026-09-03  test(updates): bring updateApplyService to zero open mutation gaps (`e251295e9`)
- 2026-09-03  test(updates): bring updateManager to zero open mutation gaps (`39cea6edd`)
- 2026-09-03  test(updates): bring templateUpdateChecker to zero open mutation gaps (`15299ba5b`)
- 2026-09-03  test(updates): share the templateUpdateChecker family setup, repairing the pushed family-rule failure (`605718810`)
- 2026-09-03  test(updates): bring addonUpdateChecker to zero open mutation gaps (`b488b68bb`)
- 2026-09-03  test(updates): bring adobeMcpUpdateChecker to zero open mutation gaps (`25ecb921f`)
- 2026-09-03  test(updates): bring forkSyncService to zero open mutation gaps (`54f3b51b7`)
- 2026-09-03  test(updates): bring collaboratorGate to zero open mutation gaps (`137525a36`)
- 2026-09-03  test(updates): bring githubApiClient to zero open mutation gaps (`8673b1ba3`)
- 2026-09-03  test(updates): bring releaseTrack to zero open mutation gaps (`7a66d62fd`)
- 2026-09-03  test(updates): bring componentRepositoryResolver to zero open mutation gaps (`fc45b3f5a`)
- 2026-09-03  refactor(updates): drop the dead optional chain in adobeMcpUpdateCore (`245c18e89`)
- 2026-09-03  test(updates): bring extensionUpdater to zero open mutation gaps (`9a56fd7bb`)
- 2026-09-03  test(auth): bring adobeWorkspaceCredentials to zero open mutation gaps (`2b190a9c8`)
