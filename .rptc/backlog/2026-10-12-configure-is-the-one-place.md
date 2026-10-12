---
id: PL-75
kind: feature
area: platform
needs: []
value: high
status: active
---

# Configure is the one place to change a project; Edit is removed

Filed 2026-10-12. Owner's go the same day, after the research in
`.rptc/research/edit-configure-architecture/research.md`. This reverses his 2026-09-11
decision that "both modes stay" (PL-56e); the research is why.

## Why

An Edit finish rebuilds the whole project from wizard state, even when nothing changed:
it reinstalls every component, redeploys the mesh and every integration, re-runs storefront
setup and publishes, re-imports the datapack and regenerates the AI files. It undoes almost
nothing (an unticked integration stays deployed, a removed mesh keeps running, a datapack
cannot be removed), and it has needed at least 13 fixes since January, nearly all a field
the rebuild forgot. Configure changes one thing and offers that thing's follow-up, which is
the shape that works.

## What gets built (the owner's plain-English version, agreed)

- **Everyday settings** stay on Configure as they are: change, save, offered follow-up.
- **Two new Configure tabs:** Addons (storefront extras on and off), and Adobe destination
  (which Adobe project the integrations deploy to; the logic exists as
  `set_project_destination` and the Integrations screen's destination stage).
- **A Foundation tab** for the demo package, stack and backend. These cannot change in
  place, so Save builds a new project from this one, through the Copy-from-existing steps,
  pre-filled. The original stays as it is until the SC deletes it; that is the undo.
- **Delete the mesh** gets a button next to its Deploy button on the Integrations screen
  (today only agents can, through `delete_mesh`).
- **Edit is deleted** in the same change that ships the Foundation tab: the wizard's edit
  mode, its executor branch, `ui/steps/editLocks.ts`, the `edit_project` tool and their
  tests. No soft deprecation.

Defaults the owner did not contradict: changing the repository or site is also a new
project; after a Foundation copy succeeds, offer to delete the original, never do it
automatically.

## Order

1. Fix what every Edit does wrong today, since Edit exists until the end. Done first:
   the rebuild now keeps the project's records (integration workspaces, AI file hashes and
   the rest) instead of dropping every field it did not list.
2. Addons tab, Adobe destination tab, the mesh delete button.
3. Foundation tab, and delete Edit in the same change.

## To check before step 3

- The agent surface: `copy_project` cannot change package, stack or backend. Either give it
  the same choices as the Foundation tab or say plainly that agents cannot.
- What still depends on edit mode outside the wizard (`editProjectPath`, `wizardMode:
  'edit'`, `handleEditProject`, the dashboard and projects-list Edit actions).

## Shipped so far
