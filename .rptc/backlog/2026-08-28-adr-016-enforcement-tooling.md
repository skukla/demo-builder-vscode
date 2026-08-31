---
id: PL-14
kind: chore
area: platform
parent: PL-11
needs: []
value: high
status: built
---

# ADR-016 enforcement tooling — the seven artifacts

The gap list from the owner's "what do we need to create" review (2026-08-28).
Build BEFORE the convergence batches — the gates are what make every
subsequent fix measurable and irreversible.

**Group A (immediate — each is the mechanism its burn-down needs):**
1. fail-on-console jest setup gate, allowlist seeded at the current ~1,000
   noise lines (the allowlist IS PL-15's burn-down ledger from day one)
2. eslint-plugin-jest adoption (warn tier -> ratchet to error)
3. family-testUtils check (multi-suite subject without shared setup -> ledger)
4. tests-tree clone ratchet (159) pinned into the codebase-sweep skill beside
   the src ratchet (66)

**Group B (release-cut instruments):**
5. test-strategy-scan skill — the witness/craft/noise/coverage censuses
   promoted from one-off scripts to a repeatable reconciled pass
6. Stryker mutation-pilot config + runner skill (scope: convergence-queue
   services + worst-covered load-bearing files; release-cut cadence)

**Group C:**
7. webview-test-authoring skill gains ADR-016 pointers (target double style,
   act()-wait rules)

## Shipped so far

- 2026-08-28  GROUP A COMPLETE (2026-08-28, attended run): (1) console gate — fails any test emitting console.error/warn unless its suite is on the burn-down ledger; ledger seeded from a measured collect-run at 68 of 1,179 suites; planted violation proves it fails; live in CI (both setup files import it). (2) eslint-plugin-jest adopted — 3 rules at ERROR (focused tests, identical titles, malformed expects), 8 at warn; first run found a REAL defect (ProjectCreationStep had two tests sharing a title while the second asserted something else — renamed) plus 3 rule-misreads of the deferred-assertion pattern, annotated with reasons. (3) family-setup check — 89 shared-setup-less families frozen, new ones fail (planted family proved it); ranked worklist written: 20 real targets, 27 small, 42 legitimate splits, ~2,446 removable lines. (4) tests-tree clone ratchet 160/2.44% pinned into codebase-sweep WITH its producing command (verified reproducible). Full suite green throughout: 1,179 suites / 15,242 tests.
- 2026-08-30  feat(tooling): Stryker mutation pilot — 93% of defects caught, and the 7% named (`c4118338e`)
- 2026-08-30  feat(tooling): test-strategy-scan — the release-cut read of the SUITE, not the run (`aa0c48b55`)
- 2026-08-31  docs(skills): webview-test-authoring gains its ADR-016 pointers — PL-14 item 7 (`697422ff7`)
- 2026-08-31  Item 7 (webview-test-authoring ADR-016 pointers) shipped — all seven artifacts now landed. Left at 'built', not 'shipped': the instruments run, but nobody has yet authored a webview test against the new sections.
- 2026-08-31  test(eds): the daLiveAuthPrompt family, where most of the shared setup was dead (`a2637e4c2`)
- 2026-08-31  test(ai): the mcpInspector family shares its harness — and the comment that stopped it (`5bbedff38`)
- 2026-08-31  test(dashboard): the configure family — four suites, and most of the shared setup was nothing (`c8320f92d`)
- 2026-08-31  test(eds): the edsPipeline family, and the casts it makes countable (`d3b602fe0`)
- 2026-08-31  test(eds): daLiveConfigService — the whole mock preamble was dead (`c67429452`)
- 2026-08-31  test(mesh): the meshVerifier family, where six lines existed to serve each other (`2fafe61bb`)
- 2026-08-31  test(mesh): the deployMesh family, and a hoisting rule worth stating once (`0c159b082`)
- 2026-08-31  test(ai-bundle): aiContextWriter shares its fixtures — and this one was real duplication (`4ead244ef`)
- 2026-08-31  test(components): componentManager — seven mocks and one line, serving each other (`51048f373`)
- 2026-08-31  docs(tests): 79 dead mocks across eleven families, recorded where it will be found (`2eafc0682`)
- 2026-08-31  test(eds): the last two families — and the root I parked them on was never the blocker (`6ed8cd592`)
- 2026-08-31  feat(tooling): dead-mock-scan — the probe that found 79 dead mocks, made repeatable (`0073ebf88`)
- 2026-08-31  test: the ledgered families are swept — 37 dead mocks, and 45 with nothing to find (`7eb23721a`)
- 2026-08-31  test: 7 more dead mocks, and one family whose entire shared set was dead (`56dc6c09b`)
- 2026-08-31  test: 22 more dead mocks, found by pointing the new scan at four ledgered families (`adc0013f6`)
- 2026-08-31  test: delete the 43 redundant automocks the new scan found (`2b6fea5c1`)
