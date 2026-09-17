---
id: AB-17
kind: question
area: app-builder
parent: AB-9
needs: []
value: high
status: open
---

# Should each system and integration get its own Adobe workspace?

Filed 2026-09-17 from the owner: the extension can create a workspace for the SC, so
system integrations need not share the project's. AB-16 (several ERPs) waits on the
answer, and AB-15 (conflicting setups) may become a fix instead of a refusal. Related:
AB-2, whose 2026-08-27 spike this builds on.

## Already known (AB-2's spike, 2026-08-27)

- The full loop is programmable: create a workspace, download its config, deploy,
  undeploy, delete the workspace (`aio-lib-console` `deleteWorkspace`; the CLI has no
  delete). The extension has `create_adobe_workspace` and `delete_adobe_workspace`.
- Many App Management apps per Commerce instance is supported; a kit app in a second
  workspace gave a second, independent install service.
- One kit app per workspace is structural (lib-app's install record has a fixed key, and
  the App Management extension registration is per workspace).
- A fresh workspace failed `aio app deploy` at the log-forwarding step twice;
  `--no-log-forwarding-update` avoided it.
- A workspace with live event registrations may refuse deletion, as projects did.

## What separate workspaces would solve

- One App Management app per workspace: each integration gets its own.
- A second ERP replacing the first (fixed package name, database collections, screen key):
  each ERP gets its own namespace and database, with no renaming.
- Two projects sharing a workspace (AB-15's first case), if systems never share the
  project's.
- Removal: deleting the workspace takes its code, database and registrations with it.

## What stays open

1. **Same app on one Commerce.** Webhook and event subscription names come from the
   integration's app id (`metadata.id` in `app.commerce.config.ts`, `commerce-erp-integration`),
   not its workspace. Can the id be set per deploy, and do two copies with different ids
   install side by side?
2. **Calls between workspaces.** The integration calls the ERP with a token from its own
   workspace credential (`src/lib/erp.js` `erpAuthHeaders`); the ERP posts events to the
   integration's ingestion webhook with its own (`demo-erp/lib/events.js` `authHeaders`).
   Both targets require Adobe auth. Does a web action accept a token minted by another
   workspace's credential in the same org? (The ERP already takes `EVENTS_WEBHOOK_URL` to
   point elsewhere; it defaults to its own namespace.)
3. **Setting up a workspace.** Credentials and API subscriptions per workspace, and whether
   App Builder Database is available in a new workspace without a manual step.

## Spike steps

Steps 1 and 2 run locally and touch nothing in the cloud. Every later step is a cloud
operation and needs the owner's approval before it runs. All cloud steps use a new
workspace named `zz-erp-spike` in Bodea's Adobe project, and are undone at the end.

1. **Local: can the app id vary?** In a scratch copy of `commerce-erp-integration`, make
   `metadata.id` read an environment variable with today's id as the default, run the
   lib-app generator, and read `.generated/app.commerce.manifest.json` and the generated
   `ext.config.yaml`: does the id reach the webhook names, event subscription names and
   Admin menu id? Nothing is committed.
2. **Local: what reads the id.** List every place the generated config and the installer
   use the id (installation record, business-config keys, association), so step 6 knows
   what to look at.
3. **Create the workspace** `zz-erp-spike` (`create_adobe_workspace`), and subscribe its
   credential to what the ERP needs, as the add path does. Record which steps needed a
   manual action.
4. **Deploy the ERP there** (`aio app deploy --no-log-forwarding-update`, targeted at the
   new workspace). Check its database works (open its screen, create a record).
5. **Call across workspaces.**
   - From Bodea's integration workspace, call the spike ERP's status action with the
     integration's credential token.
   - From the spike ERP, post one test event to Bodea's integration ingestion webhook
     (`EVENTS_WEBHOOK_URL`) with the ERP's credential token.
   Record each status code. Nothing is changed in Commerce.
6. **Only if step 1 said yes: a second integration copy on Bodea's Commerce.** Deploy the
   integration with a different app id into `zz-erp-spike`, then list Bodea's webhooks,
   event subscriptions and Admin menu. The first copy's webhooks must be untouched. Then
   uninstall the second copy and list again. This writes to Bodea's Commerce; it is the
   step to approve most carefully.
7. **Remove everything:** undeploy, remove event registrations, delete `zz-erp-spike`, and
   confirm the workspace, its Runtime namespace and its registrations are gone.

## Findings

### Steps 1 and 2, local (2026-09-17)

Run in a scratch copy of `commerce-erp-integration` at `7804f3e` (no `.env`, no `.git`;
its installed packages shared), with `metadata.id` changed to
`process.env.ERP_INTEGRATION_APP_ID ?? "commerce-erp-integration"`, lib-app 2.0.0, Node 24.
The real repository was not touched.

- **The id can vary per build.** `ERP_INTEGRATION_APP_ID=erp-integration-spike` with the
  `pre-app-build` hook wrote `"id": "erp-integration-spike"` into
  `.generated/app.commerce.manifest.json`, and nothing else changed. The running actions
  read that manifest (`.generated/app.commerce.config.js` imports it), so the id is fixed
  at build time: an environment variable on the deploy is enough.
- **Everything Commerce-facing is named from it** (read in lib-app's `dist/cjs`):
  - webhooks: batch and hook names get an id prefix (`buildWebhookIdPrefix`), and install,
    upgrade and removal only touch webhooks carrying that prefix (`isWebhookOwnedByApp`);
  - event names: `<id>.<event>`, with the id's hyphens turned to underscores
    (`getNamespacedEvent`, `utils` line 117);
  - event provider instance ids: `<id>-<provider>-<workspace id>` (`generateInstanceId`,
    `utils` line 59; the older `<id>-<provider>` form is marked deprecated).
  So two copies with different ids should not collide on one Commerce by name. That is
  what step 6 would confirm live.
- **The id cannot change on an installed app.** The installer refuses an upgrade whose id
  differs from the installed one ("The application ID (metadata.id) cannot be changed during
  an upgrade"). Demo Builder would choose a copy's id at its first install and keep it on
  the project's record for every later deploy.
- **Id rules:** letters, digits and hyphens; at most 100 characters.
- **Not named from the id:** the Admin menu id (`adminUi.menu.id`, `erp_integration`, a
  literal in `app.commerce.config.ts`). It can be varied the same way; whether Commerce
  requires it to be unique across apps is not known from the code. The business settings
  live in the workspace's own state (lib-config), so separate workspaces keep them apart
  (inferred, not checked live).
- **What this does not settle:** two copies both answering the same Commerce webhook (say,
  two ERPs pricing one cart) is a routing question for AB-16, not a naming one.

### Steps 3 to 5, live (2026-09-17, owner-approved)

In Bodea's Adobe project (org 285361, `KuklaBodeaMesh5NgV`), with the aio CLI signed in.

- **Step 3, create and subscribe.** `aio console workspace create` made `zzerpspike`
  (a title may hold only letters, digits and spaces; hyphens and parentheses are
  refused). `aio console workspace api add` for `AdobeIOManagementAPISDK` and
  `AppBuilderDataServicesSDK` created the workspace's OAuth server-to-server credential
  and attached both, with no manual step. The Runtime namespace
  (`285361-kuklabodeamesh5ngv-zzerpspike`) came with the workspace.
- **Step 4, deploy the ERP.** From a scratch copy of `demo-erp` at `bc1f60d`,
  `aio app deploy --no-log-forwarding-update` built and deployed 18 actions and
  auto-provisioned the database ("Database is deployed and ready for use in the 'amer'
  region"), no manual step. With the workspace's own token, `health` answered 200 and an
  `admin/import` of one partner wrote and read back.
- **Step 5, calls between workspaces: refused.** A token minted from one workspace's
  credential is rejected by the other workspace's `require-adobe-auth` actions, both ways,
  before the action runs:
  `401 [ERR1200] Technical account mismatch: expected '<this workspace's technical
  account>', actual '<the caller's>' for workspace '<name>'`.
  - Bodea's credential → spike ERP `health`: 401 (mismatch).
  - Spike credential → Bodea's `ingestion/webhook` with `{"data":{}}`: 401 (mismatch).
  - Controls: without a token, both 401; Bodea's credential → Bodea's webhook: 400 for the
    missing fields, so the same call passes auth in its own workspace.
  So two apps in different workspaces cannot call each other with their own S2S tokens.
  Ways round it, none tried: authenticate app-to-app calls without `require-adobe-auth`
  (a shared key, as the ERP screen does); give each app the other workspace's credential
  (spreads a secret); or connect them through I/O Events rather than direct calls.
  A signed-in person's token is not tied to a workspace (Demo Builder's App Management and
  ERP calls use one), but apps have no person's token.
- **Step 6, blocked at the Commerce subscription (replaced by the events check below).** The integration needs
  `CloudIntegrationSDK`, `commerceeventing` and `ACCS-REST-API` on the spike credential.
  The first two attached without a profile (through `aio-lib-console`
  `subscribeOAuthServerToServerIntegrationToServices`, `licenseConfigs: null`, as
  Demo Builder's subscriber does). `ACCS-REST-API` refused without a product profile
  ("requires selection of a product"); the org offers 59 ("Default - …"), and none is named
  for Bodea's tenant. Bodea's own credential reaches the tenant through product profile
  group `1164475479` ("Steve Kukla ACCS - ACCS - SANDBOX - UoGYsHrcxMyeoVd2zUktZi", read
  from its token's `projectedProductContext`). Adding that profile to the spike credential
  grants a new technical account access to Bodea's Commerce, so it waits for the owner.
  **For the product:** a workspace per integration means Demo Builder must choose the
  Commerce tenant's product profile for each new credential; today's subscriber refuses
  when the org offers more than one (`toServiceSubscriptionInfo`).

### Events between workspaces (replaces step 6; owner-approved, 2026-09-17)

The owner's direction: if this works, **every integration an SE adds gets its own
workspace in the project's Adobe I/O project, and systems and integrations talk through
events rather than direct calls**. Checked with the I/O Events API
(`api.adobe.io/events/{org}/{project}/{workspace}/…`, request shapes read from
`@adobe/aio-commerce-lib-events`):

1. A custom provider (`3rd_party_custom_events`) and event code `zz.spike.ping` were
   created in `zzerpspike` with its own credential: 201, 201.
2. A **journal registration in Bodea's Stage workspace**, with Bodea's credential, on that
   provider: 201. A workspace can subscribe to a provider that lives in another
   workspace of the same org.
3. One event published to the ingress (`eventsingress.adobe.io`, CloudEvents, `source`
   `urn:uuid:<provider>`) with the spike credential: 200. (With
   `Accept: application/hal+json` the ingress answers 406; it wants
   `application/json`.)
4. Bodea's journal held the event. **Delivery across workspaces works.**
5. Control: the same publish with **Bodea's** credential, to the spike workspace's
   provider, was also accepted and delivered. Any credential in the org with I/O Events
   can publish to any of the org's custom providers, so a receiver cannot trust an event's
   provider alone to know who sent it.
6. The registration, event code and provider were deleted: 204 each.

What this means for the design:

- ERP → integration: the ERP publishes to its own provider; the integration's workspace
  subscribes and gets the events delivered to its actions. No token crosses workspaces.
- Integration → ERP: the same the other way ("order placed" out, "order number assigned"
  back).
- Still direct: reads Demo Builder makes with the signed-in person's token (status,
  health), which is not tied to a workspace. The bulk mirror needs another route (events
  in chunks, or data the ERP pulls), because events have size limits.
- Events can arrive more than once and out of order; both sides must accept repeats, and
  since any workspace in the org can publish to a provider, a shared secret or signature in
  the payload is worth considering.

### Step 7, cleanup (2026-09-17)

- The ERP was undeployed (`aio app undeploy`): the `zzerpspike` namespace lists no
  packages and no triggers, and its `health` address answers 404.
- **The workspace could not be deleted.** `aio-lib-console` `deleteWorkspace` answered
  `400 "Read-only project cannot be deleted"`. AB-2's 2026-08-27 spike deleted a workspace
  the same way in another project, so this project refuses it; why (Bodea's project was
  created from a template, perhaps) is not known. **A workspace per integration is only
  reversible if Demo Builder can delete the workspace**, so this has to be settled first:
  which projects allow it, and whether projects Demo Builder creates do. The empty
  `zzerpspike` workspace (a credential with five APIs, no code, no providers) is still in
  Bodea's project, waiting for the owner.
- The downloaded workspace configs, the scratch copies and the helper scripts were deleted
  from the session scratchpad.

## Done when

The three open points each have a recorded answer with its evidence, and AB-15 and AB-16
are rewritten around the answer (or left as they are, with the reason).

## Shipped so far

- 2026-09-17  docs(backlog): AB-17 asks whether each system and integration gets its own workspace (`f4a0db91f`)
- 2026-09-17  docs(backlog): AB-17 steps 1 and 2 — the integration app id can vary per deploy (`0a560b980`)
