# Updating an installed integration

Status: in progress (2026-09-17): steps 1-2 built. Backlog: AB-13 (under AB-9); decision 22 in
`.rptc/plans/erp-integration/step-07-updates.md` is the earlier, narrower design this extends.

## Why

An SC installs an integration once and keeps the project for months. When the integration
changes what it registers in Commerce (a new event, a removed webhook, a webhook's settings),
nothing in Demo Builder brings that change to an installed project:

- **Update and Redeploy never fetch new code.** The integration card sends both to the redeploy
  handler, which deploys whatever is in the project's clone (`deployAppBuilderComponent`, "no
  re-clone"). The comment beside the card says a redeploy pulls the latest source; it does not.
- **The updates feature stops at the files.** `componentUpdater.updateComponent` can replace a
  component's folder from a GitHub release, but nothing redeploys or reinstalls an integration
  afterwards, and the integration repos publish no releases.
- **The install step cannot upgrade.** With `@adobe/aio-commerce-lib-app` 1.11.0 an installed app
  answers "Installation has already completed successfully."; Demo Builder records that as
  `skipped` without a word. A new event or a changed webhook never reaches Commerce.

Found on the Bodea sandbox on 2026-09-17, when the ERP integration moved its orders from a
webhook to an event (`.rptc/plans/erp-integration-settings/overview.md`, step 3).

## What Adobe's library now does (2.0.0, published 2026-09-15; read from the package)

- `POST /installation` is desired-state: with an installed baseline and a different
  `metadata.version`, it **upgrades**. The same version answers 409 `already-current`.
- An upgrade diffs the installed config against the new one and adds, changes (unsubscribe and
  subscribe again) and removes webhooks; adds and removes event providers, metadata,
  registrations and subscriptions; refreshes the Admin UI SDK registration. Custom install steps
  run only when new.
- It plans by default (`upgradeMode: "manual"`); `"auto"` executes the plan and is marked
  experimental in the SDK's usage guide. Adobe's developer docs do not describe upgrades yet.
- 2.0.0 generates a `post-app-deploy` hook that asks for the upgrade after every `aio app deploy`.
- Uninstall works from the recorded installed config (since 1.8.0), not the config on disk.
- The one declared breaking change: `PUT /config` is removed (use `PATCH`); the integration does
  not call it.

## Design

### The integration (`commerce-erp-integration`)

Move to `@adobe/aio-commerce-lib-app` 2.0.0 (and the library versions it pins), set
`metadata.upgradeMode: "auto"`, keep `metadata.version` bumped on every change that alters
what is registered, and regenerate so the `post-app-deploy` hook appears. The version bump for
the order-event change is already in (0.2.0).

### Demo Builder

1. **Update fetches the newer code.** For a git-cloned integration: fast-forward the clone to
   its branch's head (or a release tag once the repos publish them), refusing when the clone has
   local changes. Read the new `metadata.version` from the app's generated manifest.
2. **Redeploy reports the upgrade.** `installIfAppManagement` keeps what the install call
   answers instead of discarding it: installed; upgraded from X to Y (with the plan's counts);
   already current; or refused. The dashboard and the agent tool say which, in plain words.
3. **A refused upgrade offers a reinstall.** When the app answers that it cannot be upgraded
   safely, Demo Builder offers uninstall (with the deployed, old version) then install (with the
   new one), after the SC confirms. Uninstall runs before the new code is deployed.
4. **The installed version is recorded** on the project's integration state, beside the install
   outcome, so "update available" and "installed" can be compared without asking the app.
5. **Update available is shown** on the integration card when the branch head (or the latest
   release) differs from what is deployed; the card's Update action becomes reachable for
   integrations, not only through mesh staleness.
6. **Surfaces:** the dashboard card, `redeploy_integration` / `install_integration` /
   `get_integration_install_status` results, the ERP's "Redeploy ERP" menu item, and
   `docs/systems/erp-integration.md` and `mcp-tools.md`.

Association in App Management is not required by any of this: the benefit is Adobe's library, not the App Management screen (owner, 2026-09-17; AB-11).

## Steps

1. **Integration on lib-app 2.0.0.** Upgrade, `upgradeMode: "auto"`, regenerate, all tests and
   biome green. Commit with the order-event work only after the owner says so.
2. **Demo Builder reports install outcomes** (install / upgrade / already current / refused),
   records the installed version. Tests with fakes captured from the 2.0.0 OpenAPI shapes.
3. **Demo Builder fetches newer code on Update**, with the local-changes refusal and the version
   read. Tests against a temp git repo (strip `GIT_*` in the test env).
4. **Refused upgrade → confirmed reinstall.** Tests for the order: uninstall before deploy.
5. **Update available on the card**, and the surfaces and docs.
6. **Bodea, live.** Update and redeploy the ERP integration: the order webhook is gone from
   `GET /V1/webhooks/list`, the order event is subscribed, the cart webhooks show optional on
   their edit pages; one test order reaches the ERP by the event and gets its number. If the
   automatic upgrade fails, the reinstall path is the test.

## Risks

- `upgradeMode: "auto"` is experimental; the first live upgrade may fail in undocumented ways.
- An upgrade that only changes code (same version) never reaches Commerce: the version bump is a
  rule the integration's authors must keep; a check in the integration's tests can enforce it
  for changes to `app.commerce.config.ts`.
- The post-deploy hook and Demo Builder's own install call both ask for the upgrade; the second
  should answer `already-current`. Step 6 checks it.
