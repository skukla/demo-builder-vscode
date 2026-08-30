<!-- Last verified: 2026-07-03 -->
# Architecture Documentation Index

**New to the codebase?** Start with [`overview.md`](overview.md), then
[`component-system.md`](component-system.md), then
[`adobe-setup.md`](adobe-setup.md).

## Documents

### Core

- [`overview.md`](overview.md) — **START HERE.** High-level system
  architecture, technology stack, key components, and design decisions.
- [`adobe-setup.md`](adobe-setup.md) — Adobe authentication and
  org/project/workspace selection flow: two-column layout, progressive
  disclosure, per-operation org targeting (no global `aio console` mutation).
- [`component-system.md`](component-system.md) — Component-based architecture
  for mixing frontends, backends, and dependencies; registry structure and
  installation workflow. Implementation:
  `src/features/components/services/componentManager.ts`,
  `src/features/components/config/components.json`.
- [`service-resolution-pattern.md`](service-resolution-pattern.md) — How
  components declare services they *provide* as well as *require*. Partly
  historical: the resolver engine was deleted; what survives is Review-screen
  "(built-in)" labeling and requiredServices-driven env resolution (see the
  doc's status note).
- [`state-ownership.md`](state-ownership.md) — Single-source-of-truth
  principle for project state; written after the mesh-endpoint dual-storage
  bug.
- [`error-handling.md`](error-handling.md) — Error handling architecture
  (backend phases complete; frontend migration pending at time of writing).
- [`graph-based-dependencies.md`](graph-based-dependencies.md) — Planned
  evolution from the two-level prerequisite/plugin hierarchy to a
  graph-based dependency system (topological install order, cycle
  detection).
- [`working-directory-and-node-version.md`](working-directory-and-node-version.md)
  — Why commands must run from the correct component directory, and how
  per-component Node versions (fnm) are managed.

### Components and Updates

- [`component-version-management.md`](component-version-management.md) —
  Floating stable-tag pattern that decouples component updates from
  extension releases.
- [`component-update-env-migration.md`](component-update-env-migration.md) —
  Handling environment-variable renames across component updates so `.env`
  files don't rot.
- [`update-system-refactoring.md`](update-system-refactoring.md) — Dynamic
  repository resolution from `components.json` instead of hardcoded
  mappings. Implementation:
  `src/features/updates/services/updateManager.ts`.

### Edge Delivery Services (EDS)

- [`eds-content-separation.md`](eds-content-separation.md) — The
  two-repository EDS model: GitHub repo = code, DA.live = content, joined by
  configuration.
- [`eds-backend-configuration.md`](eds-backend-configuration.md) — How EDS
  projects are configured based on the selected backend component.
- [`eds-unified-config-generation.md`](eds-unified-config-generation.md) —
  Registry-based generation of both `.env` and `site.json` in one phase.
- [`eds-standard-pattern-refactoring.md`](eds-standard-pattern-refactoring.md)
  — Aligning EDS configuration with the standard component pattern
  (removing custom `.env` generation logic).
- [`eds-byom-pdp-routing.md`](eds-byom-pdp-routing.md) — How
  `/products/{urlKey}/{sku}` URLs work for every storefront: shared
  `render-pdp` overlay, browser-side smart 404, reversible SKU encoding.
  Decision rationale: [ADR-005](adr/005-byom-pdp-routing.md) and
  [ADR-007](adr/007-pdp-sku-url-encoding.md).

## Architecture Decision Records (`adr/`)

**The index is generated: [`adr/README.md`](adr/README.md).** It is rebuilt by
`npm run docs:adr-index` and every column in it is measured from the files rather
than asserted, so it cannot drift from what is on disk.

This section used to carry a second, hand-written copy of that table. It stopped at
ADR-018 while four more had landed — the same failure the backlog index had, and the
reason the generator exists. Do not reintroduce a copy here; link to it.

For the decision-vs-convention split — why a rule lives in the handbook and its
reasoning lives in an ADR — see
[`../development/handbook.md`](../development/handbook.md).

## Quick Reference

**Q: Where are wizard step definitions?**
A: `src/features/project-creation/config/wizard-steps.json` (config) and
feature-specific `ui/steps/` directories (React components).

**Q: How does Adobe authentication work?**
A: [`adobe-setup.md`](adobe-setup.md) for the flow;
`src/features/authentication/services/authenticationService.ts` for
implementation.

**Q: How are components cloned and installed?**
A: [`component-system.md`](component-system.md) and
`src/features/components/services/componentManager.ts`.

**Q: What's the "Backend Call on Continue" pattern?**
A: `docs/patterns/selection-pattern.md`.

## Related Documentation

- `src/CLAUDE.md`, `src/core/CLAUDE.md`, `src/commands/CLAUDE.md`,
  `src/features/CLAUDE.md` — source-level guidance
- `docs/systems/prerequisites-system.md`, `docs/systems/race-conditions.md`,
  `docs/systems/logging-system.md`, `docs/systems/webview-loading.md` —
  subsystem docs
- `docs/CLAUDE.md` — development strategy;
  `docs/patterns/selection-pattern.md`, `docs/patterns/state-management.md`
  — design patterns

## Maintenance

When making architectural changes:

1. Update the relevant architecture doc within the same PR
2. Update this index if docs are added, removed, or repurposed
3. Record significant decisions as a new ADR in `adr/` (next number)
