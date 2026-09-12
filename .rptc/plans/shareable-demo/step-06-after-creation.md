# Step 06 — Reset, update, edit and forget an added demo

Item: [[EDS-13a]]. Decisions: D2, D4. Depends on steps 01 and 05.

**Reuse:** section G of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## Goal

Every door in research §3b behaves for an added demo as it does for a shipped one, because
each reads the step-01 resolver. This step is mostly verification of step 01 against a real
project, plus the few places that need a colleague-specific rule.

| Door | Expected after steps 01 + 05 | Colleague-specific rule |
|---|---|---|
| Reset (both dashboard doors, MCP) | resolves the stored row; re-fetches the demo's source; re-copies pages | no LKG pin (`edsResetRepoHelper.ts:286` branch is skipped because no `codePatchSource`); the dry check re-runs and reset's completion message gains the same consequence-worded caveat list the wizard card shows (reset has no caveat channel today: `edsResetUI.ts` shows none); nothing persists (D23) |
| `refresh_block_library` | passes the template guard | — |
| Edit-mode rebuild | rehydration finds the row | a MISS logs at warn (step 01) |
| Republish / `.env` regenerate | flags from the stored row | the SC's B2B answer is one of those flags |
| Dashboard subtitle, projects-list card | the demo's name | — |
| AGENTS.md | the demo's name | — |
| Update checker / template sync | UNCHANGED code: `checkForkSyncUpdates` already checks whether the project's template repo is a fork behind its parent (the SC's fork behind Jen) and offers a pre-ticked sync per repo; `TemplateUpdateChecker`'s non-thin-layer path offers each project "N changes behind" its template (Jen's `main` when unforked, the fork when forked); both in one picker, one confirmation | `getTemplateSource` (`updateTypes.ts:90`) reads instance metadata: Change source and rename self-heal must update it together with the project row, or step 01's resolver becomes what it reads |
| Name migration, site-config repair | resolve without overlay | — |
| Block-library audience, inspector overrides | defaults | accepted degradation, named in docs |

## When the source is unreachable (unforked demos; and content for all)

Today: reset fails midway with raw git output (`githubRepoOperations.ts:551`), the update
check logs a warning and shows nothing (`templateUpdateChecker.ts:205`), nothing displays a
project's source. Decided 2026-09-11 (owner):

- **Notice.** The dashboard shows a notice on the project (the dashboard-notice convention in
  `spectrum-webview-ui`): "Jen's demo can't be reached. Reset and updates are unavailable
  until it is." The source is probed by the same handler as step 03, read-only.
- **Reset refuses up front** with that sentence, before the confirmation dialog, instead of
  failing midway with git output. The check is a preflight in `extractResetParams`'s caller.
- **Rename self-heal.** When GitHub answers with a different `full_name` (a redirect), the
  stored owner/repo in the project row and the remembered setting are updated silently and
  logged, the way the storefront name migration already self-heals names.
- **Change source.** A dashboard action reopens the Add dialog on stage 1 to point the
  project at a new link of the SAME kind (EDS to EDS, headless to headless), or at a fork
  made now if the original still exists. It rewrites the project row's source and, when the
  SC asks, the remembered setting; it touches neither the SC's repo nor their site.
  Pointing back undoes it.
- **Content is not forkable.** When the colleague's DA.live site (or the fork's upstream
  site) has no reachable index at reset time, reset offers "keep my current content" and
  resets code only, instead of failing on the index.

## Tests first

The reset-params suite with a project carrying a stored row (injected `packages` empty to
prove the catalog is not consulted); the config-flag suite with a stored `configFlags`; the
dashboard/projects-list name tests with a stored row.

## Done when

On a real project created in step 05: reset completes from both doors, Configure opens with
the demo card present, republish preserves the B2B flags, and the update check reports
against the colleague's `main`.

## Built (2026-09-12)

Every door below reads the project's own row first (step 01's resolver), so a project
built on an added demo behaves as one built on a shipped brand; what follows is the
colleague-specific rule at each door, as decided on 2026-09-11.

**Reset.** `edsResetRepoHelper.ts` resets to the row's branch (`main` when the row names
none) and re-runs the load-bearing dry check against the demo's code on every reset; the
caveats ride `EdsResetResult.demoCaveats` and reach the SC as one warning after the
success toast ("A few things to know about this demo: …"), the same sentences the wizard's
completion card shows. The dry check itself is one shared function now,
`addedDemoCaveats` in `loadBearingPatches.ts`, used by creation and reset. The agent's
`reset_eds_project` carries the same list as `caveats`. Before the first modal,
`resetEdsProjectWithUI` runs `checkDemoSource` (`reset/demoSourceCheck.ts`): an
unreachable repository refuses in one sentence ("<owner>'s demo can't be reached. Reset
and updates are unavailable until it is.") with `errorType: 'DEMO_SOURCE_UNREACHABLE'`;
a renamed repository is followed silently into the project row, the EDS instance
metadata and the remembered setting together, and saved; a content site whose index is
gone offers "Keep current content", which resets the code only (`keepContent` → the
pipeline neither clears nor copies pages).

**Updates.** Creation records `templateBranch` in the EDS instance metadata from the
row; `getTemplateSource` returns it and `TemplateUpdateChecker` compares against that
branch instead of a hard-coded `main`. Nothing else in the updater changed (D19).

**Dashboard.** A new on-open check, `demo-source` (`onOpenChecks/demoSourceCheck.ts`,
re-runnable, every project kind), runs the same `checkDemoSource` and posts a warning
whose sentence `DemoSourceNotice` shows above the action grid, with one button, "Change
source". The overflow menu carries "Change Demo Source" for any project built on an
added demo, whether or not the source is reachable (repointing at a fork made now is a
valid move while the original still exists). Both open the Add a demo dialog in a
**change mode** (`mode="change"`, `currentKind`): its own title and lead, the same
storefront kind only (a headless demo is refused for an Edge Delivery project and vice
versa, with the sentence naming what the project is built on), no shipped template, the
keep-a-copy box as in add mode, and a second, unticked box "Also update the remembered
demo". The commit is `change-demo-source`, which rewrites the project row and the
instance metadata (owner, repo, branch) together, saves, and touches the remembered
setting only when asked; the dashboard then re-requests status so the notice clears.
`DashboardInitialData.demo` carries the name, source and kind the door needs. The
dashboard bundle imports the dialog's four stylesheets (ADR-017); the four sheets'
selectors are used by no dashboard file outside the dialog, so the resting dashboard is
unchanged by construction (checked statically; the visual harness was not run for this
step).

**Forget.** An added demo's card on the Welcome grid carries the shared kebab
(`CardActionsMenu`) with one row, Forget. The host confirms in a modal that names how
many projects on this computer were built on the demo ("2 projects … were built on it
and will keep working"); when the source is the SC's own copy the modal also offers
"Forget and delete my copy", and the delete is confirmed once more, as project cleanup
does. Forget never touches a project. The card leaves through the settings push;
a forgotten demo that was the selection is deselected, row included.

**Agent surface (D15).** Two new tools in `addedDemoTools.ts`: `forget_added_demo`
(confirm-gated; the refusal names the demo, the project count and, with `deleteCopy`,
what the delete costs; `deleteCopy` is refused for a repository that is not the SC's)
and `change_demo_source` (probes the repository with the dialog's own handler, builds
the same row, hands it to the same handler). Both declare GitHub sign-in, carry a
narration phrase and a response ceiling; `forget_added_demo` is in the agent-alert
copy. Two battery prompts (tier 2) exercise them.

**Shared.** `keepOwnCopy` / `isAddedDemo` moved to `services/sharedDemoCopy.ts`, used by
the add and change commits. `add-shared-demo` is registered on the dashboard map and
`change-demo-source` on the wizard map as well: the dialog is one component and every
message it can send is answered wherever it renders (the handler-coverage check
requires it).

**Not done, on purpose.** `lastSyncedCommit` is left as it was after a source change,
so the first update check after a repoint compares an unrelated history; the checker
already logs and answers nothing on a compare it cannot make. Rename self-heal runs from
the reset door and the dashboard check, not from the storefront-name migration pass
(the reuse-map row for it): the migration pass runs on load without GitHub, and a
GitHub read on every project load is not a cost this step wants to add.

**Tests.** `demoSourceCheck` (reset and on-open), `edsResetUI-addedDemo`,
`edsResetRepoHelper-addedDemo`, the finalize suite's caveat and keep-content cases,
`templateUpdateChecker` branch cases, the executor's `templateBranch`, `edsResetTool`
caveats, `forgetAddedDemoHandler`, `changeDemoSourceHandler`, `sharedDemoCopy`,
`BrandGallery-forget`, `WelcomeStep-addDemo` forget cases, `dashboardCheckRouting`,
`ProjectDashboardScreen-demoSource`, `ActionGrid-overflow`, `showDashboard-initialData`,
`AddDemoModal-change`, `addDemoFlow` change cases, `addedDemoTools`, plus the moved
pins: dashboard handler count 38 → 41, sign-in totals (GitHub 10 → 12, 111 tools),
unreadable-class-site ceiling 85 → 79 (StatusDisplay's two sites made readable), and
14 mutation-ledger anchors re-pinned. `npm run gate` green.
