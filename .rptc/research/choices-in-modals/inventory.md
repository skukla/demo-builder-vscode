# PL-81 inventory: every place the SC is asked to choose outside a webview modal

Read by hand on 2026-10-16, one site at a time, in the `feature/erp-integration` worktree.
Scope: `src/` (tests excluded). Every `showInformationMessage` / `showWarningMessage` /
`showErrorMessage` call with at least one button, every `showQuickPick` / `createQuickPick`
/ `showInputBox`, and the wrappers that forward to them (`showOneTimeTip`,
`showWebviewQuickPick`, `BaseCommand.confirm/showQuickPick/showInputBox`, the
category-pages watcher's `notify`).

Found with a TypeScript-AST scan (199 calls total, 96 with more than one argument or a
picker), then each site opened.

**Left out on purpose:**

- Calls whose only extra argument is options (`buildStampUi.ts:71`, a dev-only modal
  with no buttons).
- Calls whose only button is a dismiss: `'OK'` (`baseCommand.ts:129/134/139`,
  `updateExecutor.ts:302/383`) and `'Got it!'` (`createHandler.ts:329`).
- Notifications with no buttons.
- `showOpenDialog` / `showSaveDialog` (file pickers belong to the OS, not a choice
  between options).

## Summary

87 sites in the three tables below, plus 9 that already ask through
`askDuringOperation`: the progress modal asks when one is open, and a notification asks
when none is.

| Verdict | Sites | What it means |
|---|---|---|
| **Fits an existing pattern** | 19 | A progress modal is already on screen, or Configure's/PL-80's modal is the right place. The fix is to wrap the work in `withModalAsking` and change the call to `askDuringOperation`. A few need the modal's finished view to carry a button. |
| **New modal on a screen that is already open** | 7 | The screen is open, but it has no progress modal. Almost all are the wizard (Edit's Finish, the Welcome card, the Adobe project picker). |
| **Needs a screen opened** | 8 | Started in the background or from the command palette. The Check for Updates group (PL-80) and the palette's multi-select delete tools. |
| **Must stay as it is** | 34 | No screen at all (settings editor, file watcher, agent), the SC chose "Run in background", a dev-only command, or a button that is only a shortcut to logs or settings. |
| **Unreachable: delete, don't convert** | 14 | Code paths with no caller in the UI or the agent surface (see "Dead paths"). |
| Already asks in the modal (fallback remains) | 5 | The DA.live sign-in form and the Sync commit message: the modal version exists, and the old version runs only when nothing hosts a modal. |

Of the 87, 47 are corner notifications, 25 are VS Code's own native modal dialogs, and 15
are pickers or input boxes. A native modal already blocks the window. When one opens over
a webview progress modal, the SC sees two modals for one operation, which is the problem
PL-59 fixed for sign-ins. The corner notifications are the ones an SC actually misses.

### What an SC hits most in a demo week (judged from the flows, not measured)

1. **Configure, after Save** (4 notifications: Apply Changes, Republish, Redeploy Mesh,
   Restart Demo). Every Configure save that touches the mesh, the storefront or a running
   demo asks in the corner, and Configure's own progress modal opens only after the answer.
2. **Reset** (dashboard and projects list). There are up to three native modals (keep
   content, confirm, remove datapack) stacked over a progress modal that is already
   showing "Starting". Reset is the most-repeated action for an SC.
3. **Delete** (dashboard and projects list). One native modal over the open progress
   modal.
4. **Check for Updates** (PL-80). This runs on its own when the sidebar opens (at most once
   an hour, `sidebarProvider.ts:31`). It asks in a notification, then a picker, then more
   notifications per project, then "Reload Now".
5. **New category pages** (background, EDS projects). Every time new Commerce categories
   appear, it offers "Add pages / Always add for this project".
6. **DA.live sign-in when no modal hosts it** (palette Sign in to DA.live, palette mesh
   deploy, agent sign-in). DA.live tokens expire often. The modal form already exists, and
   these callers just don't use it.

### Recommended order of batches

| # | Batch | Sites | Why this order | Effort |
|---|---|---|---|---|
| 0 | **Delete the dead paths** | 14 | No design needed. Follows "nothing is soft-deprecated". Shrinks the rest. | S |
| 1 | **Configure post-save prompts**: ask as a prompt in Configure's progress modal, then run Republish/Redeploy/Restart in that same modal | 4 (+ the 2 `deployMesh` error toasts that Apply triggers) | Most frequent. The modal already exists on that screen (2026-10-15 Republish). They are corner notifications today. | M |
| 2 | **Dashboard and projects-list confirms** inside the open progress modal: reset (EDS and headless), keep content, datapack removal, plain delete, Integrations "Move", unpromote, reset outcome buttons, sync "Open" | 12 | The progress modal is already up. The work is moving the confirm inside `withModalAsking`. Needs a destructive button style in `OperationProgressModal` first (its first action is always `accent`, `OperationProgressModal.tsx:116`). | S each, M total |
| 3 | **PL-80, Check for Updates as a modal** (picker, extension update, channel switch, stop-running, block-library ask, template conflict, reload) | 8 (+ `AutoUpdater` ×2) | Needs one design call: which screen opens when the background check finds something. Also resolve the duplicate `AutoUpdater` first (finding 4). | L |
| 4 | **Wizard**: Edit's Finish questions, Welcome-card remove, Adobe project delete, trust tip, block-library defaults tip | 7 | The wizard has no progress modal. Needs a modal component on the wizard, or the questions moved onto the Review step. | M–L |
| 5 | **Start demo port conflict** (headless only) | 1 | Needs Start to become a modal-hosted run first. | M |
| — | Palette multi-select delete tools (DA.live sites, GitHub repos) | 3 pickers | Only if the owner wants them on a screen (for example, the projects list). Low frequency. | L |

## Open questions for the owner

1. **The background split.** For prompts with no screen (update check, category pages,
   `.env` changed), should Demo Builder open a screen to ask, or keep the notification?
   Recommendation: keep the notification for offers (category pages, `.env` restart). For
   Check for Updates, open the dashboard (or projects list) with the update modal only
   when the SC presses the notification. A screen that opens by itself in the background
   steals focus mid-demo.
2. **Native modals over a progress modal.** Should these count as PL-81 work, or only
   corner notifications? Recommendation: count them. It is the same "one question, one
   surface" defect PL-59 named, and batch 2 is cheap.

## Table A: corner notifications with buttons (47)

Screen: the webview open at that moment. "Modal?": whether an `OperationProgressModal`
can already be showing this operation.

| # | Site | What it asks | Buttons | How the SC gets there | Screen | Modal? | Verdict | Effort |
|---|---|---|---|---|---|---|---|---|
| A1 | `src/core/vscode/envFileWatcherService.ts:202` | `.env` changed while the demo runs; restart? | Restart Demo | Background: SC edits a `.env` in the editor (headless, running demo) | none (editor) | No | Stay: no screen, and an offer is fine in a corner | — |
| A2 | `src/core/logging/errorLogger.ts:80` | Critical error happened | Show Logs | Prerequisite install or verify fails (`installHandler.ts:336/639`) | wizard (Prerequisites) | No | Stay: logs shortcut, not a choice | — |
| A3 | `src/core/vscode/operationBackgroundNotice.ts:103` | A backgrounded run did not finish | Open Debug Logs | SC pressed "Run in background" on any progress modal | any / none | No (SC dismissed it) | Stay: SC chose background | — |
| A4 | `src/features/mesh/commands/deployMesh.ts:114` | Mesh deploy failed | View Logs | Palette path of mesh deploy, **and Configure's Apply / Redeploy** (`configure.ts:640/731` run the palette command) | configure, or none | No | Stay as a logs link. Goes away in batch 1 if Configure's redeploy runs in its modal | — |
| A5 | `src/features/mesh/commands/deployMesh.ts:124` | Mesh deploy failed (unexpected) | View Logs | Same as A4 | configure, or none | No | Same as A4 | — |
| A6 | `src/features/eds/commands/cleanupDaLiveSites.ts:120` | No sites found in that namespace | Open Debug Logs | Palette: Manage DA.live Sites | none | No | Stay: palette tool, logs link | — |
| A7 | `src/features/eds/commands/manageGitHubRepos.ts:40` | GitHub sign-in needed to manage repos | Sign In | Palette: Manage GitHub Repositories | none | No | Stay (palette); moves with the tool if it ever gets a screen | — |
| A8 | `src/features/eds/handlers/daLive/daLiveAuthPrompt.ts:153` | Need a DA.live token: open da.live or continue | Open DA.live, I have my token | DA.live sign-in when **no** modal hosts it: palette Sign in to DA.live (`commandManager.ts:449`), palette mesh deploy, agent `sign_in` | none / any | No (modal path uses `signInThroughModal`) | Already routed; fallback stays for palette/agent | — |
| A9 | `src/features/eds/handlers/daLive/daLiveAuthPrompt.ts:173` | Run the bookmarklet, then continue | Continue | Same as A8 | none / any | No | Already routed; fallback | — |
| A10 | `src/features/eds/services/catalogMenu/newCategoryPagesWatcher.ts:173` (shown by `newCategoryPagesWatch.ts:67`) | N new categories have no page; add them? | Add pages, Always add for this project | Background: project opened, DA.live sign-in, or timer (`newCategoryPagesWatch.ts:86`) | any / none | No | Stay (background offer). A dashboard notice is possible when the dashboard is open | — |
| A11 | `src/features/eds/services/catalogMenu/newCategoryPagesWatcher.ts:151` | Pages were added automatically | Stop for this project | Background, `categoryPages.autoAdd` on | any / none | No | Stay (background) | — |
| A12 | `src/features/eds/services/reset/edsResetNotifications.ts:48` | Things to know about this added demo; fixes available | See the storefront report | After a successful reset of an added demo | dashboard / projects list | Yes, but it closes on success | Fits: the modal's success view with a `warning` and a button. `OperationOffer` has one action type today (`webviewPayloads.ts:439`) and needs a second | M |
| A13 | `src/features/eds/services/reset/edsResetNotifications.ts:69` | AEM Code Sync app not installed; reset failed | Install GitHub App | Reset fails on missing app (shown even when hosted in the modal) | dashboard / projects list | Yes | Fits: the modal's failure view with an action, or rely on the preflight prompt (`edsResetPreflight.ts:191`, already routed) | S–M |
| A14 | `src/features/eds/services/reset/edsResetNotifications.ts:83` | Reset failed | Show Logs | Only when `!inModal` | — | — | Unreachable: every UI reset sends `progress: 'modal'` (`useOperationRunner.ts:123`), and the agent tools call `executeEdsReset` directly | — |
| A15 | `src/features/eds/services/ewSettingChangeListener.ts:131` | N projects affected by the EW setting; republish? | Republish, Not now | SC edits `daLive.ewCanvasBranch` / `authoringExperience` in Settings | none (Settings editor) | No | Stay: no Demo Builder screen | — |
| A16 | `src/features/lifecycle/commands/syncStorefront.ts:607` | Synced and published; open the live site? | Open | Dashboard Sync tile (modal-hosted) or palette Sync Storefront | dashboard / none | **Yes**. Finding: the command `await`s this toast before returning (`syncStorefront.ts:186`), so the modal waits on a corner toast | Fits: modal success view with a link | S–M |
| A17 | `src/features/lifecycle/commands/startDemo.ts:168` | No project found; create one? | Create Project, Cancel | Start with no current project. Every door found (sidebar, dashboard, projects list) has a project, so this is an edge case | none | No | Stay (edge case) | — |
| A18 | `src/features/lifecycle/commands/startDemo.ts:234` | Port in use by process X; stop it and start? | Stop & Start, Cancel | Dashboard / sidebar / projects-list Start (headless projects only; EDS refuses start) | dashboard / sidebar / projects list | No (`surfaceShowsItself`, `dashboardHandlers.ts:220`) | Fits once Start is a modal-hosted run (batch 5) | M |
| A19 | `src/features/lifecycle/commands/viewStatus.ts:25` | No project found; create one? | Create Project, Cancel | `demoBuilder.viewStatus`: registered, not in `package.json`, no caller | — | — | Unreachable | — |
| A20 | `src/features/lifecycle/commands/viewStatus.ts:97` | Project is X; next action? | Start Demo / Stop Demo / Open Browser / Configure | Same as A19 | — | — | Unreachable | — |
| A21 | `src/features/updates/commands/checkUpdates.ts:175` | Extension update available | Update Extension, Later | **Background**: sidebar opens (throttled hourly, `sidebarProvider.ts:253`); also palette Check for Updates | none / any | No | Needs a screen (PL-80) | L (with PL-80) |
| A22 | `src/features/updates/commands/checkUpdates.ts:326` | Your preview build is superseded; switch channel? | Switch to Beta, Switch to Stable, Stay | Same as A21 (early-access channel only) | none / any | No | Needs a screen (PL-80) | S inside PL-80 |
| A23 | `src/features/updates/commands/updateExecutor.ts:67` | Project is running; stop it before updating? | Stop & {verb}, Skip | After choosing updates in the A21/P10 picker | none / any | No | Fits once updates run in the PL-80 modal | S inside PL-80 |
| A24 | `src/features/updates/commands/updateExecutor.ts:477` | Library has new commits; overwrite local block edits? | Update, Skip | Same, block-library rows, `syncBehavior: ask` | none / any | No | Fits in the PL-80 modal | S inside PL-80 |
| A25 | `src/features/updates/services/extensionUpdater.ts:47` | Updated to vX; reload? | Reload Now, Later | After Update Extension (A21) | none / any | No | Fits as the PL-80 modal's success button | S inside PL-80 |
| A26 | `src/utils/autoUpdater.ts:37` | Version X available; update? | Update Now, Later | **Background timer every 4 h** (`extension.ts:518`, `timeoutConfig.ts:247`) | none | No | Needs a screen, but see finding 4: this is a second update path beside A21 | — |
| A27 | `src/utils/autoUpdater.ts:172` | Installed; reload? | Reload Now, Later | After A26 | none | No | Same as A26 | — |
| A28 | `src/features/dashboard/commands/configure.ts:630` | Apply changes to mesh and storefront? | Apply Changes, Later | Configure Save on an EDS project with mesh and storefront changes | configure | No (opens only after the answer) | **Fits: Configure's progress modal asks first** | M (batch 1) |
| A29 | `src/features/dashboard/commands/configure.ts:680` | Republish the storefront? | Republish, Later | Configure Save, storefront or block-library change | configure | No (opens only after the answer) | **Fits** | S (batch 1) |
| A30 | `src/features/dashboard/commands/configure.ts:724` (warning) / `:725` (info) | Redeploy mesh (and restart demo)? | Redeploy Mesh / Redeploy and Restart, Later | Configure Save, mesh change | configure | No | **Fits** | S (batch 1) |
| A31 | `src/features/dashboard/commands/configure.ts:763` | Restart the demo to apply? | Restart Demo, Later | Configure Save while a headless demo runs | configure | No | **Fits** | S (batch 1) |
| A32 | `src/features/dashboard/handlers/openUrlHandlers.ts:124` | No Admin Panel URL set | Open Configure | Dashboard "Manage Commerce" with no admin URL (also Integrations grid, Setup guide) | dashboard / integrations | No | Stay: a shortcut, not a choice | — |
| A33 | `src/features/dashboard/handlers/openUrlHandlers.ts:206` | No AEM author bound | Open Settings | Dashboard AEM Assets button, nothing bound | dashboard | No | Stay: shortcut | — |
| A34 | `src/features/projects-dashboard/handlers/projectsListOpen.ts:150` | No Admin Panel URL set | Open Configure | Projects-list kebab "Manage Commerce" | projects list | No | Stay: shortcut (a near-twin of A32 that resolves the project by path) | — |
| A35 | `src/features/ai/server/agentOperationNotifier.ts:240` | The agent's run is waiting on you | (the hand-back's link, when it has one) | Agent tool call mid-run | none | No | Stay: agent-initiated | — |
| A36 | `src/features/ai/engine/engineChoiceWatch.ts:31` | Chosen agent CLI is not installed | Use Copilot in VS Code | SC changes `demoBuilder.ai.engine` in Settings | none (Settings editor) | No | Stay: no screen | — |
| A37 | `src/features/project-creation/handlers/createHandler.ts:321` | Tip: trust all Demo Builder projects | Learn How, Skip for Now | Wizard Create, once per machine, untrusted workspace | wizard | No | New modal on the wizard, or drop the tip. Finding: it is `await`ed before creation starts | S |
| A38 | `src/features/project-creation/services/aiBundle/thirdPartyToolingSettingListener.ts:92` | Apply the third-party AI tooling change to projects? | Apply Now | SC flips `ai.enableThirdPartyTools` in Settings | none (Settings editor) | No | Stay: no screen | — |
| A39 | `src/features/projects-dashboard/services/settingsTransferService.ts:251` | Exported to path | Open File, Reveal in Finder | Projects-list Export | projects list | No | Stay: shortcut after a save dialog | — |
| A40 | `src/commands/repairSiteConfiguration.ts:145` | No admin role on the site; can't repair | Manage Site Access, Close | Palette: Repair Site Configuration | none | No | Stay: palette | — |
| A41 | `src/commands/commandManager.ts:140` | Demo running; stop before switching? | Stop & Switch, Cancel | `demoBuilder.loadProject`: registered, not contributed, no caller found | — | — | Unreachable | — |
| A42 | `src/commands/commandManager.ts:384` | Already signed in to Adobe; sign in again? | Sign in again, Cancel | Palette: Sign in to Adobe | none | No | Stay: palette | — |
| A43 | `src/commands/commandManager.ts:449` | Already signed in to GitHub; sign in again? | Sign in again, Cancel | Palette: Sign in to GitHub | none | No | Stay: palette | — |
| A44 | `src/commands/diagnostics.ts:256` | Diagnostics complete | Copy Report, Show Logs, Export Log | Palette: Diagnostics | none | No | Stay: palette | — |
| A45 | `src/core/utils/oneTimeTip.ts:48` via `src/features/project-creation/commands/createProject.ts:380` | Tip: save block-library picks as defaults | Save as Defaults, Open Settings | Wizard, first block-library confirm (`useProjectBuilder.ts:509`), once | wizard | No | New, in the wizard: an inline "save as default" on the block-library step fits better than a modal | S |
| A46 | `src/core/utils/oneTimeTip.ts:48` via `src/features/projects-dashboard/services/projectDeletionService.ts:126` | Tip: cleanup behaviour is a setting | Open Settings | After deleting an EDS project, once | dashboard / projects list | Closed by then | Stay: one-time shortcut | — |
| A47 | `src/commands/configure.ts:113` | Restart to apply the port change | Restart Now | `demoBuilder.configure` (see dead paths) | — | — | Unreachable | — |

## Table B: VS Code native modal dialogs with choices (25)

| # | Site | What it asks | Buttons | How the SC gets there | Screen | Modal? | Verdict | Effort |
|---|---|---|---|---|---|---|---|---|
| B1 | `src/core/vscode/operationPrompt.ts:111` | An agent's run needs an answer | the run's actions | Agent call with no modal hosting | none | No | Stay: the agent surface asks in a VS Code modal by design | — |
| B2 | `src/core/base/baseCommand.ts:244` (`confirm`), called by `src/commands/configure.ts:77` | Redeploy API Mesh? (then "coming soon") | Yes, No | `demoBuilder.configure` only | — | — | Unreachable | — |
| B3 | `src/features/eds/commands/cleanupDaLiveSites.ts:169` | Delete N DA.live sites? | Delete | Palette: Manage DA.live Sites | none | No | Stay (palette), unless the tool gets a screen | — |
| B4 | `src/features/eds/commands/manageGitHubRepos.ts:164` | Permanently delete N repos? | Delete Permanently | Palette: Manage GitHub Repositories | none | No | Same as B3 | — |
| B5 | `src/features/eds/handlers/forgetAddedDemoHandler.ts:172` | Remove this added demo from Welcome (and its repo)? | Forget, Forget and delete | Wizard Welcome: remove a card (also agent `addedDemoTools.ts`) | wizard | No | New modal on the wizard | M |
| B6 | `src/features/eds/handlers/forgetAddedDemoHandler.ts:185` | Delete repo from GitHub? Cannot be undone | Delete repository | After B5 "Forget and delete" | wizard | No | New modal on the wizard (same as B5) | S with B5 |
| B7 | `src/features/eds/handlers/storefrontSetup/storefrontSetupHandlers.ts:93` | Cancelling deletes the repo and content made so far | Yes, Cancel | Arrives **on webview unmount** (comment at `:97`): the wizard is closing | wizard (closing) | No | Stay: the screen is going away, so nothing can host a modal | — |
| B8 | `src/features/eds/services/reset/edsResetSampleData.ts:103` | Also remove the imported datapack? | Remove Datapack, Keep Data | Reset (dashboard / projects list); also an Edit that changes the datapack (`executorEditApply.ts:81`) | dashboard / projects list / wizard | **Yes** for Reset; No for Edit | Fits (Reset). Wizard path goes with batch 4 | S |
| B9 | `src/features/eds/services/reset/edsResetUI.ts:121` | Reset project X? | Reset Project | Reset on an EDS project | dashboard / projects list | **Yes** (`narrateOutcomeToModal` pushes `running` first, `operationProgress.ts:118`) | Fits | S |
| B10 | `src/features/eds/services/reset/edsResetUI.ts:379` | Demo's pages unreachable; reset code and keep content? | Keep current content | Reset of an added demo whose content site is down (`:184`) | dashboard / projects list | **Yes** | Fits | S |
| B11 | `src/features/lifecycle/services/projectResetService.ts:391` | Reset headless project X? | Reset Project | Reset on a headless project | dashboard / projects list | **Yes** | Fits | S |
| B12 | `src/features/updates/commands/templateConflictPrompt.ts:45` | Template update conflicts with your edits in N files | Reset to template | Check for Updates, EDS template row | none / any | No | Fits in the PL-80 modal (it already lists files, so it needs the modal's long-text view) | M inside PL-80 |
| B13 | `src/features/dashboard/handlers/destinationHandlers.ts:312` | Move to Adobe project Y? Integrations are removed and re-added | Move | Integrations screen destination change (inside `withOperationProgress`, `:33`); also Edit Finish (`executorEditApply.ts:78`) | integrations / wizard | **Yes** on Integrations | Fits (Integrations); wizard path in batch 4 | S |
| B14 | `src/features/dashboard/handlers/appBuilderComponentPromote.ts:119` | Create the public repo? | Create repository | Promote with **no** modal | — | — | Unreachable: the card always sends `progress: 'modal'` (`useComponentOperation.ts:50`) and no agent tool promotes | — |
| B15 | `src/features/dashboard/handlers/appBuilderComponentPromote.ts:283` | Delete the app's GitHub repo? | Delete repository | Integrations card "Delete its GitHub repository" (`systemCardActions.ts:129`) | integrations | No (not modal-hosted today) | Fits: run unpromote through the card's operation modal, as promote does | S–M |
| B16 | `src/features/ai/server/agentOperationNotifier.ts:163` | Allow the agent to run X? | Allow, Allow for the rest of this session | Agent tool call that needs consent | none | No | Stay: agent consent, no screen guaranteed | — |
| B17 | `src/features/project-creation/handlers/executorEditApply.ts:222` | Reset the storefront to the new package? | Reset Storefront | Wizard Edit → Finish, package changed | wizard (progress step) | No | New modal on the wizard, or ask on Review before Finish | M |
| B18 | `src/features/project-creation/handlers/executorEditApply.ts:233` | Remove integrations X and Y? | Remove | Wizard Edit → Finish, integrations removed | wizard | No | Same as B17 | S with B17 |
| B19 | `src/features/projects-dashboard/services/deletionConfirmation.ts:34` | Delete project X? | Delete | Delete on a non-EDS project, or EDS with `cleanupBehavior: localOnly` | dashboard / projects list | **Yes** | Fits. The EDS case already asks in the modal (`:158`) | S |
| B20 | `src/features/authentication/handlers/deleteAdobeProjectHandler.ts:125` | Delete Adobe I/O project? | Delete Project | Adobe project picker's delete (`AdobeProjectPicker.tsx`), in the wizard and the Integrations add flow | wizard / integrations | No (teardown uses a notification, `:139`) | New modal (wizard); fits on Integrations once the teardown is modal-hosted | M |
| B21 | `src/commands/ResetAiOnboardingCommand.ts:27` | Reset AI onboarding? | Yes, Reset AI Onboarding, Cancel | Palette, dev builds only | none | No | Stay: dev only | — |
| B22 | `src/commands/ResetAllCommand.ts:26` | Delete all Demo Builder data? | Yes, Reset Everything, Cancel | Palette, dev builds only | none | No | Stay: dev only | — |
| B23 | `src/commands/storefrontReport.ts:81` | Fork is behind its template; catch up? | (`CATCH_UP`) | Palette: Storefront Report; also from A12's button | none (opens a markdown doc) | No | Stay: the report is a document, not a screen | — |
| B24 | `src/commands/storefrontReport.ts:119` | Apply N fixes? | (`APPLY_FIXES`) | Same as B23 | none | No | Stay | — |
| B25 | `src/commands/migrateStorefrontNames.ts:136` | Migrate N storefronts to repo names? | Migrate, Cancel | Palette: Migrate Storefront Names (one-shot) | none | No | Stay: one-shot palette tool | — |

## Table C: pickers and input boxes (15)

| # | Site | What it asks | Choices | How the SC gets there | Screen | Modal? | Verdict | Effort |
|---|---|---|---|---|---|---|---|---|
| C1 | `src/features/eds/commands/cleanupDaLiveSites.ts:146` | Which DA.live sites to delete | multi-select list | Palette: Manage DA.live Sites | none | No | Needs a screen (only if the owner wants these tools on the projects list) | L |
| C2 | `src/features/eds/commands/cleanupDaLiveSites.ts:355` | Which DA.live namespace | list | Same | none | No | Same as C1 | with C1 |
| C3 | `src/features/eds/commands/manageGitHubRepos.ts:141` | Which repos to delete | multi-select list | Palette: Manage GitHub Repositories | none | No | Same as C1 | L |
| C4 | `src/features/eds/handlers/daLive/daLiveAuthPrompt.ts:95` | DA.live namespace | text | DA.live sign-in, no modal (see A8) | none / any | No | Already routed; fallback | — |
| C5 | `src/features/eds/handlers/daLive/daLiveAuthPrompt.ts:118` | DA.live token | password text | Same | none / any | No | Already routed; fallback | — |
| C6 | `src/features/lifecycle/commands/syncStorefront.ts:79` (via `baseCommand.ts:202`) | Commit message | text | Palette: Sync Storefront (the dashboard tile asks in its modal) | none | No | Already routed; fallback | — |
| C7 | `src/features/updates/commands/checkUpdates.ts:211` | Which updates to apply | multi-select across all projects | Background on sidebar open (hourly), or palette | none / any | No | **Needs a screen: PL-80** | L |
| C8 | `src/features/dashboard/handlers/appBuilderComponentRename.ts:76` | New integration name | text | Rename with no `name` in the payload | — | — | Unreachable: the drawer always sends `name` (`requestRename.ts`), and the agent descriptor requires it | — |
| C9 | `src/features/dashboard/handlers/appBuilderComponentPromote.ts:83` | Repo owner | list | Promote with no modal | — | — | Unreachable (see B14) | — |
| C10 | `src/features/dashboard/handlers/appBuilderComponentPromote.ts:95` | Repo name | text | Same | — | — | Unreachable | — |
| C11 | `src/features/projects-dashboard/services/deletionConfirmation.ts:168` | Which online resources to delete with the EDS project | multi-select | EDS delete with no modal id | — | — | Unreachable: both screens send `progress: 'modal'`, and the agent's `deleteProjectTool.ts` calls `deleteProjectFiles` directly | — |
| C12 | `src/features/projects-dashboard/services/settingsTransferService.ts:151` (via `quickPickUtils.ts:54`) | Which project to copy settings from | list | Copy settings with no modal | — | — | Unreachable: the projects list always starts it as a modal operation (`projects-dashboard/ui/index.tsx:222`) | — |
| C13 | `src/commands/showPromptsPicker.ts:41` (via `quickPickUtils.ts:54`) | Which AI prompt to insert | list + Manage prompts | Sidebar "Prompts" tile | sidebar | No | Stay: a launcher into the Claude terminal, not a decision the work waits on. The sidebar is too narrow for a modal | — |
| C14 | `src/commands/configure.ts:42` (via `baseCommand.ts:198`) | What to configure | env / mesh / port / advanced | `demoBuilder.configure` | — | — | Unreachable | — |
| C15 | `src/commands/configure.ts:96` (via `baseCommand.ts:202`) | New port number | text | Same | — | — | Unreachable | — |

## Already asking in the modal (9, not counted above)

These call `askDuringOperation` (`src/core/vscode/operationPrompt.ts:88`). The open
progress modal asks when one hosts the run. With no modal, an agent call gets a VS Code
modal and a button press gets a notification. The notification fallback is reachable only
where a caller runs without a hosting modal.

| Site | What it asks |
|---|---|
| `src/core/auth/adobeAuthGuard.ts:92` | Adobe sign-in needed: Sign In, Cancel |
| `src/features/mesh/handlers/shared.ts:99` | Adobe sign-in needed: Open Dashboard |
| `src/features/eds/handlers/daLive/daLiveAuthGuard.ts:76` | DA.live expired: Sign In |
| `src/features/eds/services/reset/edsResetPreflight.ts:191` | Code Sync app missing: Install App, Continue Anyway |
| `src/features/eds/services/reset/edsResetPreflight.ts:202` | After installing: Continue, Cancel |
| `src/features/lifecycle/commands/syncStorefront.ts:251` | Merge conflicts: Continue, Cancel and Reset |
| `src/features/project-creation/services/appBuilderComponentRunnerDeps.ts:99` | Adobe CLI out of date: Update & Retry, Not Now |
| `src/features/projects-dashboard/services/edsExternalCleanup.ts:254` | GitHub sign-in to delete repo: Sign In |
| `src/features/authentication/services/ensureProjectOrgContext.ts:83` | Project's org unreachable: Switch IMS Org, Cancel |

## Dead paths (14 sites): delete them rather than convert them

| Sites | Why unreachable |
|---|---|
| `src/commands/configure.ts:42, :77, :96, :113` (B2, C14, C15, A47) | `demoBuilder.configure` is not in `package.json`. Its callers are the sidebar's `openConfigure`, whose button is never rendered (`Sidebar.tsx:74` takes `onOpenConfigure: _onOpenConfigure`, unused), and `viewStatus` (below). Its mesh option says "coming soon". |
| `src/features/lifecycle/commands/viewStatus.ts:25, :97` (A19, A20) | `demoBuilder.viewStatus` is registered (`commandManager.ts:180`) but not in `package.json`, and nothing executes it. |
| `src/commands/commandManager.ts:140` (A41) | `demoBuilder.loadProject` has no caller and is not contributed. |
| `src/features/dashboard/handlers/appBuilderComponentPromote.ts:83, :95, :119` (C9, C10, B14) | Non-modal promote branch. The card always sends `progress: 'modal'`, and no agent tool promotes. |
| `src/features/dashboard/handlers/appBuilderComponentRename.ts:76` (C8) | The UI and the agent always send a name. |
| `src/features/projects-dashboard/services/deletionConfirmation.ts:168` (C11) | Non-modal EDS delete picker. Both screens send the modal flag. |
| `src/features/projects-dashboard/services/settingsTransferService.ts:151` (C12) | Non-modal copy-settings picker. |
| `src/features/eds/services/reset/edsResetNotifications.ts:83` (A14) | Fires only when not in a modal. No such caller. |

Also unused: `showWebviewQuickPickMany` (`src/core/utils/quickPickUtils.ts:86`) has zero
callers outside its own file.

"Unreachable" here means: no caller found in `src/` (UI handlers, commands, `package.json`
contributions, the agent's descriptors). A user keybinding to an uncontributed command id
could still reach the command ones. Confirm with `dead-code-scan` before deleting.

## Findings met along the way (not PL-81 itself)

1. **Sync's modal waits on a corner toast.** `syncStorefront.ts:186` `await`s
   `reportSyncResult`, which `await`s the "Open" toast (`:607`) or an `'OK'` toast. When
   the dashboard tile hosts the sync in its modal, the outcome reaches the modal only after
   the SC dismisses the toast. Read from the code; not run.
2. **The trust tip is `await`ed before project creation starts** (`createHandler.ts:321`).
   An unanswered tip may hold the Create until dismissed. Whether VS Code settles that
   promise when the toast slides into the notification centre is unknown; check before
   relying on it.
3. **The sidebar's `checkUpdates` action names a command that does not exist.**
   `sidebarProvider.ts:78` says `demoBuilder.checkUpdates`; the registered id is
   `demoBuilder.checkForUpdates` (0 registrations for the first, 1 for the second). The
   button is not rendered today (`Sidebar.tsx:75`, `_onCheckUpdates`), so the defect is
   latent.
4. **Two update checkers.** `src/utils/autoUpdater.ts` checks every 4 h with its own
   notification, download and reload (A26, A27). `checkUpdates.ts` does the same on
   sidebar open (A21, A25). PL-80 should settle on one before converting either.
5. **The progress modal cannot style a destructive answer.** `OperationProgressModal.tsx:116`
   makes the first prompt action `accent`. Delete, Reset and Move confirms moved into it
   need a negative variant, or they lose the warning a native modal's styling gives.
