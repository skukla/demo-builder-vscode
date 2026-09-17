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

## Done when

The three open points each have a recorded answer with its evidence, and AB-15 and AB-16
are rewritten around the answer (or left as they are, with the reason).

## Shipped so far

- 2026-09-17  docs(backlog): AB-17 asks whether each system and integration gets its own workspace (`f4a0db91f`)
- 2026-09-17  docs(backlog): AB-17 steps 1 and 2 — the integration app id can vary per deploy (`0a560b980`)
