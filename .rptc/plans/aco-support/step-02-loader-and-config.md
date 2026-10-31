# PL-60 step 02: ACO loading and configuration

Built 2026-10-31 on `aco/aco-loader-and-config`, from the owner's decisions of that day (P1 the
Catalog step and Configure; P2 the SC types no credential; P4 the engine loads ACO packs through
one client). The sibling step (website scrape to ACO pack) is on `aco/aco-scrape-to-pack`.

## What was built

| Piece | Where | Notes |
|---|---|---|
| The one ACO client | `data-installer/services/aco/acoClient.ts` | IMS `client_credentials` token (scope from Adobe's ingestion auth page), base URL `https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}`, JSON array POSTs, 429 retries, timeouts read from `TIMEOUTS` at call time, `AcoApiError(stage, status)` |
| The kinds | `aco/acoKinds.ts` | Order, paths and batch sizes are the Data Installer service's; delete payloads are the SDK's `Feed*Delete` shapes |
| Load and remove | `aco/acoPackInstall.ts`, `aco/acoJobs.ts`, `demoBuilderEngine/engine.ts` | Routed by the request's kinds: all `aco_*` goes to ACO; a mix is refused. Record lists each row by the pack's key, written before the batch is sent, plus `aco: {tenantId, region, environment}` |
| Settings | `components.json` (`ACO_TENANT_ID`, `ACO_REGION`, `ACO_ENVIRONMENT`, `ACO_CATALOG_VIEW_ID`, `ACO_LOCALE`, optional `ACO_PRICE_BOOK_ID`), `envVarKeys.ts`, `components/services/acoSettings.ts` | `readAcoSettings` is the one reader, for config.json and the engine |
| Removed | `ACO_API_URL`, `ACO_API_KEY`, `ACO_ENVIRONMENT_ID`; ToolManager's `.env` writer and validator; the `'aco'` environment type and its placeholder headers | Nothing soft-deprecated |
| Storefront config | `eds/services/acoStorefrontConfig.ts`, `configGenerator.ts`, `storefrontConfigParams.ts` | Documented ACO headers and analytics; one params builder for creation and Regenerate; ACO keys on the staleness watch list |
| Credential | `app-builder/services/acoCredential.ts`, `dashboard/handlers/acoCredentialHandlers.ts`, `components/services/acoCredentialStore.ts` | API found by name in the org's service list; subscribed via `reconcileExtras` under owner key `adobe-commerce-aco`; pair from `getS2SDeployCredentials` into SecretStorage (`demoBuilder.acoCredential.<projectPath>`); deleted and moved with the project |
| Agent surface | `set_up_aco_credential`, `remove_aco_credential` (confirm) | Plus `configure_project` (add-on and fields) and `start_datapack_import` / `reset_datapack` |

## Slice 2 (built the same day, coordinator's order)

| Piece | Where |
|---|---|
| Add-on fields read like the stack's own | registry `addons` bucket (`ComponentRegistryManager`), `collectStackComponents(stack, data, selectedAddons)` for the wizard and headless creation defaults, `useSelectedComponents` reads `selectedAddons` for Configure |
| Who may have ACO | `components/services/addonOffer.ts`: the stack offers it and the package does not exclude it (the schema's blacklist model); replaces BrandGallery's dead `filterAddonsByPackage` |
| CitiSignal allows ACO | `demo-packages.json`: `optional`. Chosen because a CitiSignal ACO storefront and two CitiSignal ACO packs (`aco_citisignal_new`, `aco_citisignal_original`) already exist, and it ships on both Edge Delivery stacks ACO is offered on. Bodea (B2B, per-company shared catalogs) and starter stay excluded; BuildRight stays hidden (it needs its own persona price books and a mesh storefront) |
| The one checkbox | `components/ui/components/AcoAddonChoice.tsx` (the house `CheckboxRow`), in the wizard's Catalog step and Configure's ACO tab |
| Configure | ACO tab (`kind: 'aco'`), the tick held until Save (`useAcoAddonSwitch`), Save sends `acoAddon`; `applyAcoAddonChange` sets up / removes the credential first and keeps the change only if that worked |
| Creation | `executeAcoCredentialPhase` after the integrations phase: guards, then the credential; a failure stops creation with the reason |
| Republish prompt | the staleness detector counts ACO's values only while ACO is on, so turning it on or off is a change |
| Old ingestion tool | deleted in one commit (`35a054624`) |

## Still open

1. ~~An ACO "Clear demo data"~~: built 2026-10-31 on `loop/2026-10-31-aco-clear` (`services/aco/acoWipe.ts`), its dialog part waiting for the new dialog design.
2. ~~ADR-016's worked example~~: replaced on the merge rehearsal (it names `configGenerator.ts`); ADR-023 keeps `toolManager.ts` as history.
3. Everything under "Unverified" below.

## Decisions for the owner

Accepted by the owner 2026-10-31, as recommended:

- **Rows ACO already held.** An install can overwrite a SKU someone else loaded, and removal then
  deletes it; the outcome note says so every time.
- **The locale.** Rows load for the locale the pack names, with the warning when it is not the
  storefront's.
- **The credential is the shared workspace one.** Removing ACO unsubscribes the API and forgets
  the pair, and keeps the credential.

## Unverified (needs the live test below)

- The Console service list's NAME for the ingestion API, and its sdk code; whether it needs a
  product profile (the spine refuses profile services unless the tenant matches).
- What ingestion answers: the status on success (docs say 200; the SDK reads `acceptedCount`),
  whether a bad row 400s synchronously or is accepted and dropped later, and what a delete of a
  key ACO never took answers (404 is read as gone; anything else stops removal).
- Whether the storefront boilerplate needs `AC-Environment-Id` (not emitted).
