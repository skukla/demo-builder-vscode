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

| ADR | Title | Status |
|-----|-------|--------|
| [001](adr/001-component-naming-standardization.md) | Component naming standardization (`externalSystems` → `integrations`) | Accepted and implemented |
| [002](adr/002-helix-bulk-api-fallback.md) | Helix bulk API fallback strategy | Accepted and implemented |
| [003](adr/003-multisite-architecture-seam.md) | Multisite architecture seam | Accepted (implementation deferred) |
| [004](adr/004-claude-code-harness.md) | Claude Code (CLI) as the AI harness | Accepted |
| [005](adr/005-byom-pdp-routing.md) | BYOM PDP routing — canonical pattern with multi-tenancy and smart-404 gap-fill | Accepted |
| [006](adr/006-thin-layer-storefront-customization.md) | Thin-layer storefront customization — retire CitiSignal forks, canonical + code patches | Accepted (implementation in progress) |
| [007](adr/007-pdp-sku-url-encoding.md) | PDP SKU URL encoding — reversible, lowercase-stable, Helix-safe | Accepted |
| [008](adr/008-derive-runtime-surface-inventory.md) | Derive the runtime-surface inventory from the boilerplate, not by hand | Accepted (producer built; consumer wiring pending) |
| [009](adr/009-storefront-config-flag-injection.md) | Storefront `config.json` flag injection — the generator owns config, so template flags must be re-injected | Accepted |
| [010](adr/010-content-copy-completeness.md) | Content-copy completeness — follow document references so unindexed fragments aren't dropped | Accepted |
| [011](adr/011-app-builder-deployables.md) | App Builder deployables — a keyed set of deployable components in one App Builder project (shipped as `appBuilderComponents`) | Accepted; D1–D2 implemented, D3 pending |
| [012](adr/012-diagnostic-surfaces.md) | Diagnostic surfaces — every capability human-reachable first, MCP tools wrap the same core; no remote probe manifest | Accepted; prerequisite landed, surfaces planned (beta.123) |
| [013](adr/013-generated-file-edit-survival.md) | Generated AI files — hash-and-skip edit survival (refresh overwrites only unmodified files) | Implemented (feature/tiered-ai-refresh, 2026-08-14) |
| [014](adr/014-data-installer-shared-credential.md) | The ACCS datapack credential is served from the shared discovery service (one pair, never persisted; a declared pair still wins) | Implemented (feature/data-installer-credential-broker, 2026-08-16) |
| [015](adr/015-dependency-architecture.md) | Dependency architecture (EXTENSION HOST ONLY — the webview side is ADR-017): fetch only at the boundary (extension.ts, commands/, handlers/, tool registrars), inject below, construct in the root or a create...Deps file | Implemented + enforced (tests/sop/architecture-rules.test.ts, 2026-08-28; scoped to the host 2026-08-29); placement rules in [where-code-goes.md](../architecture/where-code-goes.md) |
| [016](adr/016-test-strategy.md) | Test strategy: three tiers (unit = handed-in deps + argument assertions; contract = fixtures-from-live + drift; live = journeys/verify-after-write), Jest retained, noise-to-zero, Stryker effectiveness pilot | Ratified 2026-08-28; execution under PL-11 |
| [017](adr/017-webview-architecture.md) | Webview architecture: composition root = the 8 bundle entries, dependencies as props (no context), the message channel a RATIFIED singleton (`acquireVsCodeApi` is once-per-webview), hooks are the service layer, and a stylesheet belongs to its bundle's graph | Accepted + enforced 2026-08-29 (`webview-architecture-rules.test.ts`, `stylesheet-bundles.test.ts`) |
| [018](adr/018-css-architecture.md) | CSS architecture: vendor CSS in the LOWEST cascade layer (`@layer vendor, reset, theme, overrides`), `!important` is a symptom not a mechanism (1,866 measured removable), shared-component classes live in a globally-loaded sheet, component `<style>` blocks are component-private, utilities live in `@layer overrides` | **Proposed** 2026-08-29 — §§1–2 measured, §§3–4 already enforced (`stylesheet-bundles.test.ts`), implementation tracked in PL-21 |

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
