<!-- Last verified: 2026-07-03 -->
# Source Code Architecture

## Overview

The `src/` directory contains all TypeScript source code for the Adobe Demo Builder VS Code extension. The code is organized using a **feature-based architecture** that groups related functionality into self-contained modules, with shared infrastructure available to all features.

## Module Organization

```
src/
├── extension.ts           # Entry point - activates extension
├── mcp-server.ts          # In-extension MCP server entry
├── mcp-proxy.ts           # MCP stdio proxy entry
├── commands/             # VS Code command implementations (→ CLAUDE.md)
├── features/            # Feature modules (→ features/CLAUDE.md)
│   ├── ai/              # AI context verification & MCP server
│   ├── app-builder/     # App Builder app deployment
│   ├── authentication/  # Adobe authentication & SDK integration
│   ├── components/      # Component management & registry
│   ├── dashboard/       # Project dashboard & controls
│   ├── eds/             # Edge Delivery Services (→ README.md)
│   ├── lifecycle/       # Project lifecycle management
│   ├── mesh/            # API Mesh deployment & verification
│   ├── prerequisites/   # Prerequisites checking & installation
│   ├── project-creation/# Project creation workflow
│   ├── projects-dashboard/ # Projects home screen (card grid)
│   ├── sidebar/         # Sidebar navigation (WebviewViewProvider)
│   └── updates/         # Auto-update system (extension & components)
├── core/                # Core infrastructure (→ core/CLAUDE.md)
│   ├── auth/            # Authentication guards (adobeAuthGuard)
│   ├── base/            # Base classes & types
│   ├── cache/           # Cache utilities
│   ├── commands/        # Command infrastructure
│   ├── communication/   # Webview communication protocol
│   ├── config/          # Configuration management
│   ├── di/              # Dependency injection
│   ├── errors/          # Error types
│   ├── handlers/        # Handler dispatch & error handling
│   ├── logging/         # Logging system (StepLogger, ErrorLogger)
│   ├── shell/           # Command execution (CommandExecutor)
│   ├── state/           # State management (StateManager, StateCoordinator)
│   ├── ui/              # Shared UI components & hooks
│   ├── utils/           # Core utilities
│   ├── validation/      # Validation utilities (security & UI)
│   ├── vscode/          # VS Code API wrappers
│   └── constants.ts     # Shared constants
├── utils/               # LEGACY location — contains only autoUpdater.ts
└── types/               # TypeScript type definitions
```

**Note:** `src/utils/` is a legacy location; everything else migrated to `features/` or `core/`. Only `autoUpdater.ts` remains.

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
├── handlers/             # Webview message handlers
├── services/             # Business logic (authenticationService.ts, ...)
├── ui/                   # React UI for this feature
└── README.md             # Feature documentation
```

**Import Rules:**
- Features can import from `@/core/*` (core infrastructure)
- Features can import from `@/types` (global types)
- Features **should not** import from other features (keep loosely coupled)
- Commands can import from any feature (orchestration layer)

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

### 3. **Dependency Injection**
Core services are instantiated once and passed down:
- StateManager for persistence
- Logger for debugging
- ComponentRegistry for configuration

## Module Responsibilities

### Commands (`commands/`)
Commands orchestrate features and coordinate workflows. See `commands/CLAUDE.md` for the current command inventory.

### Features (`features/`)
Features are self-contained modules that own specific business domains (see the tree above for the list). See `features/CLAUDE.md` for architecture and per-feature descriptions.

### Core (`core/`)
Core infrastructure is available to all features (logging, state, communication, shell execution, validation, shared UI). See `core/CLAUDE.md` for details.

### Utils (`utils/`) - LEGACY
**Status**: Migration complete except for one file. Contains only `autoUpdater.ts`. Do not add new code here — use `features/` or `core/`.

### Types (`types/`)
- Shared TypeScript interfaces
- Message protocol definitions
- State shape definitions
- Component type definitions
- Handler context and response types

## Build Process

The build is **esbuild** (`esbuild.config.js`, invoked via `npm run build` / `npm run watch`):
1. **Extension bundle**: `src/extension.ts` → CommonJS bundle for the Node extension host
2. **MCP proxy bundle**: `src/mcp-proxy.ts`
3. **Webview bundles**: one IIFE browser bundle per entry (wizard, dashboard, configure, sidebar, projectsList, aiOverview) → `dist/webview/[name]-bundle.js`

TypeScript type checking runs separately via `tsc --noEmit`.

## Testing Approach

**Framework:** Jest with ts-jest (Node environment) and @testing-library/react (jsdom for React)

**Test Organization:** Tests mirror the src/ directory structure for easy discovery.

```
tests/
├── core/              # Core infrastructure tests (mirrors src/core/)
├── features/          # Feature tests (mirrors src/features/)
├── commands/          # Command tests (mirrors src/commands/)
├── integration/       # Integration tests
├── security/          # Security-focused tests
└── webview-ui/        # Legacy shared webview UI tests (tests/webview-ui/shared/)
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

**For Complete Test Documentation:** See `tests/README.md`

## Performance Considerations

- Lazy load webview content
- Cache component definitions
- Minimize message passing overhead
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

// ❌ Avoid: Within-feature using alias (unnecessary)
import { AuthCache } from '@/features/authentication/services/authCacheManager';
```

**Available Path Aliases** (source of truth: `tsconfig.json` `paths`):
- `@/core/*` - Core infrastructure (logging, state, communication, etc.)
- `@/features/*` - Feature modules (authentication, prerequisites, mesh, etc.)
- `@/commands/*` - VS Code commands
- `@/types`, `@/types/*` - Type definitions
- `@/utils/*` - Legacy utilities (only `autoUpdater.ts` remains)
- `@/mcp-server` - MCP server entry

**Why This Pattern?**
1. **Reduced cognitive load:** No mental path calculation needed (`@/core/state` vs `../../../../core/state`)
2. **Easier refactoring:** Cross-boundary imports don't break when files move
3. **Clear architecture:** Path aliases indicate module boundaries
4. **Automated enforcement:** ESLint rules prevent regression to relative imports

**ESLint Enforcement:**
The codebase has ESLint rules (`no-restricted-imports` in `eslint.config.mjs`) that automatically block cross-boundary relative imports and guide developers to use path aliases. Within-directory imports (`./`) are allowed and encouraged.

---

For specific module details, see the CLAUDE.md file in each subdirectory (`commands/`, `core/`, `features/`).
