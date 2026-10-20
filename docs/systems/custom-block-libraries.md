# Custom block libraries

An EDS storefront can install blocks from repositories beyond the built-in
collection, so a demo can carry blocks a team already maintains.

## How a library is declared

Built-in libraries live in `src/features/components/config/block-libraries.json`.
Custom ones are configured by the user in VS Code settings, and both appear as
checkboxes in the wizard's Storefront area and on Configure's Block Libraries tab.
Both screens follow the setting while open: a custom library added or removed in
Settings appears or disappears without reopening the screen.

The shape is in `src/types/blockLibraries.ts` and the schema beside the registry.

## What installation does

The blocks are copied into the storefront repository — they become part of the
project's code, not a runtime dependency. That is deliberate: an EDS storefront
serves its blocks from GitHub, so a block that is not committed does not exist as far
as the edge is concerned.

The consequence is that updating a library later does not update projects already
created from it. They have their own copy, and that copy is now theirs to change.

Installing also merges the library's entries into the storefront's three authoring
files — `component-definition.json`, `component-filters.json` and
`component-models.json`, the list of blocks authors can pick in DA.live. Those files
are the SC's too, so the merge follows two rules:

- **A hand deletion stays deleted.** The project records, per library, which entries
  the extension added (`installedBlockLibraries[].addedEntries`). On a later install
  or update, an entry it added before that is now missing was removed by hand: it is
  left out, and the update says so (a note in the Updates modal's report, and
  `categories.addon.leftOut` in `apply_updates`). An entry it never added is added
  and recorded. A project installed before 2026-10-09 has no record, so its next run
  adds what is missing, as it always did, and starts recording. A reset passes no
  record: it starts from the template, so every entry comes back.
- **A deleted block folder stays deleted.** `installedBlockLibraries[].blockIds` lists
  the block folders the library copied (at install, and from now on the new ones an
  update copies). A block in that list whose folder is gone was removed by hand: an
  update does not copy its files back, does not put back any of its entries, and names
  it on the same "Left out" line ("hero-cta (block folder blocks/hero-cta)"). Every
  installed project already has this list, so the rule applies from its next update.
- **A stripped HTML example stays stripped.** An update also fills the HTML example
  (`plugins.da.unsafeHTML`) into an entry the storefront has without one.
  `addedEntries.htmlExamples` records each entry it filled, and each entry it added
  whole with an example. One in that list that has no example now was stripped by
  hand: it is left out and named ("hero (HTML example in component-definition.json)").
  Records written before this have no such list, so the next run fills as before and
  starts recording.
- **The file keeps its layout.** Each file is written back in the indentation it
  already had (four spaces, tabs, or two when there is none to detect), with its
  final newline if it had one. `promote_block_to_library` and
  `remove_block_from_library` follow the same rule for `component-definition.json`.

The merge only considers blocks whose folder is not already in the storefront, so an
entry deleted while its block folder stays was never put back. When the folder is
gone too and the library copied it, the folder rule decides first, so the entry
record is the backstop for a block that is missing from `blockIds`.

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
- **An authoring entry goes only when it is unchanged.** Each entry in `addedEntries`
  is compared with the library's own entry at that commit. One the SC changed stays
  and is named. An entry belonging to a block left in place is not touched. An HTML
  example the install filled into an entry the storefront already had stays.
- **One commit.** The deleted files and the three authoring files change in a single
  commit on `main` ("chore: remove <library> (N blocks)").
- **DA.live.** Each removed `component-definition.json` entry is taken off the DA.live
  block list (its doc page and its sheet row). Then, whenever the action added or
  removed at least one block, it runs Refresh Block Library: the block list is rebuilt
  from the storefront's `component-definition.json` and published, so the DA.live
  picker matches. If that fails the result says so; the file changes stay.
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

## Registering a block for authoring

A block existing in the repository does not make it available in DA.live's authoring
picker. That is a separate registration, and the
[`register-custom-block`](../../.claude/skills/) skill in a generated project is what
performs it.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). The registry loads
through `ConfigurationLoader` and its schema is validated by
`tests/templates/config-contracts.test.ts`.

## Related

- [`src/features/eds/README.md`](../../src/features/eds/README.md) — the storefront feature
