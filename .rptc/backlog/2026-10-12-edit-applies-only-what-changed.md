---
id: PL-75
kind: feature
area: platform
needs: []
value: high
status: active
---

# Edit applies only what changed

Filed 2026-10-12. Direction settled 2026-10-13, after two discarded ones (kept below,
because the reasons they were dropped are the useful part).

## Why

An Edit finish rebuilds the whole project from wizard state, even when nothing changed:
it reinstalls every component, redeploys the mesh and every integration, re-runs storefront
setup and publishes, re-imports the datapack and regenerates the AI files. It undoes almost
nothing (an unticked integration stays deployed, a removed mesh keeps running, a datapack
cannot be removed), and it has needed at least 13 fixes since January, nearly all a field
the rebuild forgot (`.rptc/research/edit-configure-architecture/research.md`).

## The direction (owner, 2026-10-13)

"When they change an existing project, they expect more of an edit behavior." So Edit
stays: the same wizard, on the same project. What changes is its Finish. It compares what
the SC picked with what the project already has and does only the difference, each through
the operation that already does that one job:

| The SC changed | Finish does |
|---|---|
| Nothing | Nothing |
| Added an integration or the mesh | Deploys just that one |
| Removed an integration or the mesh | Removes it, as the Remove button does |
| Datapack | Offers the import, or the removal |
| Package, stack or backend | Resets the storefront onto the new choice, with a warning first |

Editing again is the undo. The split from EDS-39 stays: Edit is for what a project is built
from, Configure for its settings.

## Discarded on the way, and why

- **Remove Edit; a foundation change makes a new project through Copy.** The owner: "We
  shouldn't be adding a new project as a duplicate to an existing one. That doesn't track
  with what the user expects."
- **Move everything onto Configure (Addons, Adobe destination, mesh delete tabs).** The
  maps showed the gaps were smaller than the research said: the mesh card already has a
  confirmed Remove; there is one addon (ACO), no pickable package offers it, and selecting
  it changes nothing; the Adobe destination move is a minutes-long operation that already
  lives, with its progress window, on the Integrations screen.

## Next: research before building

- For each row above, the single-step operation that exists, its entry point on the
  extension host, and whether Edit's Finish can call it.
- Where Edit's Finish branches from creation (`createHandler`, `executor.ts`), and what a
  diff of "picked vs recorded" needs from the saved project.
- What Edit changes that the table does not cover yet: Adobe org/project/workspace (the
  Integrations screen's `setProjectDestination` path), repository and site.

## Smaller findings on the way

- The agent's `delete_mesh` (`mesh/handlers/deleteHandler.ts`) deletes the mesh in Adobe and
  updates nothing in the project, so the project still reads deployed and the storefront
  keeps the dead endpoint. `remove_integration` does it properly. Proposed: delete the tool.
- The addon machinery is unused: `onAddonsChange` has no caller, `skipTools` is set and never
  read, and ACO has no `configFlags`. Decision deferred (a hidden coming-soon package needs it).


## Shipped so far
- 2026-10-12  docs(rptc): research on Edit and Configure; PL-75 makes Configure the one place (`4f49a174f`)
- 2026-10-12  fix(edit): an Edit keeps the project's records instead of dropping them (`356ffebea`)
- 2026-10-13  docs(rptc): Edit applies only what changed (PL-75 plan); the Configure audit (`756f87008`)
- 2026-10-13  feat(edit): an Edit that changes nothing only saves (`bd55ca245`)
- 2026-10-13  feat(edit): an Edit that only adds or removes integrations does only that (`d4647b86c`)
- 2026-10-13  fix(mesh,edit): the mesh updates the storefront; Edit adds and removes through the Integrations screen (`e4c5b9d3b`)
- 2026-10-13  feat(edit): changing the datapack does only that, and clears its old pages (`dc63d970e`)
- 2026-10-13  feat(edit): moving to another Adobe project does only that (`809a48565`)
- 2026-10-13  feat(edit): changing the package resets the storefront onto it (`a47484b99`)
- 2026-10-13  fix(edit): going Back keeps the project's Adobe destination (`9d9416a8d`)
- 2026-10-13  fix(wizard): Welcome settles, and Edit keeps the project's DA.live org and repository (`bc6ee1a90`)
