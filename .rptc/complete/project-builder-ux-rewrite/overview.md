# Project Builder UX rewrite — plan overview (sequenced)

> ## ⚠ REVISED 2026-06-22 — pivoted to the NESTED-BUILDER model (v3). See `nested-builder-plan.md`.
> After F5 review, the group-paced step model below (R1, shipped/uncommitted) and the tiles-everywhere
> refinement (R1b, shipped/uncommitted) were **both superseded** by a single nested **"Build Your Project"**
> step. The locked design is `research.md` → "LOCKED design v3 — nested timeline"; the clickable spec is
> `prototype-v2-nested.html`. **The build plan of record is `nested-builder-plan.md`.** The R1/R1b sections
> below are kept for history; their content components + the registry/gating/hook work are largely reused by
> the nested build, but the per-step structure is replaced.

**Status:** Design LOCKED v3 (PM, 2026-06-22). Large, multi-slice rewrite.
**Design + visual spec:** `research.md` ("LOCKED design v3 — nested timeline") + `prototype-v2-nested.html`.
**Supersedes:** the component-overview `ProjectBuilderStep` (PR #60), and the now-superseded R1/R1b step model.
Built on the renamed "App Builder component" vocabulary (this worktree).

## The locked design in one paragraph
The creation wizard reorganizes around component **groups as steps** (the `SETUP PROGRESS` timeline is the
linear guide): Demo Setup → Prerequisites → **Commerce → Integrations → Storefront** → Final Review →
Create. **Single-component group steps (Commerce, Storefront) are inline forms** reusing existing step
content; **only the Integrations step uses tiles** (a managed collection) with a **typed Add**
(Mesh / App Builder App / Custom-URL) and per-item modals. The **Adobe project + workspace** is provisioned
**inside the first integration's setup** (no standalone tile), then shown as a context line. Everything is
configured **at creation**; the post-creation dashboard reverts to **runtime-only**.

## Why sequenced (not one PR)
It restructures the wizard core (steps, navigation, gating), rewrites several step surfaces, folds the
Adobe/App Builder + integration-config flows together, and changes the dashboard. Each phase is its own
RPTC `feat` (research-light → plan → TDD → PR), green at each step, preserving the load-bearing
mesh→storefront `MESH_ENDPOINT` edge + the dual-flow throughout.

## Slices

**R1 — Wizard restructure into group-paced steps.**
Replace the per-concern steps + the current `ProjectBuilderStep` with component-GROUP steps. Commerce +
Storefront = **inline forms** reusing existing content (`ConnectStoreStepContent`; EDS connect + repo +
block-libraries). Integrations step lands as a minimal placeholder (full tiles in R2). **Generalize the
App Builder gating** from mesh-only (`hasMeshInDependencies`) to **any App Builder component**. The
timeline is the guide; Continue/Back drive it; per-step gating. Demo Setup / Prerequisites / Review /
Create bookends adjusted.

**R2 — Integrations tile surface.**
The tiled Integrations step: tiles + **typed Add** (Mesh / App Builder App / Custom) + per-item config
modals. **Workspace folds into the integration add/config flow** (reuse the adobe auth/project/workspace
UI inside it); context line once established; a template-required mesh shows pre-added. Per-tile **status
model** + the **Create gate** (all required ✓). Resolve the **cross-cutting Adobe sign-in** (needed by
Commerce discovery, which precedes Integrations) — surface a shared one-time sign-in when first needed.

**R3 — Dashboard → runtime-only.**
Remove the D2 post-creation composition (add/remove integrations) from the dashboard; dashboard =
start/stop · logs · status · configure-existing only. (Composition is creation-time.)

## Cross-cutting / risks
- **Adobe sign-in** is shared (Commerce discovery + App Builder workspace); resolve placement in R1/R2.
- **Build-your-own** entry: the empty-composer path through the same group steps (mostly pre-fill = none).
- **Reuse existing step content** as inline panels (R1) and modal bodies (R2) rather than rebuilding.
- **Preserve** the mesh→storefront `MESH_ENDPOINT` edge + mesh dual-flow throughout (D3 still owns dual-flow removal).
- This is the biggest UI change in the wizard's history; ship R1 green before R2.

## Process
Each slice: its own `/rptc:feat` on this worktree (or a stacked branch), TDD, full lint+tsc+jest, PR. No
commit without approval; no AI-attribution. The current PR #60 (component-overview builder) is superseded
— it either gets folded into R1 or closed in favor of R1.
