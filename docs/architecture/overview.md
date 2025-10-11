# Adobe Demo Builder - Architecture Overview

**Last Updated**: January 2025  
**Version**: 1.6.0  
**Status**: Current Production Architecture

## Executive Summary

The Adobe Demo Builder is a VS Code extension that streamlines the creation and management of Adobe Commerce demo projects. It provides a wizard-based interface for setting up complex e-commerce demonstrations with integrated Adobe services, local development environments, and automated deployment capabilities.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   VS Code Extension Host                     │
├─────────────────────────────────────────────────────────────┤
│  Extension Core (extension.ts)                              │
│  ├── Command Registration                                   │
│  ├── State Management (StateManager)                        │
│  ├── Provider Registration (Tree Views, Status Bar)         │
│  └── File Watcher System                                   │
├─────────────────────────────────────────────────────────────┤
│  Core Commands                                              │
│  ├── Create Project (Webview Wizard)                       │
│  ├── Start/Stop Demo (Process Management)                  │
│  ├── Configure Project (Settings UI)                       │
│  ├── Deploy Mesh (Adobe I/O Integration)                   │
│  └── Check for Updates (Auto-Update System)                │
├─────────────────────────────────────────────────────────────┤
│  Utilities & Systems                                        │
│  ├── Adobe Auth Manager (SDK + CLI)                        │
│  ├── Component Manager (Git-based Components)              │
│  ├── Update Manager (GitHub Releases)                      │
│  ├── External Command Manager (Shell Execution)            │
│  └── Mesh Staleness Detector                               │
├─────────────────────────────────────────────────────────────┤
│  Webview Layer (React + Adobe Spectrum)                    │
│  ├── Welcome Screen                                         │
│  ├── Project Creation Wizard                               │
│  ├── Project Dashboard                                     │
│  └── Configuration Editor                                  │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Extension Layer
- **Framework**: VS Code Extension API
- **Language**: TypeScript (strict mode)
- **Build**: TypeScript Compiler + Webpack
- **Package Manager**: npm

### UI Layer
- **Framework**: React 18+
- **Component Library**: Adobe React Spectrum
- **Styling**: CSS + PostCSS
- **Bundling**: Webpack

### External Integrations
- **Adobe I/O CLI**: Authentication and mesh deployment
- **Adobe Console SDK**: Fast org/project operations (30x faster than CLI)
- **Git**: Component management and cloning
- **Node.js**: Multi-version management via fnm

## Key Components

### 1. Project Creation Wizard

Multi-step React-based wizard for guided project setup:

**Steps**:
1. Welcome & Project Details
2. Component Selection (Frontend, Backend, Dependencies)
3. Prerequisites Check & Installation
4. Adobe Authentication & Setup
5. Commerce Configuration
6. Review & Creation

**Key Features**:
- Backend Call on Continue pattern (instant UI feedback)
- Progressive disclosure (complexity revealed gradually)
- Two-column layout (active content + configuration summary)
- Adobe Spectrum components (quiet mode for minimal chrome)

### 2. State Management System

**StateManager** (`src/utils/stateManager.ts`):
- Persists project configuration in `.demo-builder.json`
- Tracks component instances, versions, and status
- Manages workspace state via VS Code API
- Event-driven updates (StateChanged events)

**Project Structure**:
```json
{
  "name": "my-demo",
  "created": "2025-01-15T10:00:00Z",
  "status": "ready|running|stopped|error",
  "componentInstances": {
    "citisignal-nextjs": {
      "id": "citisignal-nextjs",
      "path": "/path/to/component",
      "status": "ready",
      "port": 3000,
      "version": "main"
    }
  },
  "componentVersions": {
    "citisignal-nextjs": {
      "version": "1.0.0",
      "lastUpdated": "2025-01-15T10:30:00Z"
    }
  },
  "meshState": {
    "envVars": {...},
    "sourceHash": "abc123",
    "lastDeployed": "2025-01-15T10:35:00Z"
  }
}
```

### 3. Component System

**Git-Based Components**:
- Frontend applications (e.g., citisignal-nextjs)
- API Mesh configurations (commerce-mesh)
- App Builder applications (custom integrations)

**Component Management**:
- Cloning from GitHub repositories
- Version tracking and updates
- Dependency resolution
- `.env` file generation and merging

**Component Tree Provider**:
- VS Code tree view for browsing component files
- Hides `.env` files (managed via Configure UI)
- Quick access to component source code

### 4. Adobe Integration

**Authentication**:
- Adobe I/O CLI for browser-based login
- Adobe Console SDK for fast API operations
- Token caching with TTL (5 minutes)
- Organization and project selection

**Optimization Strategy**:
```typescript
// Quick token check (< 1 second)
isAuthenticatedQuick() // Token + expiry only

// Full auth with SDK (30x faster than pure CLI)
ensureSDKInitialized() // Uses Adobe Console SDK
getCurrentOrganization() // SDK-powered, 1-minute cache
```

**API Mesh Deployment**:
- Builds GraphQL mesh configuration
- Deploys to Adobe I/O Runtime
- Verifies deployment success
- Tracks mesh state for staleness detection

### 5. Process Management

**Demo Lifecycle**:
- Start: Spawns Next.js dev server via terminal
- Stop: Terminates process via PID
- Monitor: Tracks logs via output channel
- Status: Updates status bar in real-time

**Port Management**:
- Automatic port availability checking
- Conflict detection before start
- Configurable default port (3000)

### 6. Auto-Update System

**Components**:
- **UpdateManager**: Checks GitHub Releases for extension and components
- **ComponentUpdater**: Updates git-based components with snapshot/rollback
- **ExtensionUpdater**: Downloads and installs VSIX files

**Safety Features**:
- Automatic snapshot before component updates
- Automatic rollback on ANY failure
- Post-update verification (package.json validation)
- Smart .env merging (preserves user values)
- Concurrent update lock

**Update Flow**:
```
1. Check GitHub Releases (stable/beta channel)
2. Show notification if updates available
3. User confirms → Check demo not running
4. For each component:
   - Create snapshot
   - Download & extract
   - Verify structure
   - Merge .env files
   - Update version tracking
   - Remove snapshot
5. Extension update (if available) → Prompt reload
```

### 7. File Watcher System

**Purpose**: Detect `.env` file changes and prompt restart

**Key Features**:
- Hash-based change detection (ignores file system events without content changes)
- Programmatic write suppression (Configure UI and updater don't trigger)
- Show-once-per-session notifications (no notification spam)
- 10-second startup grace period

**Integration Points**:
- Configure Project command
- Component Updater
- Start Demo command (initializes hashes)

### 8. Mesh Staleness Detection

**Purpose**: Detect when local mesh configuration differs from deployed mesh

**Comparison Strategy**:
```typescript
// Compare:
meshState.envVars    // Last deployed state
componentConfigs     // Current local configuration

// If empty, fetch deployed config from Adobe I/O
fetchDeployedMeshConfig() // aio api-mesh:get --active --json
```

**Staleness Indicators**:
- **Green**: Configuration matches deployed mesh
- **Amber**: Configuration changed, needs redeployment
- **Red**: Deployment error or not deployed

## Key Design Decisions

### 1. VS Code Extension vs Standalone Application

**Chosen**: VS Code Extension

**Rationale**:
- Target users already use VS Code for demo development
- Rich webview capabilities (full React apps)
- Natural workflow: Create project → Edit code → Run demo
- Easy distribution (VSIX or Marketplace)
- 4-5 week development time vs 12-16 weeks for Electron

### 2. React + Adobe Spectrum vs Native VS Code UI

**Chosen**: React + Adobe Spectrum (for complex UIs)

**Rationale**:
- Adobe brand consistency
- Enterprise-ready components
- WCAG 2.1 AA accessibility built-in
- Rich interactions (searchable lists, multi-step forms)
- Native VS Code UI for simple commands (Quick Pick, Input Box)

### 3. Git-Based Components vs NPM Packages

**Chosen**: Git-Based Components

**Rationale**:
- Allows customization and local development
- Easy to link local repositories for development
- Version control friendly
- Supports multiple component types (frontend, mesh, app builder)

### 4. Adobe I/O CLI + Console SDK Hybrid

**Chosen**: CLI for authentication, SDK for operations

**Rationale**:
- CLI handles browser-based login flow
- SDK 30x faster for org/project operations
- Automatic fallback to CLI if SDK fails
- Best of both worlds

### 5. Snapshot-Based Component Updates

**Chosen**: Full directory snapshot + automatic rollback

**Rationale**:
- Safest update strategy
- Handles partial extraction failures
- Preserves user modifications (via .env merging)
- Simple to reason about (snapshot exists = can rollback)

## Development Workflow

### Building the Extension

```bash
# Install dependencies
npm install

# Build extension + webviews
npm run compile

# Watch mode (development)
npm run watch

# Package for distribution
npm run package
```

### Running in Development

1. Open project in VS Code
2. Press F5 to launch Extension Development Host
3. Test commands and features
4. Check output channels for logs

### Adding New Commands

1. Create command file in `src/commands/`
2. Extend `BaseCommand` or `BaseWebviewCommand`
3. Register in `src/commands/commandManager.ts`
4. Add to `package.json` contributions
5. Document in `src/commands/CLAUDE.md`

### Adding New Utilities

1. Create utility file in `src/utils/`
2. Export from `src/utils/index.ts`
3. Add TypeScript types
4. Document in `src/utils/CLAUDE.md`
5. Add unit tests (future)

## File Organization

```
demo-builder-vscode/
├── src/
│   ├── extension.ts              # Entry point
│   ├── commands/                 # Command implementations
│   │   ├── createProjectWebview.ts   # Main wizard
│   │   ├── startDemo.ts             # Start demo
│   │   ├── stopDemo.ts              # Stop demo
│   │   ├── deployMesh.ts            # Deploy mesh
│   │   └── checkUpdates.ts          # Auto-update
│   ├── utils/                    # Core utilities
│   │   ├── stateManager.ts          # State persistence
│   │   ├── adobeAuthManager.ts      # Adobe auth
│   │   ├── componentManager.ts      # Component lifecycle
│   │   ├── updateManager.ts         # Update checking
│   │   ├── componentUpdater.ts      # Component updates
│   │   └── stalenessDetector.ts     # Mesh staleness
│   ├── providers/                # VS Code providers
│   │   ├── projectTreeProvider.ts   # Project tree view
│   │   ├── componentTreeProvider.ts # Component browser
│   │   └── statusBar.ts             # Status bar
│   ├── webviews/                 # React applications
│   │   ├── app/                     # Wizard app
│   │   ├── welcome/                 # Welcome screen
│   │   ├── dashboard/               # Project dashboard
│   │   └── components/              # Shared components
│   └── types/                    # TypeScript definitions
├── templates/                    # Configuration templates
│   ├── components.json              # Component registry
│   ├── prerequisites.json           # Prerequisites
│   └── wizard-steps.json            # Wizard config
├── docs/                         # Documentation
│   ├── architecture/                # Architecture docs
│   ├── patterns/                    # Design patterns
│   └── systems/                     # System docs
└── dist/                         # Compiled output
```

## Error Handling Strategy

### User-Facing Errors

```typescript
try {
  await riskyOperation();
} catch (error) {
  // Log full details for debugging
  this.logger.error('[Operation] Failed', error as Error);
  
  // Show user-friendly message
  const message = formatUserFriendlyError(error);
  vscode.window.showErrorMessage(message, 'Retry', 'View Logs');
}
```

### Error Formatting

- Network errors → "No internet connection. Please check your network."
- Timeout errors → "Operation timed out. Please try again."
- HTTP errors → "Server error. Please try again later."
- Validation errors → "Invalid configuration: [specific issue]"

## Performance Considerations

### Authentication Optimization

- **Quick check first**: `isAuthenticatedQuick()` < 1 second (token only)
- **SDK initialization**: Async, non-blocking (5 seconds max)
- **Organization cache**: 1 minute TTL (reduces API calls)
- **Console.where cache**: 3 minutes TTL (expensive 2s+ call)

### Webview Loading

- **Initial render**: < 100ms (loading state with pure HTML/CSS)
- **Minimum display time**: 1.5 seconds (prevents flashing)
- **Lazy loading**: Step components loaded on demand
- **Message queuing**: Queues messages until handshake complete

### Component Operations

- **Shallow clones**: `--depth=1` for faster cloning
- **Parallel operations**: Install dependencies in parallel when possible
- **Progress streaming**: Real-time progress updates during long operations

## Security Considerations

### Credential Management

- **VS Code Secret Storage**: All API keys and tokens
- **Never log credentials**: Mask in logs and error messages
- **Secure transmission**: HTTPS only for API calls

### Process Execution

- **Array form only**: `spawn(['cmd', 'arg'])` prevents injection
- **Input validation**: All user inputs validated before execution
- **No shell interpretation**: Avoid `{ shell: true }` in spawn

### Webview Security

- **Content Security Policy**: Strict CSP for all webviews
- **Nonce-based scripts**: Inline scripts use nonces
- **Message validation**: Validate all webview messages

### Workspace Trust

- **Trust requirement**: Operations require trusted workspace
- **Restricted in untrusted**: File operations blocked
- **Clear messaging**: Inform users why trust is required

## Future Enhancements

### Near-term (3-6 months)
- Automated testing framework
- Performance monitoring and analytics
- Enhanced error reporting (telemetry)
- Multi-project management
- Project import/export

### Long-term (6-12 months)
- Cloud synchronization
- Team collaboration features
- Advanced component templates
- CI/CD integration
- Custom component SDK

## Cross-References

For detailed information about specific areas:

- **Adobe Setup Flow**: `docs/architecture/adobe-setup.md`
- **Component System**: `docs/architecture/component-system.md`
- **Dependency Resolution**: `docs/architecture/graph-based-dependencies.md`
- **Node Version Management**: `docs/architecture/working-directory-and-node-version.md`
- **Development Strategy**: `docs/CLAUDE.md`
- **Prerequisites System**: `docs/systems/prerequisites-system.md`
- **Race Condition Solutions**: `docs/systems/race-conditions.md`
- **Logging System**: `docs/systems/logging-system.md`

---

**Document Status**: Current and maintained  
**Last Review**: January 2025  
**Next Review**: April 2025 or after major architectural changes

