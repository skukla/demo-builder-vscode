# PL-60 — finish Adobe Commerce Optimizer (ACO) support: plan and design gate

Unattended loop, 2026-10-04 (night 4, stream A). Lane: **research/design**. Nothing was built:
every next step depends on a product choice below, and building ahead of them would add more of
the unreachable code this item exists to remove.

Evidence: `.rptc/research/aco-support/research.md` (Adobe's ACO docs and the three local ACO
repos, each claim labelled), and a re-check of the item against the code on 2026-10-04.

## Staleness check — the item is still accurate

No commit since the item was filed (2026-09-17) changed ACO code in `src/`. Every claim held, and
two understate it:

- `executeCommerceCleanup` is dead too, not only the ACO path: nothing sets
  `cleanupBackendData`, and nothing writes `backendType` (`cleanupService.ts`,
  `resourceCleanupHelpers.ts`, `eds/services/types.ts`).
- `filterAddonsByPackage` (`brandGalleryHelpers.ts`) has no caller.

Dead or unreachable today: `executeAcoIngestion`, `executeAcoCleanup`, `executeCommerceCleanup`,
`configureToolEnvironment`, `validateAcoConfig` (`toolManager.ts`); `cleanupBackendData` and
`backendType`; `skipTools` (written in `wizardHelpers.ts`, read nowhere); the `'aco'` case in
`configGenerator.ts`; `onAddonsChange` (tests only); `filterAddonsByPackage`; the ACO service
group (never rendered). Live: `selectedAddons` persistence, the `configure_project` add-on input,
`injectAddonConfigFlags` (runs, adds nothing for ACO), and `ACO_API_KEY` stripping on export.

## What the research changed

1. **The storefront config the extension generates for ACO is wrong in shape, not just
   unreachable.** Adobe's documented ACO storefront sends `AC-View-ID` (required),
   `AC-Source-Locale`, and optionally `AC-Price-Book-ID` under `cs`, to
   `https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}/graphql`; no `all.Store`, no
   `Magento-*` headers, and an ACO-shaped analytics block. Today's case emits placeholders
   (`{{AC_VIEW_ID}}`) plus `all.Store`.
2. **Two of the four credentials are the wrong shape.** `ACO_API_KEY` is not how ingestion
   authenticates (an IMS client id + secret, scope `commerce.aco.ingestion`); `ACO_ENVIRONMENT_ID`
   has no documented use; `ACO_API_URL` derives from tenant + region + sandbox. Only
   `ACO_TENANT_ID` survives as an input. The storefront itself needs no credential.
3. **A catalog view cannot be created by API** (every Adobe page describes UI steps; BuildRight's
   own notes say "cannot be created programmatically"). So the SC creates it in ACO's screens and
   gives us its id. Price books CAN be created through the ingestion API.
4. **Ingestion has delete endpoints but no list.** Reversal must be driven by what the extension
   recorded when it loaded, the same shape as `reset_datapack` walking its own files.
5. **AB-14 (ERP prices on ACO):** per-customer prices are price books; the storefront must send
   the buyer's price-book id after sign-in, which static `config.json` cannot do. That is a
   storefront-block change, not a config change.

## Design gate

- **What entity is ACO?** It is already modelled: an **add-on** (`addonDefinitions` in
  `stacks.json`, a catalog entry in `components.json`) that `providesServices` catalog-service
  and live-search. That fits: ACO replaces where the storefront reads its catalog, while the
  Commerce backend still owns carts and orders (`commerce-core-endpoint` stays the backend's).
  It is NOT a backend, which is why `mapBackendToEnvironmentType` never sees it — the fix is to
  ask "is the ACO add-on selected?" alongside the backend id, not to make ACO a backend.
- **What owns it, where does it live?** The add-on's inputs belong in
  `componentConfigs['adobe-commerce-aco']` like every other component's settings; the storefront
  config is `configGenerator.ts`; the wizard control is the Commerce area's Catalog step
  (`commerceSections.ts`), which the v6/v7 prototypes already show.
- **Alternatives rejected.** *ACO as a fourth backend* — wrong: ACO has no cart or checkout, and
  every backend-keyed code path (REST tools, mesh, discovery) would have to learn it is not one.
  *ACO as a stack* — multiplies `stacks.json` by two for one catalog choice.
- **Product intent — the owner decides (not built):**

| # | Decision | Recommendation |
|---|---|---|
| P1 | Is ACO offered in the wizard (Commerce → Catalog), or agent-only for now? | Offer it in the Catalog step, off by default, only where the package allows it — the prototypes' design |
| P2 | What does the SC type? | Tenant id, region, sandbox/production, catalog view id, locale; price book id optional. Drop `ACO_API_KEY`, `ACO_ENVIRONMENT_ID`, `ACO_API_URL` as inputs (no soft deprecation: delete them in the same change) |
| P3 | Where does ACO data come from? | The Data Installer's ACO datapack family (it already exists there, and import/reset/export are built), not the bundled `commerce-demo-ingestion` tool (the local `buildright-aco` loader that used Adobe's ACO TypeScript SDK was itself archived on 2025-12-16, per its `DEPRECATED-NOTICE.md`; that is our repo, not Adobe's SDK). Then delete `ToolManager`'s ACO paths and the dead `executeCommerceCleanup` |
| P4 | Does the extension load data itself (needs an ingestion client id + secret) or only point the storefront at ACO? | Point only, first. Loading is P3's datapack; a client secret is one more SecretStorage value to manage for no demo gain yet |
| P5 | AB-14 per-customer prices | Separate item: a storefront block change (send the buyer's price-book id after sign-in) plus an ERP price-book writer |

## Build order once P1–P4 are answered

1. Delete the dead paths P3 makes dead (tool manager ACO ingestion/cleanup, `cleanupBackendData`,
   `backendType`, `skipTools`), with their tests.
2. The add-on's fields per P2 — the JSON registry, its schema and the TypeScript type together.
3. `configGenerator`: when the ACO add-on is selected, emit the documented `commerce-endpoint`,
   `cs` headers and analytics block; drop `all.Store`. Pin with fixtures copied from the
   documented shape. Regenerate path and creation path both run `generateConfigJson`.
4. Wizard: the Catalog step control (`wizard-step-authoring`), and Configure rendering the ACO
   group (fix `useSelectedComponents` to include add-ons).
5. Data: datapack import scoped to an ACO site type (Data Installer), with `reset_datapack` as
   the undo.
6. Agent surface: `configure_project` already takes add-ons; add the ACO fields to its schema.
7. Live check (owner): a sandbox ACO tenant with one catalog view; storefront PLP and PDP render.

## Reversibility

Selecting ACO is undone by deselecting it (config regenerates without the ACO block). Data
loaded through a datapack is removed by `reset_datapack`. A catalog view the SC creates in ACO's
screens is theirs to delete there; the extension never creates one (no API exists).

## Open, needs a live check

Whether any API creates catalog views; which Developer Console API grants
`commerce.aco.ingestion`; whether the boilerplate needs `AC-Environment-Id` (BuildRight sends it,
no Adobe page lists it).
