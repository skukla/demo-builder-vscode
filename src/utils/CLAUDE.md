# Utils Module

> **⚠️ MIGRATION NOTICE**: This module is being phased out in favor of a feature-based architecture.
>
> - Most utilities have been migrated to `@/features/*` (feature-specific) or `@/shared/*` (shared infrastructure)
> - Remaining code in this directory is legacy and will be gradually migrated
> - **For new code**: Use `@/features/*` for feature-specific logic, `@/shared/*` for shared infrastructure
> - **See**: `src/features/CLAUDE.md` and `src/shared/CLAUDE.md` for the new architecture
>
> **Migration Status**: Phases 1-3 complete (authentication, components, mesh, prerequisites, updates, project-creation, dashboard, lifecycle)

## Overview

The utils module contains core utilities and systems that power the Demo Builder extension. These utilities handle everything from prerequisite checking to progress tracking, state management, and error logging.

**Note**: Much of this functionality has been migrated to features/ and shared/. See migration notice above.

## Module Structure

```
utils/
├── prerequisitesManager.ts    # Tool detection and installation
├── progressUnifier.ts         # Unified progress tracking
├── stateManager.ts            # Persistent state storage
├── componentRegistry.ts       # Component definitions manager
├── debugLogger.ts             # Central debug logging system
├── logger.ts                  # Backward-compatible logger wrapper
├── errorLogger.ts             # Error tracking with UI integration
├── stepLogger.ts              # Configuration-driven logging (NEW)
├── externalCommandManager.ts  # Command execution with race protection (NEW)
├── stateCoordinator.ts        # Adobe CLI state management (NEW)
├── webviewCommunicationManager.ts # Robust webview messaging (NEW)
├── baseWebviewCommand.ts      # Base class for webview commands (NEW)
├── adobeAuthManagerV2.ts      # Migrated Adobe CLI operations (NEW)
├── shellExecutor.ts           # Shell command execution
├── fileSystemUtils.ts         # File operations
├── loadingHTML.ts             # Webview loading states
└── index.ts                   # Exports
```

## Key Systems

### Prerequisites Manager

**Purpose**: Manages tool detection, installation, and version checking

**Configuration-Driven**:
- Reads from `templates/prerequisites.json`
- Supports multiple installation strategies
- Handles complex dependencies

**Key Methods**:
```typescript
class PrerequisitesManager {
    // Check if prerequisite is installed
    async checkPrerequisite(prereq: PrerequisiteDefinition): Promise<PrerequisiteCheck>
    
    // Install a prerequisite
    async installPrerequisite(prereqId: string, options?: InstallOptions): Promise<void>
    
    // Get required prerequisites for components
    getRequiredPrerequisites(components: string[]): PrerequisiteDefinition[]
    
    // Check multiple Node.js versions
    async checkNodeVersions(versions: string[]): Promise<NodeVersionStatus[]>
}
```

**Installation Flow**:
```typescript
// 1. Check current status
const status = await checkPrerequisite(prereq);

// 2. If missing, install
if (status.status === 'missing') {
    // Execute installation steps
    for (const step of prereq.install.steps) {
        await executeStep(step);
        // Track progress
        progressUnifier.update(step.progress);
    }
}
```

### Progress Unifier

**Purpose**: Provides unified progress tracking across different CLI tools

**Progress Strategies**:

1. **Exact Progress** (`exact`)
   - For tools that output percentages
   - Example: fnm outputs "Downloading: 75%"

2. **Milestone-Based** (`milestones`)
   - Pattern matching in output
   - Example: Homebrew "==> Downloading", "==> Installing"

3. **Synthetic Progress** (`synthetic`)
   - Time-based estimation
   - For silent operations

4. **Immediate** (`immediate`)
   - Instant completion
   - For quick operations

**Implementation**:
```typescript
class ProgressUnifier {
    // Create progress tracker
    createTracker(strategy: ProgressStrategy): ProgressTracker
    
    // Update progress
    updateProgress(output: string): UnifiedProgress {
        // Parse based on strategy
        if (strategy === 'exact') {
            return this.parseExactProgress(output);
        } else if (strategy === 'milestones') {
            return this.matchMilestones(output);
        }
        // ...
    }
}
```

**Progress Structure**:
```typescript
interface UnifiedProgress {
    overall: {
        percent: number;
        currentStep: number;
        totalSteps: number;
        stepName: string;
    };
    command?: {
        type: 'determinate' | 'indeterminate';
        percent?: number;
        detail?: string;
        confidence: 'exact' | 'estimated' | 'synthetic';
    };
}
```

### State Manager

**Purpose**: Manages persistent state across extension sessions

**Key Features**:
- Uses VS Code's globalState
- Type-safe state access
- Migration support
- Event-based updates

**Implementation**:
```typescript
class StateManager {
    constructor(private context: vscode.ExtensionContext) {}
    
    // Get state value
    async get<T>(key: string, defaultValue?: T): Promise<T>
    
    // Set state value
    async set<T>(key: string, value: T): Promise<void>
    
    // Clear specific key
    async clear(key: string): Promise<void>
    
    // Migrate old state formats
    async migrate(): Promise<void>
}
```

**Common State Keys**:
- `wizard.lastState` - Last wizard state
- `prerequisites.status` - Cached prerequisite status
- `user.preferences` - User preferences
- `projects.recent` - Recent projects

### Component Registry

**Purpose**: Manages available project components and their configurations

**Data Source**: `templates/components.json`

**Key Methods**:
```typescript
class ComponentRegistry {
    // Get all components
    getComponents(): ComponentDefinition[]
    
    // Get component dependencies
    getDependencies(componentId: string): string[]
    
    // Get required prerequisites
    getRequiredPrerequisites(components: string[]): string[]
    
    // Validate component selection
    validateSelection(components: string[]): ValidationResult
}
```

### Debug Logger

**Purpose**: Central debug logging system with dual output channels

**Architecture**:
- **"Demo Builder: Logs"** - User-facing messages
- **"Demo Builder: Debug"** - Detailed diagnostic information

**Key Features**:
- Singleton pattern for global access
- Command execution logging with timing
- Environment variable logging
- Export debug log capability

**Implementation**:
```typescript
class DebugLogger {
    private outputChannel: vscode.OutputChannel;  // User-facing
    private debugChannel: vscode.OutputChannel;   // Debug info
    
    // User-facing methods
    info(message: string): void
    warn(message: string): void
    error(message: string, error?: Error): void
    
    // Debug methods
    debug(message: string, data?: any): void
    logCommand(command: string, result: CommandResult): void
    logEnvironment(label: string, env: ProcessEnv): void
    
    // Utilities
    show(preserveFocus?: boolean): void
    showDebug(preserveFocus?: boolean): void
    exportDebugLog(): Promise<string | undefined>
}

// Singleton access
const logger = getLogger();
```

**Command Logging**:
```typescript
logger.logCommand('npm install', {
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
    duration: elapsed,
    cwd: process.cwd()
});
```

### Logger

**Purpose**: Backward-compatible wrapper around DebugLogger

**Features**:
- Maintains existing API for compatibility
- Delegates all calls to DebugLogger
- No separate output channel creation

**Usage**:
```typescript
const logger = new Logger('Demo Builder');
logger.info('Message');  // Goes to "Demo Builder: Logs"
logger.debug('Details'); // Goes to "Demo Builder: Debug"
```

### Error Logger

**Purpose**: Error tracking with UI integration

**Features**:
- Uses DebugLogger for output
- Status bar error/warning counts
- Problems panel integration
- Critical error notifications

**Usage Pattern**:
```typescript
class ErrorLogger {
    private debugLogger: DebugLogger;
    private statusBarItem: vscode.StatusBarItem;
    private diagnostics: vscode.DiagnosticCollection;
    
    // Log with UI integration
    logError(error: Error | string, context?: string, critical?: boolean): void {
        // Logs to DebugLogger
        this.debugLogger.error(message, error);
        
        // Updates status bar count
        this.errorCount++;
        this.updateStatusBar();
        
        // Shows notification if critical
        if (critical) {
            vscode.window.showErrorMessage(...);
        }
    }
    
    // Add diagnostic to Problems panel
    addDiagnostic(uri: Uri, message: string, severity: DiagnosticSeverity): void
}
```

### Shell Executor

**Purpose**: Safe shell command execution with output capture

**Features**:
- Command sanitization
- Output streaming
- Error handling
- Timeout support

**Usage**:
```typescript
const executor = new ShellExecutor();

// Execute command
const result = await executor.execute('npm install', {
    cwd: projectPath,
    timeout: 60000,
    onOutput: (data) => {
        // Stream output
        progressTracker.update(data);
    }
});
```

### Loading HTML Generator

**Purpose**: Creates loading states for webviews

**Key Requirements**:
- 100ms delay (prevent VS Code default)
- 1500ms minimum display time
- Pure HTML/CSS (no JavaScript initially)

**Implementation**:
```typescript
export function getLoadingHTML(message: string): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                /* Spinner animation */
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .spinner {
                    animation: spin 1s linear infinite;
                }
            </style>
        </head>
        <body>
            <div class="loading">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        </body>
        </html>
    `;
}
```

### StepLogger

**Purpose**: Configuration-driven logging with consistent formatting

**Key Features**:
- Reads step names from wizard-steps.json
- Uses message templates from logging.json
- Smart context switching for operations
- Maintains consistent format across logs

**Implementation**:
```typescript
class StepLogger {
    // Log with step context
    log(stepId: string, message: string, level: LogLevel): void
    
    // Log using template
    logTemplate(stepId: string, templateKey: string, params: Record<string, any>): void
}
```

**Usage**:
```typescript
// Use configuration-driven step name
stepLogger.log('adobe-auth', 'Checking authentication');

// Use template with parameters
stepLogger.logTemplate('adobe-auth', 'operations.fetching', { item: 'organizations' });
// Output: [Adobe Setup] Fetching organizations...
```

### ExternalCommandManager

**Purpose**: Manages external command execution with race condition protection

**Key Features**:
- Command queuing for sequential execution
- Mutual exclusion for resource access
- Smart polling with exponential backoff
- Retry strategies for failed commands
- File system change detection

**Implementation**:
```typescript
class ExternalCommandManager {
    // Execute with exclusive resource access
    async executeExclusive<T>(resource: string, operation: () => Promise<T>): Promise<T>
    
    // Execute command with retry logic
    async executeCommand(command: string, options?: ExecOptions, retryStrategy?: RetryStrategy): Promise<CommandResult>
    
    // Poll until condition met
    async pollUntilCondition(checkFn: () => Promise<boolean>, options: PollOptions): Promise<void>
    
    // Execute multiple commands in sequence
    async executeSequence(commands: CommandConfig[], stopOnError?: boolean): Promise<CommandResult[]>
}
```

**Retry Strategies**:
- **Network**: Retry on network errors with exponential backoff
- **File System**: Retry on busy/locked files
- **Adobe CLI**: Retry on token/session errors

### StateCoordinator

**Purpose**: Coordinates state between Adobe CLI, VS Code, and project operations

**Key Features**:
- Adobe CLI state synchronization
- Project state tracking
- State change events
- Conflict resolution
- Cache management with TTL
- Atomic state updates

**Implementation**:
```typescript
class StateCoordinator {
    // Get Adobe CLI state
    async getAdobeState(forceRefresh?: boolean): Promise<AdobeCliState>
    
    // Set Adobe organization
    async setAdobeOrganization(orgId: string, orgName: string, orgCode: string): Promise<void>
    
    // Create project with tracking
    async createProject(name: string, path: string, components: string[]): Promise<ProjectState>
    
    // Listen for state changes
    onStateChange(type: StateChangeType, listener: (event: StateChangeEvent) => void): Disposable
    
    // Validate consistency
    async validateStateConsistency(): Promise<ValidationResult>
}
```

### WebviewCommunicationManager

**Purpose**: Robust bidirectional communication between extension and webview

**Key Features**:
- Two-way handshake protocol
- Message queuing until ready
- Request-response pattern with timeouts
- Automatic retry with exponential backoff
- State version tracking
- Comprehensive logging

**Critical Fix - Async Handler Resolution**:
Prior to v1.5.0, message handlers that returned Promises were not being awaited, causing the UI to receive Promise objects instead of resolved values. This led to "Error Loading Projects" despite successful backend operations.

**Fixed Implementation**:
```typescript
class WebviewCommunicationManager {
    // CRITICAL: Now properly awaits async handlers
    private async handleWebviewMessage(message: any): Promise<void> {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            try {
                // ✅ Fixed: Now awaits the handler result
                const result = await handler(message.payload);

                if (message.expectsResponse && message.id) {
                    this.sendResponse(message.id, result);
                }
            } catch (error) {
                if (message.expectsResponse && message.id) {
                    this.sendError(message.id, error);
                }
            }
        }
    }

    // Initialize with handshake
    async initialize(): Promise<void>

    // Send message (fire-and-forget)
    async sendMessage(type: string, payload?: any): Promise<void>

    // Send request and await response
    async request<T>(type: string, payload?: any): Promise<T>

    // Register message handler
    on(type: string, handler: (payload: any) => any): void
}
```

**Handshake Protocol**:
1. Extension sends `__extension_ready__`
2. Webview responds with `__webview_ready__`
3. Extension confirms with `__handshake_complete__`
4. Messages queued until handshake complete

**Common Issue Pattern**:
```typescript
// ❌ Before fix - returned Promise object
this.manager.on('get-projects', (payload) => {
    return this.adobeAuth.getProjects(payload.orgId); // Returns Promise
});

// ✅ After fix - properly awaited
this.manager.on('get-projects', async (payload) => {
    return await this.adobeAuth.getProjects(payload.orgId); // Returns actual data
});
```

### BaseWebviewCommand

**Purpose**: Base class for commands that use webviews with robust communication

**Key Features**:
- Standardized webview creation
- Automatic communication manager setup
- Loading state management
- Error recovery
- Consistent logging

**Implementation**:
```typescript
abstract class BaseWebviewCommand extends BaseCommand {
    // Webview lifecycle
    protected abstract getWebviewId(): string
    protected abstract getWebviewTitle(): string
    protected abstract getWebviewContent(): Promise<string>
    
    // Communication setup
    protected abstract initializeMessageHandlers(comm: WebviewCommunicationManager): void
    protected abstract getInitialData(): Promise<any>
    
    // Helper methods
    protected async sendMessage(type: string, payload?: any): Promise<void>
    protected async request<T>(type: string, payload?: any): Promise<T>
}
```

### AdobeAuthManagerV2

**Purpose**: Adobe CLI operations with race condition protection and SDK optimization

**Key Features**:
- Uses ExternalCommandManager for all CLI operations
- StateCoordinator for state consistency
- Polling-based authentication checks
- Atomic organization/project selection
- Comprehensive error handling
- **Adobe Console SDK integration for 30x faster operations**
- **Quick authentication checks (< 1 second)**
- **Cached organization/project data with TTL**

**Performance Optimizations (v1.6.0)**:

**Quick Authentication Check** (`isAuthenticatedQuick()`):
- Token-only validation (no org validation)
- < 1 second vs 9+ seconds for full check
- Used for dashboard loads and wizard startup
- Pre-flight checks before Adobe I/O operations

```typescript
async isAuthenticatedQuick(): Promise<boolean> {
    // Only check token validity, skip org validation
    const token = await this.getToken();
    if (!token) return false;
    
    const expiry = this.getTokenExpiry(token);
    return expiry > Date.now();
}
```

**SDK Integration** (`ensureSDKInitialized()`):
- Adobe Console SDK for org/project operations
- 30x faster than pure CLI approach
- Async initialization (non-blocking, 5-second timeout)
- Automatic fallback to CLI if SDK unavailable

```typescript
async ensureSDKInitialized(): Promise<void> {
    if (this.sdkInitialized) return;
    
    try {
        // Initialize Adobe Console SDK
        this.sdk = await ConsoleSDK.init({
            accessToken: await this.getToken(),
            apiKey: process.env.ADOBE_API_KEY
        });
        this.sdkInitialized = true;
    } catch (error) {
        // Fallback to CLI operations
        this.logger.warn('[Auth] SDK init failed, using CLI fallback');
    }
}
```

**Optimized Operations**:
- `getCurrentOrganization()`: Uses SDK for faster lookup, 1-minute cache
- `getOrganizations()`: SDK-powered, cached for 1 minute
- `getProjects()`: SDK-powered with caching
- `console.where` results: 3-minute TTL cache (expensive 2s+ call)

**Migration from V1**:
- Replace direct `exec()` calls with `executeCommand()`
- Use `executeExclusive()` for authentication operations
- Replace `setTimeout` polling with `pollUntilCondition()`
- Use StateCoordinator for all state updates
- Use `isAuthenticatedQuick()` for pre-flight checks
- Call `ensureSDKInitialized()` before org/project operations

### UpdateManager

**Purpose**: Checks for extension and component updates via GitHub Releases API

**Key Features**:
- Stable and beta channel support (`demoBuilder.updateChannel`)
- Semantic version comparison
- GitHub Releases API integration
- Respects rate limiting (60 requests/hour unauthenticated)

**Key Methods**:
```typescript
class UpdateManager {
    // Check for extension update
    async checkExtensionUpdate(): Promise<UpdateCheckResult | null>
    
    // Check for component updates
    async checkComponentUpdates(project: Project): Promise<Map<string, UpdateCheckResult>>
    
    // Fetch latest release from GitHub
    private async fetchLatestRelease(
        repo: string, 
        channel: 'stable' | 'beta'
    ): Promise<ReleaseInfo | null>
    
    // Compare semantic versions
    private isNewerVersion(latest: string, current: string): boolean
}
```

**Update Check Flow**:
```typescript
// 1. Determine channel from settings
const channel = vscode.workspace.getConfiguration('demoBuilder')
    .get<'stable' | 'beta'>('updateChannel', 'stable');

// 2. Check extension update
const extensionUpdate = await updateManager.checkExtensionUpdate();

// 3. Check component updates
const componentUpdates = await updateManager.checkComponentUpdates(project);

// 4. Show notification if updates available
if (extensionUpdate || componentUpdates.size > 0) {
    vscode.window.showInformationMessage('Updates available', 'Update Now');
}
```

**Release Tag Format**:
- Stable: `v1.6.0`, `v1.6.1`
- Beta: `v1.6.0-beta.1`, `v1.7.0-beta.2`

### ComponentUpdater

**Purpose**: Updates git-based components with safety features

**Key Features**:
- **Automatic snapshot**: Full directory backup before update
- **Automatic rollback**: Restores snapshot on ANY failure
- **Post-update verification**: Checks package.json validity
- **Smart .env merging**: Preserves user values, adds new variables
- **Programmatic write suppression**: Prevents false restart notifications
- **Concurrent update lock**: Prevents double-click accidents
- **User-friendly errors**: Network/timeout/HTTP errors explained

**Safety Flow**:
```
1. Check concurrent lock
2. Create snapshot
3. Download archive from GitHub
4. Extract to temporary location
5. Verify package.json structure
6. Merge .env files (preserve user config)
7. Replace component directory
8. Update version tracking
9. Remove snapshot
   ↓ (on ANY failure at steps 3-8)
   Restore snapshot automatically
```

**Key Methods**:
```typescript
class ComponentUpdater {
    // Update single component
    async updateComponent(
        project: Project,
        componentId: string,
        releaseInfo: ReleaseInfo
    ): Promise<void>
    
    // Merge .env files (smart preservation)
    private async mergeEnvFiles(
        oldEnvPath: string,
        newEnvPath: string,
        outputPath: string
    ): Promise<void>
    
    // Create snapshot for rollback
    private async createSnapshot(componentPath: string): Promise<string>
    
    // Restore snapshot on failure
    private async restoreSnapshot(
        componentPath: string,
        snapshotPath: string
    ): Promise<void>
}
```

**Smart .env Merging**:
```typescript
// User's current .env
COMMERCE_ENDPOINT=https://custom.magentosite.cloud
API_KEY=user-secret-123

// New component's .env.example
COMMERCE_ENDPOINT=https://demo.magentosite.cloud
API_KEY=demo-key
NEW_FEATURE_FLAG=true

// Merged result
COMMERCE_ENDPOINT=https://custom.magentosite.cloud  // User value preserved
API_KEY=user-secret-123                             // User value preserved
NEW_FEATURE_FLAG=true                               // New variable added
```

**Programmatic Write Suppression**:
```typescript
// Register write before merging .env
await vscode.commands.executeCommand(
    'demoBuilder._internal.registerProgrammaticWrites',
    [envPath]
);

// Write merged .env (file watcher will ignore)
await fs.writeFile(envPath, mergedContent);
```

### ExtensionUpdater

**Purpose**: Downloads and installs extension VSIX updates

**Key Features**:
- Downloads VSIX from GitHub Releases
- Triggers VS Code installation API
- Prompts for reload after installation

**Key Methods**:
```typescript
class ExtensionUpdater {
    // Download and install VSIX
    async updateExtension(releaseInfo: ReleaseInfo): Promise<void>
    
    // Download VSIX file
    private async downloadVSIX(url: string, targetPath: string): Promise<void>
    
    // Install VSIX via VS Code API
    private async installVSIX(vsixPath: string): Promise<void>
}
```

**Update Flow**:
```typescript
// 1. Download VSIX to temp directory
const vsixPath = path.join(tmpdir(), 'demo-builder.vsix');
await extensionUpdater.downloadVSIX(releaseInfo.vsixUrl, vsixPath);

// 2. Install via VS Code API
await vscode.commands.executeCommand('workbench.extensions.installExtension', 
    vscode.Uri.file(vsixPath)
);

// 3. Prompt for reload
const action = await vscode.window.showInformationMessage(
    'Extension updated. Reload VS Code to activate.',
    'Reload Now'
);

if (action === 'Reload Now') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
}
```

### ErrorFormatter

**Purpose**: Converts technical errors into user-friendly messages

**Key Features**:
- Network error detection (ENOTFOUND, ETIMEDOUT, ECONNREFUSED)
- HTTP status code interpretation
- Timeout error formatting
- File system error explanation

**Key Methods**:
```typescript
class ErrorFormatter {
    // Format error for user display
    static formatUserFriendlyError(error: unknown): string
    
    // Check if error is network-related
    private static isNetworkError(error: Error): boolean
    
    // Format HTTP error with status code
    private static formatHttpError(statusCode: number): string
}
```

**Error Translations**:
```typescript
// Network errors
'ENOTFOUND' → "No internet connection. Please check your network."
'ETIMEDOUT' → "Connection timed out. Please try again."
'ECONNREFUSED' → "Server refused connection. Service may be down."

// HTTP errors
404 → "Resource not found (404). The requested item may have been removed."
500 → "Server error (500). Please try again later."
503 → "Service unavailable (503). Adobe services may be experiencing issues."

// Timeout errors
'timeout' → "Operation timed out. Please try again."

// File system errors
'ENOENT' → "File or directory not found."
'EACCES' → "Permission denied. Please check file permissions."
```

## Integration Patterns

### With Commands
Commands use utilities for:
- Prerequisite checking
- Progress tracking
- State persistence
- Error logging

### With Webviews
Utilities provide:
- Loading states
- Progress updates
- State synchronization
- Error messages

### With Templates
Utilities read:
- Component definitions
- Prerequisite configurations
- Project templates

## Error Handling Strategy

```typescript
// Consistent error handling pattern
try {
    const result = await riskyOperation();
    return result;
} catch (error) {
    // Log full error
    errorLogger.error('Operation failed', error, {
        operation: 'riskyOperation',
        input: params
    });
    
    // Throw user-friendly error
    throw new UserFacingError('Something went wrong. Check logs for details.');
}
```

## Performance Considerations

1. **Cache Heavy Operations**
   - Component definitions
   - Prerequisite status
   - File system checks

2. **Debounce Rapid Calls**
   - Progress updates
   - State changes
   - File watchers

3. **Use Async/Await Properly**
   - Don't block UI thread
   - Parallelize where possible
   - Handle cancellation

## Testing Utilities

### Unit Test Patterns
```typescript
describe('PrerequisitesManager', () => {
    it('should detect installed tools', async () => {
        const manager = new PrerequisitesManager();
        const result = await manager.check({ id: 'node' });
        expect(result.status).toBe('installed');
    });
});
```

### Mock Patterns
```typescript
// Mock shell execution
jest.mock('./shellExecutor', () => ({
    execute: jest.fn().mockResolvedValue({
        stdout: 'v20.11.0',
        stderr: '',
        code: 0
    })
}));
```

## Adding New Utilities

1. Create utility file in `utils/`
2. Export from index.ts
3. Add TypeScript types
4. Document usage patterns
5. Add unit tests
6. Update this documentation

---

## Timeout Configuration

**Purpose**: Centralized timeout management for Adobe CLI operations

**Key File**: `timeoutConfig.ts`

**Configuration Values**:
```typescript
export const TIMEOUT_CONFIG = {
    // Adobe CLI operations
    AUTH_CHECK: 8000,        // Checking authentication status
    ORG_FETCH: 12000,        // Fetching organizations
    PROJECT_FETCH: 15000,    // Fetching projects
    WORKSPACE_FETCH: 10000,  // Fetching workspaces
    CONFIG_WRITE: 10000,     // Writing config values (increased for project selection)

    // Command execution
    QUICK_COMMAND: 5000,     // Fast commands (version checks)
    LONG_COMMAND: 30000,     // Installation/setup commands

    // Network operations
    DOWNLOAD: 60000,         // File downloads
    API_REQUEST: 8000,       // API requests

    // UI operations
    UI_RESPONSE: 3000,       // UI responsiveness
    LOADING_MIN: 1500        // Minimum loading display time
};
```

**Critical Adobe CLI Timeout Issue**:
Adobe CLI commands (`aio console project select`) often succeed but timeout at 5 seconds despite taking 8-10 seconds to complete. The fix involves:

1. **Increased Timeout**: Raised CONFIG_WRITE from 5000ms to 10000ms
2. **Success Detection**: Check stdout for success indicators even in timeout scenarios

**Success Detection Pattern**:
```typescript
// In catch block - detect success despite timeout
catch (error) {
    const err = error as any;
    if (err.stdout && err.stdout.includes('Project selected :')) {
        // Command succeeded despite timeout
        logger.info('Project selection succeeded (detected via stdout)');
        return true;
    }
    throw error;
}
```

**Usage Pattern**:
```typescript
import { TIMEOUT_CONFIG } from './timeoutConfig';

// Use appropriate timeout for operation type
const result = await executeCommand(command, {
    timeout: TIMEOUT_CONFIG.CONFIG_WRITE
});
```

---

For configuration details, see `../../templates/CLAUDE.md`
For usage in commands, see `../commands/CLAUDE.md`