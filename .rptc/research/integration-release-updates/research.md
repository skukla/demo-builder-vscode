# Putting the ERP pair on the release path

Research, 2026-09-22. Worktree `feature/erp-integration` at `b1d294b4d`.
Question: what does it take to deliver and update `skukla/demo-erp` (catalog id `demo-erp`,
kind system) and `skukla/commerce-erp-integration` (`erp-integration`, kind integration) the
way the extension delivers other externally-hosted repos?

Labels used below: **[code]** = read in code at the cited line. **[gh]** = read from GitHub
with a read-only `gh` call today. **[inferred]** = my reading, not run or observed.

---

## The answer in five lines

1. The "release path" is really **two different release mechanisms**, not one. Component
   folders (mesh repos, headless storefront) are replaced from a GitHub release zip. The patches
   repo is never copied into a project at all: the extension just reads files at the latest
   release tag. The owner's model (patches) is the second kind.
2. **The ERP pair is already visible to the release updater today**, and is left alone only
   because neither repo has a release. Cutting a release before the code changes would make
   "Check for Updates" offer them, and applying that would delete the git clone, skip the redeploy,
   and break the integration's own Update button. [code + inferred, see §5]
3. The smallest correct change keeps the integration's **git-based update** (fetch, install,
   redeploy, Commerce upgrade) and changes only **what it moves to**: the latest release tag
   instead of the tip of `main`. That is exactly the patches model: "latest release, or `main`
   if there is none".
4. The generic updater must be told to **skip App Builder components**. Otherwise two updaters
   own the same folder.
5. Neither path can undo an update today. The generic path only rolls back a *failed* update. The
   integration path has no rollback at all.

---

## 1. How the generic release path works today

### Where the repo is declared
- `ComponentRepositoryResolver` reads `components.json` and only the `frontends`, `mesh` and
  `tools` sections, and only entries with `source.type: "git"` and a `url`
  (`src/features/updates/services/componentRepositoryResolver.ts:67-69`, `:95`). [code]
- Fallback: any component instance with a stored `repoUrl`
  (`src/features/updates/services/updateManager.ts:266-276`). [code] Every git-cloned instance
  gets `repoUrl` at clone time (`src/features/components/services/componentInstallation.ts:69`),
  so this fallback covers **all** git-cloned components, App Builder ones included. [code]
- `app-builder-components.json` is **not** read by the resolver. The ERP pair is in that file
  (`src/features/components/config/app-builder-components.json:66-70`, `:112-116`). [code]

### How the installed version is recorded
- At clone: `detectVersion` tries an exact git tag, then `package.json` `version`, then the short
  commit hash (`componentInstallation.ts:198-260`). Result goes to
  `componentInstances[id].version` (`:165`). [code]
- At project creation: copied into `project.componentVersions[id]`
  (`src/features/project-creation/services/projectFinalizationService.ts:78-91`). [code]
- On every project load: any folder under `components/` with no `componentVersions` entry gets
  one from the instance version, or `'unknown'` (`src/core/state/projectFileLoader.ts:345-371`).
  [code]
- After an update: `componentVersions[id]` and `componentInstances[id].version` are both set
  (`src/features/updates/services/componentUpdater.ts:121-133`). [code]
- The check reads **only** `componentVersions` (`src/types/typeGuards.ts:211-216`). [code]

### How "latest" is found
- Setting `demoBuilder.updateChannel`: `stable` (default), `beta`, `early-access`
  (`package.json` contributes, default `stable`). [code]
- Components never use early-access; it collapses to beta (`updateManager.ts:93-97`). [code]
- `stable` → `GET /releases/latest`, which **ignores prereleases**; `beta` → `GET /releases`
  and picks the highest semver the channel accepts (`updateManager.ts:189-217`,
  `src/features/updates/services/releaseTrack.ts:19-75`). [code]
- Download is the release's `zipball_url` (source archive), not an asset
  (`updateManager.ts:224-228`). [code]
- Version = tag with leading `v` removed; "newer" = `semver.gt` (`updateManager.ts:301-315`).
  A current version of `'unknown'` is always treated as outdated (`:157-160`). [code]

### How an update is applied
`ComponentUpdater.updateComponent` (`componentUpdater.ts:56-196`), in order: [code]
1. copy the folder to `<path>.snapshot-<time>` (without `node_modules`);
2. keep `.env` and `.env.local`;
3. **delete the folder**; download the zip; unzip; flatten the archive root;
4. check `package.json` exists (and `mesh.json` for mesh);
5. `npm install`, then `npm run <buildScript>` if the catalog entry has one (`:293-352`);
6. merge the old `.env` into the new `.env.example` (user values win);
7. record the version; delete the snapshot.
On any failure: delete the half-updated folder, rename the snapshot back, `npm install`
(`:141-191`).

The result is a folder with **no `.git`** (a zip, not a clone). [code]

### When checks run, who approves, which projects
- Automatically when the sidebar first loads, at most once an hour, if `demoBuilder.autoUpdate`
  is on (`src/features/sidebar/providers/sidebarProvider.ts:192-227`, throttle `:29`). [code]
- On demand: command `demoBuilder.checkForUpdates` and the sidebar "updates" nav target
  (`src/commands/commandManager.ts:256-257`, `:330-332`). [code]
- Agents: MCP `apply_updates` (current project only) via
  `src/features/updates/services/updateApplyService.ts:424-440`. [code]
- It checks **every project on disk** (`src/features/updates/commands/checkUpdates.ts:76-100`),
  shows one multi-select list, current project pre-ticked (`updateTypes.ts:122-235`), and asks to
  stop a running demo first (`updateExecutor.ts:231-238`). Nothing applies without a pick. [code]

### Which repos actually use it today [gh]
| Repo | Where declared | Releases | Reaches stable-channel SCs? |
|---|---|---|---|
| `skukla/commerce-eds-mesh` | components.json mesh, `tag: stable` | beta.1–beta.5, all prereleases | **No** — `releases/latest` finds nothing |
| `skukla/eds-accs-mesh` | mesh, `tag: stable` | beta.1, prerelease | **No** |
| `skukla/headless-commerce-mesh` | mesh, `tag: stable` | beta.1, prerelease | **No** |
| `skukla/citisignal-nextjs` | demo-packages (instance `repoUrl`) | beta.1–beta.5, prereleases | **No** |
| `PMET-public/commerce-demo-ingestion` | tools, `tag: v1.0.0` | 404 to an anonymous read | Unknown |
| `adobe/commerce-integration-starter-kit` | app-builder catalog (instance `repoUrl`) | latest = tag `legacy` | Not offered: `legacy` is not semver, so `semver.gt` throws and answers false — unless the recorded version is `'unknown'` |

So on the default channel, **no component currently gets a release update at all**. That is a
finding in its own right, and it is the trap the memory note warns about.

Not on this path (they have their own mechanisms): EDS storefront template sync and fork sync
(commit-based), block libraries and the inspector SDK (commit-based,
`updateCore.ts:83-171`), the Adobe MCP package (npm), the patches repo (below).

---

## 2. How the integration path works today, and what it does that the release path does not

Entry: `handleUpdateAppBuilderComponent`
(`src/features/dashboard/handlers/integrationUpdateHandlers.ts:172-203`). [code]

**Check** — `checkIntegrationUpdates` (`src/features/app-builder/services/integrationUpdateCheck.ts:109-120`):
- runs once each time the Integrations screen opens, **current project only**
  (`src/features/dashboard/ui/integrationsSurface/IntegrationsScreen.tsx:156-160`); also MCP
  `check_integration_updates` (`src/features/ai/server/actionDescriptors.ts:275-285`). [code]
- only deployed, non-mesh App Builder components (`integrationUpdateCheck.ts:44-50`). [code]
- two signals: `git fetch origin <branch>` shows the clone is behind (`integrationSourceUpdate.ts:128-145`),
  or the clone's manifest `metadata.version` differs from the one installed in Commerce
  (`integrationUpdateCheck.ts:53-62`, `appManifestVersion.ts:24-37`). [code]
- answer stored on `appBuilderComponents[id].updateAvailable` (`src/types/base.ts:312-319`). [code]

**Apply** — `updateAppBuilderComponent` (`src/features/app-builder/services/appBuilderComponentRunner.ts:1057-1104`):

| Step | Release path | Integration path |
|---|---|---|
| Get new code | delete folder, unzip release | `git fetch` + `merge --ff-only` in the existing clone (`integrationSourceUpdate.ts:153-217`) |
| SC's own edits | kept only for `.env`/`.env.local` (merged) | whole folder kept; any tracked edit **refuses** the update and names the files (`:171-178`) |
| Tooling-rewritten files | n/a | `package-lock.json`, `.generated/`, `ext.config.yaml`, `app.config.yaml` are restored with `git checkout -- .` before the merge (`:49-54`, `:179-186`) |
| Dependencies | `npm install` (+ optional build) | the add path's `installNpmDependencies` with the entry's Node version (`appBuilderComponentRunnerDeps.ts:206-207`) |
| Deploy to Adobe | **none** | full redeploy: API subscribe, isolated `aio app deploy` (`appBuilderComponentRunner.ts:1009-1011`) |
| Per-copy env | none | deploy env resolved by `deployInputs.ts`, incl. `DEMO_BUILDER_COPY_NUMBER` for a second copy (`deployInputs.ts:14`, `:33`) |
| Commerce install/upgrade | none | App Management install pass after deploy; lib-app 2.x upgrades when `metadata.version` changes; records `installation.version` (`appManagementUpgrade.ts:1-12`, runner `:1027`, `:916-930`) |
| Pair order | none | system(s) first, then the integration; a failed system stops the rest (`integrationUpdateHandlers.ts:80-153`) |
| Version record | `componentVersions[id]` | none for code; only `installation.version` (Commerce's copy) |
| Scope | all projects, one list | one project, one card at a time |
| Snapshot / rollback | yes, on failure | **none** |
| Previous commit kept | n/a | the `from` SHA is returned in the message, **not saved** (`integrationSourceUpdate.ts:211-216`; no reader in the runner) |
| Guards | "stop the running demo?" | Adobe auth/org guard chain (`guardOrBlock`, handler `:125`) |

---

## 3. Where the two can meet

### Reusable as-is
- **Release lookup and channel choice**: `releaseTrack.selectLatestForChannel` and the
  `stable`/`beta` rule (`releaseTrack.ts:63-75`). Today it lives inside `UpdateManager`'s private
  `fetchLatestRelease` (`updateManager.ts:182-259`); it would need to be callable for one repo
  and return the **tag name**, not just a zip URL. [code + inferred]
- **The "latest release, else `main`" rule** from the patches repo: `resolvePatchRef`
  (`src/features/eds/services/patches/externalPatchFetcher.ts:59-96`). Same shape the ERP needs.
  [code]
- **Showing it in the one updates list**: `buildUpdatePickerItems` already groups many kinds per
  project (`updateTypes.ts:122-235`). An "integration" item kind would slot in the way Adobe MCP
  did. [inferred]

### Must stay integration-specific
- Getting the code by **git**, not zip: the redeploy, the tooling-owned-file rules, the edit
  refusal and the upgrade check all assume a clone with `.git` and `origin`. [code]
- Redeploy + Commerce install/upgrade + pair order + auth guards. [code]

### Is there a seam in `componentUpdater` for "after the files change, do X"?
**No.** The only post-step is `runPostUpdateBuild`: `npm install` plus an optional
`npm run <buildScript>` from the catalog entry (`componentUpdater.ts:293-352`). There is no
callback, no per-kind hook, and it has no Adobe auth or org context to deploy with. Mesh gets its
redeploy indirectly: the dashboard notices the source changed and says "redeploy". [code]
Bolting a redeploy onto `componentUpdater` would mean giving the generic updater auth, org
targeting, the pair order and the install pass. That is the integration runner, rebuilt. [inferred]

---

## 4. How the patches repo pins releases (the owner's model)

- A demo package names the repo in `codePatchSource` / `contentPatchSource`
  (`src/features/components/config/demo-packages.json:140-145`). [code]
- At create/reset time the extension asks `GET /releases/latest` and reads the ledger and the
  last-known-good pointer **at that tag**; with no release it reads `main` and logs a warning.
  Only a successful tag lookup is cached (`externalPatchFetcher.ts:59-96`,
  `lkgReader.ts:54-87`). [code]
- Nothing is recorded per project, and nothing is "updated": each create or reset simply uses
  whatever release is latest then. [code]
- `eds-demo-patches` has **one** release, `v1.0.0`, marked Latest, a normal release [gh]. Its
  workflows are `lkg-gate.yml` (daily, moves the LKG pointer on `main`) and
  `validate-code-ledgers.yml`; neither publishes a release [gh]. Releases are cut by hand.
- Why "must be NORMAL releases": `releases/latest` skips prereleases, so a prerelease-only repo
  looks like "no release" and falls back to `main` (patches) or offers nothing (components). The
  mesh repos above are living proof. [code + gh]
- Rollback in that model = publish a new release from the older state (memory note, not
  re-verified).

What transfers to the ERP: "SCs get the latest **normal** release; `main` moves freely without
reaching anyone." What does not transfer: patches have no per-project state; the ERP pair does
(a deployed app, an installed Commerce app), so it also needs a recorded version and a
confirmed update.

---

## 5. Existing projects with the pair cloned from `main`

What they have today [code + inferred]:
- a full git clone (the catalog sets no `shallow`) on `main`, `origin` pointing at the repo;
- `componentInstances[id].version` = `0.1.0` (both repos' `package.json`, [gh]), because there
  is no tag to find; `repoUrl` set; `branch: 'main'`;
- `componentVersions[id]` = `0.1.0` (filled on load);
- `appBuilderComponents[id].source = { owner, repo, branch: 'main' }`;
- for the integration, `installation.version` = whatever `metadata.version` Commerce last
  took (`0.3.0` on `main` today, [gh]).

**The latent collision, which the migration must close first.** The generic check already
iterates these instances and resolves their repo through `repoUrl` (`updateManager.ts:105-149`).
It stops only at "no release" (`:199-201`). Once a release newer than `0.1.0` exists, "Check for
Updates" will list `demo-erp` and `erp-integration` for every project that has them. Applying
it would delete the clone, unzip without `.git`, `npm install`, and **not redeploy**. The next
integration Update would then fail at `git rev-parse HEAD`. [code for each step; the end-to-end
result is inferred, not run]

What the migration must do:
1. **Exclude App Builder components from the generic updater** (anything with an
   `appBuilderComponents[id]` record) before the first release is cut. This also covers the
   starter kit and the shell, which have the same exposure.
2. **Move to a tag, not re-clone**: `git fetch origin tag <tag>` then fast-forward to it. A clone
   of `main` whose HEAD is an ancestor of the tag moves cleanly. [inferred]
3. **Clones ahead of the first release**: a project cloned from `main` after the release commit
   is *ahead* of the tag. Fast-forward refuses it ("has commits the branch does not"), and
   `checkCloneForUpdate` reports "current". That is safe, but it stays on unreleased code until a
   newer release passes it. Cutting the first release at today's `main` tip keeps this set to
   zero for existing projects. [inferred]
4. **Record the released version** on the project after a successful update (e.g. the tag on the
   App Builder record). Projects with no record read as "unreleased `main`" and are offered the
   latest release. No prompt, no forced change: the existing Update button does it. [inferred]
5. Keep the `main` fallback when a repo has no release (the patches rule). Then a project behaves
   exactly as today until the first release exists. [inferred]

---

## 6. What the two ERP repos need

Today [gh]: no releases, no tags, no `.github/workflows` in either repo; `package.json` version
`0.1.0` in both; `commerce-erp-integration` has `metadata.version: "0.3.0"` in
`app.commerce.config.ts`, with a comment saying to bump it whenever registrations change. `demo-erp`
has no App Management config (it is a plain App Builder app), so `package.json` is its only
version.

Needed:
- **Normal (not pre-) releases**, semver tags `vX.Y.Z`. With the default channel `stable`, a
  prerelease is invisible (§1 table).
- **A version source of truth.** Today there are two disagreeing numbers in the integration repo:
  `package.json` 0.1.0 and `metadata.version` 0.3.0. They mean different things: the tag is "which
  code", `metadata.version` is "what Commerce should re-register". A release that changes only
  action code need not bump `metadata.version`; a release that changes a webhook must. Suggest:
  tag = `package.json` version; `metadata.version` stays independent and is bumped by the rule
  already in the file. [inferred, owner decision]
- **Pair compatibility.** The pair updates together in a fixed order, and the integration reads the
  system's address. If the two repos release independently, "latest demo-erp" plus "latest
  integration" is not guaranteed to work together. Options: release both together with matching
  versions, or declare a minimum system version in the integration. [inferred, owner decision]
- A release workflow is optional. The only delivered repo with any workflows is
  `eds-demo-patches` and `headless-commerce-mesh` (deploy/test, not release) [gh]. Releases have
  been cut by hand everywhere I looked.

---

## 7. Can an update be undone?

**Generic path:** only a *failed* update is undone, by restoring the snapshot
(`componentUpdater.ts:141-191`). A *successful* update deletes the snapshot (`:137-139`). There
is no "go back to the previous version" command. [code]

**Integration path:** nothing is undone. The previous commit is not saved. A failure after the
fetch leaves new code in the folder with the old deployment still live and the card on "error";
the card's Update/Retry then redeploys forward (`integrationUpdateHandlers.ts:163-166`,
runner `:1077-1081`). [code]

**What undo would mean here** [inferred]:
- *Code*: easy once releases exist. Move the clone back to the previous tag (only possible by
  checkout, not fast-forward) and redeploy. Recording the previous tag on update is what makes this
  possible.
- *Adobe Runtime*: redeploying older code replaces the actions. That is a normal deploy.
- *Commerce*: the hard part. lib-app 2.x upgrades when `metadata.version` **changes**
  (`appManagementUpgrade.ts:1-12`). Whether it accepts a *lower* version, and whether it removes
  webhooks/events the newer version added, is **not established**. The fallback that is known to
  work is the existing confirmed reinstall (uninstall, then install), which the code offers when
  Commerce refuses an in-place upgrade (`base.ts:303`).

Under non-negotiable 1 ("whatever can be done can be undone"), an update that cannot be reversed
is a finding. The honest shape today: code and Runtime can be reversed; Commerce reversal is
"reinstall", and data the ERP wrote into Commerce is not part of any update undo.

---

## Recommended shape (smallest change)

Keep the integration's own updater. Change what it points at, and stop the generic one touching it.

1. **Fence the generic updater.** In `UpdateManager.checkAllProjectsForUpdates`, skip any id that
   has an `appBuilderComponents` record. Do this first; it is a safety fix whether or not the rest
   ships.
2. **Resolve the target ref like the patches repo.** A small shared helper: latest release for the
   channel (reuse `selectLatestForChannel`), else the catalog `branch`. Normal releases for stable,
   `-beta.N` for beta. Probably lift `resolvePatchRef` and `UpdateManager.fetchLatestRelease`'s
   channel logic into that one helper instead of adding a third copy. The channel logic already
   exists twice with different rules: `componentInstallation.ts:293-340` takes `releases[0]` for
   beta with no track filter.
3. **Check and fetch to that ref.** `checkCloneForUpdate` / `fastForwardClone` take a ref instead of
   a branch (`git fetch origin tag vX` / `refs/tags/vX`), everything else unchanged: edit
   refusal, tooling-owned restore, install, redeploy, Commerce upgrade, pair order.
4. **Clone at the release on add.** `buildDefinition` (`appBuilderComponentRunner.ts:374-396`)
   passes the resolved tag, so a new project starts on the same release an update would give an
   old one (creation and regeneration agree).
5. **Record the release** on `appBuilderComponents[id]` (tag, plus the previous tag) after a
   successful update or add. This is what makes "which version" and a later undo possible.
6. **Show it in both places.** The card keeps its Update. Optionally list the pair in "Check for
   Updates" as its own item kind that calls the same handler, so all projects are covered.
   The agent tools already exist (`update_integration`, `check_integration_updates`).
7. **Repos:** cut `v0.x.y` normal releases of both at today's `main` tip, together.

What this deliberately does *not* do: send the pair through `componentUpdater`'s zip-replace.
That would delete the clone and has no deploy step.

---

## Open questions for the owner

1. Release the pair **together** (same version) or **independently** with a declared minimum?
2. Should the pair appear in the all-projects "Check for Updates" list, or stay on the card only?
   The card today checks one project, and only when its screen is opened.
3. Version truth: tag = `package.json`, with `metadata.version` independent? Or require them equal?
4. Should the ERP follow the beta channel for SCs on beta (`-beta.N` releases), or be stable-only?
5. What should "undo an update" do for Commerce: redeploy the old code and accept the Commerce
   state, or always reinstall?
6. Separate from ERP: the mesh repos and `citisignal-nextjs` have only prereleases, so stable-channel
   SCs are never offered their updates. Intended?

## Could not establish

- Whether lib-app 2.x `upgradeMode: "auto"` accepts a **lower** `metadata.version` (a downgrade),
  and what it does with registrations the newer version added.
- Whether any real project has `componentVersions['demo-erp']` = `'unknown'` (that would make the
  generic updater offer it even against a non-semver tag). I did not read any SC's project files.
- `PMET-public/commerce-demo-ingestion` releases: 404 to an anonymous read (private, or none).
- The end-to-end result of the latent collision in §5 was reasoned from code, not run.
- Whether `git fetch origin tag vX` works on every existing clone (e.g. one whose `origin` was
  rewritten by a workspace relocation, `componentRelocation.ts`). Not checked.

## Aside, found on the way (not ERP)

`sidebarProvider.ts:639` runs `demoBuilder.checkUpdates`, a command that is not registered (the
real id is `demoBuilder.checkForUpdates`). It is unreachable today: `Sidebar.tsx:75` ignores
`onCheckUpdates`. The test pins the wrong id
(`tests/features/sidebar/providers/sidebarProvider-messages.test.ts:63`). This is dead code:
delete or fix?
