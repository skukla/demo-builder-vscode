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

## Not built (next slice)

1. **The human controls (P1).** The Catalog step toggle (off by default, only where the
   package does not exclude the add-on) and Configure's ACO tab plus on/off. Two blockers found:
   Configure and the wizard read fields only from stack components (`useSelectedComponents`,
   `collectStackComponents`) and the registry they read has no `addons` bucket
   (`ComponentRegistryManager.ts`), so the ACO group never renders; and Edit mode drops the
   Catalog step from the strip (`isSetInConfigure`), so Configure must carry the toggle. No
   selectable demo package allows ACO today (four exclude it; `buildright` requires it but is
   hidden), so `demo-packages.json` must change for the toggle to appear anywhere.
2. **Provisioning on the human paths.** Turning ACO on in Configure, or creating a project with
   it, should call `setUpAcoCredential` (creation: an executor phase after the Adobe workspace
   exists); turning it off should call `removeAcoCredential` and regenerate config.json.
3. **Republish on add-on toggle.** The staleness detector watches values, not `selectedAddons`.
4. **ToolManager's remaining ACO paths** (`executeAcoIngestion`, `executeAcoCleanup`, the
   `cleanupBackendData` / `backendType` chain, the `commerce-demo-ingestion` tool entry) are
   dead now that the engine loads ACO packs; delete them in one change.
5. **ACO "Clear demo data".** Without a list API, a wipe has to read the storefront GraphQL
   (`productSearch` through a catalog view), as `commerce-demo-ingestion/aco/delete-everything.js`
   does. A lead, not a design.

## Decisions for the owner

- **Rows ACO already held.** No read-back means an install can overwrite a SKU someone else
  loaded, and removal then deletes it. Recommendation: accept and say it (done in the note);
  the alternative, refusing keys not made by us, is impossible without a list API.
- **The locale.** Pack rows load for the locale they name (the service does not rewrite it
  either); the outcome note warns when it is not the storefront's. Recommendation: keep; offer a
  rewrite only if packs made from Commerce (store view codes as locales) prove common.
- **The credential is the shared workspace one.** Removing ACO unsubscribes the API and forgets
  the pair, but leaves the credential. Recommendation: keep; it is App Builder's too.

## Unverified (needs the live test below)

- The Console service list's NAME for the ingestion API, and its sdk code; whether it needs a
  product profile (the spine refuses profile services unless the tenant matches).
- What ingestion answers: the status on success (docs say 200; the SDK reads `acceptedCount`),
  whether a bad row 400s synchronously or is accepted and dropped later, and what a delete of a
  key ACO never took answers (404 is read as gone; anything else stops removal).
- Whether the storefront boilerplate needs `AC-Environment-Id` (not emitted).
