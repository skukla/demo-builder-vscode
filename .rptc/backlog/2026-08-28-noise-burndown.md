---
id: PL-15
kind: chore
area: platform
parent: PL-11
needs: PL-14
value: med
status: active
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
- 2026-08-29  test(noise): the console allowlist is EMPTY — phase 4 complete (`00ea34cae`)
- 2026-08-29  test(noise): act warnings at zero, prop warnings at zero — 14 suites left, all real errors (`2a56af2e9`)
- 2026-08-29  test(noise): every act() warning is gone — 226 to 0, and two real bugs on the way (`0e70f76c5`)
- 2026-08-29  test(noise): RepoSelectionInline solved — an await between render and settle (`a27c427b2`)
- 2026-08-29  test(noise): useComponentConfig silenced (56 -> 0), and one suite that resisted (`911c44888`)
- 2026-08-28  test(noise): three more suite families silenced — 279 act warnings to zero (`f9339a45b`)
- 2026-08-28  test(noise): the act() fix is to settle BEFORE the query, not after (`6b07d8440`)
- 2026-08-28  test(noise): six webviewLogger mocks deleted — the canonical form was zero (`5a81d4e92`)
- 2026-08-28  test(noise): real-output noise 102 -> 32, and the gate's own comment was wrong (`4959dea36`)
- 2026-08-28  test(noise): phase 4 begins — 17 suites go silent by fixing one shared filter (`86764c226`)

## Shipped so far

- 2026-09-03  Run noise reaches zero. Measured on a full gate: `console.warn` 0,
  `console.error` 0, act() warnings 0, and the console allowlist empty — the
  item's three original fix classes were already done. What remained was 58
  `console.log` firings from exactly TWO statements:
  `wizardHelpers.ts` (a trace labelled "Debug:", on the hot `buildProjectConfig`
  path) and `StorefrontSetupStep.tsx` (an unmount notice). Both deleted, neither
  a suppression: the second duplicated `handleCancelStorefrontSetup`'s own
  `'[Storefront Setup] Cancel requested'`, written through the extension's
  logger the moment it receives the cancel — the side that can actually persist
  it. Two further `console.log` calls in `wizardHelpers` sit on error paths
  beside a `console.warn`, never fire in the suite, and were deliberately left.
