# Federated two-instance demos — each SC manages their piece via their own Demo Builder

**Filed:** 2026-06-02
**Status:** **Leading direction** (per discovery — pending `/rptc:plan`). This is the **operator/delivery model** for the [commerce connection kit](./2026-06-02-commerce-connection-kit.md) (which is the *integration mechanism*).

## The model

Each SC runs **their own copy** of the Demo Builder extension, authenticated to **their own** Adobe org, managing **their piece** of a shared demo. The two halves integrate through a portable **contract** (the connection kit), not shared state — microservices-style federation.

- **Commerce SC's instance** → provisions the commerce backend (ACCS + API Mesh + Catalog Service) in their org → **exports a connection kit**.
- **AEM SC's instance** → scaffolds the AEM `aem-boilerplate-xcom` storefront in their org + **imports the kit** → their storefront renders the shared commerce data, authored/governed in their AEM Sites.
- **The shared demo** = the same commerce data behind two independently-owned storefronts, each driven by its SC in their own environment.

## Why this is the most feasible of the options explored

1. **Each instance stays single-org → no multi-IMS refactor.** This is the architecture the extension already has (`adobeOrg/adobeProject/adobeWorkspace`, singular) — run twice, not rebuilt.
2. **Each SC works entirely within their own access/entitlement → dissolves the "human-access ceiling."** Neither SC needs membership in the other's org. (That was the real limit of the centralized "one operator switches orgs" model.)
3. **The handoff primitive already exists.** `src/features/projects-dashboard/services/settingsSerializer.ts` + `settingsTransferService.ts` already do **portable settings export/import to a file**, with versioning (`isNewerVersion`), validation (`isValidSettingsFile`), `extractSettingsFromProject`, `createExportSettings`, `getSuggestedFilename`. The connection kit is a **new payload** on this, not new plumbing.
4. **The kit payload already exists** — `configGenerator.ts` output (endpoints + `x-api-key` + environment-id + store headers); runtime composition is cross-org-clean (ACCS-first).

## What it delivers

- Each SC **independently builds, manages, and iterates** their half — fully within their own access.
- "**Extend usage to AEM SCs**" realized the simplest possible way: the AEM SC just uses **their own copy** of the extension.
- A **portable "demo connection" artifact** handed between instances (export one side → import+apply the other).
- (Optional) a lightweight **shared demo descriptor** (brand / name / linkage) so both halves recognizably belong to one demo.

## Build pieces (incremental; mostly existing machinery)

- **Commerce side:** "Export connection kit" — a new payload (`commerce-*-endpoint` + `x-api-key` + `Magento-Environment-Id` + store/view/website headers) on the existing export machinery.
- **AEM side:** "Import + apply kit" (existing import + write to the storefront's config service) · "Scaffold `xcom`" (template-copy — reuses the repo-from-template machinery) · **guide** the manual AEM steps (Code Sync, Cloud Manager site, IMS roles, UE enablement).
- **Optional:** the shared demo descriptor + a "your kit is stale" drift affordance.

## Operator topology: federated vs centralized

- **Federated (this):** two operators, one org each. Matches the two-SC reality; least refactor.
- **Centralized (multi-IMS, one project):** one operator with access to many orgs; N IMS wizard steps; heavier (multi-IMS-context state + `aio` context-switching refactor). A future option *if* one person ever needs to orchestrate everything.
- Same contract underneath → **not competing bets.** Federated first; centralized is the heavier later evolution.

## Honest limits (don't design these away)

- **Loose coupling — no live shared state** between the two instances. The kit is a **snapshot**; if the commerce backend's coordinates/keys change, the kit must be **re-shared** (lean on `settingsSerializer.isNewerVersion` for "your kit is stale" detection).
- **No auto-propagation** between halves; the contract is the only link.
- **Trust/admin:** the Commerce SC must deliberately **share the data-space keys** (shareable by design — data-space-scoped, no IMS token — but a conscious act).
- **Coherence = shared *data*, not shared *content***: each storefront is authored independently.

## Existing seams to build on

- `src/features/projects-dashboard/services/settingsSerializer.ts` + `settingsTransferService.ts` — the export/import handoff (kit = new payload).
- `src/features/eds/services/configGenerator.ts` + `config-template.json` — the kit payload.
- Project-creation repo-from-template machinery — to scaffold `xcom` on the AEM side.

## For the plan

- Define the **connection-kit schema** (versioned) — fields, validation, how it's applied to a storefront's config service.
- The **AEM-side scaffold + guide** flow (`xcom` template-copy + the manual AEM steps the extension can only guide).
- Optional **shared demo descriptor** + drift/"stale kit" UX.
- Where the export/import surfaces live (Configure, dashboard, or both).
