# Research: Project-creation "project builder" UX

**Date:** 2026-06-21 · **Mode:** Hybrid (codebase + web) · **Status:** In progress — UX direction settled; two confirm-items + terminology under active research.
**Branch:** `feature/project-builder-ux` (off `develop`, with D1 + D2 merged).
**Provenance:** `/rptc:research` after D2 shipped. The creation wizard now funnels several choices through one multi-step modal; the team wants a true "project builder."

> **Terminology note (under review):** D1/D2 introduced the term **"deployable"** (`project.deployables`, `deployableRunner`, etc.). The established domain unit is **"component."** This doc uses "component/deployable" interchangeably pending the terminology decision (see Open Items §2) — the UX direction below holds regardless of the final name.

## Question

How should the project-creation flow present the choices a user now makes? The current multi-step modal
(`ArchitectureModal`) stacks several decisions; options floated: per-selection modal sub-steps, a
two-column modal, or dedicated webviews.

## Choices the user makes today (and where)

Creation runs in one wizard webview; only per-component env inputs live elsewhere (the dashboard Configure
webview, post-creation).

| Decision | Current surface | Depends on |
|---|---|---|
| Project name | `welcome` step (inline) | — |
| Demo package / brand | `welcome` → `BrandGallery` card | — |
| Architecture / stack (frontend+backend) | `ArchitectureModal` step 0 (top) | selected package |
| Optional addons | `ArchitectureModal` step 0 (middle) | stack |
| Components/deployables (catalog rows, required+optional, mesh as a row, custom-URL) | `ArchitectureModal` step 0 (bottom) — D2 Track B | stack (axis filter) |
| Block libraries | `ArchitectureModal` step 1 (EDS only) | stack + package |
| Adobe auth / IMS org | `adobe-auth` step (single-column) | mesh or ACCS backend |
| Adobe I/O project / workspace | `adobe-project` / `adobe-workspace` steps | mesh |
| Commerce connection + store discovery | `settings` step (progressive disclosure) | connection + org |
| GitHub / DA.live, repo config | `eds-connect-services` / `eds-repository-config` | EDS stack |
| Per-component env inputs (incl. secrets) | **separate dashboard Configure webview** (post-creation / on add) | catalog `envSchema` |

Four decisions (stack, addons, components, custom-URL) are stacked in one scrolling modal step; block
libraries are a second modal step. Dependency order is hard-wired throughout.

## UX analysis (web research)

- **Multi-step modal is the wrong container for composition this complex.** NN/g: "if it requires multiple
  steps, it probably justifies a full page"; "multi-step wizards shouldn't use modals." The codebase
  enforces the ceiling — the shared `Modal` silently downgrades `fullscreen`→`Dialog L` (`Modal.tsx:78-79`).
- **A wizard fits only linear, low-interaction, dependency-ordered steps.** The component/block-library
  choices are interdependent and revisited — NN/g's explicit "don't use a wizard" condition.
- **Hub-and-spoke (rendered as two-column master-detail) fits** many independent-but-related items needing
  required/optional/ready/completed semantics. Anaconda's installer is the precedent: per-spoke status, a
  Build gate on required spokes, extensible without complex dependency management.
- **Master-detail is the layout that implements hub-and-spoke** in one VS Code panel; dependency order is
  preserved by greying out "not-ready" spokes.

## Presentation options (codebase assessment)

| Option | Cost | Pattern reuse | Constraints | Fit |
|---|---|---|---|---|
| Modal sub-steps | Low | `ArchitectureModal`/`useModalState` | capped at `Dialog L` (`Modal.tsx:78-79`) | bounded sub-flows only |
| **Two-column master-detail builder** | **Low–Med** | **`TwoColumnLayout` (used by AdobeProjectStep/AdobeWorkspaceStep/ConfigureScreen), div-flex (width-safe)** | best; collapses to single-column | **strongest** |
| Dedicated webview per selection | High | BaseWebviewCommand slice ×N | full width | over-engineered; loses overview |
| More wizard steps | Lowest | wizard JSON + `renderStep` | linear only | poor for the catalog (interdependent) |

`TwoColumnLayout` is already productized (60/40, built with div-flex to dodge the Spectrum 450px gotcha) and
proven in three surfaces — the lowest-risk path.

## Recommendation (confidence: medium-high)

A **hybrid**: a thin linear wizard for the dependency-bound prefix (prerequisites → Adobe auth →
org/project/workspace → commerce connect), feeding a **two-column "Project Builder"** for composition:
- **Left (hub):** the configurable items — Architecture, Components (required + optional + add-your-own
  URL), Block Libraries — each row with a status summary, a required/optional tag, and a greyed "not-ready"
  state when gated on the prefix.
- **Right (detail):** the active item's config, with **per-item inputs and secrets inline** (pull the D2
  `envSchema` collection into the builder instead of the separate post-creation Configure trip).
- **"Create" gated** on required items complete. Modals reserved for confirmations only (e.g. remove).

Rejected: modal sub-steps (anti-pattern + `Dialog L` cap); dedicated webview per selection (heavier, loses
overview); more linear wizard steps for the catalog (interdependent + revisited). Home for the builder:
a wizard step using `TwoColumnLayout` (cheapest) vs. a dedicated webview (only if it must open independently).

## Confirm-items — RESOLVED (both support the builder)

**1. Cross-item dependency strength → clean hub-and-spoke; no dense branching.** The stack (frontend×backend)
is the single hub; deployables, addons, block libraries, and wizard steps each filter off it via flat
allow-list predicates (`fitsAxis` on `compatibleBackends`/`compatibleFrontends` — `deployableCatalogLoader.ts:23-47`;
`nativeForPackages`/`onlyForPackages`; `filterStepsForStack` pure step conditions). No `conflicts`/`replaces`
edges and no transitive cascades exist (the "graph-based dependency resolver" doc is an unimplemented
proposal). ACCS-vs-PaaS disables only the mesh entries, by a flat allow-list — not a cascade. → **Ready-gating
off a single "stack chosen" prefix is a clean fit.** (confidence: high)

**3. Revisit / telemetry → no telemetry, but revisiting is already first-class.** No usage analytics exist
(only Adobe-CLI telemetry opt-out). But four live revisit affordances already ship: edit-mode wizard
rehydration (`useWizardState.buildEditModeState`), free backward timeline nav (`TimelineNav.isStepClickable`),
`ArchitectureModal` revert/commit (`useModalState`), and dashboard add-after-creation (`DeployablesList` →
`addDeployable`). The design has already committed to re-editable choices — the behavioral assumption
hub-and-spoke depends on. → **Strong support.** (confidence: high)

## Terminology / domain model — FINDING (PM's instinct confirmed)

**"deployable" is a redundant coinage for what the codebase already calls a *component*.** ADR-011 itself says
"each deployable is its own component" (×3). The unit is unchanged: a cloned source repo under
`components/<id>/` with its own config (`componentConfigs`).

- **Real duplication exists:** the mesh lives in BOTH `components.json` (`mesh` category: `eds-commerce-mesh`…)
  AND `deployables.json` (`commerce-paas-mesh`… — same repos, different ids). Two parallel registries. A
  bridge function `meshDeployableToComponentIds` already translates between them — proof they're one layer.
- **The category already existed:** `components.json` has an `appBuilder` category + `componentSelections.appBuilder`,
  and `ComponentInstance.subType: 'mesh'|'app'|…`. D1 invented a new noun for a category that had a home.
- **Recommended scheme:** keep **component** as the umbrella; the App-Builder-deploying ones are a *kind*
  (`category:'appBuilder'`, `subType:'mesh'|'app'`), named **"App Builder component"** in prose / `appBuilderComponent`
  in symbols — NOT a sibling noun. Preserve the real distinction `deployable` captured ("deploys into the one
  shared App Builder project") as that category/subType. Reconcile the duplicate mesh registry. Standardize
  the grouping term: the PM's **"demo template"** == today's **"demo package"** (`demo-packages.json` — brand +
  storefronts + addons); pick one. Per-component **configuration** == `componentConfigs` (already exact).
- **Blast radius:** ~1,348 occurrences / 74 files (48 src, 26 test), ~30 file renames, 5 message ids — large
  but mechanical (global + LSP rename). **De-risking fact: `project.deployables` is NOT yet persisted to disk**
  (D1 read-through; `meshState`/`appState` still authoritative; `deployables` derived at load only). So renaming
  NOW costs **zero user-data migration** — a cost that only grows once D2/D3 begin persisting the keyed map.
  → **Rename now, before persistence.** (confidence: high)

## Remaining open items
- Left-rail builder component needs a short spike (Spectrum has no opinionated builder primitive).
- Pairs with **D3** (retire the mesh dual-flow + unify the dashboard list — same surfaces).
## Decisions (PM, 2026-06-21)

1. **Unit noun = "App Builder component."** Rename `deployable` → `appBuilderComponent` (symbols) / "App Builder
   component" (UI/prose); model it as a KIND of component (`category:'appBuilder'`, `subType:'mesh'|'app'`),
   not a sibling noun. Reconcile the duplicate mesh registry (mesh currently in both `components.json` and
   `deployables.json`).
2. **Grouping term = keep "demo package"** (`demo-packages.json` unchanged).
3. **Sequencing = rename first, as its own slice**, BEFORE the project-builder UX — done now while
   `project.deployables` is still synthetic (zero user-data migration).

**Resulting plan:** Slice 1 = the `deployable`→`appBuilderComponent` rename + mesh-registry reconciliation
(this worktree's research justifies it). Slice 2 = the two-column "project builder" UX (this doc's
recommendation), built on the renamed vocabulary.

## Sources
NN/g (Wizards; Modal & Nonmodal Dialogs; Overuse of Overlays; Progressive Disclosure; Required Fields);
VS Code Webviews UX Guidelines; React Spectrum / Spectrum Web Components Dialog; Anaconda Hub-and-Spoke
installer model; Oracle Alta / Wikipedia Master–detail. Codebase: `ArchitectureModal`, `TwoColumnLayout`,
`Modal.tsx`, `wizard-steps.json`, `ConfigureScreen`, the D2 `envSchema` classifier.
