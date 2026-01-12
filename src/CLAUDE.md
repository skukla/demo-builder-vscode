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
├── core/                # Core infrastructure (→ core/CLAUDE.md)
│   ├── base/            # Base classes & types
│   ├── commands/        # Command infrastructure
│   ├── communication/   # Webview communication protocol
│   ├── config/          # Configuration management
│   ├── di/              # Dependency injection
│   ├── logging/         # Logging system (StepLogger, ErrorLogger)
│   ├── shell/           # Command execution (ExternalCommandManager)
│   ├── state/           # State management (StateManager, StateCoordinator)
│   ├── ui/              # Shared UI components
│   ├── utils/           # Core utilities
│   ├── validation/      # Validation utilities (security & UI)
│   ├── vscode/          # VS Code API wrappers
│   └── constants.ts     # Shared constants
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
- Features can import from `@/core/*` (core infrastructure)
- Features can import from `@/types` (global types)
- Features **should not** import from other features (keep loosely coupled)
- Commands can import from any feature (orchestration layer)

**Path Aliases:**
- `@/features/*` - Feature modules
- `@/core/*` - Core infrastructure
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

### Core (`core/`)
- **base**: Base command classes (BaseCommand, BaseWebviewCommand)
- **commands**: Command infrastructure and handler registry
- **communication**: WebviewCommunicationManager for robust extension-webview messaging
- **config**: Configuration management
- **di**: Dependency injection and service location
- **logging**: StepLogger, ErrorLogger, DebugLogger for consistent logging across features
- **shell**: CommandExecutor for shell command execution with race protection
- **state**: StateManager and StateCoordinator for state persistence and synchronization
- **ui**: Shared UI components (FormField, LoadingDisplay)
- **utils**: Core utilities like ProgressUnifier, file system helpers, loading HTML
- **validation**: Security validation (backend) and field validation (UI)
- **vscode**: VS Code API wrappers and utilities

Core infrastructure is available to all features. See `core/CLAUDE.md` for details.

### Webviews (`webviews/`)
- React components for UI
- Adobe Spectrum integration
- Message handling with extension
- Step-based wizard flow

See `webviews/CLAUDE.md` for UI architecture.

### Utils (`utils/`) - LEGACY
**Status**: Being phased out in favor of feature-based organization.

Remaining utilities are being migrated to `features/` or `core/`:
- Most utilities moved to appropriate features or core modules
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

**Framework:** Jest with ts-jest (Node environment) and @testing-library/react (jsdom for React)

**Test Organization:** Tests mirror the src/ directory structure for easy discovery.

```
tests/
├── core/              # Core infrastructure tests (mirrors src/core/)
│   ├── base/          # Base classes and types (TDD placeholder)
│   ├── commands/      # Command infrastructure tests
│   ├── communication/ # Webview communication protocol tests
│   ├── config/        # Configuration management (TDD placeholder)
│   ├── di/            # Dependency injection (TDD placeholder)
│   ├── logging/       # Logging system (TDD placeholder)
│   ├── shell/         # Command execution tests (ExternalCommandManager, polling)
│   ├── state/         # State management tests (StateManager, StateCoordinator)
│   ├── utils/         # Core utility tests
│   ├── validation/    # Validation tests (security, field validation)
│   └── vscode/        # VS Code API wrapper tests (TDD placeholder)
├── features/          # Feature tests (mirrors src/features/)
│   ├── authentication/
│   │   ├── handlers/  # Authentication handler tests
│   │   └── services/  # Authentication service tests
│   ├── components/    # Component management tests
│   ├── lifecycle/     # Project lifecycle tests
│   ├── mesh/          # API Mesh deployment tests
│   └── [other features]
└── webview-ui/        # React webview tests (mirrors webview-ui/src/)
    └── shared/
        ├── components/ # Shared component tests (ui/, forms/, feedback/, navigation/)
        └── hooks/      # Shared hook tests
```

**Test Types:**
- **Unit tests:** Isolated component/function testing (majority of tests)
- **Integration tests:** Component interaction testing (tests/integration/)
- **React component tests:** UI component testing with @testing-library/react

**Running Tests:**
```bash
npm test                        # Run all tests (Node + React)
npm test -- --selectProjects node   # Node tests only
npm test -- --selectProjects react  # React tests only
npm test -- tests/core/         # Specific directory
```

**Path Aliases:** Tests use the same path aliases as source code:
- `@/core/*` - Core infrastructure
- `@/features/*` - Feature modules
- `@/shared/*` - Shared utilities
- `@/webview-ui/*` - Webview UI components

**TDD Placeholder Directories:** Some test directories (e.g., tests/core/base/, tests/core/logging/) contain only README.md files. These are reserved for future tests following TDD (tests written before implementation).

**For Complete Test Documentation:** See `tests/README.md`

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

### Import Patterns (Hybrid Approach)

The codebase uses a **hybrid import pattern** that balances clarity with cohesion:

**Cross-boundary imports** use path aliases:
```typescript
// ✅ Good: Cross-boundary with path alias
import { StateManager } from '@/core/state';
import { AuthService } from '@/features/authentication/services/authenticationService';
import { HandlerContext } from '@/types/handlers';
import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';

// ❌ Bad: Cross-boundary with relative path
import { StateManager } from '../../../core/state';
import { PrerequisitesManager } from '../../features/prerequisites/services/PrerequisitesManager';
```

**Within-feature imports** use relative paths:
```typescript
// ✅ Good: Within-feature relative import
import { AuthCache } from './authCacheManager';
import { TokenManager } from '../services/tokenManager';
import { helper } from './helpers/setupHelper';

// ❌ Avoid: Within-feature using alias (unnecessary)
import { AuthCache } from '@/features/authentication/services/authCacheManager';
```

**Available Path Aliases:**
- `@/core/*` - Core infrastructure (logging, state, communication, etc.)
- `@/features/*` - Feature modules (authentication, prerequisites, mesh, etc.)
- `@/commands/*` - VS Code commands
- `@/types/*` - Type definitions
- `@/utils/*` - Legacy utilities (being phased out)
- `@/webview-ui/*` - Webview UI components (from backend)

**Why This Pattern?**
1. **Reduced cognitive load:** No mental path calculation needed (`@/core/state` vs `../../../../core/state`)
2. **Easier refactoring:** Cross-boundary imports don't break when files move
3. **Clear architecture:** Path aliases indicate module boundaries
4. **Industry standard:** Used by Google, Airbnb, Next.js, and major VS Code extensions
5. **Automated enforcement:** ESLint rules prevent regression to relative imports

**ESLint Enforcement:**
The codebase has ESLint rules (`no-restricted-imports`) that automatically block cross-boundary relative imports and guide developers to use path aliases. Within-directory imports (`./`) are allowed and encouraged.

---

For specific module details, see the CLAUDE.md file in each subdirectory.
## Webview Organization Pattern

The `webview-ui/src/` directory organizes webview applications using a **complexity-based structure**:

### Pattern: Flat vs Nested by Complexity

**Simple UIs (≤5 files)** → Flat structure:
```
webview-ui/src/configure/
├── index.tsx                # Entry point
└── ConfigureScreen.tsx      # Main screen component
```

**Complex UIs (>5 files)** → Nested with subdirectories:
```
src/features/project-creation/ui/wizard/
├── index.tsx                # Entry point
├── TimelineNav.tsx          # Timeline navigation component
├── WizardContainer.tsx      # Main wizard orchestrator
└── (steps imported from feature directories - see below)
```

**Wizard Steps** (distributed across features):
```
src/features/
├── authentication/ui/steps/    # AdobeAuthStep, AdobeProjectStep, AdobeWorkspaceStep
├── components/ui/steps/        # ComponentSelectionStep
├── prerequisites/ui/steps/     # PrerequisitesStep
├── mesh/ui/steps/             # MeshDeploymentStep
└── project-creation/ui/steps/ # WelcomeStep, ReviewStep, ProjectCreationStep
```

**Note**: After the Frontend Architecture Cleanup (v1.x), all webviews use inline App components in `index.tsx` rather than separate `app/` directories. Shared utilities like `WebviewClient` live in `webview-ui/src/shared/`.

### Complexity Threshold

- **≤5 files**: Keep flat (configure, dashboard, welcome)
- **>5 files**: Add subdirectories (wizard with 15 files)

### Directory Naming Conventions

- `components/` - Feature-specific reusable components
- `steps/` - Wizard/workflow step components
- `screens/` - Screen-level components

### When to Add Subdirectories

When a webview grows beyond 5 files, organize by:
1. **components/**: Reusable UI components specific to this webview
2. **screens/** or **steps/**: Main view components
3. **utils/**: Webview-specific utilities (if needed)

The main App component should be inline in `index.tsx`. Shared utilities (like `WebviewClient`) belong in `webview-ui/src/shared/`.

### All Webview Entry Points

All webview apps (flat or nested) must have consistent entry points for webpack:
```javascript
// webpack.config.js
entry: {
    wizard: './src/features/project-creation/ui/wizard/index.tsx',
    welcome: './webview-ui/src/welcome/index.tsx',
    dashboard: './webview-ui/src/dashboard/index.tsx',
    configure: './webview-ui/src/configure/index.tsx'
}
```

Each `index.tsx` renders the root component to `#root` div.
