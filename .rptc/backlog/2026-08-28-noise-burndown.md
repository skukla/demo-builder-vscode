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
