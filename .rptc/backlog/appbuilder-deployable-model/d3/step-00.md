# Step 00 — RPTC Re-initialization

**Purpose:** Restore full RPTC context before the TDD session (the plan was scoped separately; the
executor must reload context before writing code).

## Tasks

- [ ] Re-invoke the originating command: `/rptc:feat "ADR-011 D3 — Plan is approved, continue to implementation"`.
- [ ] Read `.rptc/backlog/appbuilder-deployable-model/d3/overview.md` (the D3 step table, the component-structure
      guarantee, the non-negotiable mesh-edge discipline).
- [ ] Read the parent `../overview.md` (§"Gaps to resolve" state-coherence seam) and
      `docs/architecture/adr/011-app-builder-deployables.md`.
- [ ] Read `.rptc/research/app-builder-integration-model/research.md` (the model-as-built + the
      confirmed gaps, with file:line evidence).
- [ ] Confirm branch: create/checkout `feature/appbuilder-deployables-d3` off `develop` (never master).
- [ ] Run the baseline suite once (`npx jest --no-coverage` → redirect to a file; never pipe to `tail`)
      and record the GREEN starting point.

## Acceptance criteria

- Context files read; working branch created; baseline suite GREEN before any RED test.

## Notes

- Writes no production code. All subsequent steps are strictly RED → GREEN → REFACTOR.
- The `MESH_ENDPOINT`→`config.json` edge must stay byte-identical throughout (golden test lands in Step 06).
