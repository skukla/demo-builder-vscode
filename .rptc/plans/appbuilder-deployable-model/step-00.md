# Step 00 — RPTC Re-initialization

**Purpose:** Restore full RPTC working context at the start of the TDD session (the plan was written
by a separate architect sub-agent; the TDD executor must reload context before writing code).

## Tasks

- [ ] Re-invoke the originating command (`/rptc:feat "App Builder deployable model — D1"` or the
      `/rptc:fix` equivalent the PM used) so the TDD loop runs with the correct skills/SOPs loaded.
- [ ] Read `.rptc/plans/appbuilder-deployable-model/overview.md` (D1 section + constraints + test
      strategy).
- [ ] Read `.rptc/research/appbuilder-deployable-model/d1-spike-findings.md` (the empirical
      source of truth — honor the CORRECTION and DEFINITIVE sections).
- [ ] Read `docs/architecture/adr/011-app-builder-deployables.md`.
- [ ] Confirm branch: D1 is a multi-step feature; create/checkout a `feature/appbuilder-deployables-d1`
      branch off `develop` (per project git workflow — commit to develop's feature line, never master).
- [ ] Run the baseline test suite once (`npx jest --no-coverage` → file per memory note; never pipe to
      `tail`) and record the GREEN starting point (~574 suites / ~7054 tests).

## Acceptance criteria

- RPTC command re-invoked; context files read.
- Working branch created.
- Baseline suite GREEN before any RED test is written.

## Notes

- This step writes no production code and no tests. It exists so the TDD executor never starts cold.
- All subsequent steps are strictly RED → GREEN → REFACTOR.
