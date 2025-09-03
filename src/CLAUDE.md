# Source Code Architecture

## Overview

The `src/` directory contains all TypeScript source code for the Adobe Demo Builder VS Code extension. The code is organized into logical modules that separate concerns between VS Code integration, UI components, business logic, and utilities.

## Module Organization

```
src/
├── extension.ts           # Entry point - activates extension
├── commands/             # VS Code command implementations (→ CLAUDE.md)
├── webviews/            # React-based UI layer (→ CLAUDE.md)
├── utils/               # Core utilities and systems (→ CLAUDE.md)
├── providers/           # VS Code providers (tree views, etc.)
├── types/               # TypeScript type definitions
└── license/             # License validation logic
```

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
- **createProject**: Main wizard command
- **createProjectWebview**: Webview-based wizard
- **showLogs**: Display extension logs
- **clearCache**: Clear cached data
- **openDocumentation**: Open help docs

### Webviews (`webviews/`)
- React components for UI
- Adobe Spectrum integration
- Message handling with extension
- Step-based wizard flow

### Utils (`utils/`)
- **PrerequisitesManager**: Tool detection/installation
- **ProgressUnifier**: Unified progress tracking
- **StateManager**: Persistent state storage
- **ComponentRegistry**: Component definitions
- **ErrorLogger**: Centralized error handling

### Providers (`providers/`)
- **ProjectTreeProvider**: Project explorer view
- **PrerequisitesProvider**: Prerequisites status view
- **WelcomeViewProvider**: Getting started view

### Types (`types/`)
- Shared TypeScript interfaces
- Message protocol definitions
- State shape definitions
- Component type definitions

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