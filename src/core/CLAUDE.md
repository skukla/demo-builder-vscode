<!-- Last verified: 2026-07-03 -->
# Core Infrastructure

## Overview

The `core/` directory contains foundational infrastructure code used throughout the extension. This code provides shared capabilities that all features depend on: command execution, logging, state management, communication protocols, validation, and base classes.

**Path Alias**: `@/core/*`

## Directory Structure

```
core/
├── auth/               # Authentication guards (adobeAuthGuard.ts)
├── base/               # Base classes (→ base/README.md)
│   ├── baseCommand.ts
│   ├── baseWebviewCommand.ts
│   └── webviewPanelManager.ts
├── cache/              # Cache utilities (cacheUtils.ts)
├── commands/           # Core-owned commands (ResetAllCommand, ResetAiOnboardingCommand)
├── communication/      # Webview messaging (→ communication/README.md)
│   └── webviewCommunicationManager.ts
├── config/             # Configuration loading & config-file generation
│   ├── ConfigurationLoader.ts
│   └── configFileGenerator.ts
├── di/                 # Dependency injection (serviceLocator.ts)
├── errors/             # Error infrastructure (formatters are feature-specific; see errors/index.ts)
├── handlers/           # Handler dispatch utilities
├── logging/            # Logging system (→ logging/README.md)
│   ├── debugLogger.ts
│   ├── errorLogger.ts
│   ├── stepLogger.ts
│   └── config/logging.json
├── shell/              # Command execution (→ shell/README.md)
│   ├── commandExecutor.ts, commandQueue.ts, commandSequencer.ts
│   ├── pollingService.ts, retryStrategyManager.ts, resourceLocker.ts
│   ├── processCleanup.ts, fileWatcher.ts, rateLimiter.ts
│   └── orgContextEnv.ts, environmentSetup.ts, portChecker.ts, buildComponent.ts
├── state/              # State management (→ state/README.md)
│   ├── stateManager.ts, projectStateSync.ts, projectConfigWriter.ts
│   ├── projectDirectoryScanner.ts, projectFileLoader.ts
│   └── recentProjectsManager.ts, sessionUIState.ts, transientStateManager.ts
├── ui/                 # Shared React UI for webviews
│   ├── components/     # ui/, forms/, feedback/, navigation/, layout/, selection/
│   ├── hooks/          # Shared hooks (→ ui/hooks/CLAUDE.md)
│   ├── styles/
│   └── utils/          # WebviewClient, frontendTimeouts, etc.
├── utils/              # Core utilities (timeoutConfig, progressUnifier/, disposableStore, ...)
├── validation/         # Validation module (→ validation/README.md)
├── vscode/             # VS Code API wrappers (watchers)
└── constants.ts        # Shared constants
```

## Module Descriptions

### auth/

**Purpose**: Shared authentication guard utilities for pause-and-prompt sign-in flows

**Key Exports:**
- `ensureAdobeIOAuth()` - Check Adobe I/O auth, prompt sign-in if expired
- `AdobeAuthResult` - Result type for auth guard
- `AdobeAuthManager` - Interface for auth service compatibility

**Responsibilities:**
- Shared "check → warn → Sign In → loginAndRestoreProjectContext → verify" pattern
- Used by: Mesh deployment, EDS project reset, Storefront setup

**Path Alias**: `@/core/auth`

---

### base/

**Purpose**: Base classes for all VS Code commands

**Key Exports:**
- `BaseCommand` - Base class for standard commands
- `BaseWebviewCommand` - Base class for webview commands with communication protocol

**Responsibilities:**
- Standardized command patterns
- Error handling
- State management integration
- Progress indicators
- User prompts
- Webview lifecycle management (with `webviewPanelManager.ts`)

**Used By**: Command implementations in `src/commands/` and feature `commands/` directories

**Path Alias**: `@/core/base`

---

### cache/

**Purpose**: Shared cache utility functions

**Key Exports:**
- `getCacheTTLWithJitter()` - TTL with randomized jitter (security)
- `isExpired()` - Check if cache entry has expired
- `createCacheEntry()` - Create cache entry with TTL
- `CacheConfig`, `CacheEntry` - Type definitions

**Responsibilities:**
- TTL-based cache expiration
- Security jitter to prevent timing attacks
- Composable cache utilities (used by feature caches)

**Path Alias**: `@/core/cache`

---

### commands/

**Purpose**: Core-owned developer commands

**Key Exports:**
- `ResetAllCommand` - Development command to reset extension state
- `ResetAiOnboardingCommand` - Reset only AI onboarding state (flags + AI settings)

**Path Alias**: `@/core/commands`

---

### communication/

**Purpose**: Robust bidirectional messaging between extension and webview

**Key Services:**
- `WebviewCommunicationManager` - Message protocol with handshake

**Responsibilities:**
- Two-way handshake protocol
- Message queuing until both sides ready
- Request-response pattern with timeouts
- Automatic retry with exponential backoff
- Async handler resolution (handlers properly awaited)

**Path Alias**: `@/core/communication`

---

### config/

**Purpose**: Configuration loading and config-file generation

**Key Exports:**
- `ConfigurationLoader<T>` - Generic loader for JSON configuration
- Config file generation utilities (`configFileGenerator.ts`) - template + placeholder based JSON generation (used by EDS site.json)

**Path Alias**: `@/core/config`

---

### di/

**Purpose**: Dependency injection and service location

**Key Services:**
- `ServiceLocator` - Service registry and resolution (e.g. `ServiceLocator.getCommandExecutor()`)

**Path Alias**: `@/core/di`

---

### errors/

**Purpose**: Error infrastructure. Generic error formatting was removed in favor of domain-specific formatters (mesh: `@/features/mesh/utils/errorFormatter.ts`; auth: `@/features/authentication/services/authenticationErrorFormatter.ts`). See `docs/patterns/error-handling.md`.

**Path Alias**: `@/core/errors`

---

### handlers/

**Purpose**: Handler dispatch utilities for message handling

**Key Exports:**
- `dispatchHandler()` - Dispatch messages to handler maps
- `hasHandler()` - Check if handler exists for message type
- `createErrorResponse()` - Create standardized error responses
- `wrapHandler()` - Wrap handlers with error handling

**Usage Pattern:**
Features define handler maps as simple object literals, then use `dispatchHandler()` to route messages:

```typescript
// Feature handler map (object literal)
export const meshHandlers = defineHandlers({
    'check-api-mesh': handleCheckApiMesh,
    'delete-api-mesh': handleDeleteApiMesh,
});

// Dispatch in command
const result = await dispatchHandler(meshHandlers, context, messageType, data);
```

**Path Alias**: `@/core/handlers`

---

### logging/

**Purpose**: Consistent logging across all features

**Key Services:**
- `DebugLogger` (via `getLogger()` / `initializeLogger()`) - Dual channel logging (Logs + Debug)
- `ErrorLogger` - Error tracking with UI integration
- `StepLogger` (via `getStepLogger()`) - Configuration-driven logging

**Responsibilities:**
- Dual output channels ("Demo Builder: User Logs", "Demo Builder: Debug Logs")
- Message templates (`logging/config/logging.json`)
- Command execution logging with timing
- Error tracking and status bar integration

**Path Alias**: `@/core/logging`

---

### shell/

**Purpose**: Shell command execution with race condition protection

**Key Services:**
- `CommandExecutor` - Command queuing and execution
- `ProcessCleanup` - Event-driven process termination with tree killing
- `ResourceLocker` - Mutual exclusion for resources
- `PollingService` / `RetryStrategyManager` - Smart polling and retry strategies
- `FileWatcher` - File change detection
- `RateLimiter` - Rate limiting for external APIs
- `orgContextEnv` - Per-invocation Adobe org/project/workspace targeting for CLI ops

**Responsibilities:**
- Command queuing for sequential execution
- Mutual exclusion for resource access
- Retry strategies (network, file system, Adobe CLI)
- Smart polling with exponential backoff
- Output streaming and capture
- Timeout handling
- Process tree termination (cross-platform)

**ProcessCleanup Service:**
- Event-driven process termination (no polling or grace periods)
- Kills entire process tree (parent + children)
- Cross-platform: macOS/Linux (pkill -P), Windows (taskkill /T)
- Graceful shutdown with SIGTERM, fallback to SIGKILL
- Used by stopDemo and startDemo (port conflict resolution)

**Path Alias**: `@/core/shell`

---

### state/

**Purpose**: State persistence and synchronization

**Key Services:**
- `StateManager` - VS Code globalState persistence
- `ProjectStateSync` - Project state synchronization
- `ProjectConfigWriter` - Atomic project config file writes
- `RecentProjectsManager` - Recent project tracking

**Responsibilities:**
- Persistent state storage (survives extension reload)
- State migration between versions
- Project state tracking and synchronization
- Session UI state management
- Transient (non-persisted) state management

**Path Alias**: `@/core/state`

---

### ui/

**Purpose**: Shared React UI for webviews

**Key Contents:**
- `components/` - Shared components organized by kind (`forms/FormField`, `feedback/LoadingDisplay`, `navigation/`, `layout/`, `selection/`, timeline nav)
- `hooks/` - Shared React hooks (see `ui/hooks/CLAUDE.md`)
- `utils/` - Webview-side utilities (`WebviewClient`, `frontendTimeouts`)
- `styles/` - Shared styles

**Path Alias**: `@/core/ui`

---

### utils/

**Purpose**: Core utility functions

**Key Utilities:**
- `timeoutConfig` - Centralized timeout buckets (`TIMEOUTS`)
- `progressUnifier/` - Unified progress tracking (exact, milestones, synthetic strategies)
- `disposableStore` - VS Code-style disposable collection with LIFO ordering
- `githubUrlParser` - GitHub URL parsing (owner/repo/branch extraction)
- `loadingHTML` / `getWebviewHTMLWithBundles` / `bundleUri` - Webview HTML generation
- `oneTimeTip` - Show-once tips via VS Code globalState
- `quickPickUtils` - Shared QuickPick helpers
- `browserUtils`, `envParser`, `writeFileAtomic`, `promiseUtils`, `timeFormatting`, `executionLock`

**DisposableStore Pattern:**
- LIFO disposal ordering (Last In, First Out)
- Prevents memory leaks from orphaned subscriptions
- Used by BaseCommand and BaseWebviewCommand
- Safe multiple dispose calls (idempotent)

```typescript
import { DisposableStore } from '@/core/utils/disposableStore';

const store = new DisposableStore();
store.add(vscode.workspace.createFileSystemWatcher('**/*.ts'));
store.add(eventEmitter.event(handler));
// Later: store.dispose() disposes all in reverse order
```

**Path Alias**: `@/core/utils`

---

### validation/

**Purpose**: Validation utilities — security validation (backend) and field validation (UI)

**Key Contents:**
- `Validator.ts` - Core validation primitives
- `PathSafetyValidator.ts` - Path traversal protection
- `URLValidator.ts` - URL validation
- `SensitiveDataRedactor.ts` - Redaction of secrets in logs/output
- `fieldValidation.ts` / `normalizers.ts` - UI field validation and normalization
- `validators/` - Domain validators (AccessToken, AdobeResource, NodeVersion, ProjectName)

See `validation/README.md` for details.

**Path Alias**: `@/core/validation`

---

### vscode/

**Purpose**: VS Code API wrappers and utilities

**Key Services:**
- `WorkspaceWatcherManager` - Workspace-scoped file watcher management
- `EnvFileWatcherService` - .env file change detection with hash-based validation

**WorkspaceWatcherManager:**
- Creates file watchers scoped to workspace folders
- Auto-disposes watchers when workspace folders removed
- Prevents duplicate watchers (same folder + pattern)
- LIFO disposal via DisposableStore

**EnvFileWatcherService:**
- Workspace-scoped .env file watchers
- Hash-based change detection (prevents false notifications)
- Programmatic write suppression (Configure UI coordination)
- Demo startup grace period (anti-spam)
- Show-once notification management

**Path Alias**: `@/core/vscode`

---

## Import Guidelines

**✅ Core modules CAN import:**
- Other `@/core/*` modules (with care to avoid circular deps)
- `@/types` (global types)
- VS Code API (`vscode`)
- Node.js built-ins (`path`, `fs`, etc.)
- npm packages

**❌ Core modules CANNOT import:**
- `@/features/*` (creates circular dependency)
- `@/commands/*` (creates circular dependency)

**✅ Features CAN import:**
- Any `@/core/*` module (this is the purpose of core/)

**✅ Commands CAN import:**
- Any `@/core/*` module
- Any `@/features/*` module (commands orchestrate features)

## Usage Patterns

### Pattern 1: Creating a Command

```typescript
import { BaseCommand } from '@/core/base';
import { getLogger } from '@/core/logging';

class MyCommand extends BaseCommand {
    private logger = getLogger();

    async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();

        if (!project) {
            await this.showError('No project loaded');
            return;
        }

        await this.withProgress('Processing...', async (progress) => {
            await this.doWork(project);
        });
    }
}
```

### Pattern 2: Creating a Webview Command

```typescript
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';

class MyWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'myWebview';
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('action', async (data) => {
            return await this.handleAction(data);
        });
    }
}
```

### Pattern 3: Shell Command Execution

```typescript
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const executor = ServiceLocator.getCommandExecutor();

const result = await executor.execute('aio api-mesh:get', {
    timeout: TIMEOUTS.NORMAL,
});
```

### Pattern 4: State Management

```typescript
import { StateManager } from '@/core/state';

const stateManager = new StateManager(context);

await stateManager.setState('key', value);
const value = await stateManager.getState('key', defaultValue);
```

### Pattern 5: Logging

```typescript
import { getLogger, getStepLogger } from '@/core/logging';

const logger = getLogger();
logger.info('User-facing message');
logger.debug('Debug details');
```

## Architectural Principles

### 1. Separation of Concerns
- **Core**: Infrastructure and foundational capabilities
- **Features**: Business logic and domain-specific functionality
- **Commands**: Orchestration layer that coordinates features

### 2. Single Responsibility
Each core module has one clear purpose:
- `logging/` - Only logging
- `state/` - Only state persistence
- `shell/` - Only command execution

### 3. Avoid Circular Dependencies
Core → Features → Commands (one-way dependency flow)

## Testing Core Modules

Core module tests live under `tests/core/`, mirroring the source structure.

**Test Principles:**
- Test in isolation
- Mock external dependencies
- Test edge cases
- High coverage (core code is critical)

## History

`src/core/` absorbed the former `src/utils/` and `src/shared/` infrastructure (both directories are gone; `src/utils/` retains only `autoUpdater.ts`). `@/core/*` is the single infrastructure layer.

## Adding New Core Modules

**When to add to core/:**
- Code is used by **2+ features**
- Code provides foundational capability
- Code has no feature-specific business logic

**How to add:**
1. Create directory in `core/`
2. Add services/utilities
3. Add index.ts exporting public API
4. Add README.md with module documentation
5. Document in this file
6. Add comprehensive tests

## Performance Considerations

- Lazy load heavy dependencies
- Cache computed values
- Use memoization for expensive operations
- Minimize synchronous operations
- Debounce rapid events

## Security Considerations

- Sanitize all user input (use `@/core/validation`)
- Validate paths before file operations
- Use timeouts for all external commands
- Never expose internal errors to users
- Log security-relevant events

---

For feature architecture, see `../features/CLAUDE.md`
For overall architecture, see `../CLAUDE.md`
For validation module, see `validation/README.md`
