# Projects Dashboard

The home screen: every project as a card. `demoBuilder.showProjectsList`, backed by
the `projectsList` bundle, auto-shown on activation when no project is current.

```
projects-dashboard/
├── commands/showProjectsList.ts       the webview command
├── handlers/projectsListHandlers.ts   21 keys — the source of truth for messages
└── ui/
    ├── ProjectsDashboard.tsx          container
    └── components/                    ProjectCard · ProjectsGrid · DashboardEmptyState
```

## The card shows two status lines, one per axis — and no more

- **Runtime** (`getRuntimeSummary`) — the LOCAL dev server: `Running on port 3000`
  or `Stopped`. EDS projects have no running state, so they get this line only
  while an operation is in flight (`Republishing…`, `Resetting…`).
- **Deployment** (`getDeploymentSummary`) — the CLOUD side, worst-of across mesh,
  storefront and integrations: `Deployed` / `Attention needed` / `Deploying…` /
  `Not deployed`. Absent when the project has nothing deployable.

**The card deliberately does not name individual components.** It used to render
`Mesh · Update needed` plus an integrations count while saying nothing about the
storefront, which drifts in exactly the same way — so it reported one component's
staleness as though it were the project's. Per-component detail belongs to the
integrations dashboard, one click away. The card answers only "is what is deployed
current?".

`getProjectStatusDisplay` still serves `ProjectRow`, which shows exactly one line
and therefore keeps the storefront in it.

**Search is always available here.** `SearchHeader` defaults to showing search only
past 5 items, but this surface passes `searchThreshold={0}`. That is not a tuning
preference — the threshold changes the header's shape, deciding where the action
buttons sit, so it is a layout decision rather than a knob.

## No workspace anchoring — the always-root home model

Nothing anchors the VS Code workspace to a project subdirectory. The window stays
homed at the projects root (`~/.demo-builder/projects`, overridable by
`DEMO_BUILDER_PROJECTS_DIR`); each project is a subdirectory. Dashboards render
in-place as webviews keyed off the persisted current-project pointer.

**Why root, specifically:** the in-extension MCP server's socket is keyed on the
open workspace folder (`resolveMcpSocketPath`), and the home `.mcp.json` at the
projects root points at the *root* socket. If the window sits in a project
subdirectory, the home chat's MCP tools have nothing to talk to.

| Gesture | Effect |
|---|---|
| Click a tile | Sets the current-project pointer, surfaces the dashboard in place. **No reload, ever** |
| Shift- or Cmd-click | Opens a **new** window, which re-homes itself to the projects root on activation (`shouldReHomeToRoot`). Current window untouched |
| Wizard finish | Sets the new project as current. No anchor, no reload |
| A window opened at a project subdirectory | Activation re-homes it to the root |

**Getting back to the list.** The Project Dashboard header has an "All Projects"
button — the happy path. As a safety net, closing the dashboard webview auto-opens
the projects list in a new tab (`shouldAutoReopenProjectsList` plus a `dispose()`
override), so nobody is stranded without a navigation surface.

Rationale: [ADR-004](../../../docs/architecture/adr/004-claude-code-harness.md).

## Handlers

Pattern B throughout — a handler returns its result and never pushes a message
back. Two worth knowing:

- **`selectProject`** takes an optional `surface`. `surface: 'integrations'` opens
  the Integrations page instead of the dashboard, reusing this handler's
  validate → load → set-current path rather than forking it. `forceNewWindow`
  rides along from a shift/cmd-click.
- **`redeployMesh`** appears in the kebab only when the mesh is in a redeploy
  state, and runs under a progress notification.

Rename is shared with the project dashboard: `renameProjectCore` does the folder
rename, path updates, recent-projects fixup and save. Both surfaces rename **in
place** through `InlineRenameField` — the card's hover pencil here, the title's
pencil there. No menu items, no dialogs.

## Related

- [`../sidebar/CLAUDE.md`](../sidebar/CLAUDE.md) — the persistent nav surface
- [`../../commands/CLAUDE.md`](../../commands/CLAUDE.md) — command registration
