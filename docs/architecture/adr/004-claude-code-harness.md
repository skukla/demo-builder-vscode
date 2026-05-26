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

## Amendment (2026-05-25): Terminal as Baseline + Unified Dock-to-Right

### What changed

The prior amendment treated the extension surface as the default and framed
missing-extension as a configuration error. End-user testing surfaced two
issues with that framing:

1. New users without the Claude Code extension hit a recovery dialog on first
   launch, treating the absence as a problem rather than the baseline.
2. Each surface had its own positioning concerns — the extension had
   `claudeCode.preferredLocation`; the terminal had nothing equivalent — and
   switching surfaces lost the user's layout preference.

### Resolution

**Terminal becomes the baseline surface.** `demoBuilder.ai.surface` default
flips from `'extension'` to `'terminal'`. The Claude Code extension is
reframed as a *convenience layer* Demo Builder detects and offers, not an
expected dependency. The recovery dialog (`maybeShowFirstLaunchDialog`) now
fires only when the user has *explicitly* chosen `'extension'` AND the
extension is missing — a real intent mismatch, not the default state.

**A capability-aware offer toast surfaces the extension when detected.**
`maybeOfferExtensionSurface` fires once when `surface='terminal'` AND the
Claude Code extension is installed AND
`EXTENSION_AVAILABLE_OFFER_SHOWN_KEY` is unset. The user picks "Use the
Extension" (writes `surface='extension'`, the current click resolves via
URI) or "Stay in Terminal" (settings unchanged, click proceeds via CLI).

**A single position preference drives both surfaces.** New setting
`demoBuilder.ai.dockToRight` (boolean, default `false`). When `true`, the
extension chat panel docks to the right secondary sidebar and terminals
open as editor tabs beside the active editor. Demo Builder atomically
syncs `claudeCode.preferredLocation` (via try/catch with rollback) so the
extension natively respects the preference. One toast
(`maybeOfferDockToRight`, surface-aware wording) replaces the prior
surface-specific dock tips, sharing a single flag
(`DOCK_OFFER_SHOWN_KEY` — same string value as the legacy
`FIRST_TIP_KEY`, so users who saw the old tip don't re-see the new toast).

**Two-layer gate model for AI affordances.** Gate 1: `surface` controls
launch behavior. Gate 2: `isClaudeCodeExtensionInstalled()` controls
visibility of extension-specific UI (Browse Claude sessions link;
sessions browser auto-open). The gates are intentionally orthogonal — a
`surface='terminal'` user with the extension installed gets the
sessions browser link too (they can browse via the extension while sending
via the CLI).

### What this supersedes from the prior amendment

The 2026-05-24b amendment described `surface='extension'` as the default and
positioned missing-extension as the conflict case. Both framings are
reversed: `'terminal'` is the default; missing-extension is normal; the
extension is offered when detected.

The recovery dialog and migration logic are preserved but their scope
narrows. The mismatch warning (`MISMATCH_WARNING_KEY`) still fires for the
explicit-intent case on the no-prompt "Open in Claude Code" tile path.

### Files

- `package.json` — `demoBuilder.ai.surface` default flipped to `'terminal'`;
  new `demoBuilder.ai.dockToRight` boolean setting.
- `src/commands/openInClaude.ts` — `DOCK_OFFER_SHOWN_KEY` constant (renamed
  from `FIRST_TIP_KEY`, same string value); `maybeOfferDockToRight`
  helper with atomic dual-setting write + rollback;
  `maybeOfferExtensionSurface` helper; `launchTerminal` reads
  `dockToRight` to choose location; `SESSIONS_BROWSER_AUTO_SHOWN_KEY`
  constant colocated with the other AI globalState keys.
- `src/core/base/baseCommand.ts` — `createTerminal(name, cwd?, location?)`
  signature extended with optional location passthrough.
- `src/features/dashboard/handlers/aiHandlers.ts` — three new handlers
  (`copyAiPrompt`, `browseClaudeSessions`,
  `markSessionsBrowserAutoShown`); `handleVerifyAiSetup` response
  extended with `extensionInstalled`, `sessionsBrowserAutoShown`,
  `surface`.
- `src/features/dashboard/ui/aiSurface/components/PromptCard.tsx` — kebab
  "Copy prompt" item; distinct icon (Spectrum `Copy` for the new action,
  `Duplicate` for the existing Duplicate item).
- `src/features/dashboard/ui/aiSurface/AiOverviewScreen.tsx` — "Browse
  Claude sessions" link gated by extension presence; one-time
  auto-open on first mount gated on browse success; surface-aware
  multi-click contract note above the prompt grid.

---

## Amendment (2026-05-26): Terminal Prompt Delivery — Launch Arg on Spawn

**Problem.** A clicked prompt was dropped when Claude Code launched in a
freshly *spawned* terminal. The implementation pasted the prompt into the REPL
via bracketed-paste escape sequences after a delay (first 800 ms, later a tuned
and configurable 2500 ms). `claude --continue` reaches its input-ready REPL
only after loading prior session history and initializing MCP servers, and that
time varies by machine, project, and network. Any fixed delay races the
cold-start and loses.

**Why no readiness signal.** Research (VS Code API docs, 1.93 release notes,
the relevant GitHub issues) confirmed there is no public signal for "TUI is
ready for input." Terminal shell integration reports the shell command's
start/end, not an application's internal readiness; its only relevant event
fires at claude *launch* (earlier than the old delay), and reading the
alternate-screen output to detect readiness is fragile and unsupported. A retry
loop can't help either — without a "landed" signal it would duplicate the
prompt once claude becomes ready.

**Decision.** Eliminate the race instead of timing it.

- **Spawn:** deliver the prompt as a launch argument —
  `claude --continue -- <prompt>`. claude receives it the moment it starts; the
  `--` marks end-of-options so a dash-leading prompt is read as text, not a
  flag. The prompt is POSIX single-quote escaped (`quotePromptForShell`).
  Consequence: the prompt **auto-submits** (claude runs it immediately) rather
  than pre-filling for review — an accepted trade for reliability, and a good
  fit for curated demo prompts.
- **Reuse:** a running claude can't take a new launch arg, so the immediate
  bracketed-paste injection is retained (pre-fills the input for the user to
  send). This is reliable because claude is already at its REPL.
- The clipboard write remains the always-on fallback.

**Supersedes.** The `demoBuilder.ai.spawnInjectDelayMs` setting and the
delayed spawn-inject machinery are removed.

**Files.** `src/commands/openInClaude.ts` (`launchTerminal` spawn path,
`quotePromptForShell`; removed `scheduleSpawnInject` / `getSpawnInjectDelayMs`),
`package.json` (setting removed).
