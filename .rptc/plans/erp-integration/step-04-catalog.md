# Step 04 — Catalog entries, provider auto-add, naming, deploy order

## Two entries in `app-builder-components.json`

```jsonc
{ "id": "erp-sap-style", "name": "ERP (SAP-style)", "kind": "system",
  "providesEnvVars": ["ERP_BASE_URL"], "compatibleBackends": ["adobe-commerce-paas","adobe-commerce-accs"],
  "boundTo": "erp-integration",          // a unit with its consumer: added before it, removed after it
  "source": { "owner": "skukla", "repo": "<erp>", "branch": "main" } }
{ "id": "erp-integration", "name": "ERP integration", "kind": "integration",
  "layout": "extension", "lifecycle": "app-management", "nodeVersion": "24",
  "requiredApis": ["CloudIntegrationSDK", "commerceeventing"],
  "compatibleBackends": ["adobe-commerce-paas","adobe-commerce-accs"],
  "envSchema": [{ "name": "ERP_BASE_URL", "providedBy": "erp-sap-style", "required": true }],
  "source": { "owner": "skukla", "repo": "<integration>", "branch": "main" } }
```

`kind: 'system'` is new (decision 13): `AppBuilderComponentKind` gains it; the runner's
kind dispatch treats it as a plain deploy with no Commerce install; the gallery never lists
it (it comes with its consumer). `boundTo` names the consumer whose unit it belongs to.

## The unit: add and remove together (decision 2)

`findMissingProvider` refuses today. The add path (wizard creation phase 3b, the dashboard
add, the MCP add) gains one step before the consumer: add and deploy the bound system, keyed
by its own id, named from the pick (decision 10). The remove path mirrors it: after the
integration is uninstalled and undeployed, its bound system is undeployed and dropped. The wizard's Integrations area shows the pair
as one card with a "comes with: <name> ERP" line; the review step lists both.

## Naming (decision 10)

The pick-time name names the integration, as for any integration. The ERP's name is an
`envSchema` input on the integration entry — `ERP_DISPLAY_NAME`, label "ERP name", default
`Acme ERP` — collected by the existing inputs surface when the tile is added and written into
the bound system's env before its deploy (the integration's env carries it too, for the
Admin UI screen). The system's row is named from it (`Acme ERP`); the flyout and the ERP's
settings screen let the SE change it later (a settings write on the ERP, not a redeploy).

## Env wiring

`ERP_BASE_URL` = the provider's `deployedUrls` API base (the package's web root), written
into the consumer's `.env` before its deploy through the existing `generateComponentEnvFile`.
The provider's deploy uses `--no-log-forwarding-update` if step 01 reproduces the failure.

## Remove

One remove, two undeploys: the integration is uninstalled from Commerce and undeployed, then
the ERP is undeployed and both rows leave the project file. The ERP's records survive an
undeploy (App Builder Database is per workspace); the confirmation says so, and a re-add
starts with a reset (decision 8) so the records match the instance again.

## Pins that move

`appBuilderComponentCatalogLoader.test.ts` (gallery = the integration alone; providers
hidden), `appBuilderComponentSelection.test.ts`, `tileStatus.test.ts`, the schema test,
`dashboardHandlers-map` if a handler is added, `tool-catalog-gating`.

## Built (2026-09-14)

Catalog: `demo-erp` (`kind: system`, `boundTo: erp-integration`, `nodeVersion: 24`, provides
`ERP_BASE_URL`, `nameFromEnvVar: ERP_DISPLAY_NAME`) and `erp-integration` (extension layout,
App Management lifecycle, node 24, `CloudIntegrationSDK` + `commerceeventing`, consumes
`ERP_BASE_URL` from `demo-erp`, takes `ERP_DISPLAY_NAME` with default "Acme ERP"). Ids follow
the repository names rather than the plan's `erp-sap-style` — the SAP word stays out of
everything the SC reads (owner, "products not materials"). Type, schema and JSON moved
together: `AppBuilderComponentKind` gains `system`; entries gain `boundTo` and
`nameFromEnvVar`; env vars gain `default`.

The runner (`appBuilderComponentRunner.ts`): `addBoundSystemFirst` adds and deploys the bound
system before its integration (retrying a system in `error`); `removeAppBuilderComponent`
refuses a system whose integration is present, and removes the system after its integration.
`deployInputs.ts` is new: text inputs (Configure → the bound integration's Configure → the
default) and `providedBy` values ride the deploy's process env beside the S2S credentials,
for add and redeploy alike; a non-mesh component's `providesEnvVars` resolve to its deployed
package's web base; `nameFromEnvVar` names the row. The storefront republish is gated on
`MESH_ENDPOINT` being among the provided vars — the ERP provides only to its integration.
The add door no longer stops for a text var with a default (`userSuppliedEnvVars`); Configure
prefills it.

Pins moved: catalog loader (gallery = `['erp-integration']`, kind enum), the schema test,
`appBuilderComponentHandlers-plumbing`. New: `deployInputs.test.ts`,
`appBuilderComponentRunner-boundSystem.test.ts`, bound-pair cases in the loader test.
