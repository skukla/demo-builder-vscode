# Test-strategy slate — awaiting the owner's ratification (2026-08-28)

The complete set of decisions assembled by the strategy audit. Nothing here
is codified yet; each item becomes law + enforcement only on the owner's yes.
Evidence: escape-analysis.md (15 shipped defects, receipts), the witness
census (54/54 convergence files), the craft census (1,179/1,179 suites), the
coverage run (84% lines / 73% branches), and the noise measurement (355 act()
warnings, 72 prop warnings, 600+ error-channel lines per green run).

## The slate

1. **Three-tier strategy** (becomes the strategy ADR, companion to ADR-015):
   - UNIT: handed-in deps + argument assertions — the default for logic.
   - CONTRACT: fixtures captured from live responses, never composed;
     drift scripts for external agreements.
   - LIVE: cloud-touching paths verified against the real system — journeys
     with zero-checks; verify-after-write inside destructive operations.
   Grounding: Test Pyramid (Cohn/Fowler); contract testing (Fowler/Pact);
   interaction testing (Freeman & Pryce); characterization (Feathers);
   fitness functions (Ford/Parsons/Kua).

2. **eslint-plugin-jest adoption** — the community's ~50 Jest best-practice
   rules, replacing several hand-rolled census detectors with AST-accurate
   ones. Rollout: warn first, ratchet to error.

3. **Noise burn-down to ZERO + fail-on-console enforcement** — fix the three
   measured classes (act() waits, mock prop-spreading, expected-error
   absorption), then a setup-level rule fails any test emitting unexpected
   console output, with a shrinking allowlist. "Green" comes to MEAN clean.

4. **Mutation-testing pilot (Stryker)** — the effectiveness instrument:
   plant mutants in the core services (suggested first targets: the
   convergence queue's services + the worst-covered load-bearing files),
   measure which tests kill them, and produce the evidence-based dead-weight
   list. Decides — from data, not taste — whether a pruning pass is worth
   running. Too slow for CI; runs as a release-cut-style pass.

5. **Deferred codifications, now unblocked by evidence**:
   - split-family testUtils rule (a suite family must share its setup)
   - deps-object fakes as the ratified target double style (91% of suites
     already in the lighter styles; conversions ride ADR-015 batches)
   - tests-tree clone ratchet (159, may only fall)

6. **Coverage follow-ups** (health-epic queue, weighted by the measured
   worst-covered list): the MCP proxy process (0%, load-bearing), project
   deletion (16%), template sync (18%), DA.live cleanup commands (~24%).

7. **Craft-census fixes**: the one confirmed hollow suite
   (componentUpdater-envMigration: characterize CURRENT behavior, move
   DESIRED to a backlog item) and the throw-style suite normalization.

## Explicitly promised vs explicitly not

- PROMISED on ratification: zero-warning runs (enforced), non-repeating
  error classes, citable practices with machine-checked conformance,
  bloat bounded by ratchets and measured by mutation score.
- NOT promised: "no bugs ever" — new failure modes will occur; the system's
  guarantee is that each becomes a permanent check, not that none happens.
