# Post-reload landing on the project Dashboard (not the projects list)

**Date:** 2026-05-31
**Phase:** Research (RPTC)
**Status:** Ready for Plan
**Related backlog:** [`2026-05-30-decouple-project-from-workspace.md`](../backlog/2026-05-30-decouple-project-from-workspace.md) — this is the *tactical quick-win* slice; the backlog item is the larger "no reload at all" effort.

## Question

When the user picks a project (home grid, or "All Projects" inside an open project), the
`vscode.openFolder` reload lands them back on the **projects-list start screen**, not on the
**picked project's Dashboard**. Does the workspace reload fire an event we can listen for so we
can render that project's Dashboard instead?

## Short answer

**No in-process "reload" event exists — because the reload destroys the process that would receive
it.** Picking a project calls `vscode.commands.executeCommand('vscode.openFolder', uri, false)`
(`src/features/projects-dashboard/handlers/dashboardHandlers.ts:191`). Replacing the window's
folder **restarts the extension host**, so the only signal on the far side is the extension's own
**`activate()`** (activation event `onStartupFinished`, `package.json:30`). That *is* the
"workspace just (re)loaded" hook.

`vscode.workspace.onDidChangeWorkspaceFolders` (already used at `extension.ts:284` for the MCP
server restart) only fires for in-session folder add/remove **without** a reload — it does **not**
fire across an `openFolder` window replacement. Wrong tool for this.

**The capability is fully achievable today** and does **not** require the multi-day decouple work.
Everything needed already exists; it's just deliberately wired to open the projects list.

## Why it currently shows the list

On activation, when the workspace folder is a Demo Builder project, `extension.ts:370-373` focuses
the Activity Bar → the tree-view visibility handler (`extension.ts:206-214`) fires →
`shouldAutoOpenProjectsList` → `demoBuilder.showProjectsList`. There is **no branch** that says
"this workspace is a project → show *its* Dashboard."

## Building blocks already present

| Piece | Location | What it provides |
|---|---|---|
| Project-detection predicate | `shouldAutoReopenProjectsList(workspaceFolderPath)` — `src/features/dashboard/commands/showDashboard.ts:44-57` | On activation, already determines whether `workspaceFolders[0]` is a Demo Builder project (path under `~/.demo-builder/projects/`, via `path.relative` guard). |
| Current project persisted *before* reload | `stateManager.saveProject(project)` at `dashboardHandlers.ts:170` (before `openFolder`) | After reload, `stateManager.getCurrentProject()` returns the picked project. `state.json` stores `currentProjectPath`; manifest is source of truth. |
| Dashboard command self-resolves the project | `ProjectDashboardWebviewCommand.execute()` → `getCurrentProject()` (`showDashboard.ts`); registered as `demoBuilder.showProjectDashboard` (`commandManager.ts:96`) | No project argument needed — renders whatever the current project is. |
| Proven cross-reload replay pattern | `replayPendingClaudeLaunch` (`extension.ts:84-109`) reads a `globalState` record `{projectPath, prompt, createdAt}`, checks freshness (`PENDING_LAUNCH_TTL_MS = 60_000`) + workspace-match, dispatches on activation. Writer: `aiHandlers.ts:130-134`; key `'demoBuilder.ai.pendingClaudeLaunch'` (`openInClaude.ts:28`). | The exact template *if* extra intent must cross the reload. |

## Recommended approach — A: workspace-folder-derived

At activation, when `shouldAutoReopenProjectsList(activationWorkspace)` is true, route to
`demoBuilder.showProjectDashboard` instead of letting the projects list auto-open. The project is
derivable from the workspace folder itself — **no record, no TTL.**

**Why A over the replay-record (B):**
- Simpler — reuses the existing project-detection predicate + the dashboard's self-resolving
  `getCurrentProject()`; nothing new to persist or expire.
- More robust — also lands on the Dashboard when the folder is opened *any* way (File → Open
  Recent, `code <projectdir>`), not just via tile-click.
- The replay-record pattern (B) earns its complexity only when carrying *extra* intent that isn't
  derivable from the folder (e.g. a prompt pre-fill, which is exactly why
  `replayPendingClaudeLaunch` exists). Showing a Dashboard needs no such extra.

## Gotchas to design around

1. **Ordering vs. the list auto-open.** The tree-view visibility handler opens the list whenever
   the sidebar becomes visible and `getActivePanelCount() === 0` (`shouldAutoOpenProjectsList`,
   `extension.ts:57-66`). Open the **Dashboard first** (panel count → 1) *before* focusing the
   Activity Bar, or the list still wins.
2. **Disposal safety-net.** `BaseWebviewCommand.setDisposalCallback` (`extension.ts:230-237`)
   reopens the list when the Dashboard closes inside a project workspace — stays correct; verify it
   doesn't fight the new landing.
3. **Stale `state.json`.** `getCurrentProject()` reads `currentProjectPath` from
   `~/.demo-builder/state.json`, which could point elsewhere if the folder was opened outside the
   tile flow. Deriving the project from `workspaceFolders[0]` (approach A) sidesteps this — prefer
   the folder as ground truth, then load that project into state if it differs.
4. **Single-root assumption.** All call sites use `workspaceFolders?.[0]` — fine for Demo Builder's
   one-folder-per-project model.

## Relationship to the decouple-from-workspace backlog

This is the complementary, low-risk slice that works *within* the current "reload on switch"
reality: it fixes **where you land after the reload**, not the reload itself. The backlog item's
goal (render in-place, no window reload) supersedes this if/when it ships — but that's multi-day
work threading a `project` argument through `StateManager`, the MCP server, dashboard hooks, auth
cache, and file watchers (~50 test files). This quick-win delivers most of the perceived
improvement ("I picked a project and it showed me the project") for a fraction of the effort.

## Suggested next step (Plan phase)

Plan approach A: an activation branch in `extension.ts` that, when `shouldAutoReopenProjectsList`
is true, (a) loads the project from `workspaceFolders[0]` into state if needed, (b) executes
`demoBuilder.showProjectDashboard`, then (c) focuses the Activity Bar — in that order — and guards
the list auto-open so it doesn't override. TDD targets: the activation routing decision and the
ordering guard.
