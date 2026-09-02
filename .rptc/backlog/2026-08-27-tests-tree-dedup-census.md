---
id: PL-9
kind: chore
area: platform
needs: []
value: med
status: built
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

Lane C's ranking is `.rptc/complete/architecture-test-convergence/family-worklist.json`
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

**Status 2026-09-02 (end of day): the first four are met.** Lane C's 20 real
targets are extracted, every split family is adjudicated, and the debt list is
empty. Clones over `tests/` fell 160 to 67 and duplicated lines 7,863 to 3,368.
What remains is lane B, which belongs to [[PL-13]]'s ADR-015 conversions, and
choosing the floor the clone count should rest at — a decision, not work.

## Where it actually stands — measured 2026-09-02

Every number above is the 2026-08-28 baseline and none of it was re-measured
until now. Two of them had drifted far enough to mislead.

| | Then | Now |
|---|---|---|
| Clones over `tests/` | 160 | **72** |
| Duplicated lines | 7,863 | **3,548** |
| Lane C real targets (≥40 lines) extracted | 0 of 20 | **19 of 20** |
| Lane C small targets (10–39) extracted | 0 of 27 | **6 of 27** |
| Families the setup enforcer still ledgers | 63 | **62** |

Two of the 20 "real targets" read as unstarted only because the worklist still
named their pre-merge paths — `tests/unit/features/eds/...` and
`tests/core/commands/ResetAllCommand`, neither of which exists. Both directories
moved; one family was already done. Paths corrected in the worklist the same
day, because a row pointing at a deleted directory looks exactly like a row
nobody has worked.

**What is genuinely left — updated later the same day:**

1. ~~`helixService`~~ — **done** (`9e3e2c301`). Four of its seven suites shared a
   50-line preamble; 92 tests before and after, 266 lines removed. That closes
   lane C's real targets at 20 of 20.
2. ~~23 families with measured duplicated setup.~~ **Done.** All 23 worked
   through: 11 given a shared setup, 12 read and adjudicated. The ledger's debt
   list is now EMPTY — 43 families carry a written reason and none carries none.
3. ~~The 42 legitimate size-splits need written reasons.~~ **Done** — the ledger
   now carries two lists, measured debt and adjudicated splits, and 31 families
   have a written reason. Two enforcers hold it: a reason must be at least eight
   words, and no family may sit in both lists.

**Three things the numbers were hiding, all found by reading rather than
measuring:**

- **Seven ledger rows were never families.** The detector groups suites by a
  filename's first hyphen-token, so `no-bare-sleep`, `no-config-leaf-mocks` and
  `no-lowered-test-timeout` read as one family, and `securityValidation-*` as
  another covering six different validators. They were debt nobody could ever
  pay — there is no shared setup to extract from files that share nothing. Fixed
  in the detector (`c5e4a10b4`), which now requires a real subject.
- **The line count alone misleads, in both directions.** `dashboardHandlers`
  measures ZERO removable lines and reads as a correct split; its four suites in
  fact share five mocked modules and one is mocked by all four. It stays as debt.
  `processCleanup` measures the largest remaining saving, 36 lines, and is NOT
  debt: its five suites split by strategy — three drive real child processes, two
  mock tree-kill — and its "duplication" is a ten-line comment repeated three
  times. Reading the per-suite mock sets is what separates these.
- **The ledger listed one family twice**, so its row count overstated the work.
  The assertion reads it into a Set, so a duplicate changed nothing it could see.
  Now checked.
4. **Lane B is not this item's work** — it melts as PL-13's ADR-015 conversions
   land, and PL-13 is down to ~8 ledger rows.
5. **The clone count needs an adjudicated floor.** 160 was frozen as "cannot
   grow"; the real figure is 72 and `scripts/healthSnapshot.mjs` tracks it as a
   lower-is-better trend rather than a pinned ceiling. Deciding the floor is the
   closing act, not a prerequisite.

**Placement — done 2026-09-02**, and it was never in the lane model above:
45 suites moved to their subjects' mirrors, the `webview-ui` allowlist row
deleted, and the enforcer gained a subject check. Its stated blind spot is that
the subject resolver cannot name a subject for 316 suites (the import lives in
the family's shared setup), so the weaker directory check still carries those.

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
- 2026-08-30  refactor(tests): stopDemo extracts only what its three suites AGREE on — lane C2 opens (`dba5c486c`)
- 2026-08-30  refactor(tests): 12 more families extract only what they AGREE on — lane C2 (`ed1760fa0`)
- 2026-08-30  fix(tests): drop stopDemo from the family-setup ledger (`c88d3df42`)
- 2026-08-30  docs(plan): lane C2 partly done — the half that needed no decision (`3cdd49557`)
- 2026-08-31  test(sop): four test files were copies of other test files, and nothing could see it (`3e9eada9c`)
- 2026-08-31  test(webview): one real missing helper, and two clones that are not debt (`ed2ad0176`)
- 2026-08-31  test(sop): three more duplicate suites, and the mutation numbers were measuring the wrong test set (`6720005dd`)
- 2026-09-02  test(sop): the placement rule now checks the SUBJECT, not just the shape (`db7f72790`)
- 2026-09-02  refactor(tests): the shared webview UI suites move to their subject's mirror (`595272682`)
- 2026-09-02  Both halves done: 45 suites moved to their subjects' mirrors (38 shared webview + 7 found by the new check), the webview-ui allowlist row deleted, and the enforcer gained a subject check with two positive controls. NOT closed: the subject resolver returns nothing for 316 suites whose subject is imported by a .testUtils, so half 1 still carries those.
- 2026-09-02  helixService extracted — lane C's 20 real targets are now all done (9e3e2c301). Clones 72->70. Ledger had a duplicate row for that family, so its count was overstated; added a uniqueness check whose first version was itself broken (Set.add in a filter) and was caught by its positive control.
- 2026-09-02  Seven ledger rows were never families — the detector groups by a filename's first hyphen-token, so three unrelated 'no-*' enforcers read as one family and securityValidation-* as another (c5e4a10b4). Detector now requires a real subject; ledger 61 -> 54.
- 2026-09-02  Ledger split into measured debt vs adjudicated splits, each with a written reason grounded in the removable-lines ranking AND the per-suite mock sets. 26 adjudicated; debt 54 -> 28. dashboardHandlers looked legitimate by line count but its 4 suites share 5 mocked modules — kept as debt.
- 2026-09-02  Adjudication complete: 31 families carry written reasons, 23 remain as measured debt (ae71936df). processCleanup adjudicated despite the largest measured saving — its duplication is an explanatory comment and its suites split real-vs-mocked.
- 2026-09-02  All 23 remaining families worked: 11 extracted to a shared setup, 12 adjudicated. Debt list EMPTY, 43 families carry a written reason (0b4ab06e0). Clones 160 -> 67, duplicated lines 7,863 -> 3,368. Left: lane B (PL-13's conversions) and choosing the clone floor.
- 2026-09-02  Clone-ledger loop: 12 items worked. 62 pairs / 2506 duplicated lines -> 53 outstanding / 1826. Findings beyond duplication: 4 missing assertions (picker wiring, list_content paging, stopDemo component status, plus PL-35 filed), 1 flaky test root-caused (guessed 50ms sleep, now polls), 1 over-strong rule corrected (mocks CAN move if imported before the harness), 1 enforcer scope gap documented (no-bare-sleep walks src only).
- 2026-09-02  test(ai-bundle): eleven suites, one fixture file — and the enforcer that caught the second copy (`57a0d94ab`)
- 2026-09-02  refactor(tests): two comms suites stop hand-rolling a handshake the helper could do (`9cb2835e0`)
- 2026-09-02  refactor(tests): the one dashboard suite that never adopted its own shared file (`0288c4c63`)
- 2026-09-02  refactor(tests): blockCollectionHelpers shares its ops double and install setup (`d4195964d`)
- 2026-09-02  refactor(tests): the storefrontSetupPhases family shares its EDS config fixture (`be4b576a3`)
- 2026-09-02  refactor(tests): continueHandler's errors and operations suites share their setup (`fc92cfda3`)
- 2026-09-02  refactor(tests): installHandler's mock wall was a documented instruction to duplicate (`8a784e362`)
- 2026-09-02  refactor(tests): the lifecycle command families finish their harnesses (`ca5d7b728`)
- 2026-09-02  Merge loop/2026-09-02-helix-dedup: the duplication burn-down and what it found (`c8a4c73a6`)
- 2026-09-02  docs(backlog): log the clone-ledger loop against PL-9 (`2ce6cb6c8`)
- 2026-09-02  refactor(tests): adobeEntityFetcher's base and workspaces suites share their setup (`cfb701947`)
- 2026-09-02  test(sop): ConnectStoreStepContent is variants, not duplicates — and how I proved it wrong first (`5ccfd8759`)
- 2026-09-02  refactor(tests): the contentAuthoringTools pair finishes its extraction (`0cf61bf01`)
- 2026-09-02  refactor(tests): one extractResetParams stand-in, and its drift written down (`5778edf44`)
- 2026-09-02  test(lifecycle): stopping a demo now proves the COMPONENT stopped, not just the project (`1d60d3892`)
- 2026-09-02  refactor(tests): the checkUpdates upstream suites share their harness (`a37bd9ece`)
- 2026-09-02  fix(tests): the intermittent MCP failure was a guessed delay, not the machine (`10b17b8fa`)
- 2026-09-02  test(ai): contentAuthoringTools shares its server double, and pages properly (`3f15028ab`)
- 2026-09-02  refactor(tests): finish the block-library pair, and report lines as well as pairs (`5b3312830`)
- 2026-09-02  refactor(tests): the block-library suites share their wall, and a claim gets corrected (`cd471031a`)
- 2026-09-02  refactor(tests): the webview-command mock wall becomes one helper (`e7fe95d29`)
- 2026-09-02  test(selection): the picker suites stop being a third copy of coverage (`23f4d9832`)
- 2026-09-02  docs(tooling): the probe is the first step of every clone item, not a one-off (`a543025fe`)
- 2026-09-02  test(auth): the pickers now assert what they hand the selection hook (`a4b6ad9ba`)
- 2026-09-02  feat(tooling): a duplication burn-down keyed to the measurement, not a proxy (`79c4eed8d`)
- 2026-09-02  docs(backlog): PL-9's debt list is empty (`aa1541ff3`)
- 2026-09-02  refactor(tests): three small mock walls become one each (`505d55361`)
- 2026-09-02  refactor(tests): three more families share their setup (`81598638f`)
- 2026-09-02  refactor(tests): three families extract their shared setup (`9d92dd001`)
- 2026-09-02  docs(backlog): PL-9's remaining work, with the three things the numbers hid (`2b789e364`)
- 2026-09-02  test(sop): 26 split families adjudicated — debt and correct splits now differ (`260df7956`)
- 2026-09-02  docs(backlog): re-measure PL-9 — the baseline was four days stale (`fe9abe1d2`)
