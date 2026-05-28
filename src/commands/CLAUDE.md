# Commands Module

## Overview

The commands module contains all VS Code command implementations for the Demo Builder extension. Each command represents a user-facing action that can be triggered via the command palette, UI buttons, or programmatically.

## Command Structure

```
commands/
├── createProject.ts         # Original quick-create command
├── createProjectWebview.ts  # Main wizard implementation
├── showCommands.ts          # Command palette helper
├── showLogs.ts             # Log viewer command
├── clearCache.ts           # Cache management
└── index.ts                # Command registration
```

## Command Registration Flow

```typescript
// In extension.ts
export function activate(context: vscode.ExtensionContext) {
    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('demo-builder.createProject', 
            () => new CreateProjectCommand().execute())
    );
}
```

## Main Commands

### createProjectWebview (Primary Command)

**Purpose**: Launch the full project creation wizard

**Key Components**:
- `CreateProjectWebviewCommand` class
- Manages webview lifecycle
- Handles message passing
- Orchestrates prerequisite checking
- Manages project creation flow

**Important Methods**:
```typescript
class CreateProjectWebviewCommand {
    async execute() {
        // 1. Create webview panel
        // 2. Load React app
        // 3. Handle messages
        // 4. Manage state
    }
    
    async handleMessage(message: any) {
        switch(message.type) {
            case 'checkPrerequisites':
            case 'installPrerequisite':
            case 'createProject':
            // ... handle each message type
        }
    }
}
```

**Message Protocol Evolution**:

Starting with v1.5.0, the message handling was fundamentally improved to fix critical async handler resolution issues.

**Legacy Pattern (Pre v1.5.0)**:
```typescript
// ❌ Problematic - handlers not awaited
panel.webview.onDidReceiveMessage(message => {
    // This returned Promise objects to UI instead of resolved values
    return this.handleMessage(message);
});

// Extension → Webview
panel.webview.postMessage({
    type: 'prerequisiteStatus',
    data: { status: 'checking', progress: 50 }
});

// Webview → Extension
vscode.postMessage({
    type: 'installPrerequisite',
    prereqId: 'node',
    version: '20.11.0'
});
```

**Modern Pattern (v1.5.0+)**:
```typescript
// ✅ Fixed - handlers properly awaited via WebviewCommunicationManager
class CreateProjectWebviewCommand extends BaseWebviewCommand {
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Now properly handles async responses
        comm.on('get-projects', async (payload) => {
            return await this.adobeAuth.getProjects(payload.orgId);
        });

        comm.on('select-project', async (payload) => {
            return await this.adobeAuth.selectProject(payload.projectId);
        });
    }
}
```

**Backend Call on Continue Pattern**:
The major UX change in v1.5.0 implements the "Backend Call on Continue" pattern, where:

1. **Selection UI Updates**: Immediate visual feedback on selection
2. **Backend Calls Deferred**: Actual backend operations happen when user clicks Continue
3. **Loading Overlay**: Simple spinner during backend confirmation
4. **Error Recovery**: Clear error handling at the commitment point

```typescript
// UI-only selection handlers
comm.on('project-selected', (payload) => {
    // Immediate UI update - no backend call
    this.updateUIState({
        selectedProject: payload.project
    });
});

// Backend calls during Continue action
comm.on('continue-step', async (payload) => {
    if (payload.step === 'adobe-project' && payload.selectedProject) {
        // Now make the actual backend call
        const result = await this.adobeAuth.selectProject(payload.selectedProject.id);
        if (!result.success) {
            throw new Error(result.error || 'Failed to select project');
        }
    }
});
```

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

Two internal commands back the chat-first AI surface (also omitted from `package.json` — invoked programmatically, not from the palette):

- **`demoBuilder.openAiExperience`** — "Open Chat". Calls `OpenInClaudeCommand.execute()` with no prompt: opens/reveals the Claude Code terminal as a tab in the active editor group (`ViewColumn.Active`, next to Project Dashboard). `navigate('ai')` and the dashboard AI action route here.
- **`demoBuilder.aiMenu`** (`src/commands/aiMenu.ts`) — the AI icon (the **wand icon** in the sidebar `UtilityBar`). State-aware via `isClaudeChatOpen()` (from `openInClaude.ts`): when no live "Claude Code" terminal exists, it launches the chat directly (`demoBuilder.openAiExperience`) — zero-friction first open. When a chat is alive, it shows the prompt QuickPick (built via the shared `showWebviewQuickPick`): the merged prompt list (pinned first) and a "Manage prompts…" row. Selecting a prompt dispatches `demoBuilder.openInClaude` with `{ prompt }` — which focuses the live terminal as part of the inject, so a separate "Open chat" row would be redundant. "Manage prompts…" dispatches `demoBuilder.openAi` (the prompt library). The picker carries no per-item buttons — creating, editing, deleting, and pinning all live in the library.

The prompt-library webview (`ShowAiCommand` / `demoBuilder.openAi`, titled "Prompt Library", command-palette entry "Demo Builder: Manage AI Prompts") is the single home for prompt CRUD — reached on demand via the QuickPick's "Manage prompts…" or the palette. It is not the default AI surface; the chat is. The footer "Close" button posts `cancel`, which `ShowAiCommand` handles by disposing the panel.

---

### createProject (Legacy)

**Purpose**: Quick project creation without wizard
- Simplified flow for experienced users
- Command-line style interaction
- Minimal UI involvement

### openInClaude

**Purpose**: Launch Claude Code (CLI) on the current project.

**Command ID**: `demoBuilder.openInClaude`

**Behavior**: Find-or-spawn the "Claude Code" terminal at `project.path`, placed as a tab in the active editor group (`{ viewColumn: ViewColumn.Active }`, next to Project Dashboard). Reuses an existing live terminal (matched by name + `exitStatus === undefined`) instead of duplicating.

**Prompt delivery**:
- **Spawn**: the prompt rides the launch command as `claude --continue -- '<prompt>'` (race-free — claude runs it on startup; `--` keeps a dash-leading prompt from being read as a flag).
- **Reuse**: claude is already running, so the prompt is injected into the live REPL via bracketed paste (pre-fills the input for the user to send).
- The prompt is always copied to the clipboard as a silent fallback. A once-ever tip toast explains the contract the first time a prompt is sent.

With no prompt, spawn runs a bare `claude --continue`.

**Setting**: `demoBuilder.ai.engine` — which AI tool. Currently `'claude-code'` only; reserved for future engines (e.g. Codex).

**Why no extension surface**: An earlier version routed launches through the Claude Code VS Code extension's URI handler (`vscode://anthropic.claude-code/open`). That surface was retired because the extension's URI handler opens a new chat on every launch — there is no public API to inject a prompt into the live chat — so the wand's "pick a prompt, drop it into the conversation" model can't work there.

**Prompt-click pending-launch mechanism**: When the user clicks a prompt from the projects home-grid AND workspace ≠ project, `projectsDashboardHandlers.handleOpenAiForProject` writes `{ projectPath, prompt?, createdAt }` to `globalState` under `PENDING_CLAUDE_LAUNCH_KEY = 'demoBuilder.ai.pendingClaudeLaunch'`, then calls `vscode.openFolder` to anchor the workspace. On the next activation, `extension.ts:replayPendingClaudeLaunch` reads the record, validates three gates (present, fresh <60s, workspace matches `projectPath`), clears the record, and dispatches `demoBuilder.openInClaude` with the prompt. End-user experience: one click → workspace switches → chat opens with the prompt pre-filled and full project context.

**Dispatched from**:
- The project-card kebab menu in `ProjectActionsMenu.tsx` (calls `webviewClient.postMessage('openAiForProject', { projectPath })`)
- The Prompt Library prompt cards in `PromptCard.tsx` → `AiOverviewScreen.tsx` → `webviewClient.postMessage('openInClaude', { prompt })` → `aiHandlers.handleOpenInClaude`
- The wand QuickPick prompt rows in `aiMenu.ts`
- `extension.ts:replayPendingClaudeLaunch` on activation when a pending record exists

**File**: `src/commands/openInClaude.ts`. See `docs/architecture/adr/004-claude-code-harness.md` for the harness decision rationale.

### diagnostics

**Purpose**: Comprehensive system diagnostics
- Collects system and tool information
- Tests Adobe CLI authentication
- Verifies browser launch capability
- Exports debug logs for sharing

**Implementation**:
```typescript
class DiagnosticsCommand {
    async execute() {
        // Collect system info
        const system = await this.getSystemInfo();
        
        // Check tool versions
        const tools = await this.checkTools();
        
        // Test Adobe CLI
        const adobe = await this.checkAdobeCLI();
        
        // Run diagnostic tests
        const tests = await this.runTests();
        
        // Log full report to debug channel
        logger.debug('DIAGNOSTIC REPORT', report);
        
        // Show summary in main output
        this.showSummary(report);
    }
}
```

**Output**:
- System information (OS, architecture, VS Code version)
- Tool versions (Node.js, npm, fnm, git, Adobe CLI)
- Adobe authentication status and configuration
- Environment variables (PATH, HOME, etc.)
- Test results (browser launch, file system access)

### checkUpdates

**Purpose**: Check for and apply extension/component updates

**Key Features**:
- Checks GitHub Releases for updates (extension and components)
- Respects stable/beta channel preference (`demoBuilder.updateChannel`)
- User confirmation required before applying updates
- Demo running check before component updates
- Automatic snapshot/rollback on failure
- Smart .env merging preserves user configuration

**Implementation**:
```typescript
class CheckUpdatesCommand extends BaseCommand {
    async execute() {
        // 1. Check for extension update
        const extensionUpdate = await this.updateManager.checkExtensionUpdate();
        
        // 2. Check for component updates (if project loaded)
        const project = this.stateManager.getCurrentProject();
        const componentUpdates = project 
            ? await this.updateManager.checkComponentUpdates(project)
            : new Map();
        
        // 3. Show notification if updates available
        if (extensionUpdate || componentUpdates.size > 0) {
            const action = await vscode.window.showInformationMessage(
                'Updates available',
                'Update Now',
                'Later'
            );
            
            if (action === 'Update Now') {
                await this.applyUpdates(extensionUpdate, componentUpdates);
            }
        } else {
            vscode.window.showInformationMessage('No updates available');
        }
    }
}
```

**Safety Features**:
- Pre-flight check: Prevents updates while demo is running
- Concurrent update lock: Prevents double-click accidents
- Snapshot before update: Full component directory backup
- Automatic rollback: Restore on ANY failure
- Post-update verification: Validates package.json structure

**User Experience**:
- Auto-check on startup (if `demoBuilder.autoUpdate` enabled)
- Manual check via command palette
- Progress notifications during update process
- Clear error messages on failure

### deployMesh

**Purpose**: Deploy API mesh configuration to Adobe I/O Runtime

**Key Features**:
- Pre-flight authentication check (prevents unexpected browser launch)
- Builds mesh configuration from component settings
- Deploys to Adobe I/O via `aio api-mesh:update`
- Tracks deployment state for staleness detection
- User-friendly error formatting

**Implementation**:
```typescript
class DeployMeshCommand extends BaseCommand {
    async execute() {
        // 1. Pre-flight auth check
        const isAuthenticated = await this.authManager.isAuthenticated();
        if (!isAuthenticated) {
            const action = await vscode.window.showWarningMessage(
                'Authentication required to deploy mesh',
                'Sign In',
                'Cancel'
            );
            if (action !== 'Sign In') return;
            
            // Authenticate
            await this.authManager.login();
        }
        
        // 2. Build mesh configuration
        const meshConfig = await this.buildMeshConfig();
        
        // 3. Deploy to Adobe I/O
        const result = await this.externalCommandManager.execute(
            'aio',
            ['api-mesh:update', meshConfig],
            { timeout: 60000 }
        );
        
        // 4. Track deployment state
        await this.updateMeshState(result);
        
        // 5. Show success notification (auto-dismiss)
        vscode.window.showInformationMessage('Mesh deployed successfully');
    }
}
```

**Authentication Flow**:
1. Quick token check (< 1 second)
2. If not authenticated, show warning with "Sign In" option
3. User confirms → Browser-based login via Adobe CLI
4. After auth, retry mesh deployment

**Error Handling**:
- Network errors → "No internet connection. Please check your network."
- Timeout errors → "Deployment timed out. Please try again."
- HTTP errors → "Server error (status 500). Please try again later."
- Config errors → "Invalid mesh configuration: [specific issue]"

### showLogs

**Purpose**: Display extension logs
- Opens "Demo Builder: Logs" output channel
- Shows user-facing messages
- Quick access to error/warning information

### clearCache

**Purpose**: Clear cached data
- Resets component definitions
- Clears prerequisite status
- Useful for debugging

## Command Patterns

### BaseWebviewCommand Pattern (Recommended)

The new BaseWebviewCommand provides standardized webview handling with robust communication:

```typescript
import { BaseWebviewCommand } from './baseWebviewCommand';
import { WebviewCommunicationManager } from '../utils/webviewCommunicationManager';

class MyWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'myWebview';
    }
    
    protected getWebviewTitle(): string {
        return 'My Webview';
    }
    
    protected async getWebviewContent(): Promise<string> {
        // Return HTML with React app
        return getHtmlContent(this.panel!, this.context);
    }
    
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Register message handlers
        comm.on('action', async (data) => {
            // Handle action
            return { success: true };
        });
        
        comm.on('getData', async () => {
            return await this.fetchData();
        });
    }
    
    protected async getInitialData(): Promise<any> {
        return {
            config: await this.loadConfig(),
            state: await this.stateManager.getState()
        };
    }
    
    async execute(): Promise<void> {
        // Create panel
        await this.createOrRevealPanel();
        
        // Initialize communication with handshake
        await this.initializeCommunication();
        
        // Webview is ready for interaction
    }
}
```

**Key Benefits**:
- Automatic handshake protocol
- Message queuing until ready
- Built-in retry logic
- Standardized error handling
- Consistent logging

### Legacy Webview Pattern

For existing commands not yet migrated:

```typescript
class WebviewCommand {
    private panel: vscode.WebviewPanel | undefined;
    
    async execute() {
        // Create or reveal panel
        this.panel = vscode.window.createWebviewPanel(...);
        
        // Set content
        this.panel.webview.html = this.getWebviewContent();
        
        // Handle messages
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message)
        );
    }
    
    private getWebviewContent(): string {
        // Return HTML with React app
    }
    
    private async handleMessage(message: any) {
        // Process messages from webview
    }
}
```

### Simple Command Pattern

```typescript
class SimpleCommand {
    async execute(context: vscode.ExtensionContext) {
        try {
            // Perform action
            const result = await this.doWork();
            
            // Show success
            vscode.window.showInformationMessage('Success!');
        } catch (error) {
            // Handle error
            vscode.window.showErrorMessage('Failed: ' + error.message);
        }
    }
}
```

### Authentication Pre-flight Pattern

**Purpose**: Prevent unexpected browser auth launches during Adobe I/O operations

**Problem**: Operations like mesh deployment or fetching org data would silently trigger browser authentication, confusing users who didn't expect it.

**Solution**: Check authentication status before expensive operations and explicitly ask for permission.

**Implementation**:

```typescript
class AdobeIOCommand extends BaseCommand {
    async execute() {
        // 1. Token-only auth check (2-3s, no org validation)
        const isAuthenticated = await this.authManager.isAuthenticated();

        if (!isAuthenticated) {
            // 2. Show explicit warning with user choice
            const action = await vscode.window.showWarningMessage(
                'Authentication required to [action]. Sign in to Adobe?',
                'Sign In',
                'Cancel'
            );
            
            if (action !== 'Sign In') {
                return; // User declined
            }
            
            // 3. User confirmed → Browser-based login
            await this.authManager.login();
        }
        
        // 4. Proceed with Adobe I/O operation
        await this.performAdobeIOOperation();
    }
}
```

**Used In**:
- `deployMesh` command
- Dashboard mesh status check (skips fetch if not authenticated)
- `configure` command (when fetching Adobe data)

**Key Benefits**:
- No surprise browser windows
- User remains in control
- Clear context for why auth is needed
- Graceful degradation (operation cancelled if user declines)

**Performance Note**: `isAuthenticated()` only checks token validity (2-3s) vs full org validation (3-10s with `isFullyAuthenticated()`).

## Key Responsibilities

### Prerequisite Management
- Check for required tools
- Trigger installations
- Track progress
- Report status to UI

### Project Creation
- Gather user inputs
- Validate selections
- Execute creation scripts
- Monitor progress
- Handle errors

### State Management
- Persist wizard state
- Resume interrupted flows
- Cache user preferences

## Integration Points

### With Utils
- Uses PrerequisitesManager for tool checking
- Uses ProgressUnifier for progress tracking
- Uses StateManager for persistence
- Uses ErrorLogger for error handling

### With Webviews
- Provides data to React components
- Receives user actions
- Manages webview lifecycle
- Handles resource loading

### With Templates
- Loads component definitions
- Reads prerequisite configurations
- Applies project templates

## Error Handling Strategy

```typescript
try {
    // Risky operation
    await this.createProject(config);
} catch (error) {
    // Log for debugging
    this.logger.error('Project creation failed', error);
    
    // User-friendly message
    const message = this.getUserFriendlyError(error);
    
    // Show to user with action
    const action = await vscode.window.showErrorMessage(
        message,
        'Retry',
        'View Logs'
    );
    
    if (action === 'Retry') {
        return this.execute();
    } else if (action === 'View Logs') {
        vscode.commands.executeCommand('demo-builder.showLogs');
    }
}
```

## Timeout Handling in Commands

**Critical Issue**: Adobe CLI commands often succeed but timeout due to restrictive timeout values.

**Solution Pattern**:
```typescript
import { TIMEOUT_CONFIG } from '../utils/timeoutConfig';

class CreateProjectWebviewCommand extends BaseWebviewCommand {
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('select-project', async (payload) => {
            try {
                // Use appropriate timeout for operation
                const result = await this.adobeAuth.selectProject(payload.projectId, {
                    timeout: TIMEOUT_CONFIG.CONFIG_WRITE  // 10 seconds
                });
                return { success: true, data: result };
            } catch (error) {
                // Check for success despite timeout
                if (error.stdout && error.stdout.includes('Project selected :')) {
                    return { success: true, message: 'Project selected successfully' };
                }
                throw error;
            }
        });
    }
}
```

**Key Patterns**:
1. **Use TIMEOUT_CONFIG**: Centralized timeout management
2. **Success Detection**: Check stdout for success indicators in catch blocks
3. **Graceful Degradation**: Continue operation even if timeout occurred but command succeeded
4. **User Feedback**: Clear loading states during potentially slow operations

## Testing Commands

### Manual Testing Checklist
- [ ] Command appears in palette
- [ ] Keyboard shortcuts work
- [ ] UI buttons trigger command
- [ ] Error cases handled gracefully
- [ ] Progress shown correctly
- [ ] Cancellation works
- [ ] State persisted properly
- [ ] Timeout scenarios handled (Adobe CLI commands)

### Common Issues

1. **Webview Not Loading**
   - Check webpack build
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

1. Create command file in `commands/`
2. Implement Command interface
3. Register in extension.ts
4. Add to package.json contributions
5. Document in this file
6. Add tests

## Performance Considerations

- Lazy load heavy dependencies
- Cache webview content
- Debounce rapid messages
- Use progress indicators
- Cancel long-running operations

---

For webview details, see `../webviews/CLAUDE.md`
For utility integration, see `../utils/CLAUDE.md`