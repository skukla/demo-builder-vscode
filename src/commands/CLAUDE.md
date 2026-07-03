<!-- Last verified: 2026-07-03 -->
# Commands Module

## Overview

The commands module contains VS Code command implementations plus the central `CommandManager` that registers every `demoBuilder.*` command ID. Many user-facing commands live in their owning feature module (e.g. `@/features/mesh/commands/deployMesh`, `@/features/updates/commands/checkUpdates`, `@/features/project-creation/commands/createProject`, lifecycle commands) — `CommandManager` imports and registers them all.

## Command Structure

| File | Purpose |
|------|---------|
| `commandManager.ts` | Central registry — instantiates local and feature-owned commands and registers all `demoBuilder.*` command IDs |
| `claudeSessionStore.ts` | Probe for Claude Code's per-cwd conversation store (`~/.claude/projects/<encoded-cwd>/`); decides whether `claude --continue` is safe at launch |
| `configure.ts` | `demoBuilder.configure` — QuickPick to edit .env, redeploy mesh, and related project configuration actions |
| `diagnostics.ts` | System diagnostics report (system/VS Code/tool info, Adobe CLI auth, MCP socket/tool probe) logged to the debug channel |
| `migrateStorefrontNames.ts` | One-shot palette command migrating projects whose DA.live site name doesn't match the GitHub repo name (pre-`164fd251` builds) |
| `openInClaude.ts` | Launches the single "home" Claude Code chat terminal (see below) |
| `openModernizationAgent.ts` | Opens the AEM Experience Modernization Agent web console (`aemcoder.adobe.io`) with a tip about the current project's repo |
| `refreshBlockLibrary.ts` | Dashboard kebab action (EDS-only) — destructive full re-sync of the DA.live block library from `component-definition.json` |
| `showPromptsPicker.ts` | `demoBuilder.showPromptsPicker` — prompt QuickPick; dispatches to `openInClaude` (insert) or `openAi` (manage) |
| `handlers/HandlerContext.ts` | Back-compat re-exports of handler types from `@/types/handlers` |

Read the source — each file carries a substantial header comment.

## Command Registration Flow

```typescript
// In extension.ts
const commandManager = new CommandManager(context, stateManager, logger);
commandManager.registerCommands();
```

A few commands (`demoBuilder.showLogs`, `demoBuilder.showDebugLogs`, `demoBuilder.restartDemo`) are registered directly in `extension.ts`; everything else goes through `CommandManager.registerCommands()`.

## Main Commands

### Wizard message handling (CreateProjectWebviewCommand)

The main wizard command lives at `src/features/project-creation/commands/createProject.ts` and extends `BaseWebviewCommand`.

**Handler pattern** (handlers properly awaited via WebviewCommunicationManager):
```typescript
class CreateProjectWebviewCommand extends BaseWebviewCommand {
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('get-projects', async (payload) => {
            return await this.adobeAuth.getProjects(payload.orgId);
        });

        comm.on('select-project', async (payload) => {
            // handleSelectProject validates the target org is reachable via
            // ensureOrgContext and acks the selection; it does NOT mutate the
            // aio global. Project/workspace context is targeted per operation.
            return await handleSelectProject(this.context, { projectId: payload.projectId });
        });
    }
}
```

**Backend Call on Continue pattern** — selection steps update the UI immediately and defer backend calls to the Continue action:

1. **Selection UI Updates**: Immediate visual feedback on selection
2. **Backend Calls Deferred**: Actual backend operations happen when user clicks Continue
3. **Loading Overlay**: Simple spinner during backend confirmation
4. **Error Recovery**: Clear error handling at the commitment point

See `docs/patterns/selection-pattern.md` for the full pattern.

### navigate (Internal)

**Purpose**: Routes sidebar navigation clicks to the appropriate webview command

**Command ID**: `demoBuilder.navigate`

**Accepted targets** (via `payload.target`):

| Target | Routes to |
|--------|-----------|
| `overview` | `projectDashboard.execute()` |
| `configure` | `configureProject.execute()` |
| `ai` | `demoBuilder.openAiExperience` (chat-first: opens the Claude Code terminal tab) |
| `updates` | `checkUpdates.execute()` |

**Note**: This command is intentionally omitted from `package.json` contributions. It is an internal sidebar-routing command, not a user-facing command palette entry. The sidebar sends `demoBuilder.navigate` messages; the command dispatches to the appropriate webview.

### AI experience (chat-first)

Two single-purpose internal commands back the AI surface (omitted from `package.json` — invoked programmatically from sidebar / dashboard / navigation):

- **`demoBuilder.openAiExperience`** — "Open Chat". Calls `OpenInClaudeCommand.execute()` with no prompt: opens/reveals the Claude Code terminal as a tab in the active editor group (`ViewColumn.Active`, next to Project Dashboard). Routed from: the sidebar `AiZone` Chat button, `navigate('ai')`, and the dashboard AI action.
- **`demoBuilder.showPromptsPicker`** (`src/commands/showPromptsPicker.ts`) — "Show Prompts". Always shows the prompt QuickPick (no state-aware branching). Built via the shared `showWebviewQuickPick`: the merged prompt list (pinned first) and a "Manage prompts…" row. Selecting a prompt dispatches `demoBuilder.openInClaude` with `{ prompt }` — which opens or focuses the Claude terminal and bracketed-paste-injects the prompt. "Manage prompts…" dispatches `demoBuilder.openAi` (the prompt library). Routed from the sidebar `AiZone` Prompts button.

The prompt-library webview (`ShowAiCommand` / `demoBuilder.openAi`, titled "Prompt Library", command-palette entry "Demo Builder: Manage AI Prompts") is the single home for prompt CRUD — reached on demand via the picker's "Manage prompts…" or the palette. It is not the default AI surface; the chat is. The footer "Close" button posts `cancel`, which `ShowAiCommand` handles by disposing the panel.

The previous `demoBuilder.aiMenu` command (state-aware wand-icon dispatcher) was retired in favor of the two single-purpose commands above. The two-button `AiZone` in the sidebar makes the prompt library discoverable from the first click rather than requiring a hidden second click on a state-aware wand.

### openInClaude

**Purpose**: Launch the single "home" Claude Code (CLI) Chat.

**Command ID**: `demoBuilder.openInClaude`

**Behavior**: Find-or-spawn the "Claude Code" terminal at the **projects root** (`resolveProjectsRoot()` — `DEMO_BUILDER_PROJECTS_DIR` or `~/.demo-builder/projects`), placed as a tab in the active editor group (`{ viewColumn: ViewColumn.Active }`, next to Project Dashboard). Reuses an existing live terminal (matched by name + `exitStatus === undefined`) instead of duplicating.

Always-root home model: the Chat launches at the projects root, never a project subdir, and **nothing anchors the VS Code workspace**. The window stays homed at the root, so the home `.mcp.json` there reaches the root MCP socket and one home Chat addresses any project by name via the in-extension MCP tools. Any `project` arg passed to `execute` is ignored (only the `prompt` is used); callers that still pass a project are harmless. To resolve "the active project," the agent calls the `get_current_project` MCP tool (the persisted current-project pointer), which the home `AGENTS.md` instructs it to do before asking the user.

**Prompt delivery**:
- **Spawn**: the prompt rides the launch command as `claude --continue -- '<prompt>'` (race-free — claude runs it on startup; `--` keeps a dash-leading prompt from being read as a flag). `--continue` is only added when a prior conversation exists for the root cwd.
- **Reuse**: claude is already running, so the prompt is injected into the live REPL via bracketed paste (pre-fills the input for the user to send).
- The prompt is always copied to the clipboard as a silent fallback. A once-ever tip toast explains the contract the first time a prompt is sent.

With no prompt, spawn runs a bare `claude` (or `claude --continue` if a prior root conversation exists).

**Setting**: `demoBuilder.ai.engine` — which AI tool. Currently `'claude-code'` only; reserved for future engines (e.g. Codex).

**Why no extension surface**: An earlier version routed launches through the Claude Code VS Code extension's URI handler (`vscode://anthropic.claude-code/open`). That surface was retired because the extension's URI handler opens a new chat on every launch — there is no public API to inject a prompt into the live chat — so the wand's "pick a prompt, drop it into the conversation" model can't work there.

**No more anchoring / pending-launch**: The prior anchor-on-demand model (pending `globalState` record + `vscode.openFolder` reload + `replayPendingClaudeLaunch` on activation) was retired with the always-root model. Home-grid prompt clicks just set the current-project pointer and launch the home Chat at the root; no window reload. If a window ever opens anchored to a project subdir, activation's `shouldReHomeToRoot` re-homes it to the projects root.

**Dispatched from**:
- The project-card kebab menu in `src/features/projects-dashboard/ui/components/ProjectActionsMenu.tsx` (posts `openAiForProject` → handled in `src/features/projects-dashboard/handlers/`, which sets the current-project pointer, then dispatches `openInClaude` with no arg)
- The Prompt Library prompt cards in `PromptCard.tsx` → `AiOverviewScreen.tsx` (both under `src/features/dashboard/ui/aiSurface/`) → `webviewClient.postMessage('openInClaude', { prompt })` → `aiHandlers.handleOpenInClaude`
- The sidebar `AiZone` Prompts button → `showPromptsPicker.ts` → `openInClaude` with the selected prompt

**File**: `src/commands/openInClaude.ts`. See `docs/architecture/adr/004-claude-code-harness.md` for the harness decision rationale.

### diagnostics

**Purpose**: Comprehensive system diagnostics (`src/commands/diagnostics.ts`)
- Collects system, VS Code, and tool version information
- Tests Adobe CLI authentication
- Probes the in-extension MCP server socket and tools
- Logs the full report to the debug channel, shows a summary in user logs

## Command Patterns

### BaseWebviewCommand Pattern

Webview commands extend `BaseWebviewCommand` (from `@/core/base`) for standardized webview handling with robust communication:

```typescript
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';

class MyWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string { return 'myWebview'; }
    protected getWebviewTitle(): string { return 'My Webview'; }

    protected async getWebviewContent(): Promise<string> {
        // Return HTML with React app
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('getData', async () => this.fetchData());
    }
}
```

**Key Benefits**:
- Automatic handshake protocol
- Message queuing until ready
- Built-in retry logic
- Standardized error handling
- Consistent logging

### Authentication Pre-flight Pattern

**Purpose**: Prevent unexpected browser auth launches during Adobe I/O operations.

Check authentication status before expensive operations and explicitly ask for permission:

1. Token-only auth check via `isAuthenticated()` (fast, no org validation)
2. If not authenticated, show a warning with a "Sign In" choice
3. User confirms → browser-based login
4. Proceed with the Adobe I/O operation (or cancel gracefully if declined)

**Used In**: `deployMesh` (feature command), dashboard mesh status check (skips fetch if not authenticated), configure flows that fetch Adobe data.

## Timeout Handling in Commands

**Critical Issue**: Adobe CLI commands often succeed but timeout due to restrictive timeout values.

Note: project/workspace selection no longer runs an `aio` CLI mutation, so it no longer carries a CLI timeout. The pattern below applies to the Adobe CLI operations that DO run (e.g. workspace download, api-mesh get/deploy), which are targeted per-invocation via `withOrgContext`.

```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

comm.on('check-mesh', async (payload) => {
    try {
        // Run the CLI op under the per-invocation org/project/workspace target.
        return await withOrgContext(target, () =>
            this.commandExecutor.execute('aio api-mesh get', {
                timeout: TIMEOUTS.NORMAL,
            }),
        );
    } catch (error) {
        // Check for success despite timeout (CLI is slow, not failing).
        if (error.stdout && error.stdout.includes('Successfully')) {
            return { success: true, message: 'Completed despite timeout' };
        }
        throw error;
    }
});
```

**Key Patterns**:
1. **Use TIMEOUTS**: Centralized timeout buckets in `@/core/utils/timeoutConfig` (QUICK/NORMAL/LONG/VERY_LONG/EXTENDED plus UI/POLL sub-objects)
2. **Success Detection**: Check stdout for success indicators in catch blocks
3. **Graceful Degradation**: Continue operation even if timeout occurred but command succeeded

## Testing Commands

### Manual Testing Checklist
- [ ] Command appears in palette
- [ ] UI buttons trigger command
- [ ] Error cases handled gracefully
- [ ] Progress shown correctly
- [ ] Cancellation works
- [ ] State persisted properly
- [ ] Timeout scenarios handled (Adobe CLI commands)

### Common Issues

1. **Webview Not Loading**
   - Check the esbuild build (`esbuild.config.js`, `npm run watch`)
   - Verify resource paths
   - Check CSP settings

2. **Messages Not Received**
   - Verify message types match
   - Check panel.webview reference
   - Ensure listener registered

3. **State Not Persisting**
   - Verify StateManager usage
   - Check context.globalState
   - Handle migration cases

## Adding New Commands

1. Create the command file — in `commands/` for cross-cutting commands, or in the owning feature's `commands/` directory
2. Extend `BaseCommand` or `BaseWebviewCommand` (`@/core/base`)
3. Register in `commandManager.ts`
4. Add to package.json contributions (unless internal)
5. Add tests

---

For core infrastructure (base classes, communication, timeouts), see `../core/CLAUDE.md`
For feature-owned commands, see `../features/CLAUDE.md`
