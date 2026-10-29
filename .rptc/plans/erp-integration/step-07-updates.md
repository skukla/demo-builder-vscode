# Step 07 — How the ERP and the integration are updated by the extension

Owner, 2026-09-14: "the plan must cover how the ERP system repo and the integration repo are
updated by the extension. We must re-examine how updates are managed in the extension and
figure out how to incorporate integrations into that landscape."

## How updates work today (read 2026-09-14)

- **One check, one apply.** "Demo Builder: Check for Updates" (`checkUpdates.ts`) and the
  agent tool `apply_updates` (`applyUpdatesTool.ts` → `updateApplyService.ts`) cover the
  extension itself, storefront fork sync, templates, addons, block libraries, the Adobe MCP
  tools, and **components**.
- **Component updates are release-driven.** `updateManager.checkAllProjectsForUpdates` walks
  every component instance that has a path, resolves its GitHub repository, fetches the
  latest release for the user's channel (stable = `/releases/latest`; beta includes
  prereleases), and compares `componentVersions[id].version` to the release tag with semver.
  `componentUpdater.updateComponent` then snapshots the folder, downloads the release zipball,
  replaces the folder, verifies `package.json` (and `mesh.json` for a mesh), runs the build,
  merges the old `.env` back, records the version, and rolls back on failure.
- **Nothing is redeployed after a component update.** The updater changes files on disk only.
  For a mesh, the staleness detector (`stalenessDetector.ts`: env vars + source hashes vs the
  deployed baseline) then shows the mesh as stale and offers Redeploy; nothing equivalent
  exists for an App Management app.
- **App Builder catalog components are invisible to the updater.** `componentRepositoryResolver`
  reads `components.json` (frontends, mesh, tools) only; the fallback is an instance `repoUrl`,
  which only the EDS storefront sets. Entries in `app-builder-components.json` (the shell, the
  kit seed, and now the ERP and its integration) are cloned from `source.branch` (`main`) and
  never checked. Their version is detected at clone (`git describe --tags --exact-match`, else
  `package.json`), so ours record `0.1.0` from package.json.
- **A finding on the way (not this feature's):** meshes clone the latest release tag, else the
  moving `stable` tag, and Bodea's mesh recorded the version `stable`. `semver.gt(latest,
  'stable')` throws and is caught as `false`, so that mesh can never be flagged for an update.
  The three mesh repos publish only `v1.0.0-beta.*` prereleases; `app-builder-shell` publishes
  none.

## What this means for the two repositories

Left as they are, an SC who added the ERP integration in September keeps that September code
forever: no check, no offer, and if they redeploy they redeploy what they have. Fixing this is
mostly on the extension side, plus a release discipline on the two repositories.

## Decision 22 — the update model for App Builder components

1. **Releases, semver-tagged, on both repositories.** `skukla/demo-erp` and
   `skukla/commerce-erp-integration` publish GitHub releases (`v0.1.0`, …); a release of the
   integration runs `npm run contract:check` first so its vendored ERP contract matches the ERP
   release it pairs with, and the release notes name that ERP version. The catalog entries keep
   `source.branch: main` for development but the add path prefers the latest release tag when
   one exists (the mesh pattern: `gitOptions.tag` → `fetchLatestReleaseTag`), so a fresh add
   records a real version.
2. **The updater sees App Builder components.** `componentRepositoryResolver` also reads
   `app-builder-components.json` (`source.owner/repo`), so Check for Updates and
   `apply_updates` list them like any component. The version comparison treats a non-semver
   recorded version (`stable`, `unknown`) as "update available" instead of "never".
3. **An update of an App Builder component ends with a redeploy through the spine**, not a
   file swap alone: after `componentUpdater` replaces the folder, the runner's redeploy runs
   (mesh: `aio api-mesh update`; plain app: `aio app deploy`; app-management app: deploy +
   install reconcile), so the deployed state matches the folder and the Commerce install stays
   registered. The deploy env is injected per deploy as today; nothing secret lives in the
   folder.
4. **A bound pair updates as a unit, provider first.** When the integration has an update, the
   ERP is checked and updated first (its release is named by the integration's release notes /
   contract), then the integration. The ERP's records live in the workspace database and
   survive the update; a contract version bump in the ERP that changes stored shapes must ship
   with a migration in the ERP's own code (none needed in the first cut).
5. **Same surfaces, no new ones.** The existing Check for Updates flow and `apply_updates`
   tool carry the new rows; the flyout's status line says "update available" the way the mesh
   says "stale". Hit-every-surface: creation path (clone at release), dashboard add, MCP add,
   updater check, updater apply, flyout badge, docs.

## Work

- Extension: resolver reads both catalogs; version comparison tolerates non-semver; post-update
  redeploy for App Builder kinds via the runner; bound-pair ordering; flyout badge; tests
  (`updateManager`, `componentUpdater`, resolver, runner) and the `apply_updates` tool tests;
  `mcp-tools.md`.
- Repositories: a `release` workflow or documented `gh release create` step on both; the
  integration's release step runs `contract:check`; version bumps in `package.json`.
- Fix the `stable` mesh version comparison while in there (one line + a test), and record the
  finding in the backlog if the owner prefers it separate.

## Done when

An SC's project with the ERP integration at `v0.1.0` sees "update available" when `v0.2.0`
is released, applies it from Check for Updates and from `apply_updates`, and both apps are
redeployed and still installed afterwards; the ERP's records are untouched; a failed update
rolls back to the snapshot and the previous deploy still answers.
