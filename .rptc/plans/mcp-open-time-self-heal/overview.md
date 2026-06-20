# Plan: Open-time MCP self-heal — overview

**Status:** ⤵ FOLDED into [`../dashboard-open-orchestrator/`](../dashboard-open-orchestrator/overview.md)
(2026-06-20, PM chose the unified-orchestrator scope). This plan's detection helper + heal become that
plan's **Step 3** (`mcp-health` check); `detectMcpDrift` Step 1 here is reused verbatim. Kept for the
detailed test cases; execute via the orchestrator plan, not standalone.
**Backlog item:** [`../../backlog/2026-06-20-mcp-stale-storefront-node-modules-path.md`](../../backlog/2026-06-20-mcp-stale-storefront-node-modules-path.md)
**Decision:** auto-regenerate on open (PM-chosen), built with transparency guardrails so it is not a
silent background stall (cf. the dashboard org-check surprise-browser).

## Goal

When a project dashboard opens, cheaply detect whether the project's `.mcp.json` MCP-server paths
actually resolve on disk; if any don't, **automatically and visibly** run the existing "Regenerate AI
files" flow to rewrite them to this-project isolated paths. Cause-agnostic: catches pre-isolation
projects, pre-`eaaf44c8` renames, moves, and silently-failed inline regen — without knowing *why* a
path went stale.

## Why this shape

- Detection is **path-existence only** (no network, no MCP spawn) → cheap enough to run on every open;
  healthy projects do nothing.
- It **reuses** the shipped heal (`handleRegenerateAiFiles` → install into `.demo-builder-mcp` →
  rewrite `.mcp.json`), which already emits `creationProgress` and is non-fatal.
- It **mirrors the existing `runOrgContextCheck` seam** (fire-and-forget from `handleRequestStatus`,
  posts result messages to the webview, never blocks the status payload).

## Integration seams (from codebase trace, file:line)

- **Hook point:** `handleRequestStatus` (`dashboardHandlers.ts:40-126`) sends the status payload, then
  `void runOrgContextCheck(...)` (`:123`). Add a sibling `void runMcpSelfHeal(context, project)` the
  same way — not awaited, never blocks status.
- **Heal:** `handleRegenerateAiFiles` (`aiHandlers.ts:172-236`) — installs ai-defaults MCP tools (EDS
  gate at `:189`), runs `generateAIContextFiles`, clears the MCP inspector cache. Emits
  `creationProgress` (`:195-200`). Safe to call programmatically.
- **Detection primitives:** `.mcp.json` shape `{ mcpServers: Record<id,{command,args}> }`
  (`mcpInspector.ts:77-85`); the reader uses `.claude/mcp.json`. Isolated dir =
  `resolveMcpToolsDir(projectPath)` = `<project>/.demo-builder-mcp` (`aiDefaultsInstaller.ts:55-57`).
- **EDS gate:** `isEdsProject(project)` (`typeGuards.ts:303-305`). Headless projects have no MCP
  tooling → skip entirely.
- **Skip the `demo-builder` server:** its arg is the extension's `dist/mcp-proxy.js` (absolute,
  extension-managed, not a project-drift concern) — never stat it.
- **Webview feedback:** `useDashboardStatus` already listens for `creationProgress`
  (`useDashboardStatus.ts:303`) and `orgContextResult` (`:285`) — mirror for self-heal messages.

## Steps (TDD)

- **[Step 1](step-01.md) — `detectMcpDrift` pure helper.** New `src/features/ai/mcpDriftDetector.ts`:
  read `.claude/mcp.json`, resolve each non-`demo-builder` server's arg paths (absolute as-is; relative
  joined to `resolveMcpToolsDir`), `fs.access` each, return `{ drifted, missing[] }`. No network, no
  spawn. Pure + fully unit-testable.
- **[Step 2](step-02.md) — `runMcpSelfHeal` orchestrator + wire into open.** Fire-and-forget function
  mirroring `runOrgContextCheck`; gate on `isEdsProject`; on drift, post `mcpSelfHealStarted`, call
  `handleRegenerateAiFiles(context)`, post `mcpSelfHealDone` (non-fatal try/catch). Per-session
  re-entrancy guard so it can't run twice for the same project. Called from `handleRequestStatus`.
- **[Step 3](step-03.md) — visible UI feedback.** `useDashboardStatus` handles `mcpSelfHealStarted/Done`
  (and the `creationProgress` it reuses) to show "Updating AI configuration…", clearing on done.
  Minimal — mostly reuses the existing progress surface.

## Risks / constraints

- **Don't stall open:** detection must be O(few stats); heal runs async and only on confirmed drift.
- **No surprise:** the heal must be visibly telegraphed (Step 3) — explicitly the anti-pattern from the
  org-check finding.
- **Re-entrancy:** guard against double-fire when the webview re-requests status.
- **Non-fatal:** a heal failure (e.g. b2b `@dropins` install abort) must degrade quietly to a logged
  warning + a "couldn't update" signal, never throw into dashboard load.
- **Scope boundary:** drift = a *declared* server path that doesn't resolve. A *missing* `.mcp.json`
  (AI not set up at all) is out of scope here — that's the AI-Ready badge's job
  ([`../../backlog/2026-06-01-ai-ready-skills-drift.md`](../../backlog/2026-06-01-ai-ready-skills-drift.md));
  note the seam in case we later unify into one `detectAiDrift`.

## Out of scope

Fixing the inline rename/create regen paths (already correct via `eaaf44c8`); the broader passive
AI-Ready drift badge; the surprise-browser org-check (separate backlog item).
