# Synthesis & build order — from design to code

**Filed:** 2026-06-04 · **Repivoted:** 2026-06-05 (repoless replaces two-fork-sync). How the locked target ([storefront-topology](./storefront-topology.md)) attaches to the **existing** extension, and the order to build it. Source: a code walk of the current creation experience, reconciled with the locked architecture. Consume this with `/rptc:plan` for Slice 1.

## Headline

- **Most of the target is REUSE / EXTEND, not net-new.** The wizard, executor, installers, Connect-Commerce, dashboard, and packages all *extend* — the architecture doesn't fight a second archetype.
- **Two NET-NEW pieces:**
  1. **Repoless satellite creation** via Configuration Service Admin API — a small wizard step that wraps a single `PUT /config/{org}/sites/{site}.json` with `code.owner` cross-referencing the Commerce SC's repo. Cross-org repoless verified live 2026-06-05 (HTTP 201 + 45-second propagation).
  2. **AEM Sites as a content source** — replaces the current DA.live-only assumption. Architecturally closed via the [`roberttoddhoven/citisignal-one`](https://github.com/roberttoddhoven/citisignal-one) worked example; the remaining work is wiring.
- **Two NET-NEW deletions:**
  - The two-fork **sync engine for code** — no longer needed; satellites read the upstream natively
  - The per-fork `config.json` writer — replaced by the **config-as-content writer** that authors AEM nodes per CitiSignal's `paths.json` pattern (production / stage / dev configs as content)

## Current → target diff (per flow)

| Flow | Current (file) | Delta | Attach point |
|---|---|---|---|
| **Wizard** | one flow, pluggable steps, stack-filtered (`WizardContainer.tsx`, `stepFiltering.ts`) | **EXTEND** | a 2nd entry `createContentScProjectWebview.ts` reusing the container; a `flow` discriminator; step filtering by flow |
| **Executor + EDS setup** | single-fork, mesh+backend assumed (`handlers/executor.ts`, `eds/handlers/storefrontSetupPhases.ts`) | **EXTEND** | add `flow`; for the Content-SC flow, **skip fork + Code Sync App install + code-sync verification** (call `ConfigurationService.registerSite` instead) + skip the repo-based config-write (Phase 5) |
| **Project model** | single project, single `adobe`, no upstream (`types/base.ts`, `stateManager.ts`) | **EXTEND** | add `flow`, `upstream{owner,repo}` (both shipped + manifest-persisted). *(`contentSourceType` deferred to Slice 2 — DA.live is the only content source in Slice 1.)* **No `secondaryAdobe`** — each side's wizard runs in its own SC's extension and creates its own single-org project. |
| **Content source** | **DA.live only** (`fstabGenerator.ts`, `configurationService.ts`, `edsPipeline.ts`, `DataSourceConfigStep.tsx`) | **NET-NEW** | pluggable content-source service + an AEM-Sites variant + UI step (replaces fstab.yaml with Configuration Service `ContentConfig`) |
| **Code source registration** | fork-from-template, single-org (`createRepoFromTemplate`, `templateSyncService.ts`) | **NET-NEW (smaller than before)** | for the Content-SC flow, **replace** fork-from-template with a single cross-org `ConfigurationService.registerSite` → `PUT site config { code: { owner: <commerceSC>, repo: <upstream> } }`. **No fork, no Code Sync App install, no code-sync verification, no GitHub config-push** — the satellite references upstream code (Adobe-native repoless). Existing fork-from-template + code-sync machinery survives for the canonical site (Commerce SC) and the manual escape hatch. |
| **Installers + sync** | block libraries / feature-packs into a repo (`blockCollectionHelpers.ts`, `templateSyncService.ts`) | **REUSE (code-sync drops out for satellites)** | Block-library install still applies to the canonical Commerce-SC repo; both sites pick up the change automatically because they share code. Content-side sync survives where appropriate. |
| **Connect-Commerce** | backend discovery + config write (`ConnectStoreStepContent.tsx`, `configGenerator.ts`) | **REUSE values + redirect destination** | Connect-Commerce still produces the same commerce wiring values. The writer changes from "write to `config.json`" to "write to AEM content nodes (configs/configs-stage/configs-dev) via the Configuration Service." Content SC's wizard either mirrors the Commerce SC's published values or authors its own. |
| **Dashboard** | `isEds` boolean across ~10 files (`ActionGrid.tsx`, `useDashboard*`, `typeGuards.ts`) | **EXTEND** | centralize into per-`(product,ownership)` predicates |
| **Packages/stacks** | brand packages + tech stacks (`demo-packages.json`, `stacks.json`) | **EXTEND** | add `flow`/`supportedFlows`; mirrored packages later |

## Four reconciliations (the code walk lacked the post-repivot context)

1. **"`Project.adobe` is a single org" is *not* a blocker.** Each side's wizard runs in its own SC's extension and produces a single-org project. Cross-org plumbing lives in the Configuration Service call (`code.owner = <commerceSC-org>`), not in the project model.

2. **"Content SC doesn't transact" is resolved by the architecture.** Both sites read the same `xcom` code (commerce drop-ins included) and read the Commerce SC's backend via published values → both transact. Not a gap.

3. **The "fork sync conflict strategy" question dissolves.** Under repoless there is no satellite-side fork to keep in sync. The Commerce SC's upstream is the single source of truth; both sites read it directly. Code drift is impossible by construction.

4. **First-slice sequencing.** With architectural unknowns closed, Slice 1 is the repoless wiring plus config-as-content writer; AEM Sites as a content source becomes Slice 2 (no longer waiting on a gating spike).

## Build order

- **Slice 1 — repoless wiring (DA.live). 🟢 Headless backend built + tested (2026-06-06); UI handoff is the F5 remainder.** Per-flow Content-SC wizard entry; project model adds `flow`/`upstream`; the Content-SC site is created via a **dedicated short path** (`executeSatelliteSetup` → one cross-org `ConfigurationService.registerSite`, no fork / no Code Sync / no config-push) rather than a pipeline branch; site-vs-code split in the content pipeline; executor Phase 5/5b gated off for content; `flow`/`upstream` persisted; inherited backend coords seeded; dashboard `isEds` → per-`(product, ownership)` predicate. **Config-as-content writer deferred to Slice 2** (Slice 1 inherits coords from the shared upstream, so there's nothing to author yet). **Proves the architecture end-to-end with DA.live content first.** *(Remaining: the join-confirm→seeded-wizard handoff, gallery suppression, connect-step prefill render, dashboard routing, and the marker write-side finalization hook — all F5-verifiable.)*
- **Slice 2 — AEM Sites as a content source.** Pluggable content-source service + AEM-Sites variant; replace the DA.live assumption in `fstabGenerator` / `configurationService` / `edsPipeline` with `ContentConfig` calls to the Admin API. Architecturally closed (CitiSignal One is the worked example); slots into Slice 1's plumbing.
- **Slice 3+ (JIT):** mirrored-package config (`flow`/`supportedFlows`); the App Builder add-flow; the Content-SC-to-Commerce-SC PR contribution path.

## Guardrails

- **YAGNI on the general composer** — build the slices, not the [compositional](../compositional-demo-builder.md) framework. Each slice extends existing slots additively.
- **Neutral but thin** — a `flow` discriminator + per-product predicates, not a plugin architecture.
- **Plan one slice at a time** — `/rptc:plan` Slice 1 now; the rest JIT.
- **Manual escape hatch** — fork-and-own-your-code stays as a no-code-change fallback for the rare Content SC who needs to customize the codebase. The wizard does not orchestrate this; it's a config edit (switch `code.owner` from Commerce SC's org to the SC's own fork).

## Open product questions

- **How a satellite site obtains the Commerce SC's backend coordinates** — wizard input (paste tenantId / view-id / locale), or programmatic discovery from the Commerce SC's published `config.json` (or its AEM-authored equivalent). The values are public, so discovery is convenience, not a security boundary.
- **Mirroring mechanism** — one shared package definition both wizards consume vs. paired packages (see [compositional-demo-builder](../compositional-demo-builder.md)).
- **`code.ref` (branch/commit) pinning on the Configuration Service `CodeConfig`** — verify the API supports it. Useful for satellites that want to pin to a known-good upstream commit during a long-running demo.
