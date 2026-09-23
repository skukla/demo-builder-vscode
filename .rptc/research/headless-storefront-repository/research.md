# Research: a headless project keeps its code in a repository of the SC's own (EDS-13g)

Researched 2026-09-15 on `feature/colleague-storefront` at `7e061d2ab`. Read-only. All paths are
relative to the worktree root. "Live read" means a public, unauthenticated GitHub GET made on
2026-09-15; it can change. "Local experiment" means a git/bash run in a scratch directory, not
against GitHub.

## Read this first: four things found on the way

These are defects or false claims in code that exists today. None is fixed (this was read-only).
Each needs "fix now or defer?".

1. **A component update deletes every folder of the component.** `componentUpdater.ts:428-430`
   extracts with `unzip … && mv "$T"/*/* "$T"/ && rm -rf "$T"/*/`. The `rm` glob matches the
   folders that `mv` just moved up, not only the archive's root folder. Local experiment: a zip
   holding `package.json`, `.gitignore` and `sub/x` left only `package.json`. Verification checks
   only `package.json` (`:243-259`), so the update "succeeds". Dotfiles (`.gitignore`) are lost
   too, because bash `*` skips them. This hits any component updated this way, headless and mesh.
2. **Change source does not change where a headless reset clones from.** The handler rewrites
   `project.demo` and only the `eds-storefront` instance metadata (`changeDemoSourceHandler.ts:32-43`).
   Headless reset re-clones from `componentInstances.headless.repoUrl` (`projectResetService.ts:170-181`),
   and the update check reads the same field (`updateManager.ts:266-276`). Neither moves. The
   resolver's header claims every reset reads through it (`storefrontResolver.ts:6-9`); headless
   reset does not.
3. **`create_project` tells the agent a headless project can be synced.** Its headless answer hints
   `sync_storefront` (`createProjectTool.ts:244`). That tool refuses any project without an
   `eds-storefront` instance (`src/mcp/projectSecurity.ts:176-178`).
4. **The home Chat's auto-sync hook is not limited to Edge Delivery.** It commits and pushes any
   repo under the projects root that has an `origin` (`claudeSettingsWriter.ts:376-398`; installed by
   `homeAiContextWriter.ts:96-102`). A headless clone's `origin` is its SOURCE
   (`componentInstallation.ts:69`, cloned from the source URL). An agent edit in a headless clone
   therefore commits locally and tries to push to `skukla/citisignal-nextjs` or a colleague's repo.
   An SC without write access gets a failed push; anyone with write access pushes to the source.

---

## 1. Headless creation today

**What runs (facts).**

- Stacks: `headless-paas` / `headless-accs` have `frontend: "headless"` and no
  `requiresGitHub`/`requiresDaLive`; both EDS stacks set both (`stacks.json`).
- The wizard hides the Storefront area and the Publish Storefront step for headless: both use
  `stackRequiresAny: ['requiresGitHub','requiresDaLive']` (`buildYourProjectAreas.ts:51-56`,
  `wizard-steps.json` `storefront-setup`).
- The frontend source comes from the demo package's storefront row
  (`wizardHelpers.ts:498-507`). CitiSignal headless: `https://github.com/skukla/citisignal-nextjs`,
  `branch: master`, `shallow: false`, no tag (`demo-packages.json:212-230`). An added headless demo
  gets `branch ?? 'main'`, `shallow: true` (`storefrontResolver.ts:138-152`). The catalog entry
  `headless` has no `source` of its own (`components.json:54-78`).
- `executeProjectCreation` (`executor.ts:158-459`) → `loadComponentDefinitions` swaps in
  `frontendSource` for non-EDS (`executorComponentLoading.ts:73-86`) → `cloneAllComponents` /
  `installAllComponents` (`executor.ts:326-327`) → `ComponentInstallation.installGitComponent`.
- Clone (`componentInstallation.ts:39-190`): target `<project>/components/headless`; deletes any
  existing folder first (`:57-65`); records `repoUrl = source url`, `branch`, `path` (`:69-71`).
  **Tag vs branch:** only when the source declares `gitOptions.tag` does it ask GitHub for the
  latest release (channel default `'beta'` here, `:302-304`) and clone that tag; otherwise it
  clones the branch (`:86-125`). `--depth=1` when `shallow` (`:128-130`). Plain `git clone` of an
  https URL with no token (`:132-145`). Writes `.node-version` (`:184`). Version = exact tag, else
  `package.json` version, else short sha (`:198-260`).
- `.env` is generated into the clone. File name is `.env.local` only when the component id
  contains `nextjs`; the id is `headless`, so it is `.env` (`envFileGenerator.ts:292-294`).
- Instance shape (`componentManager.ts:59-67` + above): `id, name, type, status, repoUrl, branch,
  path, version, metadata: { nodeVersion }`. No repository field.

**GitHub sign-in:** not required anywhere on the headless path. The clone and the release lookup
are unauthenticated. A private colleague repo would depend on the machine's own git credentials
(not verified).

**EDS contrast (facts).**

- The SC's repo is created BEFORE `executeProjectCreation`, either by the wizard's "Create
  Repository" button (`RepoSelectionInline.tsx:259-329` → `create-github-repo` →
  `handleCreateGitHubRepo`, `edsGitHubHandlers.ts:395-445`) or inside storefront setup phase 1
  (`storefrontSetupPhase1.ts:394-469`). Both call `createRepoFromSource` (`:355-389`).
- `createRepoFromSource`: shipped brand → `generate` from a GitHub template. Added demo → read
  `isTemplate` live; template → `generate`; else `createEmptyRepository` + git-based
  `resetToTemplate` onto the source's default branch.
- Choices: repo name from the wizard, normalised (`RepoSelectionInline.tsx:243-252`); private is
  hard-coded `false` in the wizard (`:288`) and defaults `false` in the pipeline
  (`storefrontSetupPhase1.ts:425`); namespace is the DA.live org picker value in the pipeline
  (`:426`) but the wizard button passes none, so it creates under the signed-in user
  (`edsGitHubHandlers.ts:411-417`).
- The executor then clones the SC's repo, `branch: 'main'` (`executorComponentLoading.ts:63-71`), and
  writes `githubRepo`, `templateOwner/Repo/Branch`, `lastSyncedCommit` into
  `eds-storefront` metadata (`executorEdsPhase.ts:91-99`).

**Does `createRepoFromSource` fit headless?** Mostly, with two changes:

- CitiSignal's source is not a GitHub template (live read: `is_template: false`,
  `default_branch: master`). The non-added-demo branch calls `generate` without checking, which would
  fail for it. The "read `isTemplate` live" branch works for any source; it is currently keyed on a
  flag named `fromAddedDemo`.
- It returns a remote repo only. Headless also needs the executor to clone the SC's repo instead of
  the source, and record the repo on the instance.

## 2. Updates today

**Headless (facts).** Check Updates → `UpdateManager.checkAllProjectsForUpdates`
(`checkUpdates.ts:92-99`). Repo resolved from `components.json`, else from `instance.repoUrl`
(`updateManager.ts:266-276`); headless has no catalog source, so it is the source URL. Compares
GitHub Releases by semver (`:151-162`); channel default `stable` (`package.json` `updateChannel`).
Live read: all four `citisignal-nextjs` releases are prereleases, so on `stable` nothing is offered.
Apply → `ComponentUpdater.updateComponent` (`componentUpdater.ts:55-195`): snapshot without
`node_modules`, back up `.env`/`.env.local`, delete the folder, download the release zipball,
extract, `npm install`, merge env, delete snapshot on success. The zipball has no `.git`, so an
updated clone is no longer a git repo (inference from GitHub archive format; not tested here). Local
edits are overwritten; only env files are carried. Plus finding 1 above.

**EDS (facts).** `TemplateUpdateChecker` compares `lastSyncedCommit` with the template's branch head
(or the LKG pointer) (`templateUpdateChecker.ts:79-98, 206-244`), read from `eds-storefront`
metadata only (`:115`; `getTemplateSource`, `updateTypes.ts:90-101`). Apply →
`TemplateSyncService.syncWithTemplate` (`templateSyncService.ts:88-152`): clone the SC's repo into a
temp dir, fetch the template, `merge --no-commit`; **on any conflict it aborts and falls back to a
full reset** (`:228-252`), preserving only `fstab.yaml` and `config.json` (`:57-60`), then pushes.
It hard-codes `main` for both the SC's branch and the template branch (`:188, 207, 217, 285, 348,
367, 415, 452`), even though the checker honours `templateBranch`. Fork sync
(`checkUpdates.ts:363-398`) offers GitHub's fork-sync when the template source is a fork.

**What a headless repo would need.**

- The release path cannot stay as is: it removes `.git`, targets whatever `repoUrl` says (after the
  change that would be the SC's repo, which has no releases, so updates would silently stop), and
  overwrites edits.
- The template path is the natural fit (a repo in the SC's account kept in step with a source), but
  needs: an instance-agnostic metadata read (not `eds-storefront` only), the branch honoured
  (`master` for CitiSignal), a headless preserve list, and a decision on the conflict-→-reset fallback
  (principle 2). It updates the remote only; the local clone catches up on the next Sync's
  fast-forward.

## 3. Reset today

**Headless (facts).** Dispatch on `isEdsProject` (`projectManagementHandlers.ts:78-118`; also
`projects-dashboard/handlers/dashboardHandlers.ts:819-860`). `resetProjectWithUI`
(`projectResetService.ts:360-518`): modal confirm "delete all components and re-install"
(`:373-377`), stop demo, `rm -rf components/` (`:423-430`), `componentInstances = {}` (`:433`),
re-clone from each saved `repoUrl`/`branch` with no tag or shallow options (`:170-181`), npm install,
regenerate env, redeploy mesh. **Uncommitted and committed local edits are deleted; nothing is
checked or kept.** Wiping `componentInstances` also drops any metadata a future repo field would
live in unless the clone step re-writes it.

**EDS (facts).** `executeEdsReset` (`edsResetService.ts:361-463`) → `resetRepoToTemplate`
(`edsResetRepoHelper.ts:226-372`): builds file overrides, picks the ref (`project.demo` branch, or
LKG, else `main`, `:262-282`), then `githubFileOps.resetRepoToTemplate` replaces the tree through the
Git Tree API with one commit whose parent is the current head, force-updating `main`
(`githubFileOperations.ts:762-880`; target branch hard-coded `main` at `:775`). The description file
is carried through (`sharedDemoFile.ts:75-85`). Then block libraries, smart-404, Quick Edit, code
sync, config, content, mesh. **It never touches the local clone** (grep of `services/reset/` finds
no git/exec calls; the only `.path` read is the mesh's, which is the positive control). Local
uncommitted edits survive on disk; the next Sync fast-forwards over the reset commit and then
commits those edits on top (inference from `storefrontSyncService.ts:134-151`).

**For headless with a repo.** The Tree-API reset fits the "rewrite the repository" half. The
"refresh the clone" half does not exist anywhere yet. Principle 2 needs a rule for what happens to
the clone's uncommitted edits (see design questions).

## 4. Sync

**Flow (facts, `storefrontSyncService.ts:125-167`).** `pull --ff-only` best effort (`:186-198`) →
`add -A` → `commit` (stop if nothing) → `push <token-url> HEAD` (`:278-292`) → Helix
preview+publish of `/` only when repo + GitHub token + DA.live token are present (`:113-115, 154-163`).
Rejections are typed `non-fast-forward` vs `ruleset` (`:295-315`).

**EDS-only parts.**

- Helix publish (skipped automatically without a DA.live token or repo).
- `SyncStorefrontCommand` refuses without an `eds-storefront` path (`syncStorefront.ts:59-65`),
  reads `githubRepo` from that instance (`:524-535`), reads a DA.live token, and auto-takes the
  remote copy of `config.json`/`fstab.yaml` in rebase conflicts (`managedStorefrontFiles.ts:19`).
- MCP `sync_storefront` (`src/mcp-server.ts:207-230` → `src/mcp/storefrontSyncHandler.ts`) resolves
  the path and repo from `componentInstances['eds-storefront']` only
  (`projectSecurity.ts:173-181`, `storefrontSyncHandler.ts:39-40`).
- Dashboard: "Sync Storefront" menu item shown only when `isEds` (`ActionGrid.tsx:659-661`).

**Reuse for headless.** `syncAndPublish` already works without Helix. A headless Sync needs: the
path/repo lookup generalised to the frontend instance; `origin` pointing at the SC's repo (today it
is the source); a branch checkout, not a tag (local experiment: `push <url> HEAD` from a tag clone
fails with "not a full refname"); an empty managed-file set; and a secrets check before `add -A`
(CitiSignal's `.gitignore` ignores `.env*`, live read; a colleague's may not).

## 5. Project deletion

**Facts.** `deleteProject` (`projectDeletionService.ts:108-212`) uses `isEdsProject` from
`resourceCleanupHelpers.ts:90-95` (key `eds-storefront` present — a different test from
`typeGuards.ts:304-306`, which reads `selectedStack`). Repo found by `extractEdsMetadata` →
`metadata.githubRepo` (`resourceCleanupHelpers.ts:102-125`). `demoBuilder.cleanupBehavior`
(`ask`/`deleteAll`/`localOnly`, `package.json`) drives a QuickPick of "Delete Repository" / "Delete
DA.live Site", unticked by default (`:261-390`). Repo deletion: token or `getSession` with
`delete_repo` (`:556-617`) → `deleteRepository` (`githubRepoOperations.ts:449-470`). Headless gets a
plain modal and local delete only (`:132-149`). `CleanupService` (`eds/services/cleanupService.ts`)
is used only to roll back a cancelled storefront setup (`storefrontSetupHandlers.ts:400-431`), not
by project deletion. MCP `delete_project` is local only (`deleteProjectTool.ts:6-9`);
`delete_github_repo` deletes any named repo behind a typed-name confirm, with no project linkage
(`cloudResourceTools.ts:232-275`). "Manage GitHub Repositories" labels repos linked to EDS projects
only (`manageGitHubRepos.ts:103-114`).

**Needs for headless.** Read the repo from wherever headless records it; offer only the repository
row (no DA.live row); keep the local delete unchanged. The `isEdsProject` duplicate with different
semantics is in reach of that change.

## 6. Save as demo package

**Every EDS assumption (facts).**

| Where | Assumption |
|---|---|
| `demoPackageHandlers.ts:47-48, 67-70` | `EDS_ONLY` refusal when `ownStorefrontOf` is undefined |
| `demoPackageService.ts:46-56` | `ownStorefrontOf` needs BOTH `getEdsRepoParts` and `getEdsDaLiveTarget`; both return undefined unless `selectedStack` starts `eds-` (`typeGuards.ts:322-375`) |
| `demoPackageHandlers.ts:106, 137` + `demoPackageService.ts:166-180` | content index resolved from DA.live org/site |
| `demoPackageService.ts:142` | `contentSource` always written |
| `demoPackageService.ts:210-219` | "index" check (published pages) always added, with a `republish` action |
| `demoPackageService.ts:130, 141` | `blockLibraries` from `selectedBlockLibraries` (EDS concept) |
| `demoPackageHandlers.ts:127` | card `storefrontKind: 'eds'` hard-coded |
| `ActionGrid.tsx:656-658`; `DemoSourceNotice.tsx:28-32` | menu item and the notice's Save button hidden for non-EDS |
| `demoPackageTools.ts` preview description | says "Edge Delivery projects only" |

Not EDS-specific: the file write with sha ownership (`sharedDemoFile.ts:39-61`) works for any GitHub
repo; store codes, flags, `requiresMesh`, datapack and integrations (`demoPackageService.ts:119-144`)
are stack-neutral; the repository/datapack/custom-app checks are neutral.

**Headless shape.** `SharedDemoDescription` (`projectFile.ts:66-76`) already makes `contentSource`
and `blockLibraries` optional, and the add side already reads the file from a headless repo before
branching on kind (`sharedDemoProbe.ts:117-146`). So: `contentSource` omitted, index check omitted,
`storefrontKind: 'headless'`, repo from the headless record. The file write lands on GitHub only;
the local clone catches up on the next Sync. A headless reset must carry the file the way EDS reset
does.

## 7. Where the repository is stored

**Facts.** EDS: `componentInstances['eds-storefront'].metadata.githubRepo` (`owner/repo`), plus
`repoUrl`, `daLiveOrg`, `templateOwner/Repo/Branch`, `lastSyncedCommit`, `lkgSource`
(`executorEdsPhase.ts:91-99`). Read through `getEdsGithubRepo` / `getEdsRepoParts`
(`typeGuards.ts:346-375`), both gated on an EDS stack. `ComponentInstance.metadata` is a free
`Record<string, unknown>` (`types/base.ts:337-352`); the manifest schema keys instances by id
(`core/state/config/manifest.schema.json:27-32`).

Headless has no equivalent. `componentInstances.headless.repoUrl` holds the SOURCE URL and is
overloaded: reset re-clones from it and updates compare releases on it. An existing headless
project on disk has: that `repoUrl`, `branch` (`master` for CitiSignal), `path`, `version`,
`metadata.nodeVersion`, and a clone whose `origin` is the source (derived from the code above; no
real project file was read). Added-demo projects also carry `project.demo` (`projectFile.ts:103-107`).

## 8. Agent surface

| Action | EDS | Headless today |
|---|---|---|
| Create | `create_project` → `createEds` (GitHub + DA.live auth, `repoName`, `githubOwner`) | `createHeadless`, no GitHub (`createProjectTool.ts:196-247, 488-490`) |
| Reset | `reset_eds_project` (guard `requireEdsProject`, `edsToolGuards.ts:33-48`) | **no tool** (list of registered names and `docs/systems/mcp-tools.md` show no headless reset) |
| Sync | `sync_storefront` | refused (`projectSecurity.ts:176-178`); the create hint says otherwise (finding 3) |
| Update | `apply_updates` (fork, template, components …) | same tool, component path |
| Delete | `delete_project` (local) + `delete_github_repo` (any repo) | `delete_project` only; nothing to delete remotely |
| Save as package | `get_demo_package_preview` / `save_demo_package` / `remove_demo_package` | refused by the shared handler |
| Change source | `change_demo_source` | accepted, but see finding 2 |

## 9. Other "headless has no repository" assumptions

- Export: "This project has no storefront of its own." and the storefront part disabled
  (`ExportModal.tsx:48, 246-249`).
- Demo-package handler header and notice comments state it (`demoPackageHandlers.ts:10-13`,
  `DemoSourceNotice.tsx:28-32`).
- Template sync, template check, fork check, auto-sync per-project hook path, MCP sync all key on
  `COMPONENT_IDS.EDS_STOREFRONT` (`templateSyncService.ts:93`, `templateUpdateChecker.ts:115`,
  `updateTypes.ts:93`, `claudeSettingsWriter.ts:253-255`, `projectSecurity.ts:176`).
- "D27": the label appears only in the backlog item. The decision it names is recorded unlabelled as
  "Decided: Share is Edge Delivery only in v1" (`.rptc/plans/shareable-demo/overview.md:279-287`).
  Not verified that D27 is that decision.

---

## (a) Reuse map

| Existing piece | Verdict | Note |
|---|---|---|
| `createRepoFromSource` (`storefrontSetupPhase1.ts:355`) | extend | always read `isTemplate` live; rename the `fromAddedDemo` flag |
| `createEmptyRepository`, `deleteRepository`, `getRepository` | reuse as is | |
| `RepoSelectionInline` / Storefront area | extend or build new | EDS area also carries DA.live, Code Sync, block libraries; headless needs name + GitHub sign-in only |
| `GitHubServiceCard` + `useGitHubAuth` | reuse as is | |
| `installGitComponent` clone | extend | clone the SC's repo on a branch; record the repo; no tag |
| `syncAndPublish` | reuse as is | Helix already optional |
| `SyncStorefrontCommand`, MCP `sync_storefront` lookup | extend | resolve the frontend instance, not `eds-storefront` only |
| `managedStorefrontFiles` | extend | empty set for headless |
| Git Tree reset (`githubFileOperations.resetRepoToTemplate`) | reuse | target `main` hard-coded; branch of source must be passed |
| `projectResetService` | extend | rewrite repo, then refresh clone; stop wiping repo metadata |
| Local clone refresh after reset | build new | exists for neither stack |
| `TemplateUpdateChecker` / `TemplateSyncService` | extend | instance-agnostic read; honour branch; headless preserve list |
| `ComponentUpdater` for headless frontend | replace for headless | and fix finding 1 for everyone |
| `projectDeletionService` cleanup QuickPick | extend | repository row only |
| `writeSharedDemoFile` / `removeSharedDemoFile` / `carrySharedDemoFile` | reuse as is | |
| `describeProject` / `packageChecks` | extend | omit content source and index check for headless |
| `sharedDemoProbe` (add side) | reuse as is | already reads a headless repo's file |
| `getEdsRepoParts` / `getEdsGithubRepo` | build new sibling | a stack-neutral "own storefront repo" accessor |
| Home auto-sync hook | extend | must not push to a source (finding 4) |

## (b) Design questions for the owner

1. **Where the repository step lives in the wizard.** Recommended: a small Storefront area for
   headless (repo name + GitHub sign-in), with the repo created during Create Project, after the
   confirmation the Review step already is. Why: the EDS "Create Repository" button creates a cloud
   resource before the SC has confirmed anything and leaves an orphan if they back out; creation-time
   is also where the agent path already confirms (`create_project` `confirm:true`).
2. **Private or public by default.** Recommended: public, same as Edge Delivery today (hard-coded
   `false`, `RepoSelectionInline.tsx:288`). Why: a demo package a colleague adds must be readable
   (`packageChecks` flags private), and the source is already public. Offer no switch in v1; revisit
   if SCs ask.
3. **Update model.** Recommended: the template model (merge the source into the SC's repo, then
   fast-forward the clone on Sync), not release zipballs. Why: the release path deletes `.git` and
   overwrites edits, and would find no releases on the SC's repo. Needs one sub-decision: on merge
   conflict, stop and report instead of today's silent fallback to a full reset.
4. **What reset does to uncommitted local edits.** Recommended: before rewriting, if the clone is
   dirty or has unpushed commits, say so and offer "Sync first" or "Discard and reset"; never discard
   silently. Why: principle 2; today headless reset deletes them without a word and EDS reset leaves
   them to re-apply on the next Sync, so neither returns to zero cleanly.
5. **Existing headless projects: what they are offered, and when.** Recommended: a one-time offer on
   the first Sync, on Save as demo package, and a dashboard notice; never automatic. It creates the
   repo from the CURRENT clone (so local edits become the first commit), then repoints `origin`.
   Why: principle 3 without a cloud write nobody asked for (principle 5). Note: a shallow clone
   (added demos) cannot be pushed to an empty repo (local experiment: "shallow update not allowed";
   GitHub not tested), so such projects need a fresh tree commit, not a push of history.
6. **Namespace.** Recommended: personal account only, as D28 decided for forks. Why: one owner, and
   deletion stays reversible by the person who created it.
7. **Does the running storefront read only local disk?** Recommended: yes, as the owner framed it;
   the repository is backup and sharing only. Why: nothing about the dev server needs to change.

## (c) Risks, by principle

1. **Reversibility.** Creation that fails after the repo exists leaves an orphan; the executor has no
   headless rollback (EDS has `CleanupService` only for a cancelled setup). Deletion must learn the
   headless repo or the new capability ships without its reversal.
2. **Never overwrite user edits.** Reset (both stacks), the component updater (finding 1) and the
   template sync's conflict fallback all discard edits today. Migrating an existing project must not
   re-clone over its working tree.
3. **Existing projects keep working.** `repoUrl` is overloaded (source for reset and updates). Moving
   it to mean "the SC's repo" silently changes both for old projects; a new field is safer. Headless
   reset wipes instance metadata (`projectResetService.ts:433`), which would lose the new field.
4. **Public repo / secrets.** Sync runs `add -A`. `.env` holds Commerce values; CitiSignal ignores
   `.env*`, a colleague's repo may not, and finding 1 already deletes `.gitignore` on update. A
   public repo makes that a leak. Check before commit.
5. **Cloud operations confirmed.** The home hook (finding 4) pushes without confirmation, and today it
   targets the source. Any new headless Sync, reset or migration must be confirmed and must never push
   to a repository the project does not own.
