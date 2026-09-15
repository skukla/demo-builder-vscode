# Step 05 — One reset with the local-edits guard; the guard before Edit; `reset_project`

Item: [[EDS-13g]]. Decisions: 3, 4, 5 (revised) (owner, 2026-09-15); Q1, Q2, Q6, Q7 (owner,
same day); open decision B (overview), built here as recommended. Depends on steps 03 and 04.

Line numbers in files step 01 changes are `origin/develop`'s (`9dbdfbaa7`); re-read them
after the merge.

## Goal

Reset on a project with a repository, either kind: checks the demo's source; when the local
storefront has uncommitted changes or unpushed commits, says so and offers "Sync first",
"Discard and reset" or Cancel (silent otherwise); rewrites the SC's repository to the source
on the repository's own branch; runs the Edge Delivery steps only for Edge Delivery; brings
the local storefront to the new repository state; and redeploys the mesh. A headless project
without a repository does not reset: it shows the decision-5 sentence. Edit asks the same
question before it re-clones. Both dashboards and the agent reach the same code; the agent
tool is `reset_project`.

## Facts

- Two dispatchers, identical apart from the log prefix and how the project is found:
  `dashboard/handlers/projectManagementHandlers.ts:78-118` and
  `projects-dashboard/handlers/dashboardHandlers.ts:819-860`. Both pass
  `includeBlockLibrary`, `verifyCdn`, `showLogsOnError` as `true`, and send every non-EDS
  stack to the headless reset.
- The EDS UI (`eds/services/reset/edsResetUI.ts`, 763 lines) runs the added-demo source check
  (`:398-423`), the confirm (`:447-456`), sample-data removal (`:629-760`), DA.live, Adobe,
  org and GitHub-App pre-flights (`:98-290`), then `executeEdsReset`
  (`edsResetService.ts:376-`, develop).
- **Who calls the old headless reset.** `resetProjectWithUI`
  (`lifecycle/services/projectResetService.ts:360-518`) is called only by those two
  dispatchers' non-EDS branch (`projectManagementHandlers.ts:108-117`,
  `dashboardHandlers.ts:850-859`); its other exports (`buildComponentList` `:81`,
  `buildAppBuilderDefinitionFromInstance` `:107`, `handleMeshRedeployment` `:304`) have no
  other caller in `src` (tests: `projectResetService-resetWithUI.test.ts`,
  `-componentList.test.ts`, `-meshContext.test.ts`). The four stacks are two EDS and two
  headless (`stacks.json:12-61`). After this step a headless project with a repository takes
  the one pipeline and one without gets the sentence, so nothing reaches the old reset and it
  is deleted. Five comments name it and must follow: `componentSelectionReconcile.ts:7`,
  `deployMeshHeadless.ts:156`, `changeDemoSourceHandler.ts:36`,
  `appBuilderComponentRunner.ts:977`, `deleteAdobeProjectHandler.ts:233`.
- The headless reset confirms, stops the demo, deletes `components/`, clears
  `componentInstances`, re-clones every component, runs npm install, regenerates env files
  and redeploys the mesh through `handleMeshRedeployment` (`:304-340`). That mesh code and
  EDS's `redeployApiMesh` (`edsResetMeshHelper.ts`) were both read: the same job
  (`ensureProjectAdobeContext` → `buildOrgTargetFromProjectAdobe` → `withOrgContext` →
  `deployMeshCreateOrUpdate` → `updateMeshState`); the only difference is that EDS reports a
  skipped pre-flight in its result and headless skips silently.
- The Tree reset (develop) writes binaries as blobs and keeps modes
  (`githubFileOperations.ts:790-821`), pins its download to the resolved sha
  (`edsResetRepoHelper.ts:292-304`) and records it (`edsResetService.ts:267-275`, called at
  `:462` after the content pipeline). Its TARGET branch is still `main`
  (`githubFileOperations.ts:772`); the commit's parent is the previous head (`:868-874`).
  Its other caller is the creation-time LKG pin (`patches/lkgPinHelper.ts:137`).
- File overrides for the reset commit are EDS files plus the saved demo package's
  description file (`edsResetFileOverrides.ts:26-60`).
- Agent: `reset_eds_project` (`ai/server/edsResetTool.ts`), guarded by `requireEdsProject`
  (`:81`), `needsAuth: ['dalive']` (`:53`), inputs `includeBlockLibrary` and `verifyCdn`
  (`:58-66`). Named also in `toolNarration.ts:183`, `agentAlertCopy.ts:157`,
  `agentOperationNotifier.ts:60`, `toolDisplayName.ts:31`, `edsToolGuards.ts:3`,
  `docs/systems/agent-alerts.md:56`. `tests/sop/tool-auth-declarations.test.ts:48, 55` pins
  `dalive: 21` and `github: 18` on this branch.
- Edit re-clones every component into `components.tmp` and swaps it in
  (`executorEditMode.ts:77-116`), discarding uncommitted edits in either kind's clone.

## The exact changes

### 0. Split first (no behaviour change)

`edsResetUI.ts` is over the 500-line file limit before this step adds anything. Run
`decompose-god-file` on it: pre-flights (`:98-290`), result notifications (`:294-330`),
sample data (`:594-760`) into their own modules beside it; the public API does not move and
the seven `edsResetUI-*.test.ts` suites pass unchanged. Commit separately.

### 1. One entry point

- New `src/features/lifecycle/services/resetProject.ts`:
  `resetProjectFromDashboard(context, project, logPrefix)` holds the dependency wiring both
  dispatchers repeat (`ServiceLocator` command executor and auth service, the three `true`
  flags) and calls `resetProjectWithUI`. Both `handleResetProject` handlers call it after
  resolving their project.
- `edsResetUI.ts` `resetEdsProjectWithUI` becomes `resetProjectWithUI` (the one reset UI); the
  file is renamed `resetProjectUI.ts` in the same folder with `git mv`. The old
  `lifecycle/services/projectResetService.ts` is deleted whole, with its three test suites
  (their still-true cases move, below) and the five comments above updated.

### 2. Order of the UI, both kinds

1. **No repository** (`getStorefrontRepository` undefined and the storefront instance is
   `headless`): an information message with `NO_OWN_REPOSITORY` (step 03's constant); returns
   `{ success: false, error: NO_OWN_REPOSITORY }`; nothing else runs. An EDS project without
   a recorded repository keeps today's refusal from `extractResetParams`.
2. Source check (`checkDemoSource`), unchanged, now also for a headless added demo.
3. **Local edits** (Q1): `readCloneState(path, branch)` from new
   `lifecycle/services/storefrontClone.ts` (`git fetch origin <branch>`, then
   `git status --porcelain` and `git rev-list --count origin/<branch>..HEAD`; EDS ignores
   `isManagedStorefrontFile` paths). Only when something is found, a modal "{n} changed files
   and {m} commits in your storefront are not in your repository yet." Buttons: "Sync first",
   "Discard and reset", Cancel. "Sync first" runs `syncProjectStorefront` (step 04) for this
   project, re-reads the state, and continues only when it is clean (else it stops and says
   why). A clone whose state cannot be read stops the reset and says so (never read as clean).
4. Confirm, sample data, pre-flights: as today. DA.live and GitHub-App pre-flights run for
   EDS only; Adobe and org pre-flights for any project with `project.adobe.organization`
   (unchanged rule, `edsResetUI.ts:506-526`).
5. `executeProjectReset` (below), then the notifications.

### 3. One pipeline — `edsResetService.ts` `executeEdsReset` becomes `executeProjectReset`

- `extractResetParams` (`edsResetParams.ts:220-321`): DA.live fields required only for EDS;
  `kind` and `branch` (the SC repository's, from `getStorefrontRepository`) added to
  `EdsResetParams`, which is renamed `ProjectResetParams`.
- Step 0 (storefront-name migration): EDS only.
- Step 1, split in `edsResetRepoHelper.ts:227-389`:
  - `resetRepositoryTree(params, …)` (both kinds): overrides from
    `buildResetFileOverrides(params)` — EDS as today; headless only the description file
    (`carrySharedDemoFile`); canonical patches only when `codePatchSource`; the download pinned
    to `resolveTemplateCommitSha` on the source branch (steps 01, 02), written to
    `params.branch`.
  - `reinstallEdsAdditions(params, …)` (EDS): block libraries, smart-404, Quick Edit,
    unchanged.
- Steps 4-11 (code sync, permissions, config, content): EDS only, unchanged.
- **Record:** `recordSyncedCommit` (moved onto `recordStorefrontRepository` in step 02) runs
  for both kinds once the kind's repository work has succeeded: after the content pipeline
  for EDS (where it is today, `:462`), after the Tree reset for headless.
- **Local storefront**, new in `storefrontClone.ts`: `refreshClone(path, branch)` =
  `git fetch origin <branch>`, `git reset --hard origin/<branch>`, `git clean -fd` (no `-x`:
  `node_modules` and the excluded generated files stay). Both kinds (Q1).
- Headless follow-up: `installAllComponents` with a definitions map holding only the
  storefront (the call `projectResetService.ts:486-491` makes today, moved), then
  `regenerateProjectEnvFiles` (`envFileGenerator.ts`). Other components are not re-cloned
  (Q7).
- Mesh: `redeployApiMesh` for both kinds; `handleMeshRedeployment` is deleted with its file.
- `baseSteps` (`edsResetService.ts:391`) counts only the steps that run for the kind.

### 4. The Tree write's target branch

`githubFileOperations.ts:759-889` `resetRepoToTemplate(…, templateRef, targetBranch = 'main')`:
the hard-coded `const targetBranch = 'main'` (`:772`) becomes the parameter, used by
`getBranchInfo` (`:778`) and `updateBranchRef` (`:882`). Reset passes `params.branch`;
`lkgPinHelper.ts:137` passes nothing and keeps `main`. Binary and mode handling is develop's,
unchanged. Develop's per-file blob loop (`:795-818`) and `pushFiles`
(`githubTreePush.ts:41-79`) were judged the same job before develop's change; re-read both
when implementing, and if they still are, the reset writes through `pushFiles` and the loop
is deleted (CLAUDE.md, verified duplication in reach).

### 5. Edit (Q2; decision B)

`projects-dashboard/handlers/dashboardHandlers.ts:495-` `handleEditProject`: before opening the
wizard, `readCloneState` on the storefront clone. Only when something would be lost:
- a project with a repository: the modal with "Sync first", "Discard and edit", Cancel;
- a headless project without one (decision B): "Discard and edit" and Cancel, naming the
  changed files; commits are not counted, because its clone's origin is the source.

Whether any other door opens the edit wizard was not traced here; find every
`demoBuilder.createProject` call with an `editProject` argument when implementing and guard
each.

### 6. Agent (Q6)

- `edsResetTool.ts` → `resetProjectTool.ts`, tool `reset_project`; `reset_eds_project` is
  deleted, not aliased. `needsAuth: ['github']`; DA.live checked at run time for EDS
  with `requireDaLive`. Inputs: `includeBlockLibrary`, `verifyCdn` (EDS only; refused on
  headless with "includeBlockLibrary applies to Edge Delivery projects only" and the same
  shape for `verifyCdn`), `discardLocalEdits` (without it, local edits refuse with
  `{ localEdits: { files, commits }, hint: "Call sync_storefront first, or pass
  discardLocalEdits:true once the user agrees." }`), `confirm`. A headless project without a
  repository answers `{ error: NO_OWN_REPOSITORY }` before any confirm.
- `edsToolGuards.ts`: `requireEdsProject` stays for `republish`/`sync_content`; new
  `requireProject` for this tool.
- Copy: `toolNarration.ts:183` "Resetting the project"; `agentAlertCopy.ts:157-`
  consequence line for both kinds; `agentOperationNotifier.ts:60`, `toolDisplayName.ts:31`,
  `edsToolGuards.ts:3` comments.

## Reuse

| Need | Existing piece |
|---|---|
| The reset UI | `resetEdsProjectWithUI`, generalised |
| The pipeline | `executeEdsReset`, generalised |
| Source reachability | `checkDemoSource` |
| Repository rewrite, binaries, pinned sha | `resetRepoToTemplate` (develop) + `resolveTemplateCommitSha` |
| Description file kept | `carrySharedDemoFile` |
| Sync first | `syncProjectStorefront` (step 04) |
| The sentence | `NO_OWN_REPOSITORY` (step 03) |
| npm + env | `installAllComponents`, `regenerateProjectEnvFiles` |
| Mesh | `redeployApiMesh` |
| Baseline record | `recordSyncedCommit` on `recordStorefrontRepository` |

New: `storefrontClone.ts` (no code reads or refreshes a storefront clone's git state today:
the reset folder runs no git, overview Facts) and `resetProject.ts` (the dispatchers' shared
wiring).

## Tests (failing first)

New:

- `tests/features/lifecycle/services/storefrontClone.test.ts` (real temp repositories with a
  bare origin, git run with every `GIT_*` variable stripped, the `homeGitSyncHook.test.ts`
  pattern from step 01): "clean clone reports nothing"; "an untracked file and a modified file
  are counted"; "an unpushed commit is counted"; "managed files are ignored for EDS only";
  "refreshClone lands on origin and keeps node_modules and .env"; "a branch other than main is
  read and refreshed"; control: "a clone one commit behind origin is not dirty".
- `resetProjectUI-localEdits.test.ts`: no modal on a clean clone; modal buttons; "Sync first
  then clean continues"; "Sync first still dirty stops"; "Discard runs"; "an unreadable clone
  stops"; "EDS gets the same guard".
- `resetProjectUI-noRepository.test.ts`: a headless project without a repository shows
  `NO_OWN_REPOSITORY` and nothing else runs (assert the pipeline, source check and sync mocks
  were not called); an EDS project without one keeps today's refusal.
- `edsResetService-headless.test.ts`: EDS-only steps not called for headless (argument
  assertions on the step mocks); the record written with the sha the download was pinned to;
  `refreshClone` called with the recorded branch; mesh through `redeployApiMesh`; only the
  storefront reinstalled.
- `githubFileOperations-resetTemplate.test.ts` (develop's suite): "targetBranch reaches
  getBranchInfo and the ref update"; control: "no targetBranch still resets main".
- `tests/features/projects-dashboard/handlers/dashboardHandlers-projectActions.test.ts`
  (covers `handleEditProject`): the guard's two button sets; no modal on a clean clone.
- `resetProjectTool.test.ts` (replaces `edsResetTool.test.ts`): headless refused inputs;
  repo-less answers the sentence before confirm; local edits refusal body; confirm text.
- Both dashboard handler suites: the handler calls `resetProjectFromDashboard` with its prefix.

Moving pins and mocks (entry 6):

- `tests/features/projects-dashboard/handlers/dashboardHandlers-actions.testUtils.ts:71` mocks
  `projectResetService` — the mock becomes `resetProject`.
- `projectResetService-resetWithUI.test.ts`, `-componentList.test.ts`, `-meshContext.test.ts`:
  deleted with the module; their still-true cases (confirm cancel, mesh skip without Adobe
  context) move to `resetProjectUI-*.test.ts` and `edsResetMeshHelper` tests.
- `edsResetUI.testUtils.ts` mocks `@/types/typeGuards`: add the accessors or `requireActual`.
- `tests/helpers/edsResetParamsFake.ts` (PL-35): rebuilt on `ProjectResetParams`.
- `tests/sop/tool-auth-declarations.test.ts:48, 55`: `dalive` down by one and `github` up by
  one (read the current figures after step 01, do not copy them from here).
- `responseSize.test.ts:543, 581`, `agentOperationNotifier.test.ts:260-302`: tool name.
- `tests/templates/spine-chokepoints.test.ts:81` comment "EDS reset, non-EDS reset" converge on
  `deployMeshComponent`: now one reset.
- `tests/sop/cited-identifiers.test.ts`: the five comments that named `projectResetService`.
- `.rptc/plans/evaluation-mode/battery/unprompted-baseline.json` names `reset_eds_project`:
  a recorded measurement, left as history; the battery prompts that ask for a reset are
  rerun by the owner.

## Docs that change

`docs/systems/mcp-tools.md` (regenerated), `docs/systems/mcp-server.md`,
`docs/systems/agent-alerts.md:56`, `docs/systems/sharing-a-demo.md` (reset of a headless
added demo), `src/features/dashboard/README.md` if it names either reset, CHANGELOG (Q1's EDS
change, Q2's Edit guard, Q7's lost mesh re-clone, the tool rename).

## Acceptance

| Predicate | Evidence |
|---|---|
| One reset | `grep -rn 'resetEdsProjectWithUI\|executeEdsReset\|projectResetService\|handleMeshRedeployment\|buildAppBuilderDefinitionFromInstance\|reset_eds_project' src tests` count captured equals 0; control: the same grep for `resetProjectWithUI` counts 3 or more |
| Split first proved | the seven `edsResetUI-*` suites unchanged at the split commit |
| No EDS step runs for headless | the argument assertions above |
| Gate green | `gate`, pre-push |
| Live, headless (owner confirms each cloud write) | step-03 project: edit a file, Reset: the local-edits modal; Sync first; reset completes; `github.com/<login>/hsr-check` has one new commit; `favicon.ico` on GitHub is byte-identical to the source's (download both, compare sha-256; proves develop's binary fix on the headless path); `components/headless` is at `origin/<recorded branch>`; `.demo-builder.json` `lastSyncedCommit` is the source head; Start runs |
| Live, headless clean (owner confirms) | the same project with no local edits: Reset shows no local-edits modal |
| Live, repo-less | a headless project made before step 03: Reset shows the decision-5 sentence; `git -C components/headless status` and the project file are unchanged |
| Live, EDS (owner confirms) | an EDS project with an uncommitted local edit: the same modal; after Discard the clone matches origin; the site still publishes; the update check right after reset offers nothing |
| Live, Edit | an uncommitted edit in the step-03 project, then Edit: the modal; Cancel leaves the file |
| Live, agent | `mcp-live-probe` `reset_project` without `discardLocalEdits` on a dirty project returns the `localEdits` body; nothing ran |

## Reversal

- Code: revert the commits (split commit last).
- A reset's repository commit is an ordinary commit whose parent is the previous head
  (`githubFileOperations.ts:868-874`, develop): revert it on GitHub to undo. Local edits
  discarded after the SC chose "Discard" are not recoverable by Demo Builder; that is why the
  modal asks.
