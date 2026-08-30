---
id: PL-14
kind: chore
area: platform
parent: PL-11
needs: []
value: high
status: active
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
