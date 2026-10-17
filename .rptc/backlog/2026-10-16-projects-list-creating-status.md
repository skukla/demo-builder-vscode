---
id: PL-82
kind: fix
area: platform
needs: []
value: med
status: active
---

# The projects list shows a project an agent is building, with an honest status

Filed 2026-10-16 from the owner's release walk: "When an agent creates a project, why
don't we see that project's tile in the project dashboard with an appropriate status? The
dashboard never refreshes even after the agent finishes."

Two separate defects.

**1. The list never reloaded on its own.** `ShowProjectsListCommand` sent a fresh list
only when the panel was opened or revealed. Nothing told it a project file had appeared or
changed, so a project created, renamed, copied or deleted by an agent (or by another
window, or by the raw `.demo-builder.json` write tool) stayed invisible until the SC
navigated away and back. Fixed by watching `*/.demo-builder.json` under the projects root
and reloading once after a burst of writes settles (`TIMEOUTS.UI.PROJECT_LIST_SETTLE`).
The project files are the one place every writer passes through; an in-process event
would have missed other windows and the raw write tool.

**2. There is no "being created" status.** `ProjectStatus` has none. With part 1 in
place, the tile appears as soon as creation first writes the project file, and shows
whatever an idle project shows until creation finishes. The tile should say the project
is being created, the way it already says "Resetting…" and "Republishing…".

The hard case is a creation that fails or is interrupted (window closed mid-run): it
must not leave a tile stuck on "Creating…" forever.

## What was built (2026-10-16)

- **Part 1:** the projects list watches `*/.demo-builder.json` under the projects root
  and reloads once after a burst of writes.
- **Part 2, first attempt (`13cf5a4f2`), did not work.** It saved a new project as
  `creating` and read that back. A project's status is never written to its file:
  `projectFileLoader` sets `stopped` (or `running`) on every load. So no tile could
  ever say "Creating", and the "Creation didn't finish" reading of `error` was
  unreachable. The unit tests passed because they faked the loader with a status the
  real one never returns. Found the same evening, when the owner watched an agent
  recreate the canary and asked when the tile would appear.
- **Part 2, as rebuilt.** The running creations (`creationsRunning.ts`, counted per
  path, with a change signal) are the truth. The agent's `runProjectCreation` lists
  its whole run, storefront included; the creation step lists itself too. The list's
  one loader (`loadProjectsForList`) shows a running creation's project as `creating`,
  and gives a creation with no project file yet (an Edge Delivery storefront still
  being set up) a tile of its own. The list reloads when a creation starts or ends.
  A tile being created cannot be opened, renamed or deleted. The failed parts are
  removed: nothing is saved as `creating`, and `error` reads as before.

## Still open

- ~~An agent's failed creation leaves its folder behind; the wizard's does not.~~
  Owner, 2026-10-16: clean up the way the wizard does. Done under [[AI-73]], which
  also found the agent door could delete an existing project.
- A creation running in ANOTHER window shows no "Creating" in this one: the running
  list is per window. Its tile appears, as an idle project, once its file is written.
- A creation cut off by a closed window leaves its project behind with no marker; it
  shows as an idle project. Rare, and the SC can delete it.

## Shipped so far

- 2026-10-16  fix(projects-dashboard): show projects an agent is building, and refresh on change (`13cf5a4f2`)
- 2026-10-16  fix(projects-dashboard): show an agent's creation from its start; create_project adopts an existing storefront (`6958aff36`)
