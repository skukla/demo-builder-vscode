# A headless project keeps its code in a repository of its own — feature plan

Item: [[EDS-13g]] (`.rptc/backlog/2026-09-15-headless-storefront-repository.md`). Parent
program [[EDS-13]]. Research: `.rptc/research/headless-storefront-repository/research.md`.
Written 2026-09-15 on `feature/headless-storefront-repository` at `700487408`; revised the
same day after the owner answered Q1-Q8 and after `origin/develop` moved to `9dbdfbaa7`.

Every path and line below was read on 2026-09-15. Two sources, named where it matters:

- **This branch** (`700487408`, and `origin/feature/colleague-storefront` at `8d1669050`,
  which is this branch plus five commits) for files `origin/develop` has not changed.
- **`origin/develop` at `9dbdfbaa7`** for files it has changed (templateSyncService,
  templateMergeBase, templateCommitResolver, githubFileOperations, archiveFile,
  edsResetRepoHelper, edsResetService, executorEdsPhase, updateExecutor,
  updateApplyService, claudeSettingsWriter, homeAiContextWriter, componentUpdater). Those
  line numbers shift by a few lines once step 01 merges the two histories.

"Fact" means what the code does today. "Design" means what this plan says it should do.

## Goal, in the SC's words

"My Next.js demo lives in a GitHub repository of mine, the same way my Edge Delivery demos
do. It still runs from my computer. When I reset, update, save it as a demo package or
delete it, the extension does what it does for Edge Delivery, minus the parts headless
does not have."

## Owner decisions (2026-09-15)

Binding. Decisions 1-7 came from the research; 5 was revised when the owner answered Q4.

| # | Question | Decision |
|---|---|---|
| 1 | Where the repository step lives | Reuse the Edge Delivery wizard flow as far as possible: the same Storefront area and repository step; the repository is created during Create Project, after Review |
| 2 | Private or public | Public |
| 3 | Update model | One workflow for both storefront kinds: synthesize and consolidate, not two parallel paths. Updates, Sync, reset and deletion follow the Edge Delivery paths |
| 4 | Reset with uncommitted local edits | Say so, offer "Sync first" or "Discard and reset", never discard silently |
| 5 | Existing headless projects (revised) | Nothing special: the next headless project the SC builds has a repository. A headless project created before this feature keeps running as today. Reset, Sync and Save as demo package on it do not act and say one sentence: "This project was created before headless projects had a GitHub repository. Create a new project to use this." Edit keeps working without creating a repository. No repository is created by reset |
| 6 | Namespace | Personal account, as Edge Delivery |
| 7 | Where the running storefront reads from | Local disk only; the repository is backup and sharing |

Answers to the plan's questions, same day, also binding:

| # | Answer |
|---|---|
| Q1 | Yes: Edge Delivery reset also warns about unsaved local changes (only when the clone has uncommitted changes or unpushed commits; otherwise silent) and refreshes the local clone. The warning is a modal: "Sync first" / "Discard and reset" / Cancel |
| Q2 | Yes: the same guard runs before Edit re-clones, both kinds, and appears only when there is something to lose |
| Q3 | A headless SC can pick an existing repository, as Edge Delivery allows. The Browse list's readiness check recognises a Next.js storefront, and the existing-repository "Reset to <demo>" option stays |
| Q4 | Replaced decision 5 (above) |
| Q5 | Follow the existing pattern: a failed Create Project deletes only a mesh it created in that run; a repository it created is left, and a retry reuses it |
| Q6 | Rename `reset_eds_project` to `reset_project`, deleted not aliased; Edge Delivery-only inputs refused for headless with a sentence |
| Q7 | Follow Edge Delivery: headless reset returns the storefront to its source and redeploys the mesh; it stops re-cloning the mesh and apps |
| Q8 | Done on `origin/develop` (below); step 01 brings it in |

## Facts that shape the design

- **Edge Delivery creates its repository early, and has to.** The wizard's Create button
  (`RepoSelectionInline.tsx:259-329` → `create-github-repo` → `edsGitHubHandlers.ts:395-445`
  → `createRepoFromSource`, `storefrontSetupPhase1.ts:355-389`) runs before Review because
  the Code Sync sub-step then checks the AEM Code Sync app on that repository
  (`RepoSelectionInline.tsx:415-424`). Headless has no Code Sync, so nothing needs the
  repository before Create Project. **EDS's early button stays as it is.**
- **What EDS reset does to local edits today.** Nothing: no file under
  `src/features/eds/services/reset/` runs git or a shell command (grep count 0 on this
  branch; control on `services/storefront/` counts 1). The repository is rewritten on
  GitHub and the clone is left behind (research §3). Headless reset deletes `components/`
  and re-clones (`projectResetService.ts:423-433`): every local edit is gone, unasked.
- **Headless creation needs no GitHub sign-in today** (research §1). It will now.
- **Fixed on `origin/develop` today, not yet on this branch** (the old defects 1-3):
  - Reset keeps binary files and executable bits (merge `7316132dd`): the archive is read
    as bytes with each entry's mode (`archiveFile.ts:17-33`), binaries go up as blobs
    (`githubFileOperations.ts:790-821`).
  - Reset records `lastSyncedCommit` (merge `6b6815acd`): `resolveTemplateCommitSha`
    (`templateCommitResolver.ts:38-70`) is shared by creation (`executorEdsPhase.ts:74-78`)
    and reset, which pins its download to that sha (`edsResetRepoHelper.ts:292-304`) and
    records it (`edsResetService.ts:267-275`, called at `:462`).
  - Template updates (merge `9dbdfbaa7`, EDS-14): no `git merge`; the template's diff from
    the recorded `lastSyncedCommit` to `template/main` is applied 3-way
    (`templateMergeBase.ts:122-141`); a conflict stops and names files
    (`templateSyncService.ts:279-286`); no recorded version answers "reset once"
    (`:94-95, 183-186`); a recorded version not on the template's `main` is refused
    (`templateMergeBase.ts:64-74`). The command asks "Reset to template" in a modal
    (`templateConflictPrompt.ts:37-56`); `apply_updates` resets only with
    `resetTemplateOnConflict:true` (`applyUpdatesTool.ts:125`).
  - Also: the home Chat hook pushes only the manifest's `eds-storefront` path (merge
    `43e70398b`, `claudeSettingsWriter.ts:359-372`); component updates flatten archives in
    Node (`archiveRoot.ts`); the webview watcher fix (`f0bc8437b`).
- **Still open, and in this plan:** Edit mode re-clones every component into
  `components.tmp` and swaps it in (`executorEditMode.ts:77-116`), discarding uncommitted
  edits in either kind's clone. Step 05 guards it (Q2).
- **Every template-side branch is `main`, and not every source uses `main`.** CitiSignal's
  headless source `skukla/citisignal-nextjs` was on `master`; on 2026-09-15 it gained a
  `main` branch at the same commit (made the default) and develop's `demo-packages.json`
  now names `main` (`8bb5ff448`). `master` stays so released versions still clone, and
  headless projects created before that record `master`. An added demo records its own branch (`templateBranch`, `executorEdsPhase.ts` on this
  branch, `:74-77`). `main` is hard-coded in the resolver
  (`templateCommitResolver.ts:60`), the reset's fallback ref (`edsResetRepoHelper.ts:297`)
  and target branch (`githubFileOperations.ts:772`), and the update apply
  (`templateSyncService.ts:225, 237, 293, 307, 316`; `templateMergeBase.ts:51, 72`). The
  update checker already reads `templateBranch` (`templateUpdateChecker.ts:83-148, 210-213`
  on this branch). Steps 01, 02, 05 and 07 each take the part they touch.
- **Found while revising (verified by reading the code):**
  - **A retry of an agent EDS creation does not reuse the repository, although two hints
    say it does** (`createProjectTool.ts:338, 386`). `createEds` always sends
    `repoMode: 'new'` with no `createdRepo` (`:300-310`), so a retry reaches
    `createRepoFromSource` again, and both creators throw `REPO_EXISTS` on a taken name
    (`githubRepoOperations.ts:157, 187`). The wizard does reuse: its pre-created repository
    stays in wizard state (`storefrontSetupPhase1.ts:41-58`). See open decision A.
  - **The update-conflict "Reset to template" deletes a saved demo package's description
    file.** That reset reads the template's tree over the repository
    (`templateSyncService.ts:306-311`) and restores only `fstab.yaml` and `config.json`
    (`:114-117, 313`); `demo.demo-builder.json` (`types/projectFile.ts:46`) is not in the
    template, so it goes. The dashboard reset keeps it (`edsResetFileOverrides.ts:55-58`).
    Step 07 fixes it for both kinds.
  - An added demo whose row names a non-default branch: creation's non-template path resets
    the new repository onto the source's DEFAULT branch (`storefrontSetupPhase1.ts:386`),
    while creation records the row's branch. Not verified whether the add flow can record a
    branch other than the default. Step 03 passes the source branch, which removes the
    question.
- **Research findings #2 and #3 are fixed on this branch** (`b4136c7ac`;
  `changeDemoSourceHandler.ts:39-44`, `createProjectTool.ts:244`). #1 and #4 are the develop
  fixes above.

## The one workflow

| Stage | Edge Delivery today | Headless today | Consolidated (design) |
|---|---|---|---|
| Create | Repo created early by the wizard button or storefront setup phase 1 (`storefrontSetupPhase1.ts:394-469`); clone of the SC repo on `main` (`executorComponentLoading.ts:63-71`); repository recorded (`executorEdsPhase.ts:94-104`, develop) | Clone of the SOURCE (`executorComponentLoading.ts:73-86` → `componentInstallation.ts:39-190`); no repository | EDS unchanged. Headless: new or existing repository on the Storefront area's Repository sub-step; Create Project creates it (or resets the chosen one when asked) in a shared executor phase, clones it, and records it with the same writer EDS uses. A failed run leaves the repository; a retry reuses it (step 03) |
| Run | Nothing local; the site is live (`ActionGrid.tsx:450`) | Dev server on the local clone (`startDemo.ts:185-186`) | Unchanged (decision 7) |
| Sync | `SyncStorefrontCommand` (`syncStorefront.ts:52-150`) → `syncAndPublish` (`storefrontSyncService.ts:125-167`); menu `ActionGrid.tsx:659-661` | None | The same command and service for both, found through the repository accessor; Helix publish skipped for headless; a headless project without a repository gets the decision-5 sentence (step 04) |
| Update | `TemplateUpdateChecker` (`templateUpdateChecker.ts:79-140`) + `syncWithTemplate` (`templateSyncService.ts:145-190`, develop), appliers `updateExecutor.ts:127-212` and `updateApplyService.ts:140-179` (develop) | Release zipball through `UpdateManager` (`updateManager.ts:92-180`, repo from `repoUrl` `:266-276`) + `ComponentUpdater` (`componentUpdater.ts:56-`, develop) | The template path for both, reading the repository record and both recorded branches; storefront instances leave the zip path; a clean headless clone is fast-forwarded after the update (step 07) |
| Reset | `resetEdsProjectWithUI` (`edsResetUI.ts:379`) → `executeEdsReset` (`edsResetService.ts:376-`, develop) → Tree reset (`edsResetRepoHelper.ts:227-389`, `githubFileOperations.ts:759-889`, develop); clone untouched | `resetProjectWithUI` (`projectResetService.ts:360-518`): rm + re-clone source | One reset UI and one pipeline: source check, local-edits guard, Tree reset of the SC repo on its branch, EDS-only Helix/DA.live/config steps, local clone refresh, npm install and env for headless, mesh through `redeployApiMesh`. A headless project without a repository gets the decision-5 sentence; the old headless re-clone reset is deleted (step 05) |
| Dispatch | `projectManagementHandlers.ts:86-106`, `projects-dashboard/handlers/dashboardHandlers.ts:834-848` | `projectManagementHandlers.ts:108-117`, `dashboardHandlers.ts:850-859` | One function; both dashboards call it (step 05) |
| Delete | QuickPick with Delete Repository / Delete DA.live Site (`projectDeletionService.ts:108-213, 261-390`) | Plain modal, local only (`:132-149`) | The same QuickPick, rows by what the project has; headless gets the repository row (step 06) |
| Save as demo package | `demoPackageHandlers.ts:102-160`, `demoPackageService.ts:46-56` | Refused, `EDS_ONLY` (`demoPackageHandlers.ts:47-48, 67-70`) | Works for any project with a repository; content site and pages check only for EDS; a headless project without one gets the decision-5 sentence (step 08) |
| Agent tools | `create_project` (EDS path `createProjectTool.ts:250-398`), `sync_storefront` (`mcp-server.ts:207-231`), `reset_eds_project` (`edsResetTool.ts:51`), `apply_updates`, `delete_project` + `delete_github_repo`, demo package tools (`demoPackageTools.ts:50,69,111`) | `create_project` headless path (`:196-248`); no sync; no reset; package tools refused | Each step changes the tool on the same handler it changes for the button (steps 03-08); `reset_eds_project` becomes `reset_project` (step 05) |
| AI hooks | Per-project PostToolUse hook on the EDS path (`claudeSettingsWriter.ts:100-127, 253-255`, develop); home hook limited to the manifest's EDS storefront path (`:359-372`, develop) | None per project; home hook on this branch pushes any clone with an origin; on develop it pushes none | Both hooks read the repository record: a storefront with a recorded repository gets auto-push; a clone without one never does. AI_CONTEXT_VERSION bump (step 09) |

## Accessor design

Two accessors. Both read today's fields, so an EDS project on disk needs no migration.

**1. The project's own storefront repository** — `src/types/typeGuards.ts`, beside
`getEdsRepoParts` (`:346-356`). Pure; no `vscode`, safe in the MCP server process.

```ts
export function getStorefrontInstance(project): ComponentInstance | undefined
// componentInstances[componentSelections.frontend] ?? componentInstances['eds-storefront']

export interface StorefrontRepository {
    owner: string; repo: string; fullName: string;
    branch: string;              // instance.branch ?? 'main' (the SC repository's branch)
    path?: string;               // instance.path (the local clone)
    kind: 'eds' | 'headless';    // instance id === 'eds-storefront'
    syncedFrom?: {               // the update baseline, same record
        owner: string; repo: string; branch?: string;
        commit?: string; lkgSource?: { owner: string; repo: string; lkgFile?: string };
    };
}
export function getStorefrontRepository(project): StorefrontRepository | undefined
// undefined unless metadata.githubRepo is a well-formed owner/repo

export function getStorefrontBaseline(project): StorefrontRepository['syncedFrom']
// the same instance, WITHOUT requiring githubRepo: getTemplateSource reads it that way today
```

The record is the one EDS already writes on the storefront instance's metadata
(`githubRepo`, `templateOwner`, `templateRepo`, `templateBranch`, `lastSyncedCommit`,
`lkgSource`; `executorEdsPhase.ts:94-104` on develop plus `templateBranch` from this
branch). A headless project gets the same keys on its `headless` instance, and always
records `templateBranch` (its source is on `master`). `ComponentInstance.metadata` is a free
record (`types/base.ts:351`) and the manifest schema allows any keys
(`manifest.schema.json:375-378`): no schema change. Unlike `getEdsGithubRepo` (`:367-375`)
it is not gated on an `eds-` stack. The EDS accessors stay for what is EDS-only.

**2. The storefront's source** — `src/features/components/services/storefrontResolver.ts`,
the module that already answers "what storefront is this project on".

```ts
export interface StorefrontSource { owner: string; repo: string; branch: string; url: string }
export function getStorefrontSource(project: StorefrontLookup, packages?): StorefrontSource | undefined
// from resolveStorefrontForProject: templateOwner/templateRepo, else parseGitHubUrl(source.url);
// branch = demo?.source.branch ?? storefront.source.branch ?? 'main'
```

Checked against today's answers: shipped EDS brands give `templateOwner`/`templateRepo`
and `main`; CitiSignal headless has no template fields, so the URL gives
`skukla/citisignal-nextjs` on `master`, the same repository and branch
`projectResetService.ts:172-179` reads from `repoUrl` today (`demo-packages.json:222-229`);
an added demo gives its row (`storefrontResolver.ts:138-152`). `StorefrontLookup` is
satisfied by a `Project` and by `ProjectCreationConfig`, so creation and reset read the same
answer, including the branch `resolveTemplateCommitSha` resolves.

The update baseline and the source stay two records on purpose: the baseline says which
source commit the repository was last brought to; the source says where the next reset
goes. Change Demo Source and the rename follow already rewrite both.

### Readers that move

Found with `grep -rn 'githubRepo' src | grep -i metadata`, `grep -rn 'getEdsGithubRepo\|getEdsRepoParts' src`,
`grep -rn 'getTemplateSource\|lastSyncedCommit' src` and the headless `repoUrl` readers named
in the research. Re-run after step 01: the merge moves lines and adds the develop writers.

To `getStorefrontRepository` / `recordStorefrontRepository` — **19 files**:

| # | Site | Step |
|---|---|---|
| 1 | `lifecycle/commands/syncStorefront.ts:59` (path), `:524-535` (repo; reads `edsBranch`, which nothing writes) | 04 |
| 2 | `mcp/projectSecurity.ts:173-181` `resolveStorefrontPath` — for sync only; block tools keep an EDS lookup | 04 |
| 3 | `mcp/storefrontSyncHandler.ts:30-47` `readStorefrontGithubRepo` | 04 |
| 4 | `eds/services/reset/edsResetParams.ts:226-227` | 02 |
| 5 | `eds/services/resourceCleanupHelpers.ts:90-125` (`isEdsProject` duplicate, `extractEdsMetadata`), `:132-157` `getLinkedEdsProjects` | 06 |
| 6 | `projects-dashboard/services/projectDeletionService.ts:114-115, 272, 303-307, 634-635` | 06 |
| 7 | `eds/commands/manageGitHubRepos.ts:104-114` | 06 |
| 8 | `eds/services/demoPackage/demoPackageService.ts:46-56` `ownStorefrontOf` | 08 |
| 9 | `eds/handlers/forgetAddedDemoHandler.ts:74` (moves in `bd0fd7c70`; re-read after step 01) | 02 |
| 10 | `projects-dashboard/services/settingsSerializer.ts:136-151` | 03 |
| 11 | `project-creation/services/aiBundle/claudeSettingsWriter.ts:253-255` and `buildOwnStorefrontGuard` `:359-372` (develop) | 09 |
| 12 | `project-creation/services/aiBundle/agentsMdSections.ts:192-210` `buildStorefront` | 09 |
| 13 | `updates/commands/updateTypes.ts:90-97` `getTemplateSource` (callers `checkUpdates.ts:370`, `updateApplyService.ts:372` on this branch) | 02 |
| 14 | `updates/services/templateUpdateChecker.ts:107-148` | 02 |
| 15 | `updates/services/templateSyncService.ts:149-172, 183, 397-413` (develop) | 02 |
| 16 | `project-creation/handlers/executorEdsPhase.ts:30-109` (writer, develop) | 02, 03 |
| 17 | `eds/handlers/changeDemoSourceHandler.ts:45-53` (writer) | 02 |
| 18 | `eds/services/reset/demoSourceCheck.ts:106-109` `followRename` (writer) | 02 |
| 19 | `eds/services/reset/edsResetService.ts:267-275` `recordSyncedCommit` (writer, develop) | 02 |

To `getStorefrontSource` — **7 sites**:

| # | Site | Step |
|---|---|---|
| 1 | `lifecycle/services/projectResetService.ts:170-181` (headless `repoUrl`) | 02 (the file is deleted in 05) |
| 2 | `updates/services/updateManager.ts:266-276` (the `repoUrl` fallback, for a frontend) | 07 |
| 3 | `eds/handlers/changeDemoSourceHandler.ts:39-44` (writes headless `repoUrl`; deleted with the zip path) | 07 |
| 4 | `eds/services/reset/edsResetParams.ts:200-206, 237-248` `resolveStorefrontConfig` template owner/repo | 02 |
| 5 | `eds/services/reset/edsResetRepoHelper.ts` template ref (this branch `:262`, develop `:292-297`) | 02 |
| 6 | `project-creation/handlers/executorComponentLoading.ts:57-89` + `wizardHelpers.ts:497-507, 629, 682` (`frontendSource`) | 03 |
| 7 | `eds/services/templateCommitResolver.ts:38-70` callers (creation and reset): the branch it resolves | 01 (merge), 02 |

Readers that stay on the EDS accessors because they are Helix, DA.live or Config Service
work (19 sites plus one debug log line, `projects-dashboard/handlers/dashboardHandlers.ts:528`;
listed so nobody moves them by accident): `catalogPrewarmService.ts:125, 546`;
`siteAccessManagerHeadless.ts:107` (the name means "no UI"); `contentAuthoringTools.ts:116`;
`diagnostics.ts:301, 320, 390`; `manageSiteAccess.ts:199`; `cleanupDaLiveSites.ts:96`;
`configGenerator.ts:393`; `authoringExperienceFlip.ts:158`;
`storefrontNameMigrationForProject.ts:80`; `storefrontRepublishService.ts:113`;
`publishKeyRenewalSweep.ts:53`; `edsContentHandlers.ts:72`; `blockAuthoring.ts:75-83`;
`updateCore.ts:150`; `envFileGenerator.ts:641`; `projectFileLoader.ts:435`.
`agentsMdSections.ts:315` (`buildComponentRepositories`) loops every instance and picks up
the headless record by itself.

## Steps

Each step leaves the extension working. Agent tools change in the step that changes their
handler, not in a separate step (surface entry 4).

| Step | Slice | Depends on | Item |
|---|---|---|---|
| 01 | Bring `origin/feature/colleague-storefront` and `origin/develop` in (`step-01-bring-in-develop.md`) | — | EDS-13g |
| 02 | Two accessors, readers moved, EDS unchanged (`step-02-accessors.md`) | 01 | EDS-13g |
| 03 | Create a headless project with a new or existing repository: wizard, executor, agent, retry reuse (`step-03-create.md`) | 02 | EDS-13g |
| 04 | Sync Storefront for both kinds (`step-04-sync.md`) | 03 | EDS-13g |
| 05 | One reset with the local-edits guard, the guard before Edit, `reset_project` (`step-05-reset.md`) | 03, 04 | EDS-13g |
| 06 | Deletion offers the headless repository (`step-06-delete.md`) | 02, 03 | EDS-13g |
| 07 | Updates through the template path for both kinds, on the recorded branches (`step-07-updates.md`) | 01, 05 | EDS-13g |
| 08 | Save as demo package and Export for headless (`step-08-demo-package.md`) | 04, 05 | EDS-13g |
| 09 | AI hooks follow the repository (`step-09-ai-hooks.md`) | 01, 03, 04 | EDS-13g |
| 10 | Docs, and the headless-only paths deleted (`step-10-docs-and-cleanup.md`) | 03-09 | EDS-13g |

Step 02 is the representative slice: if the 26 sites fight the two accessors, the design
is revised before step 03.

## Hit every surface

1. **Eight webview bundles.** Applies to two. Wizard: the Storefront area, the Repository
   sub-step (new and existing repository), the summary and Review (step 03);
   `connect-services.css` and `eds-steps.css` are already imported by
   `StorefrontStep.tsx:54` and `RepoSelectionInline.tsx:49`. Dashboard: the More menu, the
   source notice and Export (steps 04, 08); reset and Edit's guard are host-side modals
   (step 05). The other six render none of these.
2. **Creation and regeneration agree.** Applies. The repository record has one writer,
   used by creation, reset, Change Demo Source and updates (steps 02, 03). The per-project
   hook and the AGENTS.md storefront section read the record, so Regenerate AI Files
   produces the same bundle as creation for a headless project with a repository, and the
   same repo-less bundle for one without (step 09).
3. **The four AI-bundle gate seams.** Does not apply: `projectNeedsAppBuilderTooling` is
   unchanged. AI_CONTEXT_VERSION does bump (step 09), for the hook and AGENTS.md.
4. **Human and agent surface.** Applies in every step: `create_project` (03),
   `sync_storefront` (04), `reset_project` (05), `delete_project` response (06),
   `apply_updates` (07), demo package tools (08).
5. **A config field in three places.** Applies once: `stacks.json` gains
   `requiresGitHub: true` on `headless-paas` and `headless-accs`; the schema field
   (`stacks.schema.json:134`) and the type (`types/stacks.ts:60`) already exist.
   `wizard-steps.json` `storefront-setup` changes its condition to
   `stackRequires: 'requiresDaLive'`; the type exists (`types/wizard.ts:69`) and the file has
   no schema. No `demo-packages.json` change (the source accessor reads the URL and branch).
6. **Mocks of changed contracts.** Applies. Named per step: `dashboardHandlers-actions.testUtils.ts:71`
   mocks `projectResetService` (05); `ActionGrid.testUtils.tsx` (04, 08); mocks of
   `GitHubFileOperations.resetRepoToTemplate` (05); `templateSyncService.testUtils.ts` (07);
   `componentUpdater.testUtils.ts` (07).
7. **Docs that state the thing.** Applies. `docs/systems/sharing-a-demo.md:229-234`,
   `docs/systems/mcp-tools.md` (regenerated), `docs/systems/mcp-server.md`,
   `docs/systems/agent-alerts.md`, `src/features/dashboard/README.md`,
   `templates/skills/sync-changes.md:46-49`, `package.json:224`, CHANGELOG (step 10 and each step).

## Five principles

| Principle | How this plan keeps it |
|---|---|
| 1. Undoable | Deletion offers the headless repository (step 06). A repository left by a failed Create Project is named in the error, reused by a retry, and removable from Manage GitHub Repositories or `delete_github_repo` (step 03, Q5). Reset returns the repository and the clone to the source (step 05). Save as demo package keeps Remove (step 08). `create_project`'s reversibility-ledger row names what removes the repository (step 03) |
| 2. User edits never overwritten | Reset and Edit ask before discarding local edits (Q1, Q2). A retry reuses a repository only when its content is still exactly the source's (step 03). Choosing an existing repository never rewrites it unless the SC ticks "Reset to <demo>" (step 03, Q3). Template updates stop on conflict (develop) and keep the description file on the conflict reset (step 07). Sync never commits generated secrets (`.git/info/exclude`, step 03; refusal, step 04) |
| 3. Existing projects keep working | EDS: both accessors read today's fields; step 02 proves it with EDS tests unchanged. Headless on disk (no repository): keeps running; Reset, Sync, Save and Export answer the decision-5 sentence; Edit works as today behind the guard; they stop being offered release-zip updates (step 07; open decision C) |
| 4. Public repository | Public by decision 2. Generated `.env` / `.env.local` / `.node-version` are listed in the clone's `.git/info/exclude` (step 03), and Sync refuses a staged secret file (step 04). No new setting or secret |
| 5. Cloud operations confirmed | Creating or resetting-on-create rides the Create Project confirmation (wizard) and `confirm:true` (agent). Reset keeps its modal and `confirm:true`. Sync keeps its commit-message prompt. Deletion keeps the QuickPick. Nothing pushes to a repository the project does not record as its own |

## Open decisions for the owner

- **A. How a retry proves a repository is the one a failed run left, and whether Edge
  Delivery gets the same fix.** Reusing any repository with the requested name could
  write over an unrelated repository the SC already had (principle 2).
  **Recommended:** reuse only when the SC owns `<login>/<name>` and its branch head's tree
  is the source branch head's tree (nothing in it differs from the demo, so nothing can be
  lost), checked in `createRepoFromSource`, which both kinds and both doors call. That also
  makes the agent EDS retry do what its two hints claim, for shipped brands and forked
  demos. A thin-layer EDS repository is pinned after creation, so its tree differs and its
  retry still stops on the taken name; the hints are corrected to say so. The alternative,
  fixing headless only, leaves the false EDS hints in place.
- **B. Edit's guard on a headless project that has no repository.** "Sync first" cannot
  work there. **Recommended:** the same modal without "Sync first": "Discard and edit" and
  Cancel, shown only when the clone has uncommitted changes. Skipping the guard would
  discard edits silently.
- **C. Release-zip updates for a headless project that has no repository.** Step 07 takes
  every storefront off the zip path (one workflow; nothing soft-deprecated), so those
  projects stop being offered storefront updates. **Recommended:** accept it, and say so in
  the CHANGELOG. The zip update deleted the clone's `.git`, and CitiSignal's releases are
  all prereleases, so the default `stable` channel offered nothing (research §2, live read).

## Assumptions, and what would overturn them

| Assumption | Evidence that would overturn it |
|---|---|
| Every SC can create a public repository under their personal account with the scopes Demo Builder already asks for | A `403` from `POST /user/repos` in the live check of step 03 |
| A repository made by `createEmptyRepository` (`auto_init`) defaults to `main` | The created repository's `defaultBranch` is anything else; the record stores the real value either way |
| The headless dev server does not care that the clone is a checkout of the SC repository rather than the source | `npm run dev` fails after step 03's live create |
| `getStorefrontSource` equals what reset reads today for every shipped package | `storefrontResolver.test.ts` cases for each shipped package and stack disagree with `repoUrl`/`templateOwner` values |
| A repository freshly made from a source has the same tree sha as the source branch head, by either creation path | Step 03's live check: the two `GET /repos/{o}/{r}/branches/{b}` tree shas differ right after creation; reuse then needs another proof (decision A) |
| A clone's state can be read with `git fetch` + `git status` using the SC's existing git credentials for a public repository | `readCloneState` fails on a live project in step 05 |

## Risks

- **Step 01's merge is not only documents.** Four source files and two tests conflict
  (step 01). The resolver's branch must survive it, or added demos on a non-`main` branch
  regress to `main` on creation and reset with every test that pins `main` still green.
- **A name collision surfaces late.** The repository is created after Review. Mitigation in
  step 03: the Repository sub-step checks the name against the SC's own repositories, and
  the executor creates or reuses the repository before cloning anything, so a taken name
  fails in seconds.
- **Secrets in a public repository.** Covered by `.git/info/exclude` (step 03) and a
  refusal in Sync when a generated secret file is staged (step 04).
- **`edsResetUI.ts` is 763 lines** and grows when it becomes the one reset UI. Step 05
  splits it with `decompose-god-file` before generalising.
- **Pins that move:** `list_stacks` output (`discoveryTools.ts:83`) and its response
  ceiling, the tool catalog, `spine-chokepoints.test.ts`, `tests/sop/reversibility.ledger.json`
  (develop), the battery baseline naming `reset_eds_project`
  (`.rptc/plans/evaluation-mode/battery/unprompted-baseline.json`).
- **Few if any SCs use headless projects today** (owner), so live checks need a project
  created for the purpose.

## Decision history

- 2026-09-15 · Plan written with owner decisions 1-7; the research's one-time offer for
  existing projects had already been replaced by decision 5.
- 2026-09-15 · Q1, Q2 answered yes: the local-edits guard and clone refresh cover Edge
  Delivery reset and Edit too.
- 2026-09-15 · Q3 reversed: headless may pick an existing repository; step 03 gains Browse,
  a Next.js readiness check and the "Reset to <demo>" option.
- 2026-09-15 · Q4 replaced decision 5: reset no longer creates a repository; a headless
  project without one gets one sentence on Reset, Sync and Save; the transition work left
  steps 03, 05, 08 and 09.
- 2026-09-15 · Q5: a failed run's repository is left and reused on retry, not deleted;
  `removeRepositoryCreatedThisRun` left step 03.
- 2026-09-15 · Q6, Q7 answered as recommended (`reset_project`; no mesh or app re-clone).
- 2026-09-15 · Q8 done on develop (`7316132dd`, `6b6815acd`, `9dbdfbaa7`): defects 1-3
  left the plan, step 05's Tree-write work shrank to the target branch, step 07 unblocked.
- 2026-09-15 · Step 01 now also brings `origin/feature/colleague-storefront` to `8d1669050`.
- 2026-09-15 · Branch work placed: resolver (01, 02), Tree reset target (05), template
  apply (07).
- Rejected while planning: a new top-level `project.storefrontRepository` field (two places
  for one fact, and a migration for every EDS project); renaming `edsConfig` to something
  kind-neutral in this plan (376 references in 37 files, mechanical; a follow-up).
