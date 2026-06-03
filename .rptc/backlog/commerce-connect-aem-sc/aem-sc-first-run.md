# AEM SC first-run & the front door

**Filed:** 2026-06-02
**Status:** Design (the AEM-SC first-run / front door). Feeds the [commerce-connect roadmap](./roadmap.md) and pairs with [federated-two-instance-demos](./federated-two-instance-demos.md) + [commerce-connection-kit](./commerce-connection-kit.md).
**Why this exists:** the extension is commerce-centric end-to-end. An AEM SC's *first action* — "pick a commerce demo package" — is an immediate mismatch. A good AEM connect flow doesn't fix a commerce-first front door. This doc designs the coherent AEM-SC first-run, the **commerce-SC-vs-content-SC journeys**, and the **selection model** — which has to be shaped now to grow into a true configuration/composition approach.

## Where commerce bites at cold-start (today)

1. **Open the extension** → projects list. New content SC = empty state ("+ New"). OK so far.
2. **"+ New"** → the wizard opens on **`welcome` = Demo Setup / demo-package selection** (CitiSignal, commerce brands, storefront configs). A content SC has no model for this. ← **first hard mismatch, at the first action.**
3. **Onward:** `component-selection` (commerce frontends/backends), `settings` (**Connect Commerce** — ACCS/PaaS store discovery), the `eds-*` steps (DA.live), `storefront-setup`. Entirely commerce vocabulary + decisions.
4. A "connect to a commerce demo" option dropped into this still reads as one commerce option among commerce options.

## What the content SC actually wants

Not "pick a commerce package." It's: *"I have an AEM Sites instance; I want to demo authoring a storefront in it that shows commerce content."* First questions: which AEM instance, what storefront, connected to which commerce backend — in **AEM / Universal-Editor** terms.

## The shape: a front door + a separate AEM flow

The content SC's flow (URL → discover → scaffold `xcom` → wire AEM → author) **does not reuse the commerce wizard** (demo packages, stacks, mesh). So we don't refactor the commerce wizard — we add:
- a **front door** ("what are you here to build?") that **routes**, and
- a **separate, AEM-framed flow** behind the AEM choice.

The commerce wizard stays untouched for Commerce SCs; the AEM flow runs in parallel.

### The front door (minimal now, grows into a configuration selector)
- **Placement:** at "+ New" (recommendation: *not* on every launch — existing projects open straight to their dashboard, so existing users see zero change until they create a new project).
- **One screen, a small grid of choice cards.** Two cards now: **Commerce demo** (existing wizard) | **AEM Sites storefront** (new flow, "connect to a commerce demo").
- **Cards are data, not code** (a registry of entry options) — so a 3rd+ card is an *append*, not a branch. This is the seed of the eventual configuration selector (see "The selection model" below).

### The AEM-framed flow (the content SC's wizard) — AEM vocabulary throughout
| Step | What | Slice |
|---|---|---|
| 1. Connect | paste the Commerce demo's storefront URL → **discover** the connection; show what was found | 1 |
| 2. AEM target | their AEMaaCS (author URL, IMS org, program/site) + GitHub org | input |
| 3. Build | scaffold `xcom` in their org + **apply** the connection (progress display) | 2–3 |
| 4. Wire (guided) | Code Sync, Cloud Manager EDS site, IMS roles, enable UE — checklist + verify | 4 |
| 5. Author | open Universal Editor on their AEM author | — |

Vocabulary: "AEM Sites," "Universal Editor," "your instance," "commerce data" — **not** "demo package," "ACCS/PaaS stack," "deploy mesh."

## Two journeys, side by side

### Commerce SC (our existing user) — the delta is one click

**Today:** open → projects home grid (or empty state + **+ New**) → wizard from `welcome` (**Demo Setup**) → `component-selection` → `prerequisites` → `adobe-auth` → `adobe-project` → `adobe-workspace` → `settings` (**Connect Commerce**) → `eds-connect-services` → `eds-repository-config` → `eds-data-source` → `review` → `storefront-setup` → `create-project` → commerce dashboard.

**After the front door:** open → home grid *(unchanged)* → **+ New** → **front door** → click **Commerce demo** → **the exact same wizard, starting at `welcome`, byte-for-byte** → the same commerce dashboard.

**The entire delta for a commerce SC is one extra click**, on a screen where "Commerce demo" is the obvious choice. Promises we hold:
- The front door appears **only at "+ New"** — existing projects open straight to their dashboard, so existing users see no change until they create a new project.
- The commerce wizard, its steps, mesh, DA.live authoring, and dashboard are **not refactored** — commerce is the *reference flow* the AEM flow runs **beside**, never **through**.
- *(Remember-last-choice / a per-user default that auto-skips the card is a later additive layer — deliberately **out** of the minimal cut so the new door stays discoverable.)*

### Content SC (AEM Sites) — the new path

open → empty state → **+ New** → **front door** → click **AEM Sites storefront** → the **AEM-framed flow** (Connect/discover → AEM target → Build/scaffold+apply → Wire (guided) → Author in UE; see table above) → an **AEM-flavored dashboard**: **Author in AEM** + a **commerce-connection status** (they *consume* the backend, don't own it) + the storefront URL; **hides** Author-in-DA.live, Sync Storefront, Deploy Mesh, commerce Configure.

| | Commerce SC (today, preserved) | Content SC (new) |
|---|---|---|
| First action after **+ New** | front door → **Commerce demo** | front door → **AEM Sites storefront** |
| Flow | existing wizard (`welcome` → `create-project`) | AEM-framed flow (connect → author) |
| Owns the commerce backend | yes (provisions ACCS/PaaS + mesh) | no — **discovers & consumes** it |
| Authoring surface | DA.live | their own AEM Sites / Universal Editor |
| Dashboard | commerce actions | Author-in-AEM + connection status |

## The selection model: reuse the existing configuration model — no new `kind`/`composition` field

An earlier draft of this doc proposed a manifest **`kind`** field (`commerce-demo | aem-storefront`), then a parallel **`composition`** object. **Both are wrong: the extension already has a configuration/composition model, and the front door *and* the eventual full selector must use it — not a new shape beside it.**

**What already exists** (the persisted `Project` manifest, [`src/types/base.ts:42–128`](../../../src/types/base.ts)):

- `selectedPackage` — the brand/vertical (`citisignal`, `isle5`, `buildright`, …).
- `selectedStack` — the **architecture**, and a **`Stack` is already a named, pre-wired composition** ([`stacks.json`](../../../src/features/project-creation/config/stacks.json) + [`src/types/stacks.ts`](../../../src/types/stacks.ts)): it binds a `frontend` + `backend` + `dependencies[]` + `optionalAddons[]`, with `requiresGitHub`/`requiresDaLive` flags. (`isEdsStackId`, the `eds-` prefix, in [`src/types/typeGuards.ts`](../../../src/types/typeGuards.ts).)
- `componentSelections: { frontend, backend, dependencies[], integrations[], appBuilder[] }` — **the actual product set is already here, and it already has `integrations[]` and `appBuilder[]` slots.**
- `selectedAddons[]`, `selectedBlockLibraries[]`, `selectedFeaturePacks[]` — layered enhancements.
- `componentConfigs: Record<componentId, Record<envVar, …>>` — per-component config; **this is exactly the shape `configGenerator.ts` / `config-template.json` emit** (the commerce connection contract from the [connection kit](./commerce-connection-kit.md)).
- The component **registry** ([`components.json`](../../../src/features/components/config/components.json) + [`src/types/components.ts`](../../../src/types/components.ts)) already categorizes `frontends / backends / mesh / dependencies / integrations / appBuilderApps / tools`, and `COMPONENT_IDS` lives in [`src/core/constants.ts`](../../../src/core/constants.ts).

**So drop the invented vocabulary and map onto the real model:**

| Invented (drop it) | Existing model to reuse |
|---|---|
| `blueprint` | a **`Stack`** (a named composition) `+ selectedPackage` |
| `products[]` | `componentSelections.{ frontend, backend, dependencies[], integrations[], appBuilder[] }` |
| `integrations[]` | `componentSelections.integrations[]` (**already exists**) |
| `deliverable` | the chosen **`frontend`** component (its stack) |
| the discovered commerce connection | `componentConfigs` on the consumed backend (`configGenerator` shape) |
| a new `kind` field | **nothing** — branch on `componentSelections.frontend` / `selectedStack` (`isEdsStackId`) / owned-vs-consumed backend |

**The future configuration cases the user named already have model slots — they're new *registry entries*, not new *fields*:**
- **commerce + App Builder (Firefly) → frontend app:** `componentSelections.appBuilder = ['…firefly…']` + `componentSelections.integrations = ['…commerce-firefly-bridge…']`; add the apps under the registry's `appBuilderApps` + `integrations` categories.
- **AEM storefront + AEP connected:** `frontend` = the AEM storefront component + `integrations = ['…aep…']`.

**How the AEM-storefront case fits (the one real wrinkle):** it's a `frontend` whose **backend is *consumed*, not provisioned**. Represent the discovered commerce backend as a backend / `external-system` component (the registry already has `type: 'external-system'`) carrying the connection in `componentConfigs`. Then the project is a normal `Project` with `componentSelections.frontend` = the AEM storefront and a consumed backend — no new top-level field. *Open question for Slice 4:* whether the AEM case is a **new `Stack`** (with a consumed-commerce backend + its own step-condition flags) or a new top-level front-door entry that still writes the same `Project` fields.

**Reuse the model, not the wizard.** Reusing the persisted shape is **not** the same as dragging the content SC through the commerce wizard. A `Stack`'s `requiresGitHub`/`requiresDaLive` flags drive the *commerce wizard's* conditional steps, and the `executor` pipeline is commerce-fixed — the AEM flow keeps **its own steps** (and, slices 3+, its own build path) and merely **writes the same `Project` shape**. We reuse the configuration **data model**; we do **not** reuse or refactor the commerce **flow**.

**Guardrail (YAGNI):** the minimal cut still ships **single-select front door → one new stack/frontend (+ consumed backend) → derived branching on existing fields**. We do **not** build a composition engine, an integration resolver, or a multi-select/compose UI now — those arrive when the full selector does, *on the same model*.

> **Update (2026-06-03):** the dashboard "variant" fork below is resolved by the **per-`(product, ownership)`** model in [ownership-vs-connection](./ownership-vs-connection.md) — the dashboard composes owned-product actions + connected-product status cards rather than switching on a project-level `isEds`/`isAem` enum. And this AEM flow is now understood as a **content-SC *owner* archetype** (a second creation wizard, peer to commerce — **first-class later**, Team-facing), with **federated** (discoverable commerce) as one connection value on it. v1 anchors on the commerce-hub; this milestone reuses the shared connection primitive (P1 discover + P2 apply) and must drop onto the **product-neutral spine** additively.

## Shared-surface adaptation (the part that *isn't* purely additive)

The AEM-storefront project lands on surfaces that assume commerce/EDS:
- **Project manifest** — **no new field.** The AEM flow writes the *existing* `Project` shape: `selectedStack` = the AEM stack/entry, `componentSelections.frontend` = the AEM storefront component, the consumed commerce backend as a backend/`external-system` component, and the discovered connection in `componentConfigs`. Plus the AEM metadata (author URL, IMS org, storefront repo) on `adobe`/component config. (Follows ADR-003's state-shape discipline — reuse fields, don't add a discriminator.)
- **Dashboard** (`ProjectDashboardScreen`/`ActionGrid`) — branch on **existing signals**: `componentSelections.frontend` (AEM storefront vs `eds-storefront`) / `selectedStack` (`isEdsStackId`) / owned-vs-consumed backend. An AEM project shows **Author in AEM**, a **commerce-connection** status, and the storefront URL; it **hides** Author-in-DA.live, Sync Storefront, Deploy Mesh, and commerce Configure.
- **Sidebar** — AI + Utilities stay global; context labels may differ.

## Additive vs touches-commerce-code

- **Additive:** the front door; the AEM flow (its own steps); the discover/scaffold/apply plumbing (slices 1–3); new **registry/stack entries** (the AEM storefront frontend, a consumed-commerce backend) — data, not new schema.
- **Touches commerce-assuming code:** the **dashboard's branching** (today it assumes commerce/EDS; it must read `componentSelections.frontend` / backend-ownership) and the project-creation **executor/step-conditions** if the AEM case routes through any shared pipeline. Targeted, not a rewrite — and no new manifest field.

## Relationship to the configuration / solution selector (the "Option C" line)

**The front door *is* the seed of the full configuration selector, and the *existing* model (`selectedPackage` / `selectedStack` / `componentSelections` / the component registry) *is* its data layer — both must use it.** Recommendation: build the **two-entry front door** now over the existing stack/component model, designed to grow into the fuller "compose your Adobe demo" selector (which is just surfacing the same `componentSelections.{frontend,backend,integrations,appBuilder}` + registry as a composable UI) — do **not** build the full selector or a parallel composition shape up front. The deep refactor (the closed step-condition vocabulary, `COMPONENT_IDS`/`isEdsStackId` conventions, the fixed `executor` pipeline) is only needed when a product must run *through* the commerce-shaped wizard/pipeline — which the AEM flow doesn't.

## Roadmap impact

- Slices 1–4 are the AEM flow's **plumbing + UI**.
- This **front door + first-run + shared-surface adaptation** is a distinct piece that *wraps* them:
  - **Reframe the roadmap's Slice 4** → "content-SC front door + connect-flow UI + shared-surface adaptation."
  - When the AEM project is first created (slice 2/3), populate the **existing `Project` fields** (`selectedStack`, `componentSelections.frontend` = the AEM storefront, the consumed backend + discovered connection in `componentConfigs`) — no new field.
- The headless plumbing (slices 1–3) is unaffected; the front-door/UX/adaptation is the user-facing slice.

## Open questions

- **Front-door placement:** "+ New" only (recommended) vs also fronting the empty-state / first-launch for brand-new users.
- **Dashboard:** adapt the existing one by branching on `componentSelections.frontend` / backend-ownership, or build an AEM-specific variant?
- **AEM flow form:** a multi-step wizard (like commerce) or a lighter single-screen connect?
- **UI vs agent:** the connect flow as a UI wizard, an MCP skill, or both (the earlier fork).
- **AEM as a new `Stack` vs a new front-door entry:** does the AEM case become a `Stack` (with a consumed-commerce backend + its own `requires*` step-condition flags), or a top-level entry that bypasses the commerce wizard but still writes the same `Project` fields? Lock when Slice 4 is planned.
- **Consumed-backend modeling:** represent the discovered commerce backend as a `backend` component or an `external-system` component — and confirm `componentConfigs` cleanly carries the `configGenerator` connection shape for a *consumed* (not provisioned) backend.
