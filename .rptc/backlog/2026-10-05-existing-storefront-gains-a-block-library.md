---
id: EDS-28
kind: fix
area: eds
needs: []
value: high
status: built
---

# Existing storefront gains a block library

Filed 2026-10-05. Owner approved the fix the same day ("Fix the gap, yes").
`value: high` because EDS-24 waits on it: the catalog menu needs the Demo
Builder Blocks library (`demo-builder-blocks`) on projects that already exist.

## The gap

Ticking a block library on a project that already exists did nothing to the
storefront. `configure_project` and the UI only wrote the id into
`selectedBlockLibraries`. The block files reached the storefront repository in
two places — project creation (`storefrontSetupPhase2.ts`) and a full reset
(`edsResetRepoHelper.ts`) — and the update check
(`AddonUpdateChecker.checkBlockLibraries`) walked only `installedBlockLibraries`.
So a library selected after creation was never installed short of resetting the
whole storefront.

## The fix

"Check for updates" now offers an install for every library that is selected
but has no record in `installedBlockLibraries`. It reads "Demo Builder Blocks:
install" in the QuickPick list and in `apply_updates`' summary
(`blockLibraryInstall`). Applying it:

- makes ONE commit to the storefront repository's `main` branch, through the
  installer updates and creation already use (`installBlockLibraryFiles` in
  `updateCore.ts` → `installBlockCollections`). No second installer was written;
- appends the record creation writes (name, source, commitSha, blockIds,
  installedAt) — both paths now build it with `toInstalledBlockLibrary`
  (`installedBlockLibraryRecord.ts`), so later update checks track the library.

It runs only on an explicit apply: the picked row, or `apply_updates` with
`confirm:true`. The check itself makes no network call and writes nothing.

Decisions taken while building:

- **`syncBehavior` does not gate an install.** That setting decides whether an
  update may replace block files. An install only adds block folders that are
  not there, so `ask` and `disabled` have nothing to protect. Without this the
  default (`ask`) would have left the agent path unable to install at all.
- **A block folder the storefront already has is never touched.** The installer
  seeds its seen-set from the destination's `blocks/`, so a same-named folder is
  skipped, not overwritten, and is left out of the record's `blockIds`.
- **When every block already exists** nothing is committed, and the library is
  recorded with no block ids at the source's current commit. Creation records
  nothing in that case; here a record is needed or the same install would be
  offered on every check.
- **A library whose source is the storefront's own template is not offered.**
  Its blocks came with the template.

Code: `src/features/updates/services/blockLibraryInstall.ts` (find + apply),
`commands/blockLibraryInstallExecutor.ts` (UI toasts), wired into
`checkUpdates.ts`, `updateApplyService.ts` and `applyUpdatesTool.ts`.

## What is not done

- **No live run.** The build made no cloud writes. Nobody has yet applied the
  install to a real storefront repository.
- **The DA.live authoring library is not rebuilt.** Creation follows the copy
  with a library build (`createBlockLibraryFromTemplate`, plus doc pages for
  libraries with a `contentSource`). This path only commits to GitHub; the
  repository's `component-definition.json` is merged, and "Refresh Block
  Library" (`refresh_block_library`) is the existing action that rebuilds the
  DA.live side from it. Not chained automatically: it is a destructive rebuild
  with its own DA.live sign-in.
- **Un-selecting a library removes nothing.** No code anywhere deletes a
  library's block folders — not un-select, not updates; only a full reset, which
  rebuilds the repository from the template. Removal was deliberately not built
  here. It needs proof of authorship per file (ADR-013) before deleting from an
  SC's repository, so it should be its own item.

## Found while reading (not fixed here)

- **A block library UPDATE does not refresh existing block files.** The update
  path calls the same add-only installer, so for a library already installed
  every block folder is "already present" and nothing is committed — then
  `commitSha` is bumped as if the update landed
  (`updateCore.ts` `applyBlockLibraryUpdateResolved`). Only a block NEW upstream
  is ever added. The prompt's "will overwrite any local edits" and the doc
  comment on `applyBlockLibraryUpdate` describe behaviour the code does not
  have. Pinned from the install side by the "never touches a block folder the
  storefront already has" test, which runs the real installer.
- **The id → source resolver is written twice**, with small differences:
  `collectAllBlockLibraries` (`storefrontSetupPhase2.ts`) and
  `collectLibrarySources` (`edsResetRepoHelper.ts`). This item adds a third
  reader of the same loader functions (`selectedLibraryEntries`). Worth one
  shared resolver; left alone here because the two existing ones log and
  validate differently and their suites mock the loader.

## Shipped so far

- 2026-10-05  Built, not committed and not run live: a selected-but-uninstalled block library is offered as an install by Check for Updates and apply_updates, through the shared installer; gate green (1820 suites)
