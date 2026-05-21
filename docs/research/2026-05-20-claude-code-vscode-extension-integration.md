# Claude Code VS Code Extension Integration Research

**Captured**: 2026-05-20
**Origin**: `/rptc:research` session investigating whether Demo Builder can integrate with the official Claude Code VS Code extension (`anthropic.claude-code`) instead of (or alongside) the terminal launch approach planned in the AI Layer Pivot
**Status**: Research deliverable. Implementation decisions feed into the AI Layer Pivot plan's Section 5 (Open in Claude Code) and Cycle D Step 14.

---

## Context

The current AI Layer Pivot plan launches Claude via a VS Code terminal running `claude` (Step 14, Section 5). Anthropic also ships an official VS Code extension that provides a richer in-editor chat panel. The extension and CLI share the same Claude Code engine — same auth, same sessions, same MCPs, same skills. This research investigates whether and how to integrate.

The user's screenshot showed the extension installed and docked in the secondary side bar (right), with tabs `CLAUDE CODE`, `CHAT`, `MERMAID CHART`, `LIVE SHARE`, an "Ask Claude to edit..." input box, and a "Prefer the Terminal experience? Switch back in Settings" hint.

---

## The Six Questions Answered

### 1. Detection

**Publisher ID: `anthropic.claude-code`** (confirmed via Visual Studio Marketplace and Open VSX listings).

```ts
const ext = vscode.extensions.getExtension('anthropic.claude-code');
if (ext) { /* installed */ }
```

Standard VS Code API. Stable since v1.0. *Confidence: high.*

### 2. Panel Docking Control

**No programmatic way to force the extension's view into a specific side bar.** VS Code's `contributes.viewsContainers` only accepts `activitybar` (primary) and `panel` (bottom) as stable locations. Secondary side bar contribution is a proposed API (microsoft/vscode #264346) that extensions cannot ship to the marketplace using. No public API queries which side bar a view currently lives in.

What we can do:
- Detect the extension is installed
- Show a one-time tip asking the user to drag the panel to the right side bar
- Track dismissal via VS Code `globalState`

*Confidence: high.*

### 3. Documented Public API for Launching

**The URI handler `vscode://anthropic.claude-code/open` is the documented public surface** (added in extension v2.1.72, March 2026). Supported parameters:

| Parameter | Supported | Notes |
|---|---|---|
| `prompt` | Yes | URL-encoded; pre-fills the input box but does not auto-submit |
| `session` | Yes | Resumes the session if it belongs to the current workspace; otherwise starts fresh |
| `folder` / `workspace` | No | The URI opens in the currently focused VS Code window; to target a specific workspace folder, focus that window first |

```ts
await vscode.env.openExternal(
    vscode.Uri.parse('vscode://anthropic.claude-code/open'),
);
```

The extension also registers commands under `claude-vscode.*` (e.g., `claude-vscode.newConversation`, `claude-vscode.editor.open`) but Anthropic does not document them as a stable API. Use the URI handler. *Confidence: high for URI handler, medium for command IDs.*

### 4. Default Panel Location

Default `preferredLocation` setting in the extension is `panel` (which means the editor area as a tab, NOT the bottom panel). Users can change to `sidebar` (secondary side bar, right). The screenshot's secondary-side-bar placement matches `preferredLocation: "sidebar"` plus the docs' clarification that "sidebar" means right side. *Confidence: high.*

### 5. Configuration Parity with the CLI

The extension wraps the same Claude Code engine as the CLI. They share:

| File | Honored | Path |
|---|---|---|
| Settings | ✅ | `~/.claude/settings.json` (shared between CLI and extension) |
| `.mcp.json` (workspace root) | ✅ | Canonical project-scope MCP file |
| `.claude/mcp.json` | ⚠️ Possibly | Anthropic issue #5350 (open feature request) says no; empirical evidence from earlier audit suggests yes. **Needs verification.** |
| `~/.claude.json` (home directory) | ✅ | Canonical user-scope MCP file per docs |
| `~/.claude/.mcp.json` | ⚠️ Possibly | What our `writeGlobalMcpConfig` writes today. Not the documented canonical path. **Needs verification.** |
| `CLAUDE.md` (root or `.claude/`) | ✅ | Memory file auto-loaded |
| `AGENTS.md` | ❌ Not loaded directly | Open feature request (issue #34235). But Claude Code resolves `@AGENTS.md` imports inside `CLAUDE.md`. Our pointer architecture handles this. |
| `.claude/skills/` (project) | ✅ | Auto-discovered at session start |
| `~/.claude/skills/` (user) | ✅ | Auto-discovered at session start |

*Confidence: high for skills, settings, `CLAUDE.md`, AGENTS.md non-support; medium for the two MCP path uncertainties.*

### 6. Session Model

Each chat tab in the extension equals one independent Claude Code session. Sessions are workspace-scoped — MCPs, skills, and `CLAUDE.md` load at session start from the current VS Code workspace. Multiple parallel chats in the same project all load the same project config but maintain separate conversation history.

Skills and MCPs are loaded per-session at startup. Our planned project-scoped MCPs/skills work without modification — no per-session logic needed. *Confidence: high.*

---

## Terminal vs. Extension UI Relationship

**Same engine, two front-ends.** The extension's `claudeCode.useTerminal` setting (default `false`) toggles between chat-panel mode and integrated-terminal mode. Both connect to the same Claude Code backend.

The CLI is bundled with the extension — installing the extension installs the `claude` binary, accessible from any VS Code terminal. Conversation history, MCPs, skills are shared.

Feature parity differences:

| Feature | CLI | Extension |
|---|---|---|
| Commands & skills | All | Subset (type `/` to see) |
| MCP server config | Full | Partial — add via CLI, manage via `/mcp` |
| Checkpoints | Yes | Yes |
| `!` bash shortcut | Yes | No |
| Tab completion | Yes | No |

---

## What This Means for the AI Layer Pivot

Three substantive impacts on the existing plan:

### Impact A: Two launch pathways, not one

The plan's "Open in Claude Code" command (Step 14) should select between two pathways based on installation:

- **Extension installed**: launch via URI handler `vscode://anthropic.claude-code/open`. The extension opens in its preferred location (chat panel or terminal mode per the user's `claudeCode.useTerminal` setting).
- **Extension not installed**: terminal launch as currently planned (`BaseCommand.createTerminal` + `sendText('claude')`).

A new setting (`demoBuilder.ai.harness`: `"auto" | "extension" | "terminal"`, default `"auto"`) lets users override the detection.

### Impact B: Possible global MCP registration bug

`writeGlobalMcpConfig` writes to `~/.claude/.mcp.json`. Anthropic's docs say the documented user-scope MCP file is `~/.claude.json` (home directory, not inside `~/.claude/`). The earlier audit showed Demo Builder's MCP working in Claude Code — but that audit ran from inside a project that had its own `.mcp.json`, which masked any global path issue.

Needs empirical verification: run `claude` from outside any Demo Builder project and check whether `demo-builder` appears in the MCP list.

### Impact C: Possible `.claude/mcp.json` redundancy

`mcpConfigWriter` writes to both `.mcp.json` (canonical project root) and `.claude/mcp.json` (which Anthropic documents as a feature request, not currently honored). Either Claude Code reads both as a defensive fallback, or the `.claude/mcp.json` write is dead weight. Worth verifying so the writer stops creating files no consumer reads.

### Impact D (minor): URI handler version dependency

The `vscode://anthropic.claude-code/open` URI handler was added in extension v2.1.72. If a user has an older version, the URI handler call no-ops silently. Worth checking `extension.packageJSON.version` and falling back to terminal launch on versions below 2.1.72. Or accepting the small failure-window risk.

---

## Recommendations

1. **Add `demoBuilder.ai.harness` setting** (`auto` | `extension` | `terminal`, default `auto`). Detection logic in the `demoBuilder.openInClaude` command picks the path. (High confidence.)

2. **Use the URI handler as the public API** for the extension. Do not depend on `claude-vscode.*` commands — those are undocumented and unstable. (High confidence.)

3. **Show a one-time placement tip** when we detect the extension is installed for the first time. Track dismissal via `globalState`. We cannot auto-dock the panel, but we can guide the user. (High confidence.)

4. **Verify the two MCP path findings** before Cycle B implementation. Five minutes of terminal work resolves both. Adjust `mcpConfigWriter.ts` based on findings. (High confidence on the recommendation; medium confidence on the underlying claims until verified.)

5. **Defer extension-command IDs.** Only use the URI handler. If we ever need finer control (e.g., session resume by ID), revisit. (Medium confidence — Anthropic may stabilize command IDs later.)

6. **Skills/MCP architecture stays as-is.** All five entry points work identically across CLI and extension. No changes needed to `aiSkillBundle`, `ai-defaults.json`, or the namespacing pass. (High confidence.)

7. **AGENTS.md must always have a `CLAUDE.md` pointer.** If a user deletes their generated `CLAUDE.md`, Claude Code loses the AGENTS.md import path. Document this dependency. The Regenerate AI Files action should restore the pointer if missing. (High confidence.)

---

## What We Cannot Do

- Force the extension into a specific side bar (no stable API)
- Query which side bar a view is currently in (no stable API)
- Open the extension in a specific workspace folder via URI parameter (URI handler always uses the focused window)
- Auto-submit a prompt via the URI handler (only pre-fills)

---

## Sources

### Official Anthropic / Claude Code

1. [Claude Code for VS Code — Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) — Publisher ID, version 2.1.145
2. [Use Claude Code in VS Code — Official Docs](https://code.claude.com/docs/en/vs-code)
3. [Claude Code Settings — Official Docs](https://code.claude.com/docs/en/settings)
4. [Extend Claude with Skills — Official Docs](https://code.claude.com/docs/en/skills)
5. [Claude Code Changelog](https://code.claude.com/docs/en/changelog)
6. [Claude Code on Open VSX (Anthropic publisher)](https://open-vsx.org/extension/Anthropic/claude-code)

### Anthropic GitHub issues

7. [anthropics/claude-code #28060 — commands not found](https://github.com/anthropics/claude-code/issues/28060)
8. [anthropics/claude-code #29145 — Add URI handler](https://github.com/anthropics/claude-code/issues/29145) (confirms `claude-vscode.editor.open` + `claude-vscode.newConversation`)
9. [anthropics/claude-code #34235 — AGENTS.md feature request](https://github.com/anthropics/claude-code/issues/34235)
10. [anthropics/claude-code #5350 — `.claude/` MCP config feature request](https://github.com/anthropics/claude-code/issues/5350)
11. [anthropics/claude-code #6732 — secondary side bar contribution](https://github.com/anthropics/claude-code/issues/6732)
12. [anthropics/claude-code #15797 — `.claude.json` location](https://github.com/anthropics/claude-code/issues/15797)
13. [anthropics/claude-code #32687 — docs missing URI handler](https://github.com/anthropics/claude-code/issues/32687)

### VS Code (Microsoft)

14. [VS Code Contribution Points — viewsContainers](https://code.visualstudio.com/api/references/contribution-points)
15. [VS Code Sidebars UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/sidebars)
16. [microsoft/vscode #264346 — secondary side bar contribution API](https://github.com/microsoft/vscode/issues/264346)
17. [microsoft/vscode-discussions #840 — querying sidebar state](https://github.com/microsoft/vscode-discussions/discussions/840)

---

## Cycle D Verification (2026-05-21)

Phase 1 research at the start of Cycle D revisited the open items in this document. Findings, captured for future maintainers:

### URI handler accepts only `prompt` + `session`

The table in Question 3 is correct. `folder` / `workspace` / `path` / `cwd` are NOT accepted. The URI handler opens in the currently-focused VS Code window. Because Demo Builder runs *inside* the user's VS Code, the focused window IS the Demo Builder window — workspace targeting is implicit. `OpenInClaudeCommand` therefore parses the bare URI without any query string. No mitigation needed.

### `@anthropic-ai/claude-code` npm package status

A stray note suggested the npm package was deprecated. **It is not.** The package is actively maintained and installs the same native binary as the standalone installer. Detection via `claude --version` exit code remains the canonical "is the CLI on PATH" check. No code change required; the original note (if it lived elsewhere) is the deprecated piece.

### Current extension version

As of 2026-05-21, the marketplace ships v2.1.145 (per the marketplace listing in source 1). The URI handler added in v2.1.72 is therefore broadly available. No runtime version gate is enforced — older installations no-op silently, which is acceptable.

### Impacts A–D resolution (cross-reference to Cycle B/D commits)

| Impact | Resolved In | How |
|---|---|---|
| A — Two launch pathways | Cycle D `OpenInClaudeCommand` | `demoBuilder.ai.harness` setting drives URI vs. terminal selection; extension detection via `vscode.extensions.getExtension('anthropic.claude-code')` |
| B — Possible global MCP path bug | Cycle B `ensureGlobalMcpRegistration` | Writes to `~/.claude.json` (the documented canonical path); the legacy `~/.claude/.mcp.json` write was dropped per the "no soft deprecation" rule |
| C — `.claude/mcp.json` redundancy | Deferred (low priority) | `mcpConfigWriter` continues to write both `.mcp.json` and `.claude/mcp.json` as a defensive mirror. Cost of two writes ≪ cost of a regression if Anthropic resumes reading the inner path. Empirical removal would happen during the structural baseline pass — see `docs/deferred/2026-05-21-legacy-soft-deprecation.md` |
| D — URI handler version dependency | Accepted | No runtime gate; older versions no-op silently. Update channel keeps users fresh |

### Other Cycle D Phase 1 findings (for future readers of the plan)

- `useAsyncOperation` had zero production callers before Cycle D. `AiConfigurationTab` is the first integration; the hook works as designed.
- No `MagicWand` icon exists in the Spectrum workflow icons used by this repo. Cycle D adopted `Wrench` for the "Open in Claude Code" action.
- The AI Configuration tab swaps in via single-line edits at `ConfigureScreen.tsx:16,615` — no tab registry, no plumbing changes.
