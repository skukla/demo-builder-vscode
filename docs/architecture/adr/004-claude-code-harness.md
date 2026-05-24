# ADR-004: Claude Code (CLI) as the AI Harness

**Status**: Accepted
**Date**: 2026-05-21
**Decision Maker**: Project Team
**Implementer**: AI Layer Pivot — Cycles A (2026-05-19), B (2026-05-20), C (2026-05-20), D (2026-05-21)

---

## Context

### The Problem

Demo Builder generates an `.claude/` directory inside every project (skills, MCP config, settings) and an extension-host MCP server that exposes seven project tools to AI agents. We had three plausible harnesses to target:

1. **VS Code Chat** (the native chat panel in VS Code)
2. **Anthropic's Claude Code VS Code extension** (`anthropic.claude-code`) — a chat panel inside VS Code, bundled with the Claude Code CLI
3. **Claude Code CLI directly** — `claude` invoked from a terminal in the project root

The pivot needed a single harness to optimize for: file layout, MCP discovery, skill discovery, "open the AI" UX, and update channels. Optimizing for two harnesses simultaneously dilutes the integration surface and forces compatibility hacks.

### Why Claude Code (CLI) Wins

Claude Code is the engine. Both the CLI binary and the VS Code extension wrap the same backend — same auth, same sessions, same MCPs, same skills, same `CLAUDE.md` / `AGENTS.md` resolution. The VS Code extension bundles the `claude` binary; installing the extension installs the CLI. Choosing the CLI as the primary harness means:

- **Single file layout works for every entry point.** `.claude/skills/`, `.mcp.json`, `~/.claude.json` (user-scope MCP registry), `~/.claude/.mcp.json` (legacy/fallback), and the `AGENTS.md` + `CLAUDE.md` pointer chain are loaded the same way by both front-ends.
- **No VS Code Chat plumbing.** VS Code Chat has a different API surface, a different skill model, and a different MCP transport. Targeting it would have required a second adapter layer.
- **Users keep their preferred UI.** A user who likes the chat panel installs the Claude Code extension; a user who prefers terminal opens a terminal. The setting `demoBuilder.ai.harness` (`'auto' | 'extension' | 'terminal'`) lets them pick.
- **No vendor lock to a chat UI.** The CLI is the canonical surface that Anthropic maintains. The extension is a wrapper. Building against the wrapper would have created drift risk.

### What Claude Code (CLI) Means in Practice

| Surface | Owned By | Path |
|---|---|---|
| Project skills | Demo Builder + Adobe `commerce-extensibility-tools` | `<project>/.claude/skills/*.md` |
| Project MCP servers | `mcpConfigWriter.ts` | `<project>/.mcp.json` (canonical) + `<project>/.claude/mcp.json` (mirror) |
| User-scope MCP registry | `ensureGlobalMcpRegistration` (consent-gated) | `~/.claude.json::mcpServers.demo-builder` |
| AI agent context | `aiContextWriter.ts` | `<project>/AGENTS.md` + `CLAUDE.md` pointers |
| Standalone MCP server | `src/mcp-server.ts` → `dist/mcp-server.js` | extension-installed binary, discoverable via the global registry |
| Configure UI surface | `AiConfigurationTab.tsx` | Live skill inventory, project MCP tool lists, session MCP detection, regenerate + register controls |
| Open-the-AI action | `OpenInClaudeCommand` | URI handler `vscode://anthropic.claude-code/open` OR terminal `claude` in the project cwd |

### What We Explicitly Did Not Build

- **VS Code Chat integration.** Not in scope. No Chat participant, no Chat tool registration, no Chat skill bridge.
- **In-VS-Code chat UI.** Users who want a chat panel install Anthropic's extension. We do not embed a chat surface.
- **Custom session model.** Claude Code owns sessions. We do not surface session IDs in our UI.
- **Auto-dock the extension into the secondary side bar.** VS Code does not expose a stable API for this. A one-time tip on first successful URI launch is the substitute.
- **Auto-submit prompts via the URI handler.** The handler only pre-fills the input; auto-submit is not supported.

---

## Decision

**Claude Code (CLI) is the AI harness.** All AI surfaces in Demo Builder are designed to work with the `claude` binary as the canonical entry point. The Anthropic VS Code extension is treated as an optional accelerator: when installed, the "Open in Claude Code" action launches via the URI handler; when not installed, it falls back to a terminal.

The harness setting (`demoBuilder.ai.harness`) lets users force one path:

- `'auto'` (default) → URI handler if extension installed, terminal otherwise
- `'extension'` → URI handler always; user-visible error if the extension is missing
- `'terminal'` → terminal launch always, even if the extension is installed

---

## Consequences

### Positive

- One file layout, one set of writers, one inspection backend (`gatherInventory` + `skillInspector` + `mcpInspector` + `sessionMcpDetector`). The Configure tab consumes the same payload regardless of which front-end the user opens.
- The MCP server is a standalone stdio process (`dist/mcp-server.js`). It has no `vscode` import and runs in any environment that can spawn a Node process. This keeps it usable by future harnesses (Cursor, Codex, anything that speaks MCP).
- `AGENTS.md` is the universal AI context file, with `CLAUDE.md` reduced to a one-line pointer. Other harnesses that adopt `AGENTS.md` directly need zero adaptation.
- "Open in Claude Code" is a single user-visible button — no harness picker UI, no settings tour.

### Negative

- **Users without `claude` installed see a friction step.** The first time they invoke "Open in Claude Code" with `harness='terminal'` and no binary on PATH, the terminal opens but `claude` fails. Mitigated by the dashboard tile copy and by the AI Configuration tab's status panel, but not eliminated.
- **Two MCP file paths to maintain.** `<project>/.mcp.json` (canonical, read by Claude Code) and `<project>/.claude/mcp.json` (defensive mirror). One write, two files. If Anthropic ever drops the mirror, we delete one branch in `mcpConfigWriter.ts` and move on. (See research notes 2026-05-20 Impact C.)
- **No control over the extension's panel location.** When the URI handler opens the extension, it lands wherever the user previously docked it. The one-time placement tip (gated by `globalState.demoBuilder.ai.firstClaudeOpenTipShown`) is the only nudge we can give.
- **URI handler depends on extension version ≥ 2.1.72.** Older installations no-op silently. Mitigated by the rolling-extension-update channel; not directly detected at runtime.

### Neutral

- The `.claude/settings.json` PostToolUse hook is part of the contract — it triggers `regenerate_ai_files_after_run` so AI-generated edits keep the inventory in sync. This is a Claude Code feature; other harnesses adopting our `.mcp.json` will not get the hook, and that is acceptable.
- Cycle B retired the now-unused `demoBuilder.aiSetup.helixToken` plumbing. Future cycles should resist re-adding harness-specific config until a concrete second harness shows up.

---

## Cycle Reference

| Cycle | Date | Branch | Highlights |
|---|---|---|---|
| A | 2026-05-19 | `feature/ai-layer-pivot-cycle-a` (merged) | Skills writer trimmed to 3 lifecycle skills; AGENTS.md as the universal context file; MCP server moved out of `features/ai/` |
| B | 2026-05-20 | `feature/ai-layer-cycle-b` (merged) | `demoBuilder.ai.harness` setting; `ensureGlobalMcpRegistration` consent-gated; `helixToken` plumbing dropped |
| C | 2026-05-20 | `feature/ai-layer-cycle-c` (merged) | `skillInspector` + `mcpInspector` + `sessionMcpDetector`; `gatherInventory` orchestrator; `inspect-mcp` handler; `AiVerificationResult.inventory` payload |
| D | 2026-05-21 | `feature/ai-layer-cycle-d` (current) | `AdobeMcpUpdateChecker`; `OpenInClaudeCommand`; `AiConfigurationTab` replaces `AiSetupTab`; dashboard tile + project-card menu item; ADR-004 |

---

## Open Questions

None affecting the harness decision. Two implementation items are tracked in [`.rptc/backlog/`](../../../.rptc/backlog/README.md):

1. **Structural baseline** — codebase-wide measurement after Cycle D.
2. **Legacy soft-deprecation cleanup** — downstream of the baseline; ~30 inventoried items.

Both run in future sessions at the maintainer's discretion. Neither blocks Cycle D shipping.

---

## References

- [docs/research/2026-05-19-ai-layer-pivot-plan.md](../../research/2026-05-19-ai-layer-pivot-plan.md) — original design plan
- [docs/research/2026-05-20-claude-code-vscode-extension-integration.md](../../research/2026-05-20-claude-code-vscode-extension-integration.md) — extension integration research
- [src/features/ai/README.md](../../../src/features/ai/README.md) — feature surface documentation
- ADR-002: Helix bulk API fallback — companion decision pattern (auth fallback driven by empirical testing)

---

## Amendment (2026-05-24): Workspace Anchoring

### What changed

A correctness gap surfaced after Cycle D shipped: the URI handler that the
`auto` and `extension` harness modes use accepts only `prompt` and `session`
query params — there is no `path`/`cwd`/`folder`. Claude Code inherits the
focused VS Code window's workspace folder as its cwd. Because Demo Builder
explicitly did not set the workspace to the project (a beta.64-era decision
to avoid multi-root pollution), the chat panel loaded with **none** of the
per-project skills, `.mcp.json`-registered Adobe MCPs, or `AGENTS.md` context.
Only the terminal harness was anchored correctly.

### Resolution

**Selecting a project anchors VS Code's workspace to the project.**

- **Project tile click** (`handleSelectProject`) opens the project folder as the
  current window's workspace via `vscode.openFolder(uri, false)`. Shift- or
  Cmd-click opens in a new window instead (VS Code modifier convention). When
  the workspace already matches the project, no reload happens — the dashboard
  webview just surfaces.
- **Wizard finish** (`openProjectAsWorkspace` from
  `projectFinalizationService.ts`) opens the freshly-created project as the
  current window's workspace right after AI context files and global MCP
  registration. The user flows from "creating a demo" into "working on the
  demo" without an extra gesture.
- **`harness='auto'`** is now workspace-aware: it URI-launches via the
  extension only when `workspaceFolder[0] === project.path`. Otherwise it
  falls back to the terminal launch (correct cwd, no chat panel) instead of
  silently URI-launching with the wrong cwd.
- **`harness='extension'`** still URI-launches unconditionally, but surfaces a
  one-time-per-session warning toast when workspace ≠ project, explaining why
  the chat panel will not see project context.
- **Safety net**: closing the project dashboard webview inside a project
  workspace auto-opens the projects list as a new tab in the same window, so
  the user never ends up stranded without a Demo Builder navigation surface.

### What this supersedes from the original ADR

The original ADR's premise — Claude Code as harness, with the harness
setting as the only knob — stands. What the amendment supersedes is the
**implicit assumption** that the user would already be in the project's
workspace when invoking "Open in Claude Code." That assumption did not hold
in practice and produced silently broken URI launches. Anchoring the
workspace to the project on tile click and wizard finish makes the assumption
true by construction.

### What is still not done

- **No multi-root workspace support.** Claude Code's behavior across roots is
  undocumented; we stay single-root for now.
- **No promotion of skills / AGENTS.md to user-scope.** Those files are
  inherently project-specific; the per-project anchoring stays correct.
- **No auto-chain of URI launch after `openFolder`.** Opening the folder
  reloads the window, and reliably scheduling a follow-up URI launch into the
  new window is fragile. The user invokes "Open in Claude Code" themselves
  once the project workspace is loaded.

### Files

- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` —
  `handleSelectProject` workspace-anchor logic
- `src/features/projects-dashboard/ui/components/ProjectCard.tsx`,
  `ProjectRow.tsx` — shift/cmd-click modifier passthrough
- `src/features/dashboard/commands/showDashboard.ts` —
  `shouldAutoReopenProjectsList` helper + `dispose()` override
- `src/features/project-creation/services/projectFinalizationService.ts` —
  `openProjectAsWorkspace`, wired into `executor.ts` as Phase 7
- `src/commands/openInClaude.ts` — workspace-aware `auto` mode, mismatch
  warning for `extension` mode

---

## Amendment (2026-05-24b): Binary Surface + Prompt-Click Anchoring

### What changed

The `auto` mode introduced in the original ADR proved confusing — its behavior
depended on runtime conditions (extension installed? workspace anchored?)
that users couldn't predict from the setting alone. The same release adds
prompt-click support to the AI surface, which surfaced two gaps: prompts were
silently dropped when the extension was missing, and even when present, URI
launches into the wrong cwd (workspace ≠ project) lost per-project context.

### Resolution

**`demoBuilder.ai.harness` is replaced by two settings:**

- **`demoBuilder.ai.engine`** — which AI tool. Currently `'claude-code'`-only;
  reserved for future engines (e.g. Codex). The split anticipates a world
  where Demo Builder supports multiple AI tools, each with its own extension
  and CLI surface.
- **`demoBuilder.ai.surface`** — `'extension'` (default) | `'terminal'`. How
  Demo Builder launches the configured engine.

A one-time migration (`extension.ts:migrateHarnessSetting`) maps any persisted
`harness` value to `surface`: `auto` → `extension`, `extension` → `extension`,
`terminal` → `terminal`. Workspace and global scopes are migrated
independently; an explicit `surface` value at a given scope takes precedence
(the migration never overwrites a user's deliberate choice).

**Extension missing is now a configuration error, not a silent fallback.**

- A recovery dialog surfaces "Install Claude Code Extension" (opens the
  marketplace) and "Switch to Terminal Mode" (updates the setting + retries
  the launch).
- A first-launch setup dialog (`maybeShowFirstLaunchDialog`) surfaces once
  during activation when `surface='extension'` (the default) AND the
  extension is not installed, presenting the same two actions.

**Terminal mode uses `claude --continue` + find-or-spawn.**

- `OpenInClaudeCommand.launchTerminal` looks for an existing "Claude Code"
  terminal in the current window (matched by name + `exitStatus === undefined`)
  and focuses it; only spawns a fresh terminal when none exists. One terminal
  per project per window, one Claude session per project (cwd-scoped). This
  matches the extension's chat-panel behavior (focus existing → chain
  prompts) on the terminal side.
- For prompt clicks, the prompt is copied to the clipboard before launching,
  with a "paste it into Claude" info toast. Survives across the
  workspace-anchor reload (OS-level clipboard).

**Prompt-click anchors the workspace via a pending-prompt mechanism.**

When the user clicks a prompt on the AI surface AND workspace ≠ project,
`aiHandlers.handleOpenInClaude` writes `{ projectPath, prompt, createdAt }`
to `globalState` under `PENDING_CLAUDE_LAUNCH_KEY`, then calls
`vscode.openFolder` to anchor. On next activation,
`extension.ts:replayPendingClaudeLaunch` validates three gates (present, not
stale <60s, workspace now matches `projectPath`), clears the record, and
dispatches `demoBuilder.openInClaude` with the prompt. Result: one click →
chat panel opens with prompt pre-filled AND full project context, regardless
of the user's starting workspace.

### What this supersedes from the prior amendment

The 2026-05-24 amendment described an `auto`-mode that fell back to terminal
when conditions weren't met. That mode is removed. The pending-prompt
mechanism replaces silent fallback with explicit workspace anchoring — the
user gets the surface they asked for (chat panel via extension; terminal via
CLI) without compromise.

The mismatch warning for `surface='extension'` is preserved for the
no-prompt "Open in Claude Code" tile path (which does not go through the
pending-prompt mechanism). For prompt clicks, the anchor + reload makes the
warning unnecessary.

### Files

- `package.json` — `demoBuilder.ai.harness` replaced with
  `demoBuilder.ai.engine` + `demoBuilder.ai.surface`.
- `src/commands/openInClaude.ts` — `Engine` + `Surface` types;
  `getEngine()`/`getSurface()` methods; `launchTerminal` find-or-spawn;
  `handleMissingExtensionDialog`; `maybeShowFirstLaunchDialog` (exported);
  new constants `PENDING_CLAUDE_LAUNCH_KEY`,
  `FIRST_LAUNCH_DIALOG_SHOWN_KEY`, `INSTALL_ACTION_LABEL`,
  `SWITCH_TO_TERMINAL_ACTION_LABEL`.
- `src/features/dashboard/handlers/aiHandlers.ts` — `handleOpenInClaude`
  pending-prompt branch when workspace ≠ project + prompt provided.
- `src/extension.ts` — `replayPendingClaudeLaunch` and `migrateHarnessSetting`
  helpers; `maybeShowFirstLaunchDialog` invocation; all gated by the
  activation-time Activity Bar focus.
