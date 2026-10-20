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
cannot be applied from here. The modal never checks itself.

Apply (`applyUpdates`) runs the ticked rows, against the check they came from, through the
same `applyUpdatesHeadless` the agent uses, told in the screen's progress modal, with its
questions asked there: stop a running demo, reset a template that conflicts with the SC's
edits, replace a library's blocks under the `ask` sync setting
(`handlers/updateQuestionsInModal.ts`). The extension's own update runs last, because it
ends by offering a reload.

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
