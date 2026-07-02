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

## Domain model & flow (PM-confirmed 2026-06-21) — the durable reference

After several UX iterations, the blocker was conceptual, not visual. The locked model:

> **A project = components + a brand + config. A "demo package" is a pre-made, branded *preset* of that.
> A user either starts from a package (the composer opens PRE-FILLED) or builds their own (the composer
> opens near-empty). Both converge in the SAME component composer, fully editable.**

The two "kinds of project" (pre-built/pre-branded vs. ad-hoc) are NOT two surfaces — they are two
*starting points* (how full the canvas is on day one) into one model.

### Vocabulary
- **Component** — any part of the project: storefront, backend, mesh, integration, block libraries. The
  atomic unit (see the diagram in `.rptc/plans/appbuilder-deployable-model/overview.md` — `components/`
  holds `eds-storefront/`, `commerce-paas-mesh/`, `erp-integration/`, …; each deploys to its own target).
- **Brand** — the identity/content layer over the storefront (e.g. CitiSignal patches + content).
  Optional and swappable; NOT a component — a dressing over them.
- **Demo package** — a curated, branded preset: "these components + this brand + this config."
  This is today's `demo-packages.json` / the brand gallery. ("Template" is its conceptual *role*; the
  user-facing term stays **"demo package"** per the Decisions above — not a rename.)
- **Project** — an instance: components + brand + config; born from a package OR from scratch, then editable.

### Flow it implies (reframes the ENTRY, not just the builder step)
- **Welcome / Start = a fork:** *Start from a demo* (the existing package gallery) **or** *Build your own*.
- **Both land in ONE composer** (the Project Builder), differing only by pre-fill:
  - From a package → brand applied, foundation/components selected, config defaulted → skim & tweak.
    (Architecture is still a real sub-choice when a package offers variants, e.g. PaaS vs. ACCS storefronts.)
  - Build your own → foundation + add components; brand optional (supports the app-only / no-storefront
    D6 case = "a project with no storefront component").
- Then the unchanged tail: prereqs → auth → connect → review → create.
- The brand gallery you already have *is* the "start from a demo" path — it just was never framed as one
  half of a fork, and the composer was never built as "the same surface, pre-filled vs. blank."

### Sequencing (PM-confirmed)
Build the **package-driven composer first** (today's reality: a package sets stack + components; catalog
is meshes-only; integrations/app-only mature over D4–D6). Design the composer **component-centric and
pre-fillable** so the *"Build your own"* entry slots in later WITHOUT a redesign — flexible model honored,
not bolted on. "Build your own" = fast follow once there are enough à-la-carte components to warrant it.

### UX iteration log (what was tried + rejected, so we don't repeat)
1. Two-column master-detail w/ inner rail → rejected: the rail competed with the wizard timeline
   (two stacked left navs) + cramped floating box.
2. Progressive sections + persistent right summary (reused panels) → rejected: a long, dull plain-form;
   not actually progressive; left dead-space.
3. Focused full-canvas steps in a centered bounded card → rejected: the card floated lonely in empty space.
   → Root cause across all three: reusing the modal's controls instead of designing for the canvas, AND
   the absence of the component/brand/package mental model above. The composer must be **component-centric**
   (present the project AS its components, with rich description cards) and reflect the package-vs-scratch
   pre-fill — not "fill out N sections."

## LOCKED UX design (PM, 2026-06-22) — supersedes the single-step builder

Extensive iteration (prototypes in `/tmp`) converged here. This **supersedes** the committed Slice-2
component-overview `ProjectBuilderStep` (PR #60) and is a larger rewrite.

**Principle:** a project's whole composition + configuration happens at **creation time** (you don't
re-architect a built project — the post-creation dashboard reverts to runtime-only: start/stop/logs/status).

**Shape — the wizard reorganizes around component GROUPS as steps** ("group-paced steps"):

```
SETUP PROGRESS
  Demo Setup        ← pick a demo package OR build your own + name
  Prerequisites     ← system tooling (gate)
  Commerce          ← Backend tile (choose PaaS/ACCS + connect + discover)
  Integrations      ← App Builder tile (sign-in→project→workspace) + integration tiles + mesh tile (if required)
  Storefront        ← Storefront tile (GitHub/DA.live + repo) + Block Libraries tile        (EDS only)
  Final Review
  Create Project
```

Each group-step = a screen of **grouped tiles** (the extension's `selector-card`/brand-card aesthetic);
each tile is a component with a **status badge** (⚠ needs setup → ✓); clicking a tile opens a **focused
modal** that fully configures it, **reusing the existing per-concern step content as the modal body**
(Backend = `ConnectStoreStepContent`; App Builder = the adobe auth/project/workspace UI; Storefront = the
eds-connect + repo UI). The **timeline + Continue/Back is the linear guide** (no overlay, no inner rail).

**UX rules (PM):** tiles + modals; **no rows, no accordions**; group tiles by where they live
(Commerce / Integrations·App Builder / Storefront·Edge Delivery — mirrors the deploy-target diagram);
order follows the data dependency **Backend → Integrations → Storefront** (storefront consumes mesh/backend).

**Open wrinkles to resolve in planning:**
1. **Adobe sign-in is cross-cutting** — needed for App Builder (Integrations step) AND Commerce store
   discovery (Commerce step, which comes first). Resolve: surface sign-in the first time any step needs it
   (shared), or a brief early sign-in; later steps reuse the session.
2. **Generalize App Builder gating** from mesh-only (`hasMeshInDependencies`) to **any App Builder
   component** (mesh OR integration) — the Integrations step appears whenever the project has one.
3. **Pull the D2 dashboard composition (add/remove integrations) back out** → dashboard = runtime-only.
4. Prerequisites placement; Publish Storefront / Create folding; the build-your-own empty-composer entry.
5. Per-component **status model** + the Create gate (all required tiles ✓).

### LOCKED design v3 — nested timeline (PM-confirmed 2026-06-22; supersedes v1 group-paced + v2 tiles-everywhere)
> **SUPERSEDED by LOCKED design v6 (below).** v3's sequenced tabs + Architecture-header are replaced by the
> decomposed + guided-accordion + summary-column model. Kept for history. The nested shell (slice 1, committed
> `507bf062`) and the per-area rail still hold.

After F5 review of the shipped R1 (group-paced steps) and R1b (tiles+modals), BOTH were rejected: per-step
groups gave no sense of the whole project, and tiles-everywhere left single-component steps as a lone tile.
The locked model:

**Top-level wizard = 4 steps:** Demo Setup → **Build Your Project** → Final Review → Create Project.
- **Prerequisites is NOT a standalone step** — it folds into **Create Project** as the first execution phase
  (verify/install tooling). Tooling is only needed to RUN creation, never to make selections, so it stops
  interrupting the pick→build→review→run arc.
- **Create Project** = one step with internal phase progress: ① Prerequisites → ② Publish Storefront [EDS] →
  ③ Deploy project.

**"Build Your Project" is ONE wizard step** whose areas are **sub-steps nested in the SAME SETUP PROGRESS
rail** — a 2-level timeline, NOT a second/inner rail (an inner rail was rejected for competing with the
timeline). Areas: **Commerce** [always] · **Storefront** [EDS only] · **Integrations** [always; optional
unless template requires mesh]. Clicking a sub-step swaps the right pane (breadcrumb "Build Your Project ›
…"). Continue stays the wizard's primary action; it enables when required sub-steps are ✓ → Final Review.

**Pattern per area (matched to its content — not one pattern forced everywhere):**
- **Commerce → sequenced tabs.** Architecture is NOT a tab: after you pick the stack (PaaS/ACCS) it
  **collapses to a header summary** ("Architecture: Edge Delivery + ACCS  [Change]") above the tabs. Tabs =
  **Connection · Business Structure · Catalog** — numbered, ✓ on completion, auto-advance, "upcoming"
  styling for gated ones (NOT disabled). **Business Structure** = the Website→Store→Store-View discovery
  cascade (renamed from "Store"). **Catalog** holds Catalog Service + **Commerce Optimizer** (the ACO add-on
  lives here, not as a loose add-on) + Assets; gated until a Store View is selected.
- **Storefront → sequenced tabs:** Services (GitHub + DA.live) · Repository · Block Libraries. Repository
  gated on GitHub auth; Block Libraries optional.
- **Integrations → tiles** (a managed collection) with a **typed Add** (Mesh / App Builder App / Custom URL).
  A template-required mesh shows pre-added; a mesh integration carries Adobe **project + workspace** in its
  own config.

**Adobe sign-in is contextual — NOT a rail sub-step and NOT a floating bar** (both tried and rejected). One
shared session, surfaced at the point of need:
- **Commerce (ACCS):** sign-in is the **first sequenced tab** (Sign in → Connection → …); Connection is
  "upcoming" until signed in (ACCS connection needs the org).
- **Integrations:** an **inline** sign-in prompt when an App Builder component is added.
- PaaS + EDS + no-integration ⇒ Adobe never appears.

**Preserved invariants:** mesh dual-flow (`selectedOptionalDependencies` / `hasMeshInDependencies`),
mesh→storefront `MESH_ENDPOINT`→config.json edge; App Builder gating generalized to ANY App Builder
component; all field/option sets stay **config-driven** (components.json, stacks.json, block-libraries.json,
app-builder-components.json, demo-packages.json) — render generically, never hardcode.

**Visual spec:** `prototype-v2-nested.html` (this directory) is the agreed clickable reference for the build.
The earlier `prototype.html` (group-paced) is superseded.

### LOCKED design v6 — decomposed + guided + summary (PM-confirmed 2026-06-23; SUPERSEDES v3)
> **Commerce surface SUPERSEDED by LOCKED design v7 (below)** — v6's guided **single-expand accordion** (point 2)
> is replaced by a **restyled top tab/step strip + a dedicated full view per step**. Everything else in v6 stands
> (decomposed backend, in-tab Adobe sign-in gate, persist-backend / "frontend pending", the summary column, the
> preserved invariants). Kept for history.

After F5 of the v3 build, three problems surfaced: the per-area **sequenced tabs were a third competing
progress level** (NN/g caps disclosure at 2 levels; Material: "don't nest steppers"), the **sign-in screen-swap
was jarring**, and there was **no running summary of choices**. v6 resolves all three. The committed nested
shell (slice 1) is unchanged; v6 changes what lives *inside* each area.

**1. "Architecture" is dissolved — it was redundant.** This is a headless solution: **Commerce IS the backend,
Storefront IS the frontend.** So the backend choice (PaaS / ACCS) becomes **Commerce's first section**, the
frontend choice (Edge Delivery / Headless) becomes **Storefront's first section**, and there is no Architecture
concept/header/modal. The 4 stacks are the cross-product of {`headless`, `eds-storefront`} × {`adobe-commerce-paas`,
`adobe-commerce-accs`}; a brand may offer a **non-rectangular subset** (`citisignal` omits headless+accs), so the
two area choices **cross-filter** against the brand's allowed stacks. The derived label ("Edge Delivery + ACCS")
is shown read-only in the summary column.

**2. Guided single-expand accordion replaces sequenced tabs** (Commerce + Storefront). One section open at a
time; **Save & continue** collapses it to a value summary + ✓ and auto-advances; locked future sections show a
one-line reason; smooth `grid-rows` expand. Fits one screen, no scroll, no second timeline.

**3. Sign-in is an in-accordion gate** — not a tab, not a banner, not a screen-swap (all tried, rejected). On
ACCS: pick backend → Backend collapses → a **"Sign in to Adobe" accordion section** (amber key) slides in →
Connection/Business/Catalog locked until signed in. **One shared Adobe session** across Commerce(ACCS) +
Integrations(Mesh) — reused unless expired.

**4. Right-hand persistent summary column** (two-column, mirroring the Adobe Setup / GitHub wizard steps):
choices per section, grouped by area, ✓ on done, "Not set" placeholders, derived Architecture at top. Replaces
the rail's old "Architecture:" line; the rail returns to a clean timeline.

**5. Addon placement corrected:** **ACO → Commerce/Catalog** (a backend catalog service; package-gated —
`buildright` required, others excluded). **API Mesh + Experience Platform → Integrations.** **App Builder** is
implied by Mesh (its deployment target), not a separate tile.

**6. In-app Adobe I/O provisioning (zero Developer Console).** Mesh config shows project + workspace selectors
with "+ Create new…"; the extension creates project + workspace + OAuth S2S credential + subscribes the
component's `requiredApis` (e.g. `GraphQLServiceSDK`), all in-app. **Backend SHIPPED** on two stacked branches:
`feature/adobe-io-project-creation` (`createProject`/`createFireflyProject` + `handleCreateAdobeProject` +
`can-create-adobe-project` probe) and `feature/adobe-io-workspace-creation` (`createWorkspace` +
`handleCreateAdobeWorkspace`), each with a permission-gated **Flow A** (in-app create) / **Flow B** (fallback:
select-existing / `open-adobe-console` / Switch-IMS-Org).

**Preserved invariants:** same as v3 — mesh dual-flow, `MESH_ENDPOINT`→config.json edge, App Builder gating,
all field/option sets config-driven (render generically, never hardcode).

**Visual spec (authoritative):** `prototype-v6-interactive.html` (this directory) — clickable, animated, with the
two-column summary and the dev-controls toolbar (area/brand/Adobe-session). Supersedes v2–v5.

**Build approach (incremental, behind the committed slice-1 shell):** Commerce (accordion + summary +
decomposed backend + in-accordion sign-in gate; **reuse** `ConnectStoreStepContent` `section` prop, **delete**
`SequencedTabs`/`ArchitectureSummary`) → Storefront → Integrations (wire the shipped provisioning) → data-model
cleanup (remove the Architecture concept from `useProjectBuilder`/areas). Each slice independently green + F5'd.

### LOCKED design v7 — tabs + dedicated views + summary (PM-confirmed; supersedes v6 accordion)
F5 of the v6 **guided accordion** Commerce area fell flat (PM): the single-expand inline bodies felt cramped.
**New direction (PM-confirmed):** each step gets its **own dedicated full view**, navigated by a **restyled top
tab/step strip**, with the right-hand **summary column kept**. This is a **presentation swap only** of the v6
Commerce slice — the step model (`commerceSections.ts`), the Backend→stack bridge, the ambiguous-clear security
guard, the auto-advance effects, `ConnectStoreStepContent`, and the Continue gate (`isCommerceConfigured`) all
carry over **unchanged**; only the left-column container changes from `GuidedAccordion` (single-expand, inline
bodies) to `StepTabs` (a numbered, restyled tab strip) + a roomy `.step-view` dedicated view showing the active
step's body.

- **Steps/tabs (order unchanged):** Backend · [Sign in — ACCS only, when not signed in] · Connection · Business
  Structure · Catalog. **Backend is the first tab.** Done tabs show ✓; the active tab is accent + `aria-selected`;
  upcoming tabs are muted; locked tabs are greyed, `aria-disabled`, non-clickable, and surface their reason
  (title + visually-hidden text).
- **`StepTabs`** (`components/StepTabs.tsx`) is a presentational, controlled, reusable primitive
  (`{ steps, activeId, onSelect }`); the Storefront slice will reuse it. Restyled with subtle Spectrum tokens
  (theme-aware), connectors between steps, accessible focus rings, no saturated fills, `prefers-reduced-motion`
  respected. `.steptabs*` + `.step-view` CSS in `custom-spectrum.css`; the dead `.acc*` accordion CSS removed.
- **`GuidedAccordion` deleted** (no soft-deprecation) along with its test.
- The rest of v6 stands: decomposed backend, in-**tab** Adobe sign-in gate, persist-backend / "frontend pending",
  the summary column, and all preserved invariants (mesh dual-flow, config-driven option sets).

## Sources
NN/g (Wizards; Modal & Nonmodal Dialogs; Overuse of Overlays; Progressive Disclosure; Required Fields);
VS Code Webviews UX Guidelines; React Spectrum / Spectrum Web Components Dialog; Anaconda Hub-and-Spoke
installer model; Oracle Alta / Wikipedia Master–detail. Codebase: `ArchitectureModal`, `TwoColumnLayout`,
`Modal.tsx`, `wizard-steps.json`, `ConfigureScreen`, the D2 `envSchema` classifier.
