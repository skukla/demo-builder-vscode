---
id: PL-15
kind: chore
area: platform
parent: PL-11
needs: PL-14
value: med
status: backlog
---

# Run-noise burn-down to zero

The owner's "error-free" ruling (ADR-016): a green run comes to MEAN a clean
run. Measured baseline (2026-08-28 full suite): 355 act() warnings, 72 React
prop warnings, 600+ error-channel lines.

Three fix classes:
1. act() warnings — un-awaited updates in tests; wrap/await or advance fake
   timers. Not cosmetic: they can mask assertion-timing bugs.
2. Prop warnings — per-suite component stubs spreading non-DOM props; fix the
   shared stub patterns, killing whole families at once.
3. Expected-error absorption — failure-path tests assert the log happened and
   silence it, so only UNEXPECTED errors surface.

Needs PL-14's fail-on-console gate first: its allowlist is this item's
ledger, shrinking to zero and frozen there. Burn down opportunistically in
convergence batches plus dedicated passes for the top emitters.

## Shipped so far

- 2026-08-28  SCOPE + FEASIBILITY MEASURED 2026-08-28 (owner asked: can the React warnings all go, and does this belong to the program?). ANSWER: yes and yes — they are already this item's scope, and they are two distinct classes with different fixes: (1) UNKNOWN-PROP warnings, 61 per react run + 11 event-handler complaints: caused by ~50 PER-SUITE Spectrum stubs spreading raw props onto DOM elements. NOT the shared stub — that one already filters correctly with a 91-name list. A one-file fix (a shared filterSpectrumProps the per-suite stubs import) was PROTOTYPED and measured: 61 -> 34 recognize warnings and 11 -> 0 event-handler warnings, whole react project still green (3,026 tests). Prototype REVERTED at the owner's direction to keep this pass single-concern; redo it here as its own pass. (2) act() warnings, 327: a different animal — each is a test asserting before a React state update settled, so they are per-test fixes, not one shared fix. Ordering ratified by the owner: this item runs AFTER the architecture + witness work, not mixed into it.
