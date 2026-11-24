# Custom block libraries

An EDS storefront can install blocks from repositories beyond the built-in
collection, so a demo can carry blocks a team already maintains.

## How a library is declared

Built-in libraries live in `src/features/components/config/block-libraries.json`.
Custom ones are configured by the user in VS Code settings, and both appear as
cards in the wizard's Storefront area and on Configure's Storefront tab. The
picker also shows, locked and ticked, the libraries the storefront gets anyway:
every storefront's (`alwaysIncluded`) and the package's own (`nativeForPackages`).
Its Custom Libraries group shows even when there are none, with the link to add
one in Settings. Both screens follow the setting while open: a custom library
added or removed in Settings appears or disappears without reopening the screen.

The shape is in `src/types/blockLibraries.ts` and the schema beside the registry.

## What installation does

The blocks are copied into the storefront repository — they become part of the
project's code, not a runtime dependency. That is deliberate: an EDS storefront
serves its blocks from GitHub, so a block that is not committed does not exist as far
as the edge is concerned.

The consequence is that updating a library later does not update projects already
created from it. They have their own copy, and that copy is now theirs to change.

Installing copies block folders and nothing else. The DA.live block list is built
from the storefront's block folders and pages
(`.rptc/plans/block-library-without-universal-editor/step-02.md`), so an install or
update no longer adds entries to the storefront's Universal Editor files
(`component-definition.json`, `component-filters.json`, `component-models.json`).
Adobe deleted those files from its Commerce templates, and nothing reads them (EDS-71).

- **A deleted block folder stays deleted.** `installedBlockLibraries[].blockIds` lists
  the block folders the library copied (at install, and the new ones an update
  copies). A block in that list whose folder is gone was removed by hand: an update
  does not copy its files back, and says so (a "Left out" note in the Updates modal's
  report, and `categories.addon.leftOut` in `apply_updates`: "hero-cta (block folder
  blocks/hero-cta)"). A reset passes no record: it starts from the template, so every
  block comes back.
- **What an older install added is still recorded.** Installs before EDS-71 merged
  entries into the three files and recorded them per library
  (`installedBlockLibraries[].addedEntries`). An update keeps that record unchanged,
  so removing the library still takes those entries out of a storefront that has the
  files (below).

**Which project gets the record.** Storefront setup installs the libraries but saves
no project: in the wizard it runs before the project exists. It hands the records
back on its result, and project creation saves them onto the project it creates or
edits (an edit that installed nothing keeps the records it had). Until 2026-10-09
setup saved them onto whichever project was open, so a project created before then
can lack its record: its next update check offers each selected library once, and
applying it records it (EDS-37).

## Removing a library from a storefront

Unticking a library on Configure's Block Libraries tab and saving records the choice.
The notification that follows names the library, and its action removes what that
library added (EDS-39). A library ticked there is installed by the same action. Edit,
Check for Updates and the agent tools do not remove anything.

Removal takes out only what the library's record says it added, and only what is
still as the library added it:

- **A block folder goes only when it is unedited.** Its files must be exactly the
  library's files at the recorded `commitSha`, compared by git blob sha. A block with a
  changed, added or deleted file stays, and the result names it ("hero (changed since
  it was added)"). So does a block whose library cannot be read at that commit.
- **A block another selected library provides stays.** It is named with that library.
- **An authoring entry goes only when it is unchanged.** For a library an older
  install recorded entries for, each entry in `addedEntries` is compared with the
  library's own entry at that commit. One the SC changed stays and is named. An entry
  belonging to a block left in place is not touched, and an entry nothing recorded is
  never touched. An HTML example the install filled into an entry the storefront
  already had stays.
- **One commit.** The deleted files, and any of the three Universal Editor files that
  lost an entry, change in a single commit on `main` ("chore: remove <library> (N blocks)").
- **DA.live.** Each block folder the removal deleted is taken off the DA.live block
  list (its doc page and its sheet row). Then, whenever the action added or
  removed at least one block, it runs Refresh Blocks: the block list is rebuilt from
  the storefront's code and pages (one entry per `blocks/<id>/` folder, each with an
  example page; `.rptc/plans/block-library-without-universal-editor/step-02.md`) and
  published, so the DA.live picker matches. If that fails the result says so; the file changes stay.
- **A block left in place is named once.** A block left because the SC changed it, or
  because another library provides it, is the SC's own (or that library's) from then
  on. The library's record is dropped from `installedBlockLibraries`, so no later save
  offers the removal again. The same goes for an authoring entry the SC changed.
- **Only a failed check is retried.** When the library could not be read at its commit,
  the record is kept for just those blocks and their entries, and the next Configure
  save offers the removal again.
- **Native libraries are never removed.** Their card is locked, and a record for one
  is never treated as unselected.

A library updated through Check for Updates after it was installed has a newer
`commitSha` than the block files it copied, because an update only adds. If the
library changed those blocks upstream, they no longer match and are left in place.

## A block in DA.live's authoring picker

The picker follows the storefront's code: every `blocks/<id>/` folder in the repository
whose name is a block name (lowercase words joined by hyphens) is listed after the next
Refresh Blocks, and one of Adobe's blocks only when its folder is there (`metadata` and
`section-metadata`, which EDS handles with no folder, excepted). There is no separate registration and no way to
hide a block whose code stays (owner, 2026-11-23). In a generated project, the
[`register-custom-block`](../../.claude/skills/) skill gives a block its example page and
title (`promote_block_to_library`), and the `remove-custom-block` skill removes a block by
taking out its page and row, then deleting its code (`remove_block_from_library`). Restoring the code
and running Refresh Blocks undoes a removal.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). The registry loads
through `ConfigurationLoader` and its schema is validated by
`tests/templates/config-contracts.test.ts`.

## Related

- [`src/features/eds/README.md`](../../src/features/eds/README.md) — the storefront feature
