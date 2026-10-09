# Updates

Pulls component and extension updates from GitHub Releases.

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

## A selected block library is installed here, not only at creation

Ticking a block library on a project that already exists only records the id in
`selectedBlockLibraries`. The update check turns that into an **install** item
("Demo Builder Blocks: install") whenever a selected library has no record in
`installedBlockLibraries` (`services/blockLibraryInstall.ts`). Applying it — the
picked row in Check for Updates, or `apply_updates` with `confirm:true` — makes
one commit to the storefront repository through the same installer updates and
creation use, and writes the same record creation writes.

The installer only adds: a block folder the storefront already has is left as it
is, and an authoring entry it added before that the SC has since deleted is not
put back (`installedBlockLibraries[].addedEntries`; see
[custom block libraries](../../../docs/systems/custom-block-libraries.md)). It does not rebuild the DA.live authoring library — run "Refresh Block
Library" (`refresh_block_library`) for that. Un-selecting a library removes
nothing.

## Related

- [component-version-management.md](../../../docs/architecture/component-version-management.md)
  — the floating stable-tag model that decouples component updates from extension releases

## Conventions that bind this

The rules are in [the handbook](../../../docs/development/handbook.md). Generated files are written through the hash-and-skip seam ([ADR-013](../../../docs/architecture/adr/013-generated-file-edit-survival.md)) — a user-edited file is skipped, never overwritten.
