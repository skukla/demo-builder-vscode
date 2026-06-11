# Engine-aware AI launch + detection + opt-in install (Claude wired, Codex placeholders)

**Status:** Draft. UX decisions locked in below; implementation sized but not started. Scope expanded from "detect missing Claude CLI" to "make the AI engine path engine-aware so future Codex support drops in via a config map," following confirmation from the project owner.
**Filed:** 2026-06-11
**Updated:** 2026-06-11 with engine-aware framing and the convention-coupling audit results from the codebase sweep.
**Origin:** Field issue with Leah Rayard. She has Claude Desktop installed (the Electron app) but no Claude Code CLI on PATH. The extension's "AI Ready" badge stayed green, she clicked "Open in Claude Code," and got `zsh: command not found: claude` in a VS Code terminal with no guidance about what's missing or how to fix it.

## What we're fixing

Three real gaps in the current AI-feature wiring:

1. **The "AI Ready" badge lies.** It checks project files (AGENTS.md, .mcp.json, skill files) and the in-extension MCP server inventory — none of which depend on the Claude CLI. A user with no `claude` on PATH still sees a green badge until the moment they try to use the chat.
2. **The chat-launch failure is invisible to the extension.** `openInClaude.ts:172-173` sends `claude --continue -- '<prompt>'` to a VS Code terminal via `terminal.sendText`. The shell prints "command not found" and the extension never sees it. No notification, no guidance.
3. **No path to recovery.** Even if the user figures out they need the CLI, the extension doesn't tell them what to install or how. Claude Code's official install is `brew install --cask claude-code` on macOS or `curl -fsSL https://claude.com/install | sh` elsewhere — discoverable from <https://claude.com/code> but the extension never points there.

## What we know about the dependency surface

The Claude CLI is only needed for three user-facing entry points, all of which converge on `openInClaude.ts`:

| Entry point | File |
|---|---|
| "Open in Claude Code" button (dashboard kebab menu) | `src/commands/openInClaude.ts` |
| Sidebar "AI Zone" Chat button | `src/features/sidebar/...` → routes to `openInClaude` |
| "Show Prompts" QuickPick | `src/commands/showPromptsPicker.ts` → routes to `openInClaude` |

Everything else AI-related — `verifyAiSetup`, the in-extension MCP server, "Regenerate AI Files," the `AiCapabilitiesModal` — runs fine without the CLI. The MCP server architecture works because Claude (the harness) spawns `dist/mcp-proxy.js` as a stdio MCP server when it launches inside a project workspace; the extension itself doesn't shell out to `claude`.

## Engine-aware structure

The owner confirmed Codex support as a near-term direction. The `demoBuilder.ai.engine` setting already exists in `package.json` (enum currently locked to `["claude-code"]`) and was always intended to be load-bearing. This plan makes it load-bearing for the **launch path** and the **install/detection path**, with Codex placeholders so adding Codex later is a config map fill-in, not a redesign.

Everywhere this plan refers to "Claude," read it as "the configured AI engine, where today the only enum value is `claude-code`." Concrete parameterization map:

| Concern | Engine-keyed value |
|---|---|
| Display name for the engine | `'Claude Code'` / `'Codex'` |
| CLI binary on PATH | `'claude'` / `'codex'` |
| Launch command construction | `claude --continue -- <prompt>` / TBD |
| Install command (Homebrew, where available) | `brew install --cask claude-code` / TBD |
| Install URL fallback | `https://claude.com/code` / TBD |
| Terminal name (label of the spawned VS Code terminal) | `'Claude Code'` / `'Codex'` |

These six values live in **one map per engine**, in `src/features/ai/services/aiEngineRegistry.ts` (or similar). Every site that historically said "claude" reads from this map keyed by the current engine setting. Today, only the `claude-code` entry is populated; the `codex` entry is a TBD placeholder with a "Codex support not yet wired" guard that surfaces a friendly error rather than running broken commands.

### The user-facing command becomes "Open in AI"

Per owner confirmation:

- Command ID renames from `demoBuilder.openInClaude` to `demoBuilder.openInAi`
- Title shown in the command palette is **dynamic**: "Open in Claude Code" when `engine === 'claude-code'`, "Open in Codex" when `engine === 'codex'`. The label is interpolated from the engine display name. Same command, two labels.
- File renames from `src/commands/openInClaude.ts` to `src/commands/openInAi.ts`
- The implementation reads `demoBuilder.ai.engine`, looks up the engine config, and routes the launch through the parameterized command and terminal name

### The modal title stays engine-agnostic

Per owner confirmation:

- `AiCapabilitiesModal` title remains "AI Capabilities" (already engine-agnostic, good)
- Body shows engine-specific copy where it makes sense (the engine row label interpolates the engine name)
- The new conditional modal-level action button — visible only when the configured engine is missing — has dynamic text: "Install Claude Code" or "Install Codex" depending on engine

## Scope boundary — what this plan does NOT do for Codex

A codebase sweep surfaced **convention coupling** that goes deeper than the launch and install paths. The plan handles the launch/install side now and explicitly punts the convention side to a future plan that will be triggered when Codex support actually wires up. The lines we're drawing:

### In scope (this plan, ships in beta.115)

- The engine setting (`demoBuilder.ai.engine`) becomes load-bearing for everything below
- The launch command (binary + flags + terminal name) is engine-keyed via a registry
- The install/detect path (Homebrew command + install URL + `<engine-binary> --version` check) is engine-keyed via the same registry
- All user-facing strings that say "Claude" in the launch and install flows interpolate the engine display name instead
- File and command renames: `openInClaude.ts` → `openInAi.ts`, `demoBuilder.openInClaude` → `demoBuilder.openInAi`, `TERMINAL_NAME` becomes `engine.terminalName`
- Tests parameterize on engine where they previously hardcoded `'Claude Code'` / `claude`
- Codex enum value is **not added yet** — the setting enum stays at `["claude-code"]`. The registry has a `codex` slot ready, but selecting Codex isn't possible until we know its install/launch surface and the convention work below is scoped

### Out of scope (separate plan when Codex actually gets wired)

The sweep found four classes of Claude-specific conventions that the launch/install plan does **not** address. These would need separate design when Codex support becomes real, because they touch project file conventions that we currently write to disk:

1. **Session store probe** (`src/commands/claudeSessionStore.ts`) — reads `~/.claude/projects/<encoded-cwd>/*.jsonl` to decide between `claude --continue` and bare `claude`. Codex's session location is unknown to us today.
2. **Config dir conventions** (`.claude/mcp.json`, `.claude/settings.json`, `.claude/CLAUDE.md`, `.claude/skills/`) — currently hardcoded in `mcpConfigWriter.ts`, `aiContextWriter.ts`, `skillsWriter.ts`, `aiSetupVerifier.ts`. Codex's equivalent dir + files are not standardized in the codebase yet.
3. **Skill discovery format** (`.claude/skills/<name>.md` with YAML frontmatter) — Claude Code's specific convention. Whether Codex consumes the same format or a different one is unknown.
4. **CLAUDE.md pointer files** — root and `.claude/` directory both get a `"see @AGENTS.md\n"` one-liner. Codex's `@FILENAME` import convention (if any) is unknown.

The reasoning for splitting these out: the engine setting + launch path + install path are enough infrastructure to ship the immediate fix (Leah's case + the broader badge accuracy) and to put the seam in the right place. The convention work is non-trivial, blocked on Codex docs we don't have, and shouldn't gate shipping the immediate-need fix.

When Codex wiring lands, it'll be one of two things:
- **If Codex uses the same conventions** (e.g., reads `.claude/mcp.json` or `@AGENTS.md` natively), nothing in the convention layer needs to change — Codex inherits everything.
- **If Codex has divergent conventions**, a separate plan picks up the convention abstraction work: parameterizing dir names (`.claude/` → `.<engine>/`), parameterizing pointer file names (CLAUDE.md → CODEX.md), and so on. The sweep documents every site that'd need to change so that plan is well-scoped.

### Confirmed engine-agnostic, no work needed

The codebase sweep also confirmed three things are already engine-agnostic by design:

- The **in-extension MCP server** (`src/features/ai/server/inExtensionMcpServer.ts`) and the **stdio↔socket proxy** (`src/mcp-proxy.ts`) speak pure MCP. Any client that respects the MCP protocol gets the same tools.
- The canonical `.mcp.json` at the project root is the MCP standard format. Both Claude Code and Codex consume it. The defensive `.claude/mcp.json` mirror is Claude-specific, but having it write doesn't break Codex (Codex ignores it).
- The `AGENTS.md` file is the cross-tool AI-context standard. Same content works for any agent that reads it.

So the foundation we're building on is solid — only the harness conventions are engine-specific, and those are exactly what the convention plan will address later.

## Existing UX patterns we'll reuse — do NOT reinvent

The extension already has the right primitives for every layer of this work. The plan deliberately routes Claude detection and install **into existing surfaces**, not parallel ones. Concrete reuse map:

| Concern | Existing pattern | Where it lives | Why we reuse |
|---|---|---|---|
| **Modal that lists AI capabilities** | `AiCapabilitiesModal` | `src/features/dashboard/ui/components/AiCapabilitiesModal.tsx` | Already renders skills + MCPs with status. We add a new row, not a new modal. |
| **"AI Ready" badge with four-color state machine** | `useDashboardStatus.aiReady` memo + `AiReadyState` type | `src/features/dashboard/ui/hooks/useDashboardStatus.ts:388-411` | Already implements blue/red/yellow/green semantics with the exact framing we need (yellow = "Setup incomplete"). We add Claude availability to the existing yellow branch, not a new color or label. |
| **AI verification result shape** | `verifyAiSetup` returns `{ status, checks, inventory }`; `checks[]` already drives the red branch | `src/features/ai/aiSetupVerifier.ts` | Add Claude as a new `check` entry — same shape as the existing file/MCP checks. Badge logic reads from `checks` already; no new wiring needed. |
| **Status row components (icon + label + action)** | `StatusDot`, `StatusCard`, `StatusDisplay` | `src/core/ui/components/ui/StatusDot.tsx`, `src/core/ui/components/feedback/StatusCard.tsx`, `src/core/ui/components/feedback/StatusDisplay.tsx` | Match the visual language of every other badge in the extension. The new Claude row inside `AiCapabilitiesModal` composes from these. |
| **"Binary missing → notification → action" pattern** | The `storefront-setup-github-app-required` flow in `storefrontSetupPhase3.ts:140-158` (AEM Code Sync install prompt) | `src/features/eds/handlers/storefrontSetupPhase3.ts` | This is the template. We mirror the same notification shape ("isTeamOrg" style) and action handling for `openInClaude.ts`. Don't invent a new notification UX. |
| **Shell-out with timeout + retry** | `CommandExecutor` + the retry-strategy infrastructure | `src/core/shell/commandExecutor.ts`, `src/core/shell/retryStrategyManager.ts` | The `claude --version` check uses these directly, not raw `child_process`. Inherits cancellation, timeout, race protection. |
| **Install-with-progress in a tracked VS Code terminal** | `PrerequisitesManager.installPrerequisite` flow + the install-step output capture | `src/features/prerequisites/services/PrerequisitesManager.ts` + `src/features/prerequisites/services/installation/` | The brew install of Claude runs through the same mechanic as the existing brew install of fnm/Node. We extract a thin reusable helper (`installViaBrew`) if not already present, or just call into the existing prereq-install runner with a synthesized prereq spec. |
| **One-time post-install hint** | `showOneTimeTip` | `src/core/utils/oneTimeTip.ts` | The "You may need to sign in to Claude" post-install message uses this so it doesn't spam users on every install. |
| **Open external URL with confirmation** | `vscode.env.openExternal(vscode.Uri.parse(url))` (used throughout for GitHub OAuth, install URLs, etc.) | Standard VS Code API | "Open install page" actions in the modal and notification use this directly. No wrapper needed. |
| **Progress tracking for multi-step operations** | `ProgressUnifier` | `src/core/utils/progressUnifier.ts` | If the install needs more than one step (brew check → brew install → reverify), the progress goes through ProgressUnifier so it visually matches existing install flows. |

What this means for **new code**: the only genuinely new things are (a) the `claude --version` check entry inside `verifyAiSetup`, (b) one new row inside `AiCapabilitiesModal`, (c) the lazy-gate function in `openInClaude.ts`, and (d) the orchestration in `claudeInstaller.ts`. Everything else routes through patterns that already exist.

### The "use the prerequisites engine wholesale?" question — answered no, but with explicit borrowing

The existing prereq system (config-driven `prerequisites.json` + `PrerequisitesManager`) is tempting because it handles detection, install, progress, and re-check in one place. We deliberately do NOT add `claude-cli` as an entry in `prerequisites.json` — three reasons:

1. **The prereq engine is wizard-scoped.** It runs during project creation and gates the wizard's "Continue" button per Node version. Claude doesn't fit either dimension (it's not Node-versioned, it's not part of project creation).
2. **The user explicitly distinguished "upfront extension prerequisite" from "AI-specific prerequisites."** The current AI surfaces (badge, modal, lazy gate) are the right home; the wizard prereqs step is the wrong home.
3. **It would visually pile Claude on every wizard run** for every user, even users not using AI features today. That's the opposite of YAGNI.

Instead, we borrow the prereq engine's *install runner* (the part that runs a Homebrew command in a tracked terminal with progress UI) and call it from the AI surface. The result: same visual experience as installing aio-cli or fnm, but triggered from the AI Capabilities modal instead of the wizard step.

## The design — B + C + opt-in install

### Layer 1 (B) — Honest detection in the verifier

Add a `claude` availability check to `verifyAiSetup`. Shells out to `claude --version`, parses the output, returns `{ available: true, version: "..." } | { available: false }`. This becomes a first-class field on the `AiVerificationResult`.

Propagate to two visible surfaces:

- **The "AI Ready" badge** in `useDashboardStatus.aiReady` — when `claude.available === false`, badge moves to yellow ("AI setup incomplete") with a contextual link
- **The `AiCapabilitiesModal`** — render a "Claude Code CLI" row with status: Installed (v1.2.3) ✓ or Not installed ⚠ + actions

### Layer 2 (C) — Lazy gate at the chat-launch site

Before `terminal.sendText('claude ...')` in `openInClaude.ts`, run a quick `which claude` (~5ms cached for the session). If missing:

- Show a VS Code notification: "Claude Code isn't installed. Install it now?"
- Buttons: "Install" (triggers the opt-in flow below), "How to install" (opens <https://claude.com/code>), "Skip" (opens the terminal anyway so power users can debug)
- Don't auto-block — let them choose

Layer 2 covers users who click chat without ever opening the AI Capabilities modal first. Layer 1 covers the proactive-discovery path. Both reuse the same install-flow code.

### Layer 3 — Opt-in auto-install

This is the part you asked about. Trigger paths:

- "Install" button in the AI Capabilities modal row (Layer 1)
- "Install" button on the lazy-gate notification (Layer 2)
- "Install" CTA on the contextual link from the yellow badge

Behavior:

1. Confirm with the user (modal): "This will install Claude Code on your machine via Homebrew. Continue?" Buttons: Install / Cancel / Open install page
2. If Cancel → close, nothing happens
3. If Open install page → opens <https://claude.com/code>, closes
4. If Install:
   - Check Homebrew availability. If missing, fall back to "Open install page" with a message ("Auto-install needs Homebrew. Use the installer at claude.com/code instead.")
   - If Homebrew available: spawn the install in a tracked VS Code terminal (named "Install Claude Code") via `terminal.sendText('brew install --cask claude-code')`
   - Wait for the command to complete (poll for process exit or use `vscode.tasks.executeTask`)
   - On success: re-run the verifier, show "Claude Code installed. You may need to open a new terminal." with a button to re-trigger the original chat action
   - On failure: surface the brew error and offer to open the install page

Why these specific choices on auto-install:

- **Homebrew rather than `curl | sh`.** The curl-piped-shell pattern is the official non-Homebrew path, but it's the kind of thing many enterprise users are trained not to run, and it implicitly accepts whatever the script does. Homebrew is auditable, reversible, and matches the existing extension pattern (which uses Homebrew to install fnm, which installs Node, etc.). For non-Homebrew systems (Linux without brew, Windows without WSL+brew), fall through to "open install page" rather than offering a less trustworthy path.
- **Install scope: fully global, not jailed** — see the "Jail it or install globally?" section below.
- **No auto-auth.** After install, Claude still needs subscription/API auth setup, which is interactive and user-specific. The extension stops at "binary installed and on PATH"; the user runs `claude` once to complete setup.

## Answering your three questions

### Q1: How does auto-install factor into B+C?

It slots in as the **primary action** wherever B+C currently surface "Install Claude Code" links:

- **Layer 1 (badge + modal):** "Install" button triggers the opt-in flow, with "How to install" as a fallback link to <https://claude.com/code>
- **Layer 2 (lazy gate notification):** Same — "Install" triggers opt-in, "How to install" opens the URL, "Skip" lets them proceed

Without auto-install, B+C send the user to a browser to install manually and re-trigger. With auto-install, the same UX flows skip the browser detour for Homebrew users. The fallback to "open install page" stays, so non-Homebrew users get the same experience they would have had without the feature.

### Q2: Should we auto-install?

Yes, but constrained. Homebrew path only; everything else falls back to the install URL. Three reasons:

- **It matches the existing extension pattern.** fnm, Node, aio-cli, and Git are all auto-installed via Homebrew (Mac) or other package managers. Treating Claude as an exception is inconsistent and confuses users into thinking it's somehow more dangerous than the others.
- **It eliminates the click-out-to-browser drop-off.** Today, "click here to install" means: opens a browser, finds the command, opens a terminal, runs it, returns to the extension, re-tries. Each step has a drop-off. Bundling them into one confirm + one progress UI is meaningfully better.
- **It's reversible.** Homebrew installs can be cleanly removed (`brew uninstall --cask claude-code`). Curl-piped-shell installs typically aren't.

The constraint matters: don't auto-run the curl installer. The "auto-install" code path is Homebrew or it's the install URL. Nothing in between.

### Q3: Jail it or install globally? Does that conflict with using Claude outside the extension?

**Install globally.** Don't try to jail it.

Two reasons:

1. **There's no meaningful "jail" available.** The existing "jails" in this extension are an illusion: fnm is installed globally via Homebrew; Node is installed under fnm's per-version directories (not really a jail — it's just version management); aio-cli lives in fnm's Node 20 global bin (jailed to fnm Node 20, but the extension switches Node version per shell-out, so the user can't easily use it from another terminal without `fnm use 20`). That pattern works because aio-cli is a Node package and its version is tied to a Node version. Claude Code is not a Node package — it's a Rust/Node bundle distributed as a brew cask or a self-contained installer. There's no per-Node-version equivalent to lock it to.
2. **Jailing would conflict with using Claude outside the extension.** If we somehow installed Claude into fnm's Node 20 bin (which we can't, but hypothetically), the user wouldn't have `claude` on their normal PATH. They'd need `fnm use 20` to run it from a fresh terminal. That's a real conflict — Leah probably wants `claude` available in any terminal she opens, not just terminals where she's pre-loaded fnm. Installing globally via Homebrew puts the binary at `/opt/homebrew/bin/claude` (on Apple Silicon) or `/usr/local/bin/claude` (Intel), both on default PATH. No conflict with extension or non-extension use.

**Cross-contamination concern (worth knowing):** Claude's config and auth state live under `~/.claude/`. That directory is shared by every `claude` process the user runs, regardless of how Claude was installed. So if the user installs Claude via our extension and also uses Claude for their own projects, they share auth and CLI history. That's the same situation as if they installed Claude themselves manually — installing through the extension doesn't add any new sharing.

## Files we'd change

| File | What |
|---|---|
| `src/features/ai/aiSetupVerifier.ts` | Add `checkClaudeAvailable()`; include in `AiVerificationResult` |
| `src/features/ai/index.ts` | Export `AiVerificationResult` shape with the new field |
| `src/features/dashboard/ui/hooks/useDashboardStatus.ts` | `aiReady` factors `claude.available` into the badge color |
| `src/features/dashboard/ui/AiCapabilitiesModal.tsx` (or wherever the modal lives) | New row + actions |
| `src/commands/openInClaude.ts` | Add lazy-gate check before `sendText`; show notification on failure |
| New: `src/features/ai/services/claudeInstaller.ts` | The opt-in install flow (Homebrew check, install command, completion polling, fallback to URL) |
| New: `src/features/ai/services/claudeInstallerConstants.ts` | `CLAUDE_INSTALL_URL = 'https://claude.com/code'`, brew command string |

## Tests

| Test | Covers |
|---|---|
| `verifyAiSetup` returns `claude.available: true` when `claude --version` succeeds | Happy path |
| `verifyAiSetup` returns `claude.available: false` when `claude --version` 127s (not found) | Missing binary |
| `verifyAiSetup` returns `claude.available: false` when `claude --version` times out | Slow/broken install |
| `aiReady` returns "incomplete" when `claude.available: false` | Badge color logic |
| `openInClaude` shows notification + skips terminal when claude missing | Lazy gate happy path |
| `openInClaude` proceeds normally when claude available | Lazy gate no-op path |
| `claudeInstaller.install()` runs brew command and reports success when brew exits 0 | Auto-install happy path |
| `claudeInstaller.install()` falls back to URL when brew missing | Non-Homebrew path |
| `claudeInstaller.install()` reports failure when brew exits non-zero | Install error |

~9 test deltas, ~5 new + 4 updates to existing badge/modal/openInClaude tests.

## Execution plan

### Step 0 — Engine registry (new file, foundation for everything below)

- New file: `src/features/ai/services/aiEngineRegistry.ts`
- Exports `AI_ENGINES: Record<EngineId, EngineConfig>` where `EngineConfig` contains:
  - `displayName: string` (e.g., `'Claude Code'`)
  - `binaryName: string` (e.g., `'claude'`)
  - `versionCommand: string` (e.g., `'claude --version'`)
  - `launchCommand: (prompt: string, hasPriorConversation: boolean) => string`
  - `terminalName: string`
  - `installCommandHomebrew: string | null` (null → no Homebrew path)
  - `installUrlFallback: string`
- Exports `getCurrentEngine(): EngineConfig` that reads `demoBuilder.ai.engine` from settings, looks up the registry, and returns the config
- Today: `claude-code` entry fully populated; `codex` entry is a stub that throws "Codex support not yet wired" when `getCurrentEngine` is called with engine = codex. The setting enum stays at `["claude-code"]` so this throw is unreachable through normal UX.
- Tests: 2 cases (returns Claude config when setting = claude-code; throws when setting = codex)

### Step 1 — Verifier check (extend `aiSetupVerifier`, don't fork it, use the registry)

- Add `checkAiEngineAvailable(engine: EngineConfig): Promise<{ available: boolean; version?: string }>` to `aiSetupVerifier.ts`
- Implementation calls `CommandExecutor.execute(engine.versionCommand, { timeout: TIMEOUTS.QUICK })` — not raw `child_process`. Inherits the existing timeout + cancellation handling we already trust elsewhere.
- Add an `ai-engine` entry to the result's `checks[]` array, mirroring the shape of the existing AGENTS.md / .mcp.json / skill file checks. The check name is dynamic: `engine.displayName + ' CLI'`. The badge logic at `useDashboardStatus.ts:399` already iterates `checks[]` for the red-branch; making the engine availability a check entry means it naturally surfaces in the badge without changing the iteration logic.
- For the yellow branch ("Setup incomplete"), expose engine availability alongside the existing `inv.skillsError ?? inv.mcpsError` checks. One condition added to one OR expression.
- Tests: 3 cases (engine available, not found, timeout) — placed next to existing `aiSetupVerifier` tests, same mocking patterns. Tests parametrize on engine config so they exercise both branches when Codex eventually lands.

### Step 2 — Badge + modal surfaces (single-action pattern matches existing AI modal)

- `useDashboardStatus.aiReady` memo at `useDashboardStatus.ts:388-411` — add `verifyResult.checks.find(c => c.name === currentEngine.displayName + ' CLI')` to the existing yellow-branch condition. Single line addition; no new state machine, no new color, no new label.
- `AiCapabilitiesModal` (`src/features/dashboard/ui/components/AiCapabilitiesModal.tsx`) — two changes that follow the modal's existing single-action vocabulary:
  - **Read-only status row in the body** (same pattern as `AiMcpsList`): "AI Engine (Claude Code) · v1.2.3" when installed, "AI Engine (Claude Code) · not installed" when missing. Uses the same inline minimal-ink style as the skill and MCP rows — no per-row action button.
  - **Conditional second action button at the modal level**: when the engine is missing, add an "Install Claude Code" / "Install Codex" button alongside the existing "Regenerate AI files" button. Label is dynamic via `currentEngine.displayName`. When the engine is available, this second button isn't rendered — modal goes back to just "Regenerate AI files."
- This matches the existing AI modal's design vocabulary: actions are at the modal level, body rows are status display. We add ONE conditional second action, not a per-row pattern.
- Tests: 3 cases (modal renders engine row in available state, missing state; modal shows second action button only when missing).

### Step 3 — File/command rename + lazy gate (engine-aware)

Two concurrent moves in this step:

**3a — Rename for engine-agnostic naming:**
- File: `src/commands/openInClaude.ts` → `src/commands/openInAi.ts`
- Class: `OpenInClaudeCommand` → `OpenInAiCommand`
- Command ID: `demoBuilder.openInClaude` → `demoBuilder.openInAi` in `package.json` and `commandManager.ts:239`
- Command title in `package.json`: change from static `"Open in Claude Code"` to a dynamic label using VS Code's command title interpolation if available, OR keep a static title and rely on the modal/error messages for engine-specific copy. (Implementation-time decision: VS Code's `package.json` doesn't support dynamic command titles natively; the simplest path is "Open in AI" as the static label, and the terminal it spawns plus the toast message carry the engine name.)
- The `Engine = 'claude-code'` type in `openInClaude.ts:14` becomes the registry's `EngineId` import — keeps current behavior but is now the source of truth.
- All Claude-specific strings in this file interpolate from the registry:
  - `TERMINAL_NAME = 'Claude Code'` → `engine.terminalName`
  - The hardcoded launch command construction → `engine.launchCommand(prompt, hasPriorConversation)`
  - Error/toast strings: "Failed to open Claude Code..." → `"Failed to open ${engine.displayName}..."`, etc.

**3b — Lazy gate (mirror the AEM Code Sync prompt):**
- Before `terminal.sendText`, run `engine.versionCommand` via `CommandExecutor`. Cache the result on a module-level `let lastEngineCheck: { engineId: string; available: boolean; timestamp: number } | undefined` with a 60-second TTL so repeat clicks don't re-spawn the check. The cache is keyed on engineId so a setting change invalidates appropriately.
- When missing, show a VS Code notification using `vscode.window.showWarningMessage` with the same shape as the existing AEM Code Sync install prompt in `storefrontSetupPhase3.ts:140-158`:
  - Message: `"${engine.displayName} isn't installed on your system."`
  - Actions: `"Install ${engine.displayName}"` (calls Step 4), "How to install" (opens `engine.installUrlFallback`), "Skip" (proceeds with `terminal.sendText` anyway so power users can debug their PATH).
- The session store probe in `claudeSessionStore.ts` remains Claude-specific for now — see "Out of scope" above. When `engine.id === 'claude-code'`, use the existing probe. When the registry adds a Codex entry that includes session-store logic, the call site will branch on engine. For now, hardcoded to Claude is acceptable because `engine.id === 'claude-code'` is the only possible value at runtime.

Tests: 3 cases (gate-passes when engine available; gate-shows-notification when missing; cache invalidates on engine setting change) — use the renamed `openInAi.test.ts` scaffolding.

### Step 4 — Opt-in installer (thin orchestration over existing install runner, engine-aware)

- New `src/features/ai/services/aiEngineInstaller.ts` (renamed from the draft's `claudeInstaller.ts` since it's engine-aware). Small orchestration layer, not a new install system. It exposes one function: `confirmAndInstall(engine: EngineConfig, context): Promise<{ installed: boolean; reason?: string }>`.
- Internally:
  1. Show a confirmation modal via `vscode.window.showInformationMessage` (modal: true) with copy: `"Install ${engine.displayName} on your machine via Homebrew?"`. Buttons: Install / Cancel / Open install page.
  2. Cancel → return `{ installed: false, reason: 'user-cancelled' }`.
  3. Open install page → route to `vscode.env.openExternal(engine.installUrlFallback)` and return `{ installed: false, reason: 'user-chose-manual' }`.
  4. Install → check `engine.installCommandHomebrew !== null` AND Homebrew availability via `CommandExecutor.execute('command -v brew', ...)`. If either absent, route to install URL fallback and return `{ installed: false, reason: 'no-homebrew' }`.
  5. If brew available and engine has a brew command, delegate the actual install to **the same install runner the prereq engine uses** — either by importing the helper from `src/features/prerequisites/services/installation/` or by extracting it into `src/core/shell/brewInstaller.ts` if it's not yet importable. Pass `engine.installCommandHomebrew` as the command. Same visible experience as a brew install of fnm/Node/aio-cli.
  6. After the install runner completes, re-run `checkAiEngineAvailable(engine)` (the Step 1 helper).
  7. On success: show a one-time hint via `showOneTimeTip` (key: `aiEngineInstalled-${engine.id}`) saying `"You may need to run \`${engine.binaryName}\` once to sign in."` and trigger a re-verify of the AI surface so the badge updates.
  8. On failure: surface the brew error via `vscode.window.showErrorMessage` with an "Open install page" action that opens `engine.installUrlFallback`.
- The registry already holds the install URL, brew command, and binary name. The installer just reads them off the engine config — no new constants file needed.
- Tests: 4 cases (brew install success for Claude → re-verify → tip shown; brew missing → URL fallback; brew install failure → error + URL action; engine has no brew command → URL fallback). The fourth case covers the Codex placeholder path even before Codex is enum-enabled — it's how we'll know the engine-aware structure works when Codex info lands.

### Step 5 — Wire all surfaces to call into Step 4

- Modal second action button (when engine missing) → `aiEngineInstaller.confirmAndInstall(currentEngine, context)`
- Notification "Install" action → same
- Badge link click (when yellow due to engine missing) → same
- Single entry point keeps confirmation UX, install progress, and post-install hint consistent across surfaces. No surface implements its own install flow. Each surface reads `currentEngine` from the registry; the installer is engine-aware end-to-end.

## Risk + rollback

**Risk 1 — Brew install can take 30-60 seconds on slow networks.** The progress UX matters; users will think it hung. Mitigation: spawn in a visible VS Code terminal so they see brew's own output streaming. No silent background install.

**Risk 2 — `claude --version` adds ~50ms to dashboard load.** Cache the result for the session; only re-check on explicit "Re-verify" action or after install completes. Tests should cover the cache path.

**Risk 3 — Claude installed but not auth'd.** Common state after fresh install. The lazy gate would pass (binary present) but the terminal launch may still produce a "log in to claude.com" prompt the first time. That's Claude's own UX, not ours — the extension shouldn't try to handle it. Document in the install-complete notification: "You may be prompted to sign in to Claude on first use."

**Risk 4 — Auto-install on an unsupported platform.** Linux without Homebrew, Windows without WSL+brew. The fallback is "open install page." Worth confirming the install page handles platform detection — claude.com/code does (per the spec — but worth verifying during implementation).

**Rollback:** All five steps are independent commits. Revert can target any subset. The setting/binary-install path doesn't persist anything in the project — it's purely user-machine-level, so rolling back the extension change doesn't leave a trail.

## What this plan does NOT solve

- **Auto-auth after install.** The user logs in to the chosen engine themselves (interactive flow per engine). The extension surfaces a "You may need to sign in" hint and stops there.
- **Detecting Claude Desktop (or a Codex-equivalent desktop app) as a fallback.** Desktop apps have no CLI surface for prompt injection.
- **Detecting/integrating the Claude Code VS Code extension** (`anthropic.claude-code`). Research note `2026-05-20` concluded the URI handler doesn't support prompt injection. Not a v1 concern.
- **Non-Homebrew auto-install paths.** Curl-piped-shell is risky; we fall back to the install URL instead.
- **Uninstall.** Users remove engines themselves via `brew uninstall`. Not extension territory.
- **Codex convention layer** (see the "Scope boundary" section above). `.claude/` directory conventions, session-store probing, skill discovery format, and CLAUDE.md/CODEX.md pointer files are intentionally out of scope. Triggered as a separate plan when Codex actually wires up.

## Open questions before implementation

None remaining — UX decisions are locked in above. The only implementation-time confirmation is: does `claude --version` exit non-zero (127) or zero with a different stdout when the binary is missing? Almost certainly 127 + ENOENT, but worth a 5-second verify when wiring Step 1.

## Kickoff prompt

```
Implement the claude-cli-detection-and-install plan
(see .rptc/plans/claude-cli-detection-and-install/overview.md).

Design is locked. Read the "Existing UX patterns we'll reuse" section
FIRST and orient toward extending the existing surfaces rather than
creating parallel ones. The plan estimates ~150-200 lines of new code
ONLY because most of the work is hooking into patterns that already
exist (badge state machine, status row components, modal layout,
install runner, command executor, one-time tip). If you find yourself
writing more than that, you're probably reinventing something —
re-read the reuse map.

Execute Steps 1-5 in order. Each step references specific existing
files/lines to extend.

Hot files (extend):
  - src/features/ai/aiSetupVerifier.ts — add checkClaudeAvailable
    + a check entry to the result. Don't fork the verifier.
  - src/features/dashboard/ui/hooks/useDashboardStatus.ts:388-411 —
    one OR-condition added to the existing yellow branch. Don't
    add a new color or state.
  - src/features/dashboard/ui/components/AiCapabilitiesModal.tsx —
    one new row composed from existing StatusDot/StatusCard primitives.
    Don't introduce a new row pattern.
  - src/commands/openInClaude.ts — lazy gate before sendText, mirroring
    the AEM Code Sync prompt pattern at storefrontSetupPhase3.ts:140-158.

Hot files (genuinely new):
  - src/features/ai/services/claudeInstaller.ts — thin orchestration
    layer. Internally delegates to the existing prereq install runner
    for the brew step.
  - src/features/ai/services/claudeInstallerConstants.ts — constants only.

If the prereq engine's install runner isn't cleanly importable from
outside the prereq feature, extract a small brewInstaller helper into
src/core/shell/ and import from both places. Don't replicate the
install/progress code.

Verify during implementation:
  - `claude --version` exits 127 with ENOENT when missing (almost
    certainly, but confirm during Step 1)
  - claude.com/code handles platform detection for the fallback URL
    path (test by curling its content; if no, document an OS-aware
    fallback)
  - The existing prereq install runner is importable / extractable
    cleanly. If not, Step 4 needs a small refactor pass to expose it.

Target: ship as part of beta.115 or next release window.

Acceptance criteria:
  - Leah (or anyone) opens a project, sees yellow "AI Setup incomplete"
    badge (the SAME yellow badge fnm/Node/aio-cli prereqs would surface
    — visual reuse, not a new badge variant)
  - Clicks the badge → AiCapabilitiesModal opens with a new "Claude
    Code CLI" row alongside the existing skill / MCP rows, styled the
    same way
  - "Install" button on the row → confirm dialog → brew install runs
    in a tracked terminal with the SAME progress UI fnm install uses —
    completes → badge turns green
  - One-time tip surfaces post-install: "You may need to run `claude`
    once to sign in." (uses showOneTimeTip, won't re-show on next install)
  - Clicks "Open in Claude Code" from dashboard → chat launches with
    no detour
```
