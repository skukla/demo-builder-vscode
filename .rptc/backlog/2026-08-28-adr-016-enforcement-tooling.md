---
id: PL-14
kind: chore
area: platform
parent: PL-11
needs: []
value: high
status: backlog
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
