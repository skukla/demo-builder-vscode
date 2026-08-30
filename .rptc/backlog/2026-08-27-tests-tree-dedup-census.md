---
id: PL-9
kind: chore
area: platform
needs: []
value: med
status: active
parent: PL-11
---

# Tests-tree dedup — the census after the first-ever scan

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-27 by the dedup sweep, which ran jscpd over `tests/` for the
first time (the scan skill ignores `*.test.*` by design — that ignore is
right for src and was bypassed deliberately here).

Measured at min-lines 20 / min-tokens 140: **174 clones, 2.66% duplication**
(src is 0.62%). Most is CONVENTION — per-suite Spectrum mock preambles are
duplicated on purpose (webview-test-authoring §2) and are not targets.

The actionable class is split suites repeating an ARRANGE ritual per test
instead of using their testUtils. The sweep fixed the worst cluster as the
reference: PrerequisitesStep's progress specs (14 clones) inlined the
message-callback wiring because the testUtils helper was BROKEN — it
returned the captured callbacks by value, so the returned functions stayed
no-ops forever, and every spec copied the working inline version instead.
Lesson worth keeping: a dead helper next to N clones of its job usually
means the helper is broken, not unwanted. Fixed via trampolines +
`renderLoadedStep`; 23 tests, count unchanged, all green.

Remaining clusters, largest first (re-run before working — lines move):
`npx jscpd tests --min-lines 20 --min-tokens 140 --reporters console`

1. eds/services/reset/edsResetService-meshAuth.test.ts (8 clones — internal)
2. lifecycle/commands/stopDemo.process.test.ts (6, internal)
3. extension-activation-navigation + extension-context (5 each)
4. eds/services/blockCollectionHelpers-multiLibrary-merging (5)
5. projects-dashboard/commands/showProjectsList (4)
6. prerequisites/handlers/installHandler-shellOptions (4)
7. lifecycle/commands/startDemo.portConflict (4)
8. eds/daLive/daLiveContentOperations-transform (4)

Per cluster: same rule as production dedup, adapted for tests — extract the
arrange ritual to the suite's testUtils (hoist-safe per
webview-test-authoring §3), test COUNT stays identical, all green. Also
90 files sit in the 500-750 warning zone (validate:test-file-sizes) — split
per the playbook when touched, not as a batch.

## The 2026-08-28 refresh — what the 160 clones ARE, and the three lanes

The owner's challenge ("is 160 acceptable for a baseline?") forced the
composition measurement. It is NOT acceptable as an endpoint — it is frozen
so it cannot grow. Reference point: `src` sits at **0.62%** under the same
reviewers, so 2.44% in tests is accumulated slack, not a law of test code.

**7,863 duplicated lines, measured, in three lanes:**

| Lane | Size | Mechanism | Owner |
|---|---|---|---|
| **A. A suite repeating ITSELF** | 16 clones | Fix outright — no design question, no trade-off | this item, do first |
| **B. Mock-wall suites** | 41 clones / 1,658 lines (21%) | Melts as a SIDE EFFECT of the ADR-015 conversions — no separate work | PL-13 batches |
| **C. Between separate files** | 103 clones / ≈2,446 removable | Extract a shared setup per family, worst-first | this item, ranked list below |

Lane C's ranking is `.rptc/plans/architecture-test-convergence/family-worklist.json`
(all 89 shared-setup-less families scored): **20 real targets** (≥40 removable
lines — deleteProject 177, stopDemo 152, storefrontSetupPhases 147,
edsResetService 144, aiContextWriter 141 lead it), **27 small** (10–39, do
opportunistically when a batch is already in that area), **42 legitimate
size-splits** (adjudicate to a reason string; they stop counting as debt).

**Guardrails already live**: the family-setup check (new families without
shared setup fail the build) and the clone ratchet (160, may only fall,
re-measured by the sweep's own command).

**Done when**: lane A is zero, lane B has melted with its conversions, lane C's
20 real targets are extracted, the 42 legitimate splits carry written reasons,
and the ratchet rests at that adjudicated floor.

## Shipped so far

- 2026-08-27  test(prerequisites): the arrange ritual lives in testUtils — because the helper was broken (`8002fe208`)
- 2026-08-28  Cluster 1 fixed (loop, 2026-08-28): the extension-activation pair's duplicated ~220-line preamble extracted to tests/extension.testUtils.ts (owns mocks + SUT import per the hoisting rule; also made the pair deterministic — the fs/promises flag-file mock now covers both suites). 14 tests before and after, zero edited. Census: 167 clones/2.59% at pickup -> 162/2.53% after. Next clusters per the fresh census: edsResetService customBlockLibraries<->meshAuth (4), AddIntegrationFlowModal pair (3), checkUpdates-upstream pair (3), startDemo pair (3).
- 2026-08-28  Cluster triage completed (loop, 2026-08-28). MECHANICAL, fixed tonight: extension-activation pair (5 clones) and AddIntegrationFlowModal pair (3) — census 167 -> 159, 2.59% -> 2.45%. VARIANTS, need per-family design, not forced: edsResetService family (5 suites, preambles differ 70-160 lines of 130 — each steers different mocks), checkUpdates-upstream pair (makeProject defaults differ semantically: forkSync's fixture deliberately lacks githubRepo), startDemo/stopDemo family (7 clones woven across 4 files). Internal-only clusters (daLiveContentOperations-transform, blockCollectionHelpers-multiLibrary) unexamined. Next pass starts from this triage.
- 2026-08-28  refactor(tests): the AddIntegrationFlowModal pair shares one preamble (`4d4192dcc`)
- 2026-08-28  refactor(tests): the extension-activation pair shares one preamble (`767c8ecd6`)
- 2026-08-28  REFRESHED with the measured composition (owner challenge: 'is 160 acceptable?'). Answer recorded: no — a frozen starting line, not an endpoint; src is 0.62% under the same reviewers. Three lanes now named with owners: A = 16 clones of a suite repeating itself (fix outright, do first, no design question), B = 41 clones / 1,658 lines / 21% inside mock-wall suites (melts as a side effect of the PL-13 conversions, zero separate work), C = 103 clones / ~2,446 removable lines across families (ranked worklist: 20 real targets, 27 small, 42 legitimate splits to adjudicate). Value raised low -> med; guardrails already enforcing (family-setup check + ratchet with its producing command).
- 2026-08-30  docs(plan): lane C measured — 18 families extractable, 26 need judgment first (`bbc5af7f6`)
- 2026-08-30  docs(scan): jscpd's overlapping-range "self-clone" is a false positive (`067db15f2`)
- 2026-08-30  refactor(tests): PrerequisitesStep-installation opens the same 25 lines 3× (`de92b4186`)
- 2026-08-30  refactor(tests): executor EDS flow stops duplicating its definition-capture mock (`687dbfa3f`)
- 2026-08-30  refactor(tests): the two blockCollectionHelpers merge suites stop repeating their tails (`c36b9951c`)
- 2026-08-30  refactor(tests): sidebarProvider stops redeclaring its webview fake five times (`02ef32f22`)
- 2026-08-30  refactor(tests): blockCollectionHelpers multi-library suite stops repeating itself (`866f08ddf`)
- 2026-08-30  refactor(tests): daLive transform suite stops repeating itself — 334 lines to 199 (`26de46ce0`)
- 2026-08-30  refactor(tests): AdobeAuthStep's four specs stop pasting the same 24 lines — lane C1 (`dea9dde05`)
- 2026-08-30  docs(handoff): lane C1's first family shipped — recipe proven, 16 remain (`3aa8ea08b`)
- 2026-08-30  refactor(tests): startDemo's three suites stop pasting the same mock block — lane C1 (`6f8ac1971`)
- 2026-08-30  refactor(tests): envFileWatcherService's mocked suites stop re-declaring the mocks their testUtils already owns — lane C1 (`a7ba8c6f2`)
- 2026-08-30  refactor(tests): componentUpdater's two suites share one testUtils — lane C1 (`571cc0181`)
- 2026-08-30  refactor(tests): ResetAllCommand's two suites share one testUtils — lane C1 (`63510f83a`)
- 2026-08-30  refactor(tests): useSelectionStep's four suites share one testUtils — lane C1 (`021c31fcf`)
- 2026-08-30  refactor(tests): diagnosticsChecks' three suites share one testUtils — lane C1 (`b6f2c7d61`)
- 2026-08-30  refactor(tests): daLiveContentOperations, adobeEntityFetcher and contentAuthoringTools share testUtils — lane C1 (`0f8b70d6e`)
- 2026-08-30  refactor(tests): continueHandler and IntegrationDetailPanel share their testUtils — lane C1 (`1190306f2`)
- 2026-08-30  refactor(tests): webviewCommunicationManager + componentHandlers share their testUtils; lane C1 closes at 14 (`9e7e2877c`)
- 2026-08-30  chore(census): refresh craft-census.json for the merged lane C1 state (`0324961d2`)
- 2026-08-30  docs(handoff): lane C1 complete — 14 families, and the record updated (`2caf02d32`)
