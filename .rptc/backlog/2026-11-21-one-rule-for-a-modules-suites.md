---
id: PL-116
kind: fix
area: platform
parent: PL-45
needs: []
value: low
status: built
---

# One rule decides which test suites belong to a module, in every mutation script

Filed 2026-11-21 from the backlog reconciliation (PL-45 named the disagreement; no item carried it).

Two implementations still disagree: `scripts/mutationScope.mjs` (line 86) matches the module's stem
anywhere in `tests/`, while `scripts/focusModule.mjs` (line 77) uses the mirror directory plus an
import-graph fallback. mutationScope's version still feeds `profile()`'s suite counts (lines 163-164),
so the two scripts can measure the same module against different suites.

Done when both call one function, with a test that a module whose suite sits outside the mirror is
counted the same by both.

## Shipped so far

- 2026-11-23  Loop 2026-11-23: built (86ece0e00, on loop/2026-11-23-backlog). Both scripts read mirroringSuites from scripts/moduleSuites.mjs; tests/scripts/moduleSuites.test.ts checks a strayed suite and a same-named pair (fails on the old rule). 9 modules include to blocked, all same-name miscredits; checkAttributionEquality: 0 pinned rows moved. Reviewed (opus, 3 low findings fixed).
