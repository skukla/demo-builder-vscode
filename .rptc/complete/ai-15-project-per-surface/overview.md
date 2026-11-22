# AI-15: each surface acts on its own project

Backlog: AI-15. Owner decisions 2026-10-19 (logged on the item):
(a) an agent's `create_project` does not make the new project current;
(b) each screen acts on the project it shows;
(c) an agent is told when the current project changed since its last call.

Evidence: research pass 2026-10-19 (this session), spot-checked against
`scopedStateManager.ts` and `stateManager.ts` `saveProject`.

## The facts the design rests on

- There is one current project. `saveProject` always makes the saved project current
  (`stateManager.ts` `saveProject`: `this.state.currentProject = project`), and
  `loadProjectFromPath` does too unless `persistAfterLoad: false`. Nothing else
  switches it; there is no `setCurrentProject`.
- A per-project view already exists: `createScopedStateManager`
  (`ai/server/scopedStateManager.ts`), used for an agent session started inside a
  project folder. `getCurrentProject` loads that project; `saveProject` becomes
  `saveProjectConfigOnly`, which does not move the pointer and fires no change event.
- Screens are one panel per screen type, re-pointed at whichever project is current
  each time they are opened (`createOrRevealPanel` → `getInitialData`, which reads
  the current project). Only the projects list sends a project path today.
- Every agent tool answer passes through one wrapper per connection
  (`inExtensionMcpServer.ts` `withToolLogging.registerTool`), with a connection id.
- 85 agent tools act on "the current project" with no project argument. So decision
  (a) alone strands the agent: its next step would act on the person's project.

## The design

**One idea serves all three: every surface carries a WORKING project, and the
person's current project is only the default.**

- A screen's working project is the one it was last opened for.
- An agent session's working project follows the person's current project until the
  agent creates a project or picks one (`set_current_project`); from then on it stays
  on that project and the person's pointer is never moved by the agent.

Both use the existing scoped view, generalised so that when the working project IS the
current one it delegates to the real manager unchanged (saves still fire the change
event, so today's behaviour is identical in the common case). Only when they differ
does a save go through `saveProjectConfigOnly`.

### Rejected alternatives

- **Pass a project path on every webview request and edit 149 call sites.** Same
  result, 100 files touched, and every handler must validate a path a webview sent
  (`aiHandlers.ts` deliberately refuses that today). The view gives the same answer
  from one place.
- **Screens refresh when their project stops being current.** Owner chose (b) over
  this; it still loses the click that was in flight.
- **Agent tools gain a `project` argument.** 85 tools, and every agent prompt would
  have to carry it. The session's working project does the same without new inputs.

## Steps

1. **Generalise the scoped view.** `createScopedStateManager(manager, () => path)`:
   delegate everything when the path is the current one; otherwise load by path and
   save config-only. Fix the `clearAll` prototype trap the research found. Tests:
   same-project save fires the change event; other-project save does not move the
   pointer.
2. **Screens (b).** Each panel records the project path its `getInitialData` read, and
   `createHandlerContext` hands handlers the view for that path. Handlers that run a
   VS Code command (start, stop, restart, deploy mesh, open Configure) pass the path to
   the command, and those commands take it. Tests: a dashboard opened for A, with B
   made current, starts A.
3. **Agent working project (a).** The connection keeps its working project; the
   headless context uses the view for it. `create_project` sets the connection's
   working project to the new one and creation's saves stop moving the pointer (the
   saves in component installation, the EDS phase and finalisation, and the preflight
   read). `set_current_project` from an agent sets the connection's working project
   and no longer moves the person's. Its answer and `create_project`'s say which
   project the agent is now working on.
4. **Change notice (c).** The per-connection wrapper records the working project
   after each tool runs; when a following answer finds the person's current project
   moved under an agent that is still following it, the answer gains one line naming
   both. Recorded after the call, so an agent's own pick never reports itself.
5. **Docs and pins.** `docs/systems/mcp-server.md` (how agents choose a project),
   tool descriptions for `create_project` and `set_current_project`, CHANGELOG.

## Known limit, stated

A webview screen still opens on the person's current project; it just stops
following it afterwards. An agent session started inside a project folder keeps its
folder's project, as now.

## Verification

Gate per step. Live check by the owner: open the dashboard for project A, have an
agent create project B, then start A from the dashboard and confirm A starts and the
dashboard still says A.

## Outcome (2026-10-19)

Built in four commits on `loop/2026-10-19-backlog-fixes`: `36200a8b9` (the view),
`8bbc8a9bd` (screens), `7cb6f3192` (agents and the notice), plus this docs commit.
Every step passed the full gate; each new behaviour has a test shown to fail on the
old code.

Found while building, and decided in the code:

- Saves decide by whether the SURFACE's project is current, not the saved project's
  path: a rename saves at a new folder that is never "current", and deciding by path
  left the pointer on a folder that no longer existed.
- With no working project a save is today's save, so the projects list, which
  selects a project BY saving it, still works.
- A screen's command buttons pass the project's path to the command rather than
  making it current first, because agents dispatch into the same handlers and an
  agent's start must not move the person's project.

Not covered, stated:

- The AI screen's "open chat" button and the Site Access screen still act on the
  current project (Site Access is deliberately its own picker).
- An agent's create no longer stops the person's running demo on a port clash: the
  check reads the project being built, which is not running.
- Not proven live. The owner's check: open project A's dashboard, have an agent
  create project B, then press Start on A's dashboard; A starts, the dashboard still
  says A, and the projects list still shows A as open.
