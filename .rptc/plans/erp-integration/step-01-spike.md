# Step 01 — Spike the four unknowns, live

On a scratch workspace of the Bodea Console project the agent creates and deletes through
the SDK path proven 2026-08-27 (decision 17: no owner action needed). Each question has one falsifying command;
the answers go into `.rptc/research/erp-integration/research.md`.

1. **App Builder Database.** The docs (2026-09-14) say: add the **App Builder Data Services**
   API to the project ("provides the necessary authentication"; no licence beyond App
   Builder), provision declaratively (`application.runtimeManifest.database: {auto-provision:
   true, region: amer}`) or with `aio app db provision`, one database per workspace, actions
   need `include-ims-credentials: true` and `libDb.init({token})`. Live check: find the API's
   service code in the org's Console list (`list_console_apis`), add it to a scratch
   workspace, deploy a ten-line app whose one action opens a collection. Pass: rows come
   back. Fail: 403 → store decision reopens. The service code becomes the ERP entry's
   `requiredApis`.
2. **Admin UI screen beside the kit.** Narrowed by the docs (2026-09-14, App Management →
   Admin UI SDK): the `adminUi` block in `app.commerce.config` declares a `menu` entry that
   opens the app's own page, registered on `commerce/backend-ui/2`, needs
   `@adobe/aio-commerce-lib-app` ≥ 1.8 (the kit is on `^1.8.0`), and the library generates
   the registration — no second hand-authored extension. Live check left: declare one menu
   entry in a kit clone, deploy + install, see the page in Bodea's Commerce Admin (needs the
   instance's Admin UI SDK at the version the docs name).
3. **The kit's external → Commerce order path.** Answered by reading the kit (2026-09-14):
   `updated` posts a status-history comment; `shipment-created` creates a shipment; there is
   no invoice action. Live check moves to step 03's own acceptance; nothing to deploy here.
4. **First deploy of a fresh workspace.** Reproduce or rule out the log-forwarding failure
   (`Cannot read properties of undefined 'runtime'`); if it reproduces, the spine passes
   `--no-log-forwarding-update` for the ERP's first deploy.

Also confirmed in passing, no deploy needed: the one-extension-app-per-workspace limit
(structural, AB-2 spike) — read, not re-run.

## Results (2026-09-14)

Checks 1, 3 and 4 answered; check 2 narrowed to one live look during step 03. Details in
`.rptc/research/erp-integration/research.md`. Two facts change later steps: the ERP entry
declares `requiredApis: ["AppBuilderDataServicesSDK"]`; and a new workspace needs its Runtime
namespace before any deploy (the extension provisions it already; the August bypass flag was
the wrong lesson).

## Done when

The research note answers all four with the command run and the observed result, and the
scratch workspace is gone.
