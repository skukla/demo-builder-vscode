---
id: EDS-39
kind: feature
area: eds
needs: []
value: med
status: backlog
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
