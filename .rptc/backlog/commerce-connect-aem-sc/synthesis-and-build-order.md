# Synthesis & build order — from design to code

**Filed:** 2026-06-04 · How the locked target ([storefront-topology](./storefront-topology.md)) attaches to the **existing** extension, and the order to build it. Source: a code walk of the current creation experience, reconciled with our locked decisions. Consume this with `/rptc:plan` for the first slice.

## Headline

- **Most of the target is REUSE / EXTEND, not net-new.** The wizard, executor, installers, sync, Connect-Commerce, dashboard, and packages all *extend* — the architecture doesn't fight a second archetype.
- **One big NET-NEW:** **AEM Sites as a content source** (the extension is DA.live-only). It's the spine *and* the gated unknown (the spike).
- **The two-fork plumbing can be built *now*, without the AEM env**, by using DA.live content first — then AEM Sites slots into the *same* plumbing. This is how we make progress while the spike is blocked.

## Current → target diff (per flow)

| Flow | Current (file) | Delta | Attach point |
|---|---|---|---|
| **Wizard** | one flow, pluggable steps, stack-filtered (`WizardContainer.tsx`, `stepFiltering.ts`) | **EXTEND** | a 2nd entry `createContentScProjectWebview.ts` reusing the container; a `flow` discriminator; step filtering by flow |
| **Executor** | single-fork, mesh+backend assumed (`handlers/executor.ts`) | **EXTEND** | add `flow`; skip mesh + backend for content; new "fork from upstream" + "content source" branches |
| **Project model** | single project, single `adobe`, no upstream (`types/base.ts`, `stateManager.ts`) | **EXTEND** | add `flow`, `upstream{owner,repo}`, `contentSourceType` |
| **Content source** | **DA.live only** (`fstabGenerator.ts`, `configurationService.ts`, `edsPipeline.ts`, `DataSourceConfigStep.tsx`) | **NET-NEW** | pluggable content-source service + an AEM-Sites variant + UI step |
| **Installers + sync** | arbitrary source repos; sync from `templateOwner/templateRepo`, preserves `config.json`/`fstab.yaml` (`blockCollectionHelpers.ts`, `templateSyncService.ts`) | **REUSE + EXTEND** | add `upstreamRepo` to metadata; sync from upstream |
| **Connect-Commerce** | backend discovery + config write (`ConnectStoreStepContent.tsx`, `configGenerator.ts`) | **REUSE** | skip for content; content fork inherits the backend URL |
| **Dashboard** | `isEds` boolean across ~10 files (`ActionGrid.tsx`, `useDashboard*`, `typeGuards.ts`) | **EXTEND** | centralize into per-`(product,ownership)` predicates |
| **Packages/stacks** | brand packages + tech stacks (`demo-packages.json`, `stacks.json`) | **EXTEND** | add `flow`/`supportedFlows`; mirrored packages later |

## Three reconciliations (the code walk lacked our locked context)

1. **"`Project.adobe` is a single org" is *not* a blocker.** Each fork is its **own project in its own org**, managed by **that SC's own extension** (Scenario B). Nothing needs one project to hold two orgs — single-org-per-project is correct. (No `secondaryAdobe` needed.)
2. **"Content SC doesn't transact" is resolved by the locked design.** Both forks come from the **`xcom` upstream** (commerce dropins included) and point at the **Commerce SC's backend by URL** → both transact. Not a gap.
3. **First-slice sequencing — adjust for the blocked spike.** The walk suggested "DA.live content SC first"; our target makes **AEM Sites the spine**. Reconcile: **build the two-fork plumbing now with DA.live** (same plumbing the AEM version uses), and **add AEM Sites as a content source once the spike passes.** Not wasted — the plumbing is content-source-agnostic.

## Build order

- **Slice 0 — the spike (gates AEM Sites).** Manual, when the AEM env is secured. See [verify-aem-sites-spike](./verify-aem-sites-spike.md). *Does not block Slice 1.*
- **Slice 1 — two-fork plumbing, DA.live content (buildable now).** `Project.flow` + `upstream`; `createContentScProjectWebview` reusing the container; step filtering (skip prerequisites/mesh/Connect-Commerce for content); executor: fork-from-upstream + skip mesh/backend; sync from `upstreamRepo`; dashboard `isEds` → per-`(product,ownership)` predicates. **Proves the architecture end-to-end without AEM.**
- **Slice 2 — AEM Sites as a content source (the spine; after spike).** Pluggable content-source service + AEM-Sites variant (`fstabGenerator`/`configurationService`/`edsPipeline` branch) + UI step. Slots into Slice 1's plumbing.
- **Slice 3+ (JIT):** mirrored-package config (`flow`/`supportedFlows`); the App Builder add-flow; two-way contribution.

## Guardrails

- **YAGNI on the general composer** — build the slices, not the [compositional](../compositional-demo-builder.md) framework. Each slice extends existing slots additively.
- **Neutral but thin** — a `flow` discriminator + per-product predicates, not a plugin architecture.
- **Plan one slice at a time** — `/rptc:plan` Slice 1 now; the rest JIT.

## Open product questions

- **Fork sync conflict strategy** — for a content fork, reset-to-upstream (content lives in AEM Sites, not the repo) vs. merge.
- **Mirroring mechanism** — one shared package definition both wizards consume vs. paired packages (see [compositional-demo-builder](../compositional-demo-builder.md)).
- **How a content fork obtains the Commerce SC's backend coordinates** — wizard input, or read from the upstream repo's `config.json`.
