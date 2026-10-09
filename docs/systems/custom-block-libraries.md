# Custom block libraries

An EDS storefront can install blocks from repositories beyond the built-in
collection, so a demo can carry blocks a team already maintains.

## How a library is declared

Built-in libraries live in `src/features/components/config/block-libraries.json`.
Custom ones are configured by the user in VS Code settings, and both appear as
checkboxes in the wizard's Storefront area.

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
  left out, and the update says so (the Check for Updates notice, and
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
