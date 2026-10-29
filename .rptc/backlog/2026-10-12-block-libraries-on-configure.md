---
id: EDS-39
kind: feature
area: eds
needs: []
value: med
status: active
---

# Choose block libraries on Configure, not only in Edit

Filed 2026-10-12, from the owner: "There's no way to add it via Configure. I can only do it
via Edit. We should add that!"

## Today

A storefront project's block libraries are chosen in the wizard's Storefront area, so after
creation the only way to add one is Your Projects, Edit, which reopens the whole wizard.
Configure, the screen an SC opens to change a project, has five tabs (Project, the Commerce
connection, Business Structure, Adobe Assets, Authoring) and none of them lists libraries.

It came up on the BJU project: created without Demo Builder Blocks, so its menu had no
`catalog-menu` block, and Configure offered no way to add it.

Two documents had it wrong, both written by the agent: the 2026-10-10 release test plan's
row 3.4 said "tick a second block library on Configure" (corrected), and the agent told the
owner the same thing in chat.

## What it would do

A block libraries section on Configure for Edge Delivery projects, with the same checkboxes
the wizard shows. The wizard's picker is `BlockLibrariesStepContent.tsx`; use it, do not build
a second one.

Ticking a library only has to record its id in `selectedBlockLibraries`. Installing is already
handled: `blockLibraryInstall.ts` offers "<library>: install" in Check for Updates for any
recorded library that is not in the repository yet. Decide whether Save should offer that
install at once or leave it to the update check; the first is what an SC expects.

## To settle before building

- **Unticking.** What Edit does today when a library is unticked decides this: Configure must
  do the same, and "whatever can be done can be undone" means a library that can be added
  here can be removed here, or the screen says plainly why not. Read Edit's path first.
- **Which tab.** Authoring is the Edge Delivery-only tab and the natural home; check it is
  not already crowded.
- **The agent surface.** A person gains an action here. Say whether an agent gets it too
  (there is `refresh_block_library` and `promote_block_to_library`, and no "add a library").

## Shipped so far

- 2026-10-12  docs(backlog): file EDS-39, choose block libraries on Configure; correct test row 3.4 (`961d972f2`)
- 2026-10-12  feat(configure): choose block libraries on the Authoring tab (`9f2c73f26`)
- 2026-10-12  feat(configure): Block Libraries is its own tab, and Save applies the change (`70d62496f`)
- 2026-10-12  fix(configure): custom block libraries follow the setting while Configure is open (`c92fa06b0`)
- 2026-10-12  docs(changelog): Edit and Configure split; the Block Libraries tab on Configure (`7b330e4de`)
- 2026-10-12  feat(wizard): Edit leaves the name, Commerce settings and block libraries to Configure (`a74724958`)

## Left open by the first build (2026-10-12)

- **`wizard-misc.css`'s header is now wrong.** It says the sheet is "imported by the `wizard`
  entry ALONE". The Configure entry imports it too, for one rule, `.settings-link` (the
  picker's "Configure custom libraries in Settings" line). The clean fix is to move that rule
  to a sheet both entries already share and drop the import. Either is a stylesheet edit, which
  needs a resting visual capture, and the capture browser was not connected in the session that
  built this. The Configure entry's own comment says what is true.
- **Not looked at in a browser by the builder.** The owner's check on BJU is the first look.
- ~~**A custom library changed in VS Code settings shows only after Configure is reopened.**~~
  Fixed 2026-10-12: Configure pushes `customBlockLibraryDefaultsUpdated` when the setting
  changes, the message the wizard already followed (`useBlockLibraryChoices.ts`).
- **A custom library that is recorded on the project but no longer in settings** is hidden and
  kept by Configure. Edit used to drop it; since 2026-10-12 Edit shows the project's own
  record, locked (see "Edit leaves block libraries to Configure" below), so it is kept there
  too. Configure still hides it. Whether Configure should show it is open.
- **Install on Save.** Settled by the owner the same day: see the next section.

## The owner's decisions, and the second build (2026-10-12)

Three decisions, all built. Not committed yet when this was written.

1. **Block Libraries is its own item on Configure's rail**, immediately before Authoring.
   Edge Delivery projects only, and only when the project has a library to show.
2. **Saving a library change makes it live through the notification Configure already had.**
   Save records the choice. The notification that follows ("Configuration saved. Republish
   storefront to apply changes." with Republish and Later, or the mesh-and-storefront one)
   now also appears when only libraries are pending, and it names them: "Block libraries:
   add X; remove Y." Republish does the library work first, then the republish it always ran.
3. **The two sentences are gone from the screen.**

What is pending is read from the project, not from the one save. Selected and not installed
means install. Installed and not selected means remove. So after Later, the next Configure
save offers the same work again.

**Install** is the existing installer, unchanged (`applyBlockLibraryInstall`).

**The DA.live block picker is brought up to date in the same action.** When at least one
block was added or removed, Republish runs the existing Refresh Block Library
(`refreshBlockLibraryHeadless`) before it shows the result. That rebuilds the DA.live block
list from the storefront's `component-definition.json` and publishes it. If it fails, the
result says so and the file changes stay.

**Removal is new** (`blockLibraryRemoval.ts`, `blockLibraryUninstall.ts`). Its rules:

- A block folder is deleted only when its files are exactly the library's files at the
  recorded commit, compared by git blob sha. An edited block stays and is named.
- A block another selected, installed library also provides stays and is named.
- An authoring entry is taken out only when it is still equal to the library's own entry
  at that commit. One the SC changed stays and is named.
- The deletions and the authoring files change in one commit.
- Each removed `component-definition.json` entry is taken off the DA.live block list.
- A block left because it was edited, or because another library provides it, is named
  once. The record is then dropped, so no later save offers that removal again. The same
  goes for an authoring entry the SC changed.
- The record is kept only when the library could not be read at its commit. It then
  lists just the blocks that could not be checked, and the next save tries again.
- A native library is never treated as unselected.

Full rules: `docs/systems/custom-block-libraries.md`, "Removing a library from a storefront".

### Out of scope, on purpose

- **Check for Updates does not offer removals.** It offers installs as before.
- **Agents cannot remove a library.** `configure_project` records the selection and
  `apply_updates` installs. There is no removal tool, and none was added.
- **Creation is unchanged.** Edit changed afterwards: see the next section.

### Edit leaves block libraries to Configure (2026-10-12)

The owner's line: Edit changes what a project is built from, Configure its settings. In Edit
the block libraries are now shown, locked, with a note pointing to Configure; so are the
project name and the Commerce settings (`ui/steps/editLocks.ts`). They open again in Edit
when the package or backend changes, because that change resets them. So unticking in Edit
is no longer possible unless the foundation changed.

### Left open by the second build

- **Not run against a real storefront.** Every test uses fakes. No GitHub commit, DA.live
  write or publish was made while building. The first removal on a real project is the
  first real run.
- **An untick made in Edit long ago now produces a removal offer.** Such a library is
  "installed and not selected", so that project's next Configure save offers to remove it.
  The notification names the library before anything runs. Accepted by the owner.
- **The dashboard's own Republish button does no library work.** Only the notification
  after a Configure save does. Accepted by the owner.
- **A block left in place can no longer be removed from Configure.** Once it is named and
  the record is dropped, the extension does not track it. The SC deletes it by hand.
- **Install through Check for Updates still does not refresh the DA.live block list.**
  Only the Configure action does.
- **A library updated through Check for Updates may not be removable.** An update moves the
  recorded commit but never rewrites blocks already copied. If the library changed those
  blocks upstream, they no longer match and are left in place.
- **A private library repository cannot be compared.** The archive download sends no
  token, so its blocks are left in place ("could not be compared with the library").
- **An HTML example filled into an entry the storefront already had is not taken back.**
- **Later marks the storefront "update declined"** even when only libraries were pending.
- **Removed doc pages are not unpublished from the CDN.** They are deleted from DA.live
  and dropped from the block list.

