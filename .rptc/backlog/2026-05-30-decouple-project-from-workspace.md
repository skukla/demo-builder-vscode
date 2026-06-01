# Decouple project from VS Code workspace folder

**Filed:** 2026-05-30
**Origin:** Fix-session for "extension resets when switching projects from the list"

> **Related tactical quick-win:** [`../research/2026-05-31-post-reload-dashboard-landing.md`](../research/2026-05-31-post-reload-dashboard-landing.md).
> That research covers a much smaller, lower-risk slice that works *within* the current reload
> behavior: after the `openFolder` reload, land on the picked project's **Dashboard** instead of
> the projects-list start screen (route on `activate()` when the workspace folder is a project).
> It does **not** require the project↔workspace decoupling below, and delivers most of the
> perceived "I picked a project and it showed me the project" improvement. This decouple item
> supersedes it if/when it ships (no reload at all).

## Symptom

From a project's Dashboard, clicking "All Projects" → selecting a different project
triggers a full VS Code workspace switch. The extension host reactivates, the auto
update check re-runs (mitigated separately by the throttle commit), and the dashboard
cold-loads. The user describes this as "the extension resets" — and architecturally
it does.

The throttle commit (this same session) silences the most obvious re-execution noise.
The remaining cold-load disruption is the architectural piece.

## Why it happens

Each Demo Builder project is anchored to its own VS Code workspace folder. The
projects-home grid handler at
`src/features/projects-dashboard/handlers/dashboardHandlers.ts:191` calls
`vscode.commands.executeCommand('vscode.openFolder', uri, false)` when the picked
project's path differs from the current workspace folder. VS Code reloads the
extension host on workspace change — there is no API to swap the workspace folder
in-place.

## Goal

When the user picks a project from the home grid (or from "All Projects" inside an
already-open project window), the Project Dashboard for the picked project should
render in-place without a window reload. The workspace folder should remain stable
until the user explicitly opens an action that needs it (terminal, AI Chat, MCP).

## What this would require

1. **Project state read from a central registry, not the workspace folder.** The
   Project Dashboard already reads from the per-project manifest, but several
   features (`StateManager.getCurrentProject`, mesh status, AI verify) currently
   assume "current project = workspace folder." Each of these needs an explicit
   `project` argument.
2. **Per-project MCP socket lifecycle.** Today `inExtensionMcpServer` starts on
   activation against the workspace folder. To support "viewing a project that
   isn't the workspace," either keep the MCP server idle until a workspace-anchor
   action fires, or spin up a transient server per project visit.
3. **Terminal/AI Chat anchoring.** `OpenInClaudeCommand` spawns a terminal with
   `cwd = project.path`. If the workspace folder is different from the project,
   the terminal session is in the project's directory but the editor's file
   operations still target the workspace. Decide whether to (a) silently swap
   workspaces at that moment (preserves today's behavior for that one action), or
   (b) document the disconnect and let the user open the workspace manually.
4. **File watchers and dashboard live data.** The `componentTreeProvider` watches
   the workspace folder. If the dashboard shows project B but workspace is A, the
   "component browser" tile cannot reflect B's files without re-scoping the watcher.
5. **Migration path.** Existing users land in a project workspace today. The new
   flow needs a sensible default: probably keep the workspace stable until the user
   takes a workspace-requiring action, then anchor on-demand.

## Why this is multi-day work

The "workspace = project" assumption is hardwired across `StateManager`, the
MCP server, the dashboard's status hooks (`useDashboardStatus`), Adobe Auth
caching (`AuthCacheManager`), the file watchers, and most handlers in
`features/dashboard/handlers/`. Each needs an audit and a project-argument
threading pass. Expect cascading test updates (~50 test files reference the
"current project" pattern).

## Scope guardrails

When this work is picked up:
- Keep the workspace-anchor command path intact (one explicit user action triggers
  the reload — that's fine). The goal is "no automatic anchor on browse."
- Do NOT remove the per-project MCP socket — the socket path is the wire identity
  the proxy needs. Just delay or scope its lifecycle.
- A backlog item, not a feature request — the throttle commit fixed the
  highest-irritation slice; the rest is polish.
