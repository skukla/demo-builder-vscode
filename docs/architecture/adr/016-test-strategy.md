# ADR-016: Test strategy — three tiers, chosen on the escape record

**Status:** Accepted (owner-ratified 2026-08-28)
**Companion to:** ADR-015 (dependency architecture) — the two were designed
together and enforce each other; neither stands alone.
**Evidence base:** `.rptc/plans/test-strategy-audit/` — the escape analysis
(15 shipped defects with receipts), the witness census (54/54 convergence
files), the craft census (1,179/1,179 suites), the coverage run (84% lines /
73% branches), and the run-noise measurement (355 act() warnings per green
run). This is the first time in the project's life the test strategy was
CHOSEN rather than accreted.

## Context

Two years of AI-driven development accreted a mock-heavy unit style with no
deliberate strategy. The escape analysis showed the consequence precisely:
of 15 defects that shipped past the suite, 8 lived in the gap between our
code and external reality — a class NO unit-test improvement can close,
because a test double of a wrong assumption is still wrong. The remaining
escapes were mock-blindness on internal seams (5, already fixed forward by
the argument-assertion rule), one unchecked convention, and one comment
doing verification's job.

## Decision — the three tiers

1. **UNIT** — the default for all logic: dependencies handed in, fakes
   passed through the front door, assertions on HOW collaborators are called
   (interaction testing, Freeman & Pryce). Rides ADR-015: converted code
   sheds its module-mock walls; suites migrate to plain deps-object fakes.
2. **CONTRACT** — any fixture standing for an external system is CAPTURED
   from a live response, never composed from memory (characterization,
   Feathers; integration-contract testing, Fowler/Pact); drift scripts
   re-check external agreements on a cadence (eds:drift /
   data-installer:drift are the pattern).
3. **LIVE** — cloud-touching paths verify against the real system: journeys
   that contain their own undo and end at a checked zero; probe verification
   after tool changes; and verify-after-write built INTO destructive
   operations (the remove_integration fix shape — postconditions, not
   trust).

### Where a test file lives (added 2026-08-28)

The tiers above say what a test IS. They said nothing about where it goes,
and that omission had a cost: a second test tree, `tests/unit/`, existed for
years without violating anything written down. It held 28 files against 1,158
in the mirror tree, covered 5 modules the mirror tree ALSO covered, and — being
in a different directory — could not reach the shared setup helpers its
neighbours used. That is the whole explanation for suites that "each do their
own thing": they were not allowed to share.

The rule, from here:

**A test file lives at the path its subject lives at, with `src/` replaced by
`tests/`.** `src/features/eds/services/toolManager.ts` is tested by
`tests/features/eds/services/toolManager*.test.ts` and nowhere else. A suite
split for size keeps the base name and adds a `-suffix`; the split shares one
`*.testUtils.ts` beside it.

There is no tier directory, and there must not be one. UNIT, CONTRACT and LIVE
describe how a test is written — handed-in fakes, captured fixtures, real
systems — not where it sits. A given file routinely contains tests of more than
one tier for the same subject, and separating them by directory would split a
subject's coverage across the tree for no reader's benefit. The tier is visible
in the test's own construction, which is where it belongs.

Enforced by `tests/sop/test-placement.test.ts`: every test file must sit at its
subject's mirrored path, and no test file may live outside the mirror.

Grounding: Test Pyramid (Cohn; Fowler), contract tests (Fowler; Pact),
GOOS interaction testing (Freeman & Pryce), characterization tests
(Feathers), architectural fitness functions (Ford/Parsons/Kua).

## Ratified with the tiers

- **Framework**: Jest stays. Criteria: fit (20s full suite — the speed a
  switch would sell, we have), pain (zero of 15 escapes trace to the
  framework), cost (1,179-suite migration buys nothing).
  `@vscode/test-electron` (real-extension-host tests) is the noted
  complement IF journeys ever prove insufficient as the live tier.
- **eslint-plugin-jest** adopted (warn → ratchet to error): the community's
  Jest best-practice rules replace hand-rolled census detectors.
- **Run noise goes to ZERO and stays there**: fix the three measured classes
  (un-awaited updates, mock prop-spreading, expected-error absorption), then
  a setup-level fail-on-unexpected-console gate with a shrinking allowlist.
  A green run MEANS a clean run.
- **Effectiveness is measured, not assumed**: a Stryker mutation pilot over
  the convergence-queue services + worst-covered load-bearing files produces
  the evidence-based dead-weight verdict; pruning decisions come from its
  data. Release-cut cadence (mutation runs are too slow for CI).
- **Duplication target = an adjudicated floor, not literal zero**: per-suite
  mock isolation is ratified policy; the tests-tree clone count (159)
  ratchets down as ADR-015 conversions melt the mock walls, resting where
  every remaining clone carries a named reason or sits on a kill queue
  (src precedent: floor 66).
- **Split-suite families share a testUtils** (the family-setup rule) and
  deps-object fakes are the target double style.

## Explicitly not promised

"No bugs ever." New failure modes will occur; the system's guarantee is that
each becomes a permanent check (journey → finding → enforcement), so error
CLASSES do not repeat.

## Rejected alternatives

- **Switch to Vitest** — no measured pain traces to Jest; migration cost
  with no capability gain.
- **Literal-zero duplication** — destroys ratified isolation to flatter a
  metric (Goodhart).
- **Rewrite tests from scratch** — the suite has a real catch record and 91%
  of suites already use the accepted lighter double styles; incremental
  convergence (Feathers) is the accepted path and the chosen one.

## Enforcement

`tests/sop/architecture-rules.test.ts` (shared with ADR-015), the coming
fail-on-console gate, eslint-plugin-jest, the clone ratchet, and the pinned
census instruments in `.rptc/plans/pattern-conformance-audit/harness/`.
Execution is tracked under PL-11 (test health epic).
