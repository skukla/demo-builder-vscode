# Entry-point drift audit (2026-11-18)

Read-only audit. Question from the owner: Adobe sign-in passed its spine pin (one
`aio auth login` site) but had seven entry points, each re-deciding policy. Is the same
thing happening elsewhere?

## Summary for the owner

Yes. I audited 30 user actions. 11 have one door (one function every button, command and
agent tool goes through). 5 have several doors that agree. 14 have doors that disagree
about policy: 13 I verified by reading both doors, plus sign-in, which you already know.
Three more are leads I pattern-matched but did not finish reading.

The worst three, by risk to an SC:

1. **Reset from the agent is a smaller, less careful reset.** It skips the wrong-org
   check and the GitHub App check. It never marks the project as "resetting". It also
   leaves the block library alone and skips the CDN check, which the button always runs.
2. **Two GitHub sign-ins store a narrower token.** Manage GitHub Repositories and Delete
   Project sign in with fewer permissions than every other door. Later storefront work
   can then fail, for example writing workflow files.
3. **Datapack installs during creation and reset skip the validation step.** The Data
   Installer screen checks a request before sending it. Creation and reset build their
   own request and send it unchecked.

Why nothing caught it: the spine test checks only the bottom call. Its header says
"entry points may multiply freely". Nothing counts doors or compares them.

Recommended enforcement: a door ledger (a checked-in list of allowed doors per action)
checked on every test run, in both directions, like the reversibility ledger. Add three
cheap checks beside it: agent-only handlers, spine results a door must act on, and
token writes. Details below.

## How to read the table

- **Spine primitive**: the single call that does the effect.
- **Pinned?**: whether `tests/templates/spine-chokepoints.test.ts` pins it. "primitive"
  means only the bottom call is pinned; "doors" means the door list is pinned too.
- **Verdict**: One door / Same policy (several doors that only adapt input or output) /
  **Drift (verified)** (I read both doors) / Lead (pattern-matched, not fully read).
- File:line references are as of `988e84d0e`.

## The table

| # | Action | Spine primitive | Pinned? | Doors (file:line) | Verdict | Policy difference |
|---|---|---|---|---|---|---|
| 1 | Adobe sign-in | `aio auth login` in `adobeSignIn.ts` | primitive | 7 (known; being rewritten) | **Drift (known)** | Each door re-decided forced mode and after-steps; `reAuthenticate` forced to dodge a spine bug |
| 2 | GitHub sign-in (token store) | `tokenService.storeToken` after `vscode.authentication.getSession('github', …)` | no | `edsGitHubHandlers.ts:258-277` (`acquireGitHubSession`, used by `signInToGitHub` for wizard, palette `commandManager.ts:459-480`, agent `sign_in` via `authTools.ts:275`); `manageGitHubRepos.ts:146-161`; `edsExternalCleanup.ts:369-372` | **Drift (verified)** | Main door asks for `GITHUB_SCOPES` = repo, user, read:org, delete_repo, workflow (`types.ts:154`) and recovers a stale cached session (`edsGitHubHandlers.ts:138-157`). The other two ask for and STORE only `['repo','delete_repo']`, with no stale-session recovery. The stored token is shared, so the narrow one is what later storefront work gets. Consequence (missing `workflow`/`read:org` breaks later steps) is inferred, not run |
| 3 | DA.live sign-in | `showDaLiveAuthQuickPick` + `authService.storeToken` | no | palette `commandManager.ts:436`; agent `authTools.ts:301`; in-flow guard `daLiveAuthGuard.ts:93`; wizard `edsDaLiveAuthHandlers.ts:198` | Same policy | Both store sites run the same `validateDaLiveTokenStrict`. Agent's fire-and-forget is a surface adaptation |
| 4 | DA.live token for storefront teardown | `tearDownStorefront` (pinned) fed by a token provider | doors pinned, token choice not | button delete `edsExternalCleanup.ts:148-168` (`ensureDaLiveAuthShared`, DA.live session only, asks to sign in); agent delete `agentProjectCleanup.ts:167`; `cleanup_dalive_site` `cloudResourceTools.ts:73`; Manage DA.live Sites `cleanupDaLiveSites.ts:58` | **Drift (verified)** | Three doors use `firstUsableDaLiveToken` (`daLiveTokenChain.ts:26-40`), which falls back to the Adobe IMS token. The agent door's own comment (`agentProjectCleanup.ts:162-166`) says Helix rejects that token and claims "the button … already choose it this way". The button does not: it uses the DA.live session only |
| 5 | Reset project (storefront) | `executeEdsReset` (`edsResetService.ts:86`) | sub-steps only (catalog menu, product pages, leftover pages) | button and batch `projectsBatchHandlers.ts:96` and Edit `executorEditPackage.ts:104`, both via `resetEdsProjectWithUI` (`edsResetUI.ts:130`); agent `runEdsReset` (`edsResetTool.ts:87`, called from `resetProjectTool.ts:225`) | **Drift (verified)** | (a) Button and Edit pass `includeBlockLibrary: true, verifyCdn: true` (`projectsBatchHandlers.ts:101-102`, `executorEditPackage.ts:112-113`). Agent defaults both to false (`edsResetTool.ts:145-146`). (b) Org-mismatch check `checkOrgContext` (`edsResetUI.ts:221`) runs for any project with an Adobe org; the agent checks only "is a token valid" and only when a mesh exists (`edsResetTool.ts:107-113`). (c) GitHub App check (`edsResetUI.ts:232`) is absent from the agent. (d) `whileRunning(…,'resetting')` (`edsResetUI.ts:176`) is absent, so the projects list does not show the project resetting during an agent reset |
| 6 | Reset project (headless) | `whileResetting` + `resetWithDatapack` in `projectResetService.ts` | no | batch `runProjectResetAnswered` (`projectResetService.ts:362`); agent `executeProjectReset` (`:290`, from `resetProjectTool.ts:119`) | Same policy | Both share the steps. The button stops a running demo and the agent refuses (`resetProjectTool.ts:98-103`). Deliberate and documented |
| 7 | Delete project | leaf steps pinned (`tearDownStorefront`, `deleteStorefrontRepository`, `deleteProjectFiles`) | leaves and their doors | button `runProjectDelete` (`projectDeletionService.ts:43`) to `performEdsCleanup` (`edsExternalCleanup.ts:389`); agent re-orchestrates in `deleteProjectTool.ts:113-131` + `cleanUpProjectCloud` (`agentProjectCleanup.ts:149`) | **Drift (verified)** | The agent does not call `runProjectDelete`. It re-implements the order and the stop rules beside it (5 "as the button does" comments in that file). The token choice already differs (row 4). Defaults from the `cleanupBehavior` setting and the shared-resource filter are input adaptations, fine |
| 8 | Republish storefront (full) | `republishStorefrontContent` (`storefrontContentRepublishService.ts:243`) | store-change sub-step only | button `edsContentHandlers.ts:202`; agent `storefrontTools.ts:123` | **Drift (verified)** | After success the button runs `recheckCodeStep` (`edsContentHandlers.ts:229`), which marks the Finish Setup "Republish the Code" step done. The agent does not, so the same republish leaves the checklist behind |
| 9 | Republish storefront settings (config.json) | `republishStorefrontConfig` (`storefrontRepublishService.ts:223`) | no | mesh command `deployMesh.ts:70`; mesh handler `deployHandler.ts:52`; Configure `configureStorefrontRepublish.ts:152`; authoring flip `authoringExperienceFlip.ts:205`; full republish `storefrontContentRepublishService.ts:284`; creation `meshAddressRepublish.ts:49`; Repair command `repairSiteConfiguration.ts:115` | **Drift (verified)** | The service says `ensureDaLiveSession` is "optional only for callers with nobody to ask; production callers pass it" (`storefrontRepublishService.ts:57-60`). The Repair command is a palette command (a person is there) and does not pass it. Separately, the agent's `repair_site_configuration` answers `nextStep: 'republish'` (`siteTools.ts:327`), the full republish, where the command does a settings-only one |
| 10 | Deploy mesh | `aio api-mesh:create/update` in `meshDeployment.ts` | primitive | palette `deployMesh.ts:57`; screen button `deployMeshFromScreen` (`deployHandler.ts:100`); agent `deploy_mesh` to `handleDeployApiMesh` (`deployHandler.ts:77`); creation `meshSetupService.ts:269,384`; reset `edsResetMeshHelper.ts`, `deployMeshHeadless.ts` | **Drift (verified)** | `meshDeployLock` (one deploy at a time, "whichever door started it", `meshDeployLock.ts:1-4`) is taken by the palette (`deployMesh.ts:29-34`) and the button (`deployHandler.ts:104-111`). `handleDeployApiMesh` takes no lock and skips `_internal.meshActionTaken` (`deployHandler.ts:82-90`). No webview sends `deploy-api-mesh`; it is the agent's door only. An agent deploy can run beside a button deploy. The `republishStorefront` after-step closure is also hand-copied in two places (`deployHandler.ts:50-58`, `deployMesh.ts:65-79`), same policy for now |
| 11 | Delete mesh | `MESH_DELETE_COMMAND` (`meshDeleteCommand.ts:21`) | primitive | agent `delete_mesh` to `handleDeleteApiMesh` (`deleteHandler.ts`); integration removal `appBuilderComponentTeardown.ts:292`; failed-creation cleanup `creationFailureCleanup.ts:95` | **Drift (verified, partial)** | The agent door deletes the cloud mesh and saves nothing to the project; it clears only an in-memory flag (`deleteHandler.ts:92-99`). Removal deletes as part of removing the component record. The agent door takes no `meshDeployLock` either. Lead: the pin's comment and the call-path-audit worklist name a "dashboard delete" door, but no webview sends `delete-api-mesh` (literal search, 0 UI senders), so that label looks stale |
| 12 | Install / remove a datapack | `engine.startImport` / `engine.startDelete` | no | Data Installer screen and agent via `startDatapackImport` (`importStart.ts:89`) and `reset-datapack` (`importHandlers.ts:176`); creation `installSampleData` (`executorDatapackPhase.ts:69`); reset and delete removal `removeSampleData` (`edsResetDatapack.ts:193`), both via `runSampleDataJob` (`projectDatapackInstall.ts:179`) | **Drift (verified)** | Two engines with two request builders. The handler path validates with the synchronous twin before starting. Its own comment says that is "the only thing that will tell us this request is malformed. A 202 from the async entry point would not" (`importStart.ts:106-110`). `runSampleDataJob` builds its own `ImportRequest` and calls start directly with no validation (`projectDatapackInstall.ts:222-232`) |
| 13 | Start / stop demo | `demoBuilder.startDemo` / `stopDemo` (`commandManager.ts:188,192`); terminal factory pinned | primitive | every button, list, agent and internal caller goes through the command | One door | none |
| 14 | Restart demo | stop then start | no | `demoBuilder.restartDemo` (`extension.ts:640-646`); env watcher `envFileWatcherService.ts:209-210`; Configure screen `dashboard/commands/configure.ts:766-767`; port change `commands/configure.ts:119-120` | **Drift (verified, small)** | Only the command waits `DEMO_STATUS_UPDATE_DELAY` between stop and start. Three hand-rolled copies do not, and two of them drop the project path. Four copies is past the repo's Rule of Three |
| 15 | Open Commerce Admin | `openCommerceAdmin` (`commerceAdmin.ts:70`): resolve, `validateURL`, `openAdminUrl` | no | data installer `demoDataHandlers.ts:108`, `buildDatapackEngine.ts:152`, dashboard `openUrlHandlers.ts:125`; projects list re-inlines it `projectsListOpen.ts:144-185`; agent `open_url` `lifecycleTools.ts:137` with `vscode.env.openExternal` injected at `extension.ts:837-838` | **Drift (verified)** | The agent opens the URL in the default browser with no `validateURL`, and returns the URL in its answer. The house opener validates it and opens Classic Admin in a private window. Code elsewhere says the URL may embed credentials and must not be echoed (`commerceAdmin.ts:67`, `projectsListOpen.ts:170-171`). The projects-list copy agrees with the house opener today |
| 16 | Create project | `executeProjectCreation` (`executor.ts:178`) | no | wizard `createHandler.ts:236`; agent `createProjectTool.ts:417,624` (both agent tools funnel through `runProjectCreation`, `:710`) | Lead | Shared: the name check and failed-creation cleanup. Different: the wizard wraps creation in `withTimeout`, the agent does not. The agent door rebuilds the wizard's state by hand (11 "as the wizard does" comments) |
| 17 | Create GitHub repository | `createFromTemplate` (github mutations pinned) | primitive | wizard `createRepoFromSource` (`storefrontSetupPhase1.ts:384-410`); agent `create_github_repo` (`cloudResourceTools.ts:167`) | **Drift (verified, small)** | The wizard handles a source that is not a GitHub template (empty repo, then reset onto the source). The agent calls `createFromTemplate` directly and fails on such a source. Turning Actions off is in the spine, so both doors get it |
| 18 | Delete GitHub repository | `deleteStorefrontRepository` | doors | 6 doors listed in the pin | One door | none (the newer, door-level pin) |
| 19 | Remove storefront pages and site | `tearDownStorefront`, `removeProductPages`, `unpublishPages` | doors | listed in the pins | One door, apart from the token choice (row 4) | |
| 20 | Rename project | `renameProjectCore` (`projectRenameService`) | no | `projectManagementHandlers.ts:63`; `projectsListLifecycle.ts:110`; `executorEditRename.ts:29`; agent via descriptor | Same policy | Two handlers share one name and adapt "current project" vs "project by path" |
| 21 | Apply updates | `applyUpdatesHeadless` (`updateApplyService.ts:341`) | no | modal `updatesModalHandlers.ts:235`; agent `applyUpdatesTool.ts:166` | Same policy | Modal stops running demos; agent refuses. Deliberate, matches reset |
| 22 | Sync storefront | `syncAndPublish` (`storefrontSyncService`) | no | palette and tile `syncStorefront.ts`; agent `mcp/storefrontSyncHandler.ts:98` (separate process) | Lead | Credentials come from env vars for the agent and from the token service for the command. With none, the agent skips the Helix publish (`storefrontSyncHandler.ts`, around line 118). Conflict handling is surface-specific |
| 23 | Delete Adobe Console project | `teardownConsoleProject` (`consoleProjectTeardown.ts`) | no | handler `deleteAdobeProjectHandler.ts` (button); agent `adobeResourceTools.ts:292` | **Drift (verified)** | The spine returns `shouldClearConsoleSelection` and its docstring says the HANDLER must act on it (`consoleProjectTeardown.ts:22,141`). The button does (`deleteAdobeProjectHandler.ts:239`) and validates ids first (`:107-108`). The agent tool does neither. Caveat: this folder is being rewritten tonight; re-check after |
| 24 | Add / deploy / redeploy / update / remove integration | `aio app deploy` / `undeploy`, app-management POSTs | primitive | buttons and agent descriptors send the same handler types | One door | |
| 25 | Clear demo data / clear Commerce instance | `clear-demo-data` / `clear-commerce-instance` handlers | no | palette opens the same window; agent descriptor uses the same handler | One door | |
| 26 | Install prerequisite | `install-prerequisite` handler | no | button and descriptor | One door | |
| 27 | Regenerate AI files | `regenerate-ai-files` handler | no | button and descriptor | One door (the separate four-seam rule covers creation vs regenerate) | |
| 28 | Pin project | `setProjectPinned` | no | button and descriptor | One door | |
| 29 | Export project settings | `exportProjectSettings` | no | agent descriptor only | One door | |
| 30 | VS Code settings writes | `getConfiguration().update` | negative pin | four single-site actions | One door each | |

Not traced (named so the gap is visible): edit project (wizard edit vs `configure_project`),
export or import demo bundle (EDS-72 just landed), copy project, ERP actions, block-library
promote and remove, add or forget an added demo.

Counts: 30 actions. 11 one door (13, 18, 19, 24 to 30). 5 same policy (3, 6, 20, 21, and
row 19's doors). 14 drift: 13 verified (2, 4, 5, 7, 8, 9, 10, 11, 12, 14, 15, 17, 23) plus
sign-in (1). 3 leads (16, 22, and the stale mesh-delete door label in 11). Row 19 is
counted once, under one door.

### A signal worth keeping

A door that copies another door's policy by hand says so in a comment. Searching `src/`
for "as the button / wizard / window / batch does" and "mirrors the …" finds 64 such
comments. They cluster in exactly the drifting agent doors: `createProjectTool.ts` 11,
`deleteProjectTool.ts` 5, `storefrontTools.ts` 3, `edsResetTool.ts` 3. Each one marks a
policy kept equal by memory, not by code.

## Why the instruments did not catch it

- `spine-chokepoints.test.ts` pins where the primitive lives. Its header states the gap
  outright: "Entry points may multiply freely; the primitive may not" (line 13). 13 of its
  23 blocks check the primitive only. The newer storefront blocks (catalog menu, product
  pages, repository delete, store change, unpublishing) do pin door lists, which is why
  rows 18 and 19 are clean. That pattern was never applied back to the older blocks.
- `call-path-audit` step 1 ("trace down from the doors") asks whether doors CONVERGE on the
  spine, not whether they AGREE about policy. Converging doors with different guards pass.
- Nothing counts doors per action. I checked every suite in `tests/sop/` and
  `tests/templates/`, plus the scan and sweep skills. The nearest model is
  `reversibility.ledger.json`: one row per agent capability, checked against the tool list
  in both directions. It answers "can this be undone?", not "how many ways in?".
- `ai-coverage-scan` measures whether an agent CAN reach a capability. It counts an agent
  door as coverage even when that door re-implements the button with different guards.
  Rows 5, 7, 10 and 23 all score as covered.

## Recommended fixes (wrong outcome for an SC first)

| Order | Fix | Rows | Size |
|---|---|---|---|
| 1 | One storefront reset for every door. Move the pre-flight (org check, GitHub App check, `whileRunning`) out of `resetEdsProjectWithUI` into a function both doors call. The agent supplies a "cannot ask" adapter that turns each would-be dialog into a refusal it can act on. Decide the block-library and CDN defaults once, in the spine | 5 | medium |
| 2 | One GitHub sign-in. `manageGitHubRepos.ts` and `edsExternalCleanup.ts` call `signInToGitHub`, so the stored token always has `GITHUB_SCOPES`. Pin it so the only `getSession('github'` with `createIfNone` or `forceNewSession` lives in `acquireGitHubSession` | 2 | small |
| 3 | One datapack job runner. `runSampleDataJob` gets the handler path's validation step, or both build the request through `prepareImport` | 12 | medium |
| 4 | The agent's mesh deploy takes `meshDeployLock` and fires `meshActionTaken`, like the other two doors. `delete_mesh` takes the lock too and records the mesh as gone on the project | 10, 11 | small |
| 5 | Delete project: the agent calls `runProjectDelete` with a no-prompt adapter, and `cleanUpProjectCloud` is deleted. Decide one DA.live token rule for teardown, then fix the false comment at `agentProjectCleanup.ts:162-166` | 4, 7 | medium |
| 6 | `delete_adobe_project` validates ids and acts on `shouldClearConsoleSelection`. Better: move the selection clear into the spine so no door can forget it. Do this after the sign-in rewrite lands | 23 | small |
| 7 | `open_url` with target `commerceAdmin` goes through `openCommerceAdmin`, and the URL is left out of the answer. `projectsListOpen.ts` calls `openCommerceAdmin` too | 15 | small |
| 8 | The agent republish runs `recheckCodeStep`. Better: move it into `republishStorefrontContent`'s success path | 8 | small |
| 9 | The Repair command passes `ensureDaLiveSession`. Make the field required, with an explicit `null` for callers with nobody to ask, so the compiler asks every new caller | 9 | small |
| 10 | The three restart copies call `demoBuilder.restartDemo` with the project path | 14 | small |
| 11 | `create_github_repo` goes through `createRepoFromSource` | 17 | small |

## Recommended enforcement

### 1. Door ledger (per jest run): `tests/templates/action-doors.ledger.json` plus a block in `spine-chokepoints.test.ts`

One row per action. The row names the spine ENTRY (the policy owner, one level above the
primitive) and the exact set of files allowed to call it, each with a reason. Checked in
both directions, like the reversibility ledger: a new caller fails, and so does a ledger
door that no longer calls it.

```jsonc
{
  "storefront-reset": {
    "entry": "\\bresetEdsProject\\(",           // the one policy owner
    "doors": {
      "features/projects-dashboard/handlers/projectsBatchHandlers.ts": "button, single and batch",
      "features/project-creation/handlers/executorEditPackage.ts": "Edit that changes the package",
      "features/ai/server/resetProjectTool.ts": "agent; supplies the cannot-ask adapter"
    },
    "policyArgs": ["includeBlockLibrary", "verifyCdn", "force"]   // doors may not pass these
  }
}
```

```ts
it.each(Object.entries(ledger))('%s: exactly the ledger doors call the entry', (_, row) => {
    const callers = filesTouchingPrimitive(new RegExp(row.entry)).filter((f) => f !== row.spine);
    expect(callers.sort()).toStrictEqual(Object.keys(row.doors).sort());
});
it.each(Object.entries(ledger))('%s: no door passes a policy argument', (_, row) => {
    for (const door of Object.keys(row.doors)) {
        const code = codeOf(door);                       // comment-stripped, as the file already does
        for (const arg of row.policyArgs ?? []) expect(code).not.toMatch(new RegExp(`\\b${arg}\\s*:`));
    }
});
```

The second check is the one that would have caught sign-in: `force:` passed at a door is
a door deciding mode. Seed the ledger from the table above. Each verified drift row starts
as a failing entry, or as a ledger exemption carrying its fix-row number, so the debt is
written down rather than hidden.

### 2. Agent-only handler check (per jest run)

Every descriptor `type` in `actionDescriptors.ts` and `dataInstallerDescriptors.ts` must
also be sent by some webview under `src/**/ui/`, or carry a ledger reason. Today this
flags `deploy-api-mesh`, `delete-api-mesh` and `exportProjectSettings`. The first two are
real drift (rows 10 and 11). A handler only an agent reaches is a second door by
construction, and nobody watches it.

### 3. "Spine hands the door a job" check (per jest run)

A spine result field named `should*` (today `shouldClearConsoleSelection`) means the door
must act. Assert that every door file in the ledger reads that field. Better still, ban
such fields in spine result types so the spine does the job itself.

### 4. Credential-write pins (per jest run)

Add to `spine-chokepoints.test.ts`: `getSession('github'` with `createIfNone` or
`forceNewSession` only in `edsGitHubHandlers.ts`; `firstUsableDaLiveToken(` only at the
doors the ledger allows. These are the token-level siblings of the sign-in pin.

### 5. Sweep (periodic, `npm run sweep`)

- A **reported** row, "door census": for every ledger action, list its spine-entry
  callers and the count of "as the button / wizard does" comments per file. A rising count
  is drift starting.
- Add a step 5 to `call-path-audit`, "compare the doors": for each action with more than
  one door, put the doors' pre-flight checks, defaults and after-steps side by side. Any
  difference is either a surface adaptation (written in the ledger reason) or a finding.
  Update the skill's worklist so each PINNED row also records "doors pinned: yes / no".

Checks 1 to 4 are cheap text scans like the existing pins, so they belong in the per-run
suite. Check 5 needs judgement, so it belongs in the sweep.
