# Projects Dashboard

The home screen: every project as a card. `demoBuilder.showProjectsList`, backed by
the `projectsList` bundle, auto-shown on activation when no project is current.

```
projects-dashboard/
├── commands/showProjectsList.ts       the webview command
├── handlers/projectsListHandlers.ts   29 keys — the source of truth for messages
└── ui/
    ├── ProjectsDashboard.tsx          container
    └── components/                    ProjectCard · ProjectsGrid · DashboardEmptyState
```

## The card shows two status lines, one per axis — and no more

- **Runtime** (`getRuntimeSummary`) — the LOCAL dev server: `Running on port 3000`
  or `Stopped`. EDS projects have no running state, so they get this line only
  while an operation is in flight (`Republishing…`, `Resetting…`).
- **Deployment** (`getDeploymentSummary`) — the CLOUD side, worst-of across mesh,
  storefront and integrations: `Deployed` / `Attention needed` / `Deploying` /
  `Not deployed`. Absent when the project has nothing deployable.

**The card deliberately does not name individual components.** It used to render
`Mesh · Update needed` plus an integrations count while saying nothing about the
storefront, which drifts in exactly the same way — so it reported one component's
staleness as though it were the project's. Per-component detail belongs to the
integrations dashboard, one click away. The card answers only "is what is deployed
current?".

`getProjectStatusDisplay` still serves `ProjectRow`, which shows exactly one line
and therefore keeps the storefront in it.

**Search is always available here,** as on every list with anything in it: `SearchHeader`
has no setting to hide it on a short list (owner, 2026-11-02).

## Reset Selected and Delete Selected

Select Projects puts the list in selection mode (`useProjectSelection`); the batch window
(`useProjectsBatch`, `ProjectsBatchModal`) asks once and then runs the projects, a row each, the
Updates window's shape: deletes one at a time, resets side by side within an IMS org, up to three
at once (owner, 2026-11-04). A card's or row's Reset or Delete opens the same window on that one
project (`useListBatch`), its words naming it: "Reset Kukla Luma?", the button "Reset", "Resetting
Kukla Luma", "Kukla Luma Reset" (`ui/batchWords.ts`; decisions J7-1, step-05 S2). The list sends no
`resetProject` or `deleteProject` any more, and neither does the project dashboard (step-05 S4,
owner 2026-11-13): its Reset opens this window on the dashboard, its project the one row
(`useDashboardResetDelete`); its Delete (`deleteFromProjectsList`) opens this list on the one-row
Delete window, since the dashboard closes when its project goes. The list is handed the project the
way Check for Updates hands it the Updates window: held for a list still loading
(`takeDeleteRequest`), pushed to one already open (`openDeleteWindow`). Cancelled, the SC stays on
the list. The work is `services/projectsBatch.ts`,
reusing the single delete (`runProjectDelete`) and each reset's answered run. Only the
ticked projects the filter shows count. Rationale and decisions:
`.rptc/research/projects-bulk-actions/research.md`.

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

That safety net fires on EVERY dashboard close outside a webview transition, ~100 ms
later. Code that closes the dashboard in order to show the list must close it inside
one (`swapWebviewSurface`, or the transition the `demoBuilder.showProjectsList` handler
in `commandManager.ts` holds), or the net opens the list a second time while the first
is still loading. That second load is what dropped the Updates modal on Review
(2026-10-30, `tests/commands/commandManager-reviewUpdates.test.ts`).

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
place** through `InlineRenameField` — the menu's Rename here, the title's pencil there. No
dialogs. A card and row carry no pencil: the name is where an SC aims to open the project, and the
pencil sat 6px from it (owner, 2026-11-05). For the same reason the pin takes the smallest target
allowed, 24px.

## Related

- [`../sidebar/CLAUDE.md`](../sidebar/CLAUDE.md) — the persistent nav surface
- [`../../commands/CLAUDE.md`](../../commands/CLAUDE.md) — command registration
