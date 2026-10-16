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
- **Part 2:** a new project is saved with status `creating` (`buildInitialProject`;
  an edit keeps `created`) until finalization marks it `ready`. The tile says
  "Creating". `whileCreating` (`src/core/state/creationsRunning.ts`) lists the
  creations running in this window. The list's one loader (`loadProjectsForList`,
  now shared by `handleGetProjects` and the file-watch reload, which were two
  copies of the same loop) shows a `creating` project that is not running as
  `error`, which the tile reads as "Creation didn't finish". Nothing else sets a
  project's status to `error`.

## Still open

- ~~An agent's failed creation leaves its folder behind; the wizard's does not.~~
  Owner, 2026-10-16: clean up the way the wizard does. Done under [[AI-73]], which
  also found the agent door could delete an existing project.
- A creation running in ANOTHER window shows as "Creation didn't finish" in this one,
  because the running list is per window. Its own finalization still marks it ready.

## Shipped so far

- 2026-10-16  fix(projects-dashboard): show projects an agent is building, and refresh on change (`13cf5a4f2`)
