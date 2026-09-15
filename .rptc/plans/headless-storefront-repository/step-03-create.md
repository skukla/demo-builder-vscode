# Step 03 — Create a headless project with its repository

Item: [[EDS-13g]]. Decisions: 1, 2, 5, 6 (owner, 2026-09-15); Q3 and Q5 (owner, same day);
open decision A (overview), built here as recommended. Depends on step 02.

## Goal

The SC picks CitiSignal Headless (or an added headless demo), signs in to GitHub, and on the
Storefront area's Repository sub-step either names a new repository or picks an existing one
of theirs (with "Reset to <demo>" when it should start from the demo), reviews, and presses
Create. Create Project makes the public repository in their personal account from the demo's
source (or uses the chosen one), clones it, and runs the storefront from that clone. If
Create Project fails after the repository exists, the repository is kept and named, and
pressing Create again uses it. An agent gets the same through `create_project` (new
repository only, as for Edge Delivery). Edge Delivery creation is unchanged except where
listed.

## Facts

- The Storefront area and the Publish Storefront step both show only when the stack has
  `requiresGitHub` or `requiresDaLive` (`buildYourProjectAreas.ts:51-56`,
  `wizard-steps.json:27-35`); both headless stacks set neither (`stacks.json`).
- The Storefront area's rail is always Accounts, Repository, Code Sync, Block Libraries
  (`storefrontSections.ts:42-68`). Accounts needs GitHub and DA.live (`:112-116`);
  `isStorefrontConfigured` needs both sign-ins and both validity flags (`tileStatus.ts:157-165`).
- The wizard keeps every storefront field in `state.edsConfig`, cleared for any stack
  without `requiresGitHub`/`requiresDaLive` (`useProjectBuilder.ts:121-126`); WelcomeStep
  refills it only for `eds-` stacks (`WelcomeStep.tsx:252-267`).
- Renaming the repository also writes `daLiveSite` (`RepoSelectionInline.tsx:243-253`);
  Review shows a DA.live row whenever `daLiveSite` is set (`ReviewStep.tsx:139-151`).
- **Existing repositories.** The Browse list comes from `get-github-repos`
  (`RepoSelectionInline.tsx:162-164`). A picked repository is classified by
  `check-repo-readiness` (`RepoSelectionInline.tsx:430-455` → `checkRepoReadinessHandler.ts:31-56`
  → `classifyRepoForStorefront`, `repoStorefrontReadiness.ts:87-122`), which probes only the
  Edge Delivery files (`:37-41`), so a Next.js repository reads `not-a-storefront` and cannot
  pass without a reset (`repoSelectionInline.helpers.tsx:154-188`). The reset control is
  `ResetToTemplateOption`, labelled `Reset to ${templateName ?? 'template'} (replaces all
  content)` (`:796-829`), driven by `describeResetOption` (`:706-753`). A non-`main` default
  branch silences it (`unusable`, `RepoSelectionInline.tsx:528-537`) because EDS URLs assume
  `main`. Selecting an existing repository also probes AEM Code Sync (`:398-413`).
- **A headless detector already exists.** "Add a demo package" reads a repository as
  headless when it is not an Edge Delivery storefront and its `package.json` has a `next`
  dependency (`sharedDemoProbe.ts:47-48`, `:138-146`; the read is `RepoReader.dependencies`,
  `:293-300`). Marker read from `skukla/citisignal-nextjs` on 2026-09-12 (`:13`).
- For an existing EDS repository with reset ticked, forked storefronts reset through the git
  path `githubRepoOps.resetToTemplate` (`storefrontSetupPhase1.ts:304-311`;
  `githubRepoOperations.ts:590-`), which takes a template branch.
- `createRepoFromSource` calls `generate` without asking for any source not flagged as an
  added demo (`storefrontSetupPhase1.ts:366-368`). CitiSignal's headless source is not a
  GitHub template (research §1, live read). For a non-template source it resets the new
  repository onto the source's DEFAULT branch (`:386`). Both creators turn GitHub Actions
  off (`githubRepoOperations.ts:145, 198`) and throw `REPO_EXISTS` on a taken name
  (`:157, 187`).
- **Failure today.** A failed creation deletes the local folder and a mesh made in the same
  run, unasked (`createHandler.ts:135-165`, `cleanupOrphanedMesh` at `:177`), wizard door
  only; the agent door reports (`createProjectTool.ts:236-239`). EDS reuses its repository
  on a wizard retry because the repository stays in wizard state
  (`storefrontSetupPhase1.ts:41-58`). The agent EDS door does not reuse, though its hints
  say it does (`createProjectTool.ts:338, 386`; overview "Found while revising").
- Every frontend clone today is the SC repo on `main` for EDS or the source for headless
  (`executorComponentLoading.ts:57-89`); `frontendSource` exists only to carry the second
  (`webviewRequests.ts:325`, `types/handlers.ts:64`, `wizardHelpers.ts:497-507, 629, 682`).
- Generated files land in the clone: `.env` for the `headless` id (`envFileGenerator.ts:292-294`),
  `.node-version` (`componentInstallation.ts:265-282`, `components.json` `headless`
  `nodeVersion: "24"`). CitiSignal's `.gitignore` ignores `.env*` but not `.node-version`
  (live read).
- The reversibility ledger (develop, `tests/sop/reversibility.ledger.json`) says
  `create_project` is reversed by `delete_project`, which is local only.
- A known limit this step inherits from EDS: creation records the source head as
  `lastSyncedCommit` even for an existing repository kept as it is
  (`executorEdsPhase.ts:74-78`, develop). An update on such a repository then stops on
  conflicts rather than overwriting anything (develop `templateSyncService.ts:279-286`).

## The exact changes

### Config (surface entry 5)

- `src/features/components/config/stacks.json`: `"requiresGitHub": true` on `headless-paas`
  and `headless-accs`. Schema `stacks.schema.json:134` and type `types/stacks.ts:60` exist.
- `src/features/project-creation/config/wizard-steps.json:32-34`: `storefront-setup`
  condition becomes `{ "stackRequires": "requiresDaLive" }` (Publish Storefront stays EDS).
- `buildYourProjectAreas.ts:51-56`: the storefront area's condition becomes
  `{ stackRequires: 'requiresGitHub' }`; the header comment (`:9-13`) says the area shows for
  every stack with a storefront repository.

### Wizard (bundle: wizard)

- `storefrontSections.ts:66-68` `storefrontSectionOrder(state)`: `['accounts', 'repository']`
  when `!isEdsStackId(state.selectedStack)`; the full list otherwise.
  `isStorefrontStepComplete('accounts')` (`:112-116`) needs DA.live only for EDS.
  `typeGuards.ts` is already imported by webview code (`useAuthStatus.ts`,
  `ConfigureScreen.tsx`), so the wizard bundle can import it.
- `tileStatus.ts:157-165` `isStorefrontConfigured`: derives from `storefrontSectionStates`
  (every section done) instead of restating the four flags, so the rail and the tile cannot
  disagree.
- `useProjectBuilder.ts:122` and `WelcomeStep.tsx:254`: fill `edsConfig` for any stack with
  `requiresGitHub` (one predicate, `stackHasStorefrontRepository`, beside `isEdsStackId` in
  `typeGuards.ts`, taking a `Stack`).
- `StorefrontStep.tsx:203-234`: headless renders `GitHubServiceCard` alone; `DaLiveServiceCard`
  and `useDaLiveAuth`'s card only for EDS. Block libraries already gate on `isEdsStack` (`:152, 236`).
- `RepoSelectionInline.tsx`, for a headless stack:
  - **New repository:** `NewRepoForm` without its Create button (the repository is made by
    Create Project); `handleRepoNameChange` stops writing `daLiveSite`. Valid when
    `getRepositoryNameError` passes and the name check (below) does not answer `taken`.
  - **Existing repository:** the same Browse list; the readiness request carries
    `storefrontKind: 'headless'`; `ResetToTemplateOption` stays, with `templateName` as today.
    `DefaultBranchNotice` and `unusable` apply to EDS only: headless clones, resets and syncs
    the repository's own branch (steps 03, 05). The Code Sync probe effect (`:398-413`) and
    the created-repo App effect (`:417-424`) return early for headless.
- Name check (decision A): when the typed name is one of the SC's repositories (the list
  `useSelectionStep` already loads), the step asks the host `check-storefront-repository-name`
  (new, `webview-command-handler` skill; Pattern B) and shows the answer:
  `reusable` → notice "You already have {name}, unchanged from this demo. Create Project will
  use it."; `taken` → error "You already have a repository called {name}. Choose it under
  existing repositories, or pick another name."; `undetermined` → notice only, never a
  block (the readiness rule).
- `repoSelectionInline.helpers.tsx:618-697` `NewRepoForm`: `onUseExisting` and
  `onCreateRepository` become optional; a missing handler hides its button. The
  description line (`describeRepoTarget`, `:602-613`) already says "Will be created as
  login/name"; its placeholder `my-eds-project` becomes the project name.
- `buildSummary.ts:70-107` `storefrontSummaryGroup`: rows follow `storefrontSectionOrder`.
  This deletes the stale "Code Sync only applies to a NEW repo" comment (`:93-94`); an EDS
  project with an existing repository gains the Code Sync row the rail already shows (a
  visible EDS change).
- `ReviewStep.tsx:139-151` `deriveDaLiveInfo`: null unless the stack is EDS.
- Edit mode of a headless project that has no repository (decision 5): the Repository
  sub-step shows `InlineNotice` with the decision-5 sentence (new `NO_OWN_REPOSITORY` in
  `src/features/components/services/storefrontRepositoryCopy.ts`, the one home steps 04, 05
  and 08 reuse; the folder is already imported by webview code) and reports valid. Edit
  never creates a repository.

### Readiness recognises a Next.js storefront (Q3)

- `repoStorefrontReadiness.ts`: `classifyRepoForStorefront(fileOps, owner, repo, logger,
  storefrontKind: StorefrontKind = 'eds')`. For `'headless'` it probes `package.json`:
  `storefront` when its `dependencies` has `next`; `not-a-storefront` with
  `missing: ['package.json with a "next" dependency']`; `empty` and `undetermined` by the
  same rules as today.
- The `next` read moves here, exported as `HEADLESS_DEPENDENCY` and
  `readPackageDependencies(fileOps, owner, repo)`; `sharedDemoProbe.ts` imports both
  (`:47-48` and `RepoReader.dependencies` `:293-300` delegate), so "Add a demo package" and
  the Browse list use one detector.
- `checkRepoReadinessHandler.ts:19-22`: `storefrontKind?: StorefrontKind` on the request,
  passed through.

### Host: one creation phase for the repository

- `storefrontSetupPhase1.ts:345-389` `createRepoFromSource(repoOps, request, source, logger)`,
  where `source` is `{ owner, repo, branch }` from `getStorefrontSource`:
  - `fromAddedDemo` is deleted from `NewRepoRequest`; callers lose the flag
    (`storefrontSetupPhase1.ts:427`, `edsGitHubHandlers.ts:371-384, 417`
    `CreateGitHubRepoPayload.fromAddedDemo`, `RepoSelectionInline.tsx:289-290`).
  - Always reads `getRepository(source)`: `generate` when it is a template and its default
    branch is `source.branch` (GitHub's generate copies the default branch; confirm against
    GitHub's docs when implementing); otherwise `createEmptyRepository` + `resetToTemplate`
    onto `source.branch` (today `source.defaultBranch`, `:386`). EDS change: one GitHub read
    before `generate`; same result for shipped brands.
  - On `REPO_EXISTS` (decision A): `findReusableRepository(repoOps, fileOps, name, source)`
    answers the SC's own `login/name` when its default branch's tree sha equals the source
    branch's tree sha (`getBranchInfo`, `githubFileOperations.ts:411-431` develop, both
    reads); otherwise the `REPO_EXISTS` error is rethrown. The handler behind the name check
    calls the same function.
- New `src/features/project-creation/handlers/executorStorefrontRepositoryPhase.ts`:
  - `ensureStorefrontRepository(context, config, progress)`: runs when the stack has a
    storefront repository, it is not edit mode, and `config.edsConfig.repoUrl` is absent.
    EDS always arrives with `repoUrl` from storefront setup, so for EDS it does nothing.
    - `repoMode: 'existing'`: `getRepository` on the chosen repository; when
      `edsConfig.resetToTemplate`, `resetToTemplate(owner, name, source.owner, source.repo,
      defaultBranch, 'chore: reset to template', source.branch)` (the forked EDS path,
      `storefrontSetupPhase1.ts:304-311`).
    - `repoMode: 'new'`: `createRepoFromSource` with `{ newRepoName, isPrivate: false }` and
      no namespace (decisions 2 and 6), then `waitForContent`.
    - Either way sets `edsConfig.repoUrl`, `githubOwner`, and new `edsConfig.repoBranch`
      (the repository's `defaultBranch`), and records
      `context.sharedState.storefrontRepository = fullName`.
  - `recordHeadlessRepository(context, project, config)`: after the clone,
    `recordStorefrontRepository` (step 02) with `githubRepo`, `repoUrl`, the source as
    `templateOwner`/`templateRepo`/`templateBranch` (always recorded for headless), and
    `lastSyncedCommit` from `resolveTemplateCommitSha` with the source branch (step 01).
- `executor.ts`: call `ensureStorefrontRepository` after project initialisation and before
  `loadComponentDefinitions` (`:273-278`), so a taken name or an unreadable chosen repository
  fails before anything is cloned; call `recordHeadlessRepository` beside
  `populateEdsMetadata` (`:341`). No repository cleanup on failure (Q5).
- Failure message: when `sharedState.storefrontRepository` is set, the wizard's failure text
  (`createHandler.ts:226-278`) and the agent's result add "Your repository {fullName} was
  kept. Create the project again to use it, or delete it from Manage GitHub Repositories."
  `cleanupOnFailure` (`:135-165`) is unchanged: it still deletes the local folder and only a
  mesh created in that run.
- `executorComponentLoading.ts:57-89` `resolveFrontendSource`: clone `edsConfig.repoUrl` on
  `edsConfig.repoBranch ?? 'main'`; without one (only a repo-less headless project in Edit),
  clone `getStorefrontSource(config)` with the storefront row's `gitOptions`, as today. The
  `isEdsStack` parameter goes. `frontendSource` is deleted from `ProjectCreationConfig`
  (`webviewRequests.ts:324-325, 341`), `types/handlers.ts:64` and `wizardHelpers.ts`
  (`resolveFrontendSourceFromPackage` `:497-507`, `:629`, `:682`).
- `webviewRequests.ts:329-360`: `edsConfig.repoBranch?: string`.
- New `src/features/components/services/storefrontLocalExcludes.ts`:
  `excludeGeneratedFiles(clonePath)` appends `.env`, `.env.local`, `.node-version` to
  `<clone>/.git/info/exclude` when absent. Local to the clone; nothing reaches GitHub. Called
  for the storefront clone of either kind right after cloning. The names are read from their
  writers' constants, exported for this (`envFileGenerator.ts:292-294`,
  `componentInstallation.ts:274`), not retyped.
- `settingsSerializer.ts:136-151`: the repository half reads `getStorefrontRepository`, so
  Edit and settings export carry a headless project's repository. `useWizardState.ts:78-108`
  `buildImportModeEdsConfig`: for a headless stack an imported file prefills `repoName`
  only and stays in `new` mode (an imported repository belongs to the old project).

### Agent: `create_project` (`createProjectTool.ts`)

- `createHeadless` (`:196-247`): refuses without `repoName` ("Headless projects require
  repoName: the name of the GitHub repository to create."), refuses `githubOwner` ("A headless
  project's repository is created in your own GitHub account."), pre-flights GitHub with
  `requireGitHub` (`edsToolGuards.ts:58`), and passes
  `edsConfig: { repoName, repoMode: 'new', githubOwner: login }` in its `ProjectConfigSource`.
  A failure result carries `repository` when one was made or reused, with the kept-repository
  sentence as `hint`.
- EDS hints `:338` and `:386` say what is true after decision A: "a repository still
  unchanged from the demo is reused on retry; one that has changed (a thin-layer storefront is
  changed at creation) needs another repoName or delete_github_repo first."
- Picking an existing repository is not added to the agent surface, for either kind: the
  EDS agent path has no such input today (surface entry 4, stated).
- Descriptions (`:411-440`): `repoName` "The name of the new GitHub repository for the
  storefront"; confirm text "creates a real GitHub repository, and for EDS DA.live content".
- `:244-246` hint unchanged until step 04.
- `tests/sop/reversibility.ledger.json` (after step 01): the `create_project` row gains
  `note: "its GitHub repository is removed by delete_github_repo; delete_project names it from
  step 06"`.

## Reuse

| Need | Existing piece |
|---|---|
| Storefront area, rail, sub-steps | `StepAreaShell`, `StepRail`, `storefrontSections`, `areaSubSteps` |
| GitHub sign-in | `GitHubServiceCard` + `useGitHubAuth` |
| Name field, "Will be created as" | `NewRepoForm`, `describeRepoTarget`, `getRepositoryNameError` |
| Existing repository list and reset control | `useSelectionStep` (`get-github-repos`), `ResetToTemplateOption`, `describeResetOption`, `computeRepoValid` |
| Is it a Next.js storefront | the probe's `next` detector, moved into `repoStorefrontReadiness.ts` |
| Repo-less notice in Edit | `InlineNotice` |
| Create the repository, Actions off | `createRepoFromSource` → `createFromTemplate` / `createEmptyRepository` |
| Reset a chosen repository | `githubRepoOps.resetToTemplate` |
| Is a repository still the source's | `getBranchInfo` tree sha |
| Baseline commit | `resolveTemplateCommitSha` (step 01's branch input) |
| Record | `recordStorefrontRepository` (step 02) |
| Agent GitHub pre-flight | `requireGitHub` |

New: the phase module (no creation-time repository step exists for any stack),
`findReusableRepository`, the name-check handler, and `storefrontLocalExcludes.ts` (nothing
writes `.git/info/exclude` today; grep for `info/exclude` in `src` finds none — run it with a
control when implementing).

## Tests (failing first)

New:

- `tests/features/project-creation/handlers/executorStorefrontRepositoryPhase.test.ts`:
  "creates from the source for a new headless project, on the source's branch" (argument
  assertion on `createRepoFromSource`'s source); "does nothing when repoUrl is set (EDS)";
  "does nothing in edit mode"; "uses a chosen repository and resets it onto the source only
  when asked" (argument assertion on `resetToTemplate`, including the source branch);
  "a taken name fails before any clone" (assert the clone mock was not called); "records the
  repository, the source on master and the baseline"; "leaves the repository and names it
  when a later phase throws" (assert no delete call).
- `tests/features/eds/handlers/storefrontSetup/createRepoFromSource-reuse.test.ts`: "reuses the
  SC's repository whose tree equals the source's"; "rethrows REPO_EXISTS when the tree
  differs"; "rethrows when the repository belongs to someone else"; control: "a free name is
  created, never looked up".
- `repoStorefrontReadiness.test.ts`: headless `storefront` with `next`; `not-a-storefront`
  without it; `empty`; `undetermined` when `package.json` cannot be read; EDS cases unchanged.
  `sharedDemoProbe.test.ts:206-214` "reads a Next.js storefront as headless" unchanged.
- `tests/features/components/services/storefrontLocalExcludes.test.ts`: appends once;
  idempotent; keeps existing lines; a real temp git repository (git run with every `GIT_*`
  variable stripped, as `homeGitSyncHook.test.ts:24-42` does on develop), then
  `git status --porcelain` does not list a written `.env` (control: a file not in the list is
  listed).
- `storefrontSections.test.ts`: "headless has Accounts and Repository only"; "headless
  Accounts is done with GitHub alone".
- `tileStatus.test.ts`: "headless storefront configured with GitHub and a valid name".
- `buildYourProjectAreas.test.ts`: "headless stacks show the Storefront area".
- `StorefrontStep.test.tsx`: "headless shows only the GitHub card"; `StorefrontStep-daLive.test.tsx` unchanged.
- New `RepoSelectionInline-headless.test.tsx`: no Create button; renaming does not write
  `daLiveSite`; a `taken` answer is an error and `reusable` is a notice; Browse shows the
  list; a picked Next.js repository with readiness `storefront` is valid without reset; the
  readiness request carries `storefrontKind: 'headless'`; no Code Sync probe is sent; no
  default-branch notice for a `master` repository.
- `buildSummary.test.tsx`: headless rows; EDS existing-repo gains the Code Sync row.
- `createProjectTool-validation.test.ts`: headless without `repoName`; headless with `githubOwner`.
- `createProjectTool.test.ts`: headless GitHub handoff; config carries `edsConfig.repoName`;
  a failure result names the kept repository.

Pins and mocks that move (entry 6):

- `executor-orchestrationSeams.test.ts`, `executor-meshComponentLoading.test.ts`,
  `executor-appBuilderComponentLoading.test.ts`: `loadComponentDefinitions` loses
  `isEdsStack`; `frontendSource` leaves their configs.
- `createHandler-errors.test.ts`: the failure text case for a kept repository.
- The two suites that name `fromAddedDemo` lose it: `edsGitHubHandlers-createRepo.test.ts`
  and `storefrontSetupPhase1-source.test.ts` (the latter's shipped-brand case now expects a
  `getRepository` call).
- `checkRepoReadinessHandler.test.ts`: the request's `storefrontKind` reaches the classifier.
- `discoveryTools.test.ts:27-40` reads `requiresGitHub` per stack: add the headless
  expectation. The `list_stacks` ceiling (`tests/features/ai/server/responseCeilings.ts:189`,
  4,000 bytes against 601 measured) does not move for two booleans.
- `reversibility-ledger.test.ts`: green with the new note.
- `tests/types/demoPackages*.test.ts` and `stacks` validators: rerun; no data shape changes.

## Docs that change

- `docs/systems/sharing-a-demo.md:229-234` "Headless demos" — rewritten in step 08; here only
  "a headless project has a repository of its own from creation, new or existing" is added.
- `docs/systems/mcp-tools.md` regenerated (`scripts/generate-tool-catalog.mjs`).
- `src/features/project-creation/ui/steps/buildYourProjectAreas.ts` header; CLAUDE.md
  "Modifying Wizard Steps" says StorefrontStep is "EDS-only" — becomes "any stack with a
  storefront repository; DA.live, Code Sync and block libraries for EDS only".
- CHANGELOG entry, including the EDS retry change (decision A).

## Acceptance

| Predicate | Evidence |
|---|---|
| `frontendSource` gone | `grep -rn 'frontendSource' src tests` count captured equals 0; control grep for `repoBranch` counts 2 or more |
| `fromAddedDemo` gone | same pattern, 0; control on `createRepoFromSource` |
| One Next.js detector | `grep -rn "HEADLESS_DEPENDENCY = " src` count captured equals 1; control: `grep -rn 'HEADLESS_DEPENDENCY' src` counts 3 or more |
| EDS creation unchanged | the EDS executor and storefront setup suites pass with only the listed edits |
| No generated secret can be staged | the exclude test's real-git case |
| Gate green | `gate`, pre-push |
| Live: create new (owner confirms the cloud write first) | dev host: new CitiSignal Headless project named `hsr-check`; Storefront area shows Accounts + Repository; after Create, `github.com/<login>/hsr-check` exists, is public, Actions off (repository settings), default branch recorded in `.demo-builder.json` `componentInstances.headless.metadata`; `git -C components/headless remote get-url origin` is the new repository; Start runs the storefront |
| Live: the tree proof holds (read-only) | right after that create, the tree sha of `hsr-check`'s default branch equals `skukla/citisignal-nextjs@master`'s (two `GET /repos/{o}/{r}/branches/{b}`); if not, decision A's proof is revised before this step ships |
| Live: existing (owner confirms) | a second project picking `hsr-check` under existing repositories: readiness reads it as a storefront, no reset needed, the project clones it |
| Live: failure and retry (owner confirms) | break the mesh step on purpose (invalid workspace) and create `hsr-retry`: the error names the kept repository; fix the workspace, Create again: the Repository sub-step says it will be used, and the project is created on it |
| Live: agent (owner confirms) | `mcp-live-probe` `create_project` headless without `repoName` refuses; with it and `confirm:true` creates |
| Live: EDS unchanged | an EDS project created end to end (owner confirms), repository via the early button |

## Reversal

- Code: revert the commit.
- Data: a headless project created by this step owns a GitHub repository. Deleting the
  project offers it once step 06 lands; until then, and for a repository a failed run kept,
  the SC deletes it from "Manage GitHub Repositories" (or an agent with `delete_github_repo`).
  The recorded metadata keys are ignored by a build without this step.
