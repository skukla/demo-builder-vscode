# ERP integration — the first pre-built entry in the integrations catalog

Research opened 2026-09-14 for the owner's ask: ship, as one catalog integration, an ERP
modeled on SAP (a clone the SC can demonstrate) and an Adobe Commerce integration to it
built with Adobe's Commerce integration starter kit. Bidirectional; works whatever data
the Commerce instance holds; every ERP record resettable. Branch `feature/erp-integration`
from `develop`.

## What the surface already does (read 2026-09-14)

- The catalog (`app-builder-components.json`) holds two entries: the Commerce integration
  starter kit as a SEED (`seed: true`, `layout: extension`, `lifecycle: app-management`,
  `nodeVersion: 24`, `requiredApis: CloudIntegrationSDK, commerceeventing`,
  `compatibleBackends: paas, accs`) and the blank shell (`blank: true`). Neither is a
  pre-built gallery entry: the gallery is EMPTY today. This feature is its first tile.
- The spine (`appBuilderComponentRunner.ts`, AB-1d shipped 2026-08-27) already: clones,
  installs under the entry's node version, deploys an extension-layout app (imports the
  workspace Console config), injects the six S2S `AIO_COMMERCE_AUTH_IMS_*` vars, subscribes
  the required APIs, associates the app with the project's Commerce instance (saas for
  ACCS, paas + base URL for PaaS) and drives the App Management install (reconcile with the
  409-race retry) to green. Uninstall before remove. Live-proven on Bodea.
- An entry can declare `providesEnvVars` (what it hands to consumers; today only the mesh's
  `MESH_ENDPOINT`, which triggers a storefront config regen) and `envSchema` (inputs it
  needs). There is NO dependency between catalog entries: nothing says "this integration
  needs that one deployed first".
- The Integrations page (dashboard) lists deployed components with status; `deployedUrls`
  are captured on deploy. No "open this app's UI" affordance yet.

## The colleague's mock (`jogosset/agilent-erp-mock`, private, read 2026-09-14 with the owner's access)

One App Builder app that is BOTH the ERP and the Commerce integration, App Management
generation (`app.commerce.config.mjs`, `install.yaml`, `@adobe/aio-commerce-lib-app`), not
the starter kit itself. Master data (products, companies/contracts, discount rules, orders,
quotes) in App Builder Database (`amer`); business logic in `lib/`, thin actions over it;
a React Spectrum admin SPA registered through the Admin UI SDK (runs inside the Commerce
Admin and standalone); two totals-collector webhooks (contract pricing, max-discount
ceiling) and an order-place webhook that creates the ERP order and writes `ext_order_id`
back; quotes synced as negotiable quotes; a configurable-product rule engine. Data is
seeded from a fixed Agilent product CSV mirrored into the ERP, and its accounts mirror two
sandbox companies by id — i.e. it is BOUND to one instance's data. Its admin action has
`seed` (idempotent master data) and `reset` (wipe transactional, keep master). Requires the
App Builder Data Services entitlement on the Console project. Node >=18, runtime nodejs:22.

## What this means for the design (to settle with the owner)

1. One app or two: the mock fuses ERP and integration; the ask names two things.
2. Where the ERP's data comes from, so it works on any Commerce instance.
3. Which bidirectional flows are in the first cut, in the kit's terms (product, customer,
   order, stock) plus what the mock adds (pricing, quotes).
4. What "reset" covers, and whether the Commerce side is touched.
5. Whether the mock is the starting point (fork and generalise) or a reference.
6. The name the SC sees, and the ERP's own UI door from the dashboard.

## Spike results (2026-09-14, live, scratch workspace `ErpSpike…` on the Bodea Console project, created and deleted by the agent)

1. **App Builder Database works on this org.** The org's Console offers
   `AppBuilderDataServicesSDK` ("App Builder Data Services", no review, no profile). A scratch
   workspace with an S2S credential subscribed to it, a plain app declaring
   `application.runtimeManifest.database: {auto-provision: true, region: amer}` and one
   `nodejs:22` action with `include-ims-credentials: true`: `aio app deploy` printed
   "Database is deployed and ready for use in the 'amer' region", and the action's
   `libDb.init({token}) → connect → collection.replaceOne/find` answered `{ok:true, rows:1}`.
   So the ERP entry's `requiredApis` is `["AppBuilderDataServicesSDK"]` and the spine's
   existing subscribe path covers it.
2. **Admin UI screen beside the kit**: answered from Adobe's App Management docs (see plan
   step 01); the live check moves into step 03's acceptance, where the kit is installed anyway.
3. **The kit's external → Commerce order path**: answered by reading the kit (`updated` posts a
   status-history entry through `POST /orders/{id}/comments`; `shipment-created` posts
   `POST /order/{id}/ship`; no invoice action).
4. **The fresh-workspace deploy failure has a cause, not a flag.** A workspace created through
   the SDK has `runtime.namespaces: []`; `aio app deploy` then dies at "Updating log
   forwarding configuration — Cannot read properties of undefined (reading 'runtime')", and
   with `--no-log-forwarding-update` it dies later at "Database deployment requires OW
   namespace configuration". `createRuntimeNamespace` (which the extension's provisioning
   already calls) fixes both: the default deploy then passes, log forwarding included. The
   August note's bypass flag treated the symptom.

Cleanup: action undeployed, workspace deleted (HTTP 200), downloaded config and `.env` removed.
Identifiers redacted here; the probe app lives only in the session scratchpad.
