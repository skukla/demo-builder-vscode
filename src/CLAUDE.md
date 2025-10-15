# Source Code Architecture

## Overview

The `src/` directory contains all TypeScript source code for the Adobe Demo Builder VS Code extension. The code is organized using a **feature-based architecture** that groups related functionality into self-contained modules, with shared infrastructure available to all features.

## Module Organization

```
src/
├── extension.ts           # Entry point - activates extension
├── commands/             # VS Code command implementations (→ CLAUDE.md)
├── features/            # Feature modules (→ features/CLAUDE.md)
│   ├── authentication/  # Adobe authentication & SDK integration
│   ├── components/      # Component management & registry
│   ├── dashboard/       # Project dashboard & controls
│   ├── lifecycle/       # Project lifecycle management
│   ├── mesh/            # API Mesh deployment & verification
│   ├── prerequisites/   # Prerequisites checking & installation
│   ├── project-creation/# Project creation workflow
│   └── updates/         # Auto-update system (extension & components)
├── shared/              # Shared infrastructure (→ shared/CLAUDE.md)
│   ├── base/            # Base types & utilities
│   ├── command-execution/ # Command execution infrastructure
│   ├── communication/   # Webview communication protocol
│   ├── logging/         # Logging system (StepLogger, ErrorLogger)
│   ├── state/           # State management (StateManager, StateCoordinator)
│   ├── utils/           # Common utilities
│   └── validation/      # Validation utilities
├── webviews/            # React-based UI layer (→ CLAUDE.md)
├── utils/               # Legacy utilities - being phased out (→ CLAUDE.md)
├── providers/           # VS Code providers (tree views, etc.)
├── types/               # TypeScript type definitions
└── license/             # License validation logic
```

## Feature-Based Architecture

The codebase uses a **feature-based architecture** (also called "vertical slice architecture") where code is organized by business domain rather than technical layer:

**Benefits:**
- **Cohesion**: Related code lives together (types, services, UI, tests)
- **Discoverability**: Easy to find all code related to a feature
- **Modularity**: Features are self-contained and loosely coupled
- **Scalability**: New features don't impact existing structure

**Feature Structure:**
```
features/authentication/
├── index.ts              # Public API exports
├── services/
│   ├── authenticationService.ts
│   ├── authCacheManager.ts
│   └── types.ts
└── README.md            # Feature documentation
```

**Import Rules:**
- Features can import from `@/shared/*` (shared infrastructure)
- Features can import from `@/types` (global types)
- Features **should not** import from other features (keep loosely coupled)
- Commands can import from any feature (orchestration layer)

**Path Aliases:**
- `@/features/*` - Feature modules
- `@/shared/*` - Shared infrastructure
- `@/types` - Global type definitions
- `@/utils` - Legacy utilities (being phased out)

## Key Architectural Patterns

### 1. **Command Pattern**
All user-facing actions are implemented as VS Code commands:
- Commands are registered in `extension.ts`
- Implementation details in `commands/` directory
- Each command is self-contained with its own logic

### 2. **Message-Based Communication**
Extension and webview communicate via messages:
```typescript
// Extension → Webview
panel.webview.postMessage({ type: 'update', data });

// Webview → Extension
vscode.postMessage({ type: 'action', payload });
```

### 3. **Provider Pattern**
VS Code UI elements use providers:
- TreeDataProvider for sidebar trees
- WebviewProvider for custom views
- TextDocumentContentProvider for virtual documents

### 4. **Dependency Injection**
Core services are instantiated once and passed down:
- StateManager for persistence
- Logger for debugging
- ComponentRegistry for configuration

## Entry Point Flow

```typescript
// extension.ts activation sequence
export async function activate(context: ExtensionContext) {
    // 1. Initialize core services
    const stateManager = new StateManager(context);
    const logger = new Logger();
    
    // 2. Register commands
    registerCommands(context, stateManager, logger);
    
    // 3. Register providers
    registerProviders(context);
    
    // 4. Initialize component registry
    await ComponentRegistry.initialize();
}
```

## Module Responsibilities

### Commands (`commands/`)
- **createProject**: Legacy wizard command (deprecated)
- **createProjectWebview**: Main webview-based wizard
- **welcomeWebview**: Welcome screen
- **startDemo**: Start demo server
- **stopDemo**: Stop demo server
- **deployMesh**: Deploy API mesh to Adobe I/O
- **configure**: Open project configuration UI
- **checkUpdates**: Check for extension and component updates
- **diagnostics**: System diagnostics
- **resetAll**: Reset all state (dev only)

Commands orchestrate features and coordinate workflows. See `commands/CLAUDE.md` for details.

### Features (`features/`)
- **authentication**: Adobe authentication with Console SDK, token caching, org/project/workspace selection
- **components**: Component registry, definitions, and lifecycle management
- **dashboard**: Project dashboard UI, mesh status, component browser
- **lifecycle**: Project start/stop, process management, terminal integration
- **mesh**: API Mesh deployment, verification, staleness detection, configuration fetching
- **prerequisites**: Tool detection, installation, version checking, Node.js multi-version support
- **project-creation**: Project creation workflow, template application, environment setup
- **updates**: Auto-update system (extension and components), GitHub Releases integration, snapshot/rollback

Features are self-contained modules that own specific business domains. See `features/CLAUDE.md` for architecture.

### Shared (`shared/`)
- **base**: Base types, interfaces, and utilities used across features
- **command-execution**: ExternalCommandManager for shell command execution with race protection
- **communication**: WebviewCommunicationManager for robust extension-webview messaging
- **logging**: StepLogger, ErrorLogger, DebugLogger for consistent logging across features
- **state**: StateManager and StateCoordinator for state persistence and synchronization
- **utils**: Common utilities like ProgressUnifier, file system helpers, loading HTML
- **validation**: Field validation utilities for user input (UI and CLI)

Shared infrastructure is available to all features. See `shared/CLAUDE.md` for details.

### Webviews (`webviews/`)
- React components for UI
- Adobe Spectrum integration
- Message handling with extension
- Step-based wizard flow

See `webviews/CLAUDE.md` for UI architecture.

### Utils (`utils/`) - LEGACY
**Status**: Being phased out in favor of feature-based organization.

Remaining utilities are being migrated to `features/` or `shared/`:
- Most utilities moved to appropriate features or shared modules
- See `utils/CLAUDE.md` for migration status and guidance

### Providers (`providers/`)
- **ProjectTreeProvider**: Project explorer view
- **ComponentTreeProvider**: Component file browser with .env hiding
- **StatusBar**: Status bar integration for demo state

### Types (`types/`)
- Shared TypeScript interfaces
- Message protocol definitions
- State shape definitions
- Component type definitions
- Handler context and response types

## Key Design Patterns

### Singleton Services
```typescript
class ComponentRegistry {
    private static instance: ComponentRegistry;
    
    static getInstance(): ComponentRegistry {
        if (!this.instance) {
            this.instance = new ComponentRegistry();
        }
        return this.instance;
    }
}
```

### Factory Pattern
```typescript
class CommandFactory {
    static create(type: CommandType): Command {
        switch(type) {
            case 'wizard': return new WizardCommand();
            case 'quick': return new QuickCommand();
        }
    }
}
```

### Observer Pattern
```typescript
class StateManager extends EventEmitter {
    setState(key: string, value: any) {
        this.state[key] = value;
        this.emit('stateChanged', { key, value });
    }
}
```

## Build Process

1. **TypeScript Compilation**: `tsc` compiles to `dist/`
2. **Webpack Bundling**: Bundles webview code
3. **Copy Assets**: Static files copied to dist
4. **Generate Manifest**: package.json processed

## Testing Approach

Currently manual testing with plans for:
- Unit tests for utilities
- Integration tests for commands
- Component tests for React UI
- E2E tests for critical paths

## Performance Considerations

- Lazy load webview content
- Cache component definitions
- Minimize message passing overhead
- Use virtual documents for large content
- Debounce rapid state changes

## Security Considerations

- Sanitize all user input
- Use nonces for webview scripts
- Validate message origins
- Secure credential storage
- No eval() or dynamic code execution

## Common Patterns to Follow

### Error Handling
```typescript
try {
    await riskyOperation();
} catch (error) {
    logger.error('Operation failed', error);
    vscode.window.showErrorMessage('User-friendly message');
    // Don't expose internal details to user
}
```

### State Updates
```typescript
// Always use StateManager for persistence
await stateManager.setState('key', value);
const value = await stateManager.getState('key');
```

### Webview Communication
```typescript
// Type-safe message passing
interface Message {
    type: 'update' | 'action' | 'error';
    payload: any;
}
```

---

For specific module details, see the CLAUDE.md file in each subdirectory.