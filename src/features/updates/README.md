# Updates

Pulls component and extension updates from GitHub Releases.

## Check for Updates: the notification checks, the modal replaces the picker (PL-80)

Run by the SC, `demoBuilder.checkForUpdates` checks the extension's own release and every
project in a "Checking for updates" notification (`commands/checkUpdates.ts`), through
`services/allUpdates.ts` and the same `computeUpdateSelections` the agent's `apply_updates`
uses. Nothing waiting says "Demo Builder is up to date". Anything waiting is handed to the
Updates modal (`presentUpdates`, `handlers/updatesModalHandlers.ts`), which opens on Your
Projects (`projects-dashboard/ui/components/UpdatesModal.tsx`) with every update grouped
under Demo Builder, each project and the template repositories, all ticked except what
cannot be applied from here and an integration pair, which starts unticked because
applying it redeploys to Adobe with nothing asking first. Each group starts closed, saying
how many of its rows are ticked and how many wait for the SC; its name opens it, and the
checkbox beside it ticks or unticks the whole group. The modal never checks itself.

Apply (`applyUpdates`) runs the ticked rows, against the check they came from, through the
same `applyUpdatesHeadless` the agent uses, told in the screen's progress modal, with its
questions asked there: stop a running demo, reset a template that conflicts with the SC's
edits, replace a library's blocks under the `ask` sync setting
(`handlers/updateQuestionsInModal.ts`). The extension's own update runs last, because it
ends by offering a reload.

A run that leaves rows the SC unticked runs the same check once more before it ends, and
its answer says how many of those rows are still waiting (`remaining`; a locked row, and a
ticked row that failed or was skipped, are never counted). The finished window then says
"N updates still waiting" and offers Back to updates (`recheckUpdates`), which runs Check
for Updates again: the run changed storefronts, so the old list is stale. That check
presents a fresh list, ticked by the same rules, or says "up to date" in its notification
and the window closes (owner, 2026-10-22). The agent's `apply_updates` answers `remaining`
too: what the same check still finds for the project after it applies.

The background check (the sidebar opening, then every four hours) runs the same check
quietly and only notifies, "N Demo Builder updates available", with Review opening the
modal on that check. Nothing opens by itself. Until 2026-10-20 the notification led to VS
Code's picker, the picker had its own copy of the check and the apply, and a second updater
(the old auto-updater in the legacy utils folder) showed its own "Update Now" every four
hours; the modal replaces the picker, and the other two are gone (owner, 2026-10-20: the
notification still checks).

A projects list that is not open yet cannot be pushed to, so the request is held
(`handlers/updatesModalRequest.ts`) until the new screen takes it once mounted, with the
rows; one already open is pushed `showUpdates` with them.

## Every component update is snapshotted first

`componentUpdater.ts` copies the component directory before touching it and restores
that copy if anything fails. Not conditionally — always. A half-updated component is
a broken demo, and the user has no way back on their own.

`node_modules` is excluded from the snapshot for speed; it is reinstalled rather than
preserved.

## `.env` files are merged, not replaced

A component update ships a new `.env` template, and the user's file holds their
credentials. Overwriting it would destroy their configuration; skipping it would
miss new variables. So the two are merged, with the user's values winning.

**Renames are the case it cannot handle.** If a component renames a variable, the
merge keeps the old key with the user's value AND adds the new one empty — the
component then reads the new name, finds nothing, and fails at runtime. That gap is
documented in `envMerge.ts`'s own header and asserted in its tests; closing it is
backlog item PL-24.

## Programmatic writes are suppressed

The extension watches project files, so its own update writes would fire change
notifications and tell the user their project drifted the moment it finished
updating. The updater suppresses its own writes for that window.

## Three updaters

| | |
|---|---|
| `updateManager` | checks GitHub Releases, compares versions |
| `componentUpdater` | a component in a project — snapshot, update, rollback |
| `extensionUpdater` | the VSIX itself |

Releases are **prereleases**, and `releases/latest` ignores those — a detail that has
bitten this repo before. See
[cut-release](../../../.claude/skills/cut-release/SKILL.md).

## The template update also runs outside VS Code, for the patch canary

`TemplateSyncService` (the storefront's template merge) receives its GitHub access as a
constructor argument (`GitHubAccess` in `templateSyncTypes.ts`); callers pass
`getGitHubServices(secrets)`. Nothing on that path needs VS Code at run time, so the patch
canary in `skukla/eds-demo-patches` runs the SAME update on its canary storefront in CI,
rather than a copy of it that would drift (EDS-49).

`canary/` is that program: `canaryUpdate.ts` builds the canary's project record from the
bundled demo-package catalog and runs the merge; `canaryUpdateCli.ts` is its command
(inputs from the environment, documented in its header). `npm run build:canary-update`
bundles it to `dist/canary-update.js`, with `vscode` replaced by `vscodeAbsent.ts`, which
throws by name if a change ever makes this path reach for VS Code. Change the update path
and the canary runs your change, from whatever branch the patches repo's `EXTENSION_REF`
variable names.

## A template change never touches `.github`

Every template update (and the Adobe boilerplate update below) leaves the template's
`.github` out of the change (`templateMergeBase.ts`). A repository generated from the B2B
template has none of Adobe's CI workflows, because the template's own `cleanup-on-create`
workflow deletes them, so an edit to one stops the update on a file the storefront does
not have. Measured 2026-10-20: Adobe's change from 71a67e0 to the tested 48bed04 edits 14
of them, and our own storefront repositories keep only `sync-from-upstream.yml`.

## A colleague's storefront follows two tracks (EDS-56)

A storefront added from a colleague's demo follows the colleague's repository: the
template row, worded "Changes from kmanns/justrite". When the Adobe commit its code
started from is known, it also follows our tested boilerplate: the "Adobe boilerplate"
row, which applies Adobe's change from that commit to the patches repo's last-known-good,
3-way, keeping the SC's and the colleague's edits. The two are independent; one Apply
runs the colleague's first, each its own commit.

| | |
|---|---|
| The base | `boilerplateBase` in the storefront's metadata, its own field: never `lastSyncedCommit` (the colleague's track) or `lkgSource` (which would make the project thin-layer) |
| Found by | `boilerplateBase.ts`: a saved package's `builtWith.lkg`; else GitHub says the colleague's repository was made from one of our templates and its first commit has the same files as one of that template's commits (`.github` aside). JustRite: 71a67e0, the 39th commit back |
| Recorded | by the check (`boilerplateCheck.ts`), the one path, so new and existing projects get it alike |
| Kept true | reset forgets it; after the colleague's update, their `demo.demo-builder.json` moves it forward when it is ahead (`boilerplateBaseRefresh.ts`); Share Demo's link save writes it as `builtWith.lkg`; changing the demo source keeps it (the code did not change) |
| Never | a reset on a conflict, Demo Builder's fixes re-applied (D6), or a move backwards |

## A clash is fixed with AI (EDS-57)

A template or Adobe boilerplate update that clashes with edits in the storefront asks one
question: Fix with AI, Leave it as it is, or (the colleague's row only) Use the update
(`updateClash.ts`). No choice involves reading code (owner, 2026-10-20).

| | |
|---|---|
| Kept | the same change, applied 3-way in the project's local storefront copy after bringing it up to GitHub (`localStorefrontRefresh.ts`, `pendingClash.ts`); the clashing files carry markers, the rest is staged; `pendingClash` on the storefront, and a mark inside the copy's `.git` holding what the update changed |
| Opened | the SC's chosen engine, by the Chat command, with the files and both sides' diffs (`fixWithAi.ts`, `clashPrompt.ts`) |
| Offered | a "Finish" row in place of its track's own row, until finished or dropped (`updateSelections.ts` `finish`, `updateApplyFinish.ts`); a fix not ready asks Fix with AI, Keep it for later, or Drop the fix |
| Finished | `finish_storefront_update` and the Finish row (`pendingClashFinish.ts`), the one place it is pushed: still the current update, only the clashing files changed, no markers, JavaScript and JSON parse; then commit, push with the SC's token, record the version |
| Guarded | Sync Storefront refuses while the mark is there (`keptClashMark.ts`), for the button and `sync_storefront` alike |
| Never | the AI committing or pushing; a stale fix going out (the update moved on: dropped, copy put back) |

Every update that writes a storefront also brings the local copy up to GitHub afterwards,
losing nothing: a local change GitHub already has is dropped, anything else leaves the copy
as it is.

## An older storefront is told to reset

A fix Demo Builder makes to the storefronts it builds reaches new storefronts, and a reset's.
Nothing here repairs an older storefront in place: an update merges code, and the Adobe
boilerplate track re-applies none of our fixes (EDS-56 D6). Instead every storefront change an
existing storefront does not pick up by itself is listed in `STOREFRONT_CHANGES`
(`features/eds/services/storefront/storefrontChanges.ts`), and a storefront built before any of
them shows **Needs reset** on its project card, its dashboard (the Reset tile), its Storefront
Report, Diagnostics, and `get_project_status`.

| | |
|---|---|
| The stamp | `storefrontBuiltThrough` on the storefront's metadata: the newest change the building version knew, written at creation and reset. A storefront whose build step could not finish (`bringStorefrontUpToDate` not current) also gets `storefrontBuildIncomplete` |
| No stamp | the project's creation date; neither means older than every change |
| The build step | `bringStorefrontUpToDate` (`storefrontUpToDate.ts`): creation, reset and a tested-boilerplate update run the storefront repairs (`storefrontRepairs.ts`: the 404 import map, the retired patches) after the smart 404 handler, so every path ends the same |
| Labels inside an update | every template and Adobe boilerplate update, and finishing a kept clash, puts the template's checkout labels back over Demo Builder's stub in its own commit (`labelStubRepair.ts`) |
| Never | a file that is not Demo Builder's text (the SC's, a colleague's) |

## A selected block library is installed here, not only at creation

Ticking a block library on a project that already exists only records the id in
`selectedBlockLibraries`. The update check turns that into an **install** item
("Demo Builder Blocks: install") whenever a selected library has no record in
`installedBlockLibraries` (`services/blockLibraryInstall.ts`). Applying it — a row left
ticked in the Updates modal, or `apply_updates` with `confirm:true` — makes
one commit to the storefront repository through the same installer updates and
creation use, and writes the same record creation writes.

The installer only adds: a block folder the storefront already has is left as it
is, and a block folder, authoring entry or HTML example it added before that the
SC has since deleted is not put back (`installedBlockLibraries[].blockIds` and
`.addedEntries`; see
[custom block libraries](../../../docs/systems/custom-block-libraries.md)). It does not rebuild the DA.live authoring library — run "Refresh Block
Library" (`refresh_block_library`) for that.

Configure offers the same install without the update check. After a Configure
save, the notification that offers to republish the storefront also names any
selected library the storefront lacks, and its action runs this installer
(`dashboard/services/configureBlockLibraryWork.ts`). Unlike the update check, that
action then runs Refresh Block Library itself when a block was added or removed.

**Un-selecting a library removes nothing here.** Check for Updates and
`apply_updates` never remove a library. Removal is offered only by that Configure
notification, for a library the storefront has and the project no longer selects
(`services/blockLibraryUninstall.ts`; the rules are in
[custom block libraries](../../../docs/systems/custom-block-libraries.md)).

## Integration pairs are checked here too, for every project

A deployed integration and its ERPs are one more category of the startup check and
Check for Updates (AB-73), with the Integrations screen's own rule
(`checkIntegrationUpdates`: the GitHub branch is ahead of the clone, a fetched commit
was never deployed, or the clone's app version differs from the one installed in
Commerce). It runs for ALL projects, one row per pair ("Justrite: ERP Integration and
Justrite ERP"), alongside the other project checks so the extension's own update notice
does not wait on it; a project with no deployed integration costs nothing, and each
pair costs one `git fetch` per clone.

Applying the row is the confirmation. It runs the same pair update the card's Update
button runs (`updateIntegrationPairFor`, dashboard/handlers/integrationUpdateHandlers;
the order and loop in app-builder's `integrationPairUpdate.ts`): guards, then the ERPs
with newer code, then the integration. A project other than the open one is saved in
place, never made current. A pair whose project uses a different Adobe organization is
listed unticked and locked, and not deployed from this org: its row says to open that
project.
That is decided by the guard chain's own org step (`orgGuard`, which `runGuards` runs),
handed to the updates services as a probe bound at the boundary (`integrationUpdateProbe`),
so nothing under `updates/services` reaches into the dashboard's handlers.
`apply_updates` reports the same pairs (`summary.integration`) and applies them with
`confirm:true`; an other-org pair comes back under `categories.integration.deferred`.

## Related

- [component-version-management.md](../../../docs/architecture/component-version-management.md)
  — the floating stable-tag model that decouples component updates from extension releases

## Conventions that bind this

The rules are in [the handbook](../../../docs/development/handbook.md). Generated files are written through the hash-and-skip seam ([ADR-013](../../../docs/architecture/adr/013-generated-file-edit-survival.md)) — a user-edited file is skipped, never overwritten.
