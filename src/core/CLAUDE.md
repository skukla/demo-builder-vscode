# Core Infrastructure

## Overview

The `core/` directory contains foundational infrastructure code used throughout the extension. This code provides shared capabilities that all features depend on: command execution, logging, state management, communication protocols, and base classes.

**Path Alias**: `@/core/*`

## Core vs Shared

⚠️ **Note**: The codebase currently has BOTH `src/core/` and `src/shared/` directories with overlapping purposes:

- **`src/core/`** (THIS directory) - Primary infrastructure layer with 170+ imports
- **`src/shared/`** - Contains only `validation/` module with 3 imports

**Current State**: `@/core/*` is the de facto standard infrastructure layer. The `@/shared/*` path alias exists but is minimally used (only for validation).

## Directory Structure

```
core/
├── base/                # Base classes & types (→ base/README.md)
│   ├── BaseCommand.ts
│   ├── BaseWebviewCommand.ts
│   └── types.ts
├── commands/           # Command infrastructure
│   └── HandlerRegistry.ts
├── communication/      # Webview messaging (→ communication/README.md)
│   ├── WebviewCommunicationManager.ts
│   └── types.ts
├── config/             # Configuration management
│   └── configManager.ts
├── di/                 # Dependency injection
│   └── serviceLocator.ts
├── logging/            # Logging system (→ logging/README.md)
│   ├── logger.ts
│   ├── debugLogger.ts
│   ├── errorLogger.ts
│   └── stepLogger.ts
├── shell/              # Command execution (→ shell/README.md)
│   ├── commandExecutor.ts
│   ├── resourceLocker.ts
│   ├── fileWatcher.ts
│   └── rateLimiter.ts
├── state/              # State management (→ state/README.md)
│   ├── stateManager.ts
│   ├── stateCoordinator.ts
│   └── types.ts
├── ui/                 # UI components & patterns
│   ├── FormField.tsx
│   ├── LoadingDisplay.tsx
│   └── components/
├── utils/              # Core utilities
│   ├── progressUnifier.ts
│   ├── fileSystemUtils.ts
│   ├── loadingHTML.ts
│   └── timeoutConfig.ts
├── validation/         # Validation barrel (re-exports from @/shared/validation)
│   └── index.ts
├── vscode/             # VS Code API wrappers
│   └── vscodeUtils.ts
└── constants.ts        # Shared constants
```

## Module Descriptions

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
- Webview lifecycle management

**Used By**: All command implementations in `src/commands/`

**Path Alias**: `@/core/base`

---

### commands/

**Purpose**: Command infrastructure and handler registry

**Key Exports:**
- `HandlerRegistry` - Centralized message handler registration
- Handler patterns and types

**Responsibilities:**
- Message handler registration
- Command orchestration patterns
- Handler context management

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
- Async handler resolution

**Critical Fix**: v1.5.0 fixed async handler resolution (Promises now properly awaited)

**Path Alias**: `@/core/communication`

---

### config/

**Purpose**: Extension configuration management

**Key Services:**
- `ConfigManager` - Centralized configuration access

**Responsibilities:**
- VS Code settings integration
- Configuration validation
- Default value management

**Path Alias**: `@/core/config`

---

### di/

**Purpose**: Dependency injection and service location

**Key Services:**
- `ServiceLocator` - Service registry and resolution

**Responsibilities:**
- Service registration
- Dependency resolution
- Singleton management

**Path Alias**: `@/core/di`

---

### logging/

**Purpose**: Consistent logging across all features

**Key Services:**
- `Logger` - Basic logging (backward compatible)
- `DebugLogger` - Dual channel logging (Logs + Debug)
- `ErrorLogger` - Error tracking with UI integration
- `StepLogger` - Configuration-driven logging

**Responsibilities:**
- Dual output channels ("Demo Builder: Logs", "Demo Builder: Debug")
- Configuration-driven step names (wizard-steps.json)
- Message templates (logging.json)
- Command execution logging with timing
- Error tracking and status bar integration

**Path Alias**: `@/core/logging`

---

### shell/

**Purpose**: Shell command execution with race condition protection

**Key Services:**
- `CommandExecutor` - Command queuing and execution
- `ResourceLocker` - Mutual exclusion for resources
- `FileWatcher` - File change detection
- `RateLimiter` - Rate limiting for external APIs

**Responsibilities:**
- Command queuing for sequential execution
- Mutual exclusion for resource access
- Retry strategies (network, file system, Adobe CLI)
- Smart polling with exponential backoff
- Output streaming and capture
- Timeout handling
- File system monitoring

**Path Alias**: `@/core/shell`

---

### state/

**Purpose**: State persistence and synchronization

**Key Services:**
- `StateManager` - VS Code globalState persistence
- `StateCoordinator` - Adobe CLI state synchronization

**Responsibilities:**
- Persistent state storage (survives extension reload)
- State migration between versions
- Adobe CLI state synchronization
- Project state tracking
- Cache management with TTL
- State change events

**Path Alias**: `@/core/state`

---

### ui/

**Purpose**: Shared UI components and patterns

**Key Components:**
- `FormField` - Reusable form field component
- `LoadingDisplay` - Loading state display
- Component patterns and utilities

**Responsibilities:**
- Shared React components
- UI patterns and utilities
- Webview styling helpers

**Path Alias**: `@/core/ui`

---

### utils/

**Purpose**: Core utility functions

**Key Utilities:**
- `ProgressUnifier` - Unified progress tracking
- `fileSystemUtils` - File operations
- `loadingHTML` - Webview loading states
- `timeoutConfig` - Centralized timeout configuration

**Responsibilities:**
- Progress tracking strategies (exact, milestones, synthetic)
- Safe file operations
- Webview loading HTML generation
- Timeout configuration for Adobe CLI

**Path Alias**: `@/core/utils`

---

### validation/

**Purpose**: Barrel file that re-exports from `@/shared/validation`

**Note**: This is a compatibility layer. The actual validation code lives in `src/shared/validation/`.

**Exports**: All validators from `@/shared/validation` (see `src/shared/validation/README.md`)

**Path Alias**: `@/core/validation`

---

### vscode/

**Purpose**: VS Code API wrappers and utilities

**Responsibilities:**
- VS Code API abstractions
- UI helper functions
- Extension context utilities

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
            this.showSuccessMessage('Operation completed');
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

    protected async getInitialData(): Promise<any> {
        return { config: await this.loadConfig() };
    }
}
```

### Pattern 3: Shell Command Execution

```typescript
import { getCommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const executor = getCommandExecutor();

const result = await executor.execute('aio', ['console:org:select', orgId], {
    timeout: TIMEOUTS.CONFIG_WRITE,
    exclusive: 'adobe-cli',
    shell: true
});
```

### Pattern 4: State Management

```typescript
import { StateManager } from '@/core/state';

const stateManager = new StateManager(context);

// Get/set state
await stateManager.setState('key', value);
const value = await stateManager.getState('key', defaultValue);

// Clear state
await stateManager.clearState('key');
```

### Pattern 5: Logging

```typescript
import { getLogger, ErrorLogger, StepLogger } from '@/core/logging';

const logger = getLogger();
logger.info('User-facing message');
logger.debug('Debug details');

const errorLogger = new ErrorLogger();
errorLogger.logError('Operation failed', error, { critical: true });

const stepLogger = new StepLogger();
stepLogger.log('adobe-auth', 'Checking authentication');
```

## Architectural Principles

### 1. Separation of Concerns
- **Core**: Infrastructure and foundational capabilities
- **Features**: Business logic and domain-specific functionality
- **Commands**: Orchestration layer that coordinates features

### 2. Dependency Inversion
Core modules define interfaces, features implement them:

```typescript
// Core defines interface
interface IAuthService {
    isAuthenticated(): Promise<boolean>;
}

// Feature implements interface
class AuthenticationService implements IAuthService {
    async isAuthenticated(): Promise<boolean> {
        // Implementation
    }
}
```

### 3. Single Responsibility
Each core module has one clear purpose:
- `logging/` - Only logging
- `state/` - Only state persistence
- `shell/` - Only command execution

### 4. Avoid Circular Dependencies
Core → Features → Commands (one-way dependency flow)

## Testing Core Modules

Core modules should have comprehensive tests:

```
core/logging/
├── logger.ts
├── logger.test.ts
├── errorLogger.ts
└── errorLogger.test.ts
```

**Test Principles:**
- Test in isolation
- Mock external dependencies
- Test edge cases
- High coverage (core code is critical)

## Migration Notes

### From utils/ to core/

Many utilities were migrated from `utils/` to `core/`:

**Before**:
```
utils/
├── externalCommandManager.ts
├── webviewCommunicationManager.ts
├── stateManager.ts
└── errorLogger.ts
```

**After**:
```
core/
├── shell/
│   └── commandExecutor.ts
├── communication/
│   └── webviewCommunicationManager.ts
├── state/
│   └── stateManager.ts
└── logging/
    └── errorLogger.ts
```

### Planned Migration: core/ → shared/

⚠️ **Note**: Documentation in `src/CLAUDE.md` references `src/shared/` as the infrastructure layer, but the codebase primarily uses `src/core/`. This suggests a planned migration that was never completed.

**Current Reality**:
- `@/core/*` - 170+ imports (primary infrastructure)
- `@/shared/*` - 3 imports (only validation module)

**Recommendation**: Either complete the migration to `@/shared/` OR update documentation to reflect `@/core/` as the standard.

## Known Issues

1. **Documentation Inconsistency**: `src/CLAUDE.md` documents `shared/` but codebase uses `core/`
2. **Duplicate validation/**: Both `src/core/validation/` and `src/shared/validation/` exist
3. **Mixed naming**: Some modules use `Manager` suffix, others use `Service`
4. **Path alias confusion**: `@/core/*` and `@/shared/*` both exist with unclear boundaries

## Adding New Core Modules

**When to add to core/:**
- Code is used by **2+ features**
- Code provides foundational capability
- Code has no feature-specific business logic

**How to add:**
1. Create directory in `core/`
2. Add services/utilities
3. Add types.ts for module types
4. Add README.md with module documentation
5. Add index.ts exporting public API
6. Document in this file
7. Add comprehensive tests

**Example:**
```typescript
// core/my-module/index.ts
export { MyService } from './myService';
export type { MyServiceConfig, MyServiceResult } from './types';
```

## Performance Considerations

- Lazy load heavy dependencies
- Cache computed values
- Use memoization for expensive operations
- Minimize synchronous operations
- Debounce rapid events

## Security Considerations

- Sanitize all user input (use `@/shared/validation`)
- Validate paths before file operations
- Use timeouts for all external commands
- Never expose internal errors to users
- Log security-relevant events

---

For feature architecture, see `../features/CLAUDE.md`
For overall architecture, see `../CLAUDE.md`
For validation module, see `../shared/validation/README.md`
