# Shared Infrastructure

## Overview

The `shared/` directory contains infrastructure code used across multiple features. This code provides foundational capabilities that all features can depend on without creating circular dependencies.

## Shared vs Feature Code

**Shared Infrastructure:**
- Used by **multiple** features
- Provides foundational capabilities
- No business logic specific to one feature
- Examples: logging, state management, communication

**Feature Code:**
- Used by **one** feature
- Contains business logic
- Domain-specific
- Examples: mesh deployment, Adobe auth

## Directory Structure

```
shared/
├── base/                # Base types & utilities
│   ├── errors.ts       # Error base classes
│   ├── events.ts       # Event emitter patterns
│   └── types.ts        # Common base types
├── command-execution/   # Shell command execution
│   ├── externalCommandManager.ts
│   ├── shellExecutor.ts
│   └── types.ts
├── communication/       # Extension-webview messaging
│   ├── webviewCommunicationManager.ts
│   ├── baseWebviewCommand.ts
│   └── types.ts
├── logging/            # Logging infrastructure
│   ├── logger.ts
│   ├── debugLogger.ts
│   ├── errorLogger.ts
│   ├── stepLogger.ts
│   └── types.ts
├── state/              # State management
│   ├── stateManager.ts
│   ├── stateCoordinator.ts
│   └── types.ts
├── utils/              # Common utilities
│   ├── progressUnifier.ts
│   ├── fileSystemUtils.ts
│   ├── loadingHTML.ts
│   └── timeoutConfig.ts
└── validation/         # Input validation
    ├── fieldValidation.ts
    ├── validators.ts
    └── types.ts
```

## Module Descriptions

### base/

**Purpose**: Base types, error classes, and foundational utilities

**Key Exports:**
- `BaseError` - Base error class with context
- `UserFacingError` - Errors safe to show to users
- `EventEmitter` patterns
- Common type utilities

**Path Alias**: `@/shared/base`

### command-execution/

**Purpose**: Shell command execution with race condition protection

**Key Services:**
- `ExternalCommandManager` - Command queuing and mutual exclusion
- `ShellExecutor` - Safe shell command execution

**Responsibilities:**
- Command queuing for sequential execution
- Mutual exclusion for resource access
- Retry strategies (network, file system, Adobe CLI)
- Smart polling with exponential backoff
- Output streaming and capture
- Timeout handling

**Path Alias**: `@/shared/command-execution`

**Usage Example:**
```typescript
import { ExternalCommandManager } from '@/shared/command-execution';

const manager = new ExternalCommandManager();

// Execute with exclusive resource access
await manager.executeExclusive('adobe-cli', async () => {
    return await aio.command(['console', 'org', 'select', orgId]);
});
```

### communication/

**Purpose**: Robust bidirectional messaging between extension and webview

**Key Services:**
- `WebviewCommunicationManager` - Message protocol with handshake
- `BaseWebviewCommand` - Base class for webview commands

**Responsibilities:**
- Two-way handshake protocol
- Message queuing until both sides ready
- Request-response pattern with timeouts
- Automatic retry with exponential backoff
- Async handler resolution (critical fix in v1.5.0)

**Path Alias**: `@/shared/communication`

**Usage Example:**
```typescript
import { WebviewCommunicationManager } from '@/shared/communication';

const comm = new WebviewCommunicationManager(panel.webview, logger);

// Register handler
comm.on('get-projects', async (payload) => {
    return await authService.getProjects(payload.orgId);
});

// Initialize with handshake
await comm.initialize();
```

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

**Path Alias**: `@/shared/logging`

**Usage Example:**
```typescript
import { getLogger, ErrorLogger, StepLogger } from '@/shared/logging';

const logger = getLogger();
logger.info('User-facing message');
logger.debug('Debug details');

const errorLogger = new ErrorLogger();
errorLogger.logError('Operation failed', error, { critical: true });

const stepLogger = new StepLogger();
stepLogger.log('adobe-auth', 'Checking authentication');
```

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

**Path Alias**: `@/shared/state`

**Usage Example:**
```typescript
import { StateManager } from '@/shared/state';

const stateManager = new StateManager(context);

// Get/set state
await stateManager.setState('key', value);
const value = await stateManager.getState('key', defaultValue);

// Clear state
await stateManager.clearState('key');
```

### utils/

**Purpose**: Common utilities used across features

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

**Path Alias**: `@/shared/utils`

**Usage Example:**
```typescript
import { ProgressUnifier } from '@/shared/utils';
import { TIMEOUT_CONFIG } from '@/shared/utils/timeoutConfig';

const tracker = progressUnifier.createTracker('exact');
tracker.update(output);

// Use timeout config
const result = await command.execute({
    timeout: TIMEOUT_CONFIG.CONFIG_WRITE
});
```

### validation/

**Purpose**: Input validation utilities

**Key Utilities:**
- `validateField` - Generic field validation
- `validateProjectName` - Project name rules
- `validateCommerceUrl` - Commerce URL validation
- `validateEmail` - Email validation

**Responsibilities:**
- User input validation
- Field-level validation
- Form validation
- Error message generation

**Path Alias**: `@/shared/validation`

**Usage Example:**
```typescript
import { validateField, validateProjectName } from '@/shared/validation';

const result = validateProjectName('my-project');
if (!result.isValid) {
    showError(result.message);
}
```

## Import Guidelines

**✅ Shared modules CAN import:**
- Other `@/shared/*` modules (with care to avoid circular deps)
- `@/types` (global types)
- VS Code API (`vscode`)
- Node.js built-ins (`path`, `fs`, etc.)
- npm packages

**❌ Shared modules CANNOT import:**
- `@/features/*` (creates circular dependency)
- `@/commands/*` (creates circular dependency)

**✅ Features CAN import:**
- Any `@/shared/*` module (this is the purpose of shared/)

## Adding New Shared Modules

**When to create a new shared module:**
- Code is used by **2+ features**
- Code provides foundational capability
- Code has no feature-specific business logic

**How to add:**
1. Create directory in `shared/`
2. Add services/utilities
3. Add types.ts for module types
4. Add index.ts exporting public API
5. Document in this file
6. Update path aliases if needed

**Example:**
```typescript
// shared/my-module/index.ts
export { MyService } from './myService';
export type { MyServiceConfig, MyServiceResult } from './types';
```

## Circular Dependency Prevention

**Problem**: Shared modules importing features creates circular dependencies.

**Solution**: Use dependency inversion:

```typescript
// ❌ BAD - Shared imports feature
import { AuthService } from '@/features/authentication';

class StateCoordinator {
    constructor(private authService: AuthService) {}
}

// ✅ GOOD - Shared defines interface, feature implements
interface IAuthService {
    isAuthenticated(): Promise<boolean>;
}

class StateCoordinator {
    constructor(private authService: IAuthService) {}
}
```

## Migration from utils/

Many utilities were moved from `utils/` to `shared/`:

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
shared/
├── command-execution/
│   └── externalCommandManager.ts
├── communication/
│   └── webviewCommunicationManager.ts
├── state/
│   └── stateManager.ts
└── logging/
    └── errorLogger.ts
```

**Benefits:**
- Clearer organization by purpose
- Easier to find infrastructure code
- Explicit separation from features
- Better namespacing

## Testing Shared Modules

Shared modules should have comprehensive tests:

```
shared/logging/
├── logger.ts
├── logger.test.ts
├── errorLogger.ts
└── errorLogger.test.ts
```

**Test Principles:**
- Test in isolation
- Mock external dependencies
- Test edge cases
- High coverage (shared code is critical)

---

For feature architecture, see `../features/CLAUDE.md`
For overall architecture, see `../CLAUDE.md`
