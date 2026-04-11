## IMPORTANT: RPTC Workflow

This project uses the RPTC (Research → Plan → TDD → Commit) workflow.

**See `.rptc/CLAUDE.md` for complete RPTC workflow instructions and commands.**

All development must follow the RPTC process defined in that file.

---

# Adobe Demo Builder VS Code Extension

## Project Overview

The Adobe Demo Builder is a VS Code extension that streamlines the creation of Adobe Commerce demo projects. It provides a wizard-based interface for setting up complex e-commerce demonstrations with various Adobe technologies integrated.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   VS Code Extension Host                  │
├─────────────────────────────────────────────────────────┤
│  Extension Activation (extension.ts)                     │
│  ├── Command Registration                                │
│  ├── State Management                                    │
│  └── Provider Registration                               │
├─────────────────────────────────────────────────────────┤
│              Core Systems                                │
│  ├── Prerequisites System (JSON-driven)                  │
│  ├── Component Registry (features/components/config/)    │
│  ├── Progress Tracking (ProgressUnifier)                 │
│  ├── Error Logging System                                │
│  ├── StepLogger (Configuration-driven logging)           │
│  ├── ExternalCommandManager (Race-safe commands)         │
│  ├── StateCoordinator (Adobe CLI state sync)             │
│  └── Auth Guards (Shared re-auth prompts)                │
├─────────────────────────────────────────────────────────┤
│          Communication & Messaging Layer                 │
│  ├── WebviewCommunicationManager (Handshake protocol)    │
│  ├── BaseWebviewCommand (Standardized patterns)          │
│  └── Message queuing & retry logic                       │
├─────────────────────────────────────────────────────────┤
│              Webview Layer (React)                       │
│  ├── Wizard UI (Adobe Spectrum)                          │
│  ├── Message Protocol (vscode.postMessage)              │
│  └── Step Components                                     │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
demo-builder-vscode/
├── src/                    # Source code (→ see src/CLAUDE.md)
│   ├── commands/          # VS Code commands (→ see src/commands/CLAUDE.md)
│   ├── features/          # Feature modules (→ see src/features/CLAUDE.md)
│   │   ├── authentication/   # Adobe authentication
│   │   ├── components/       # Component management
│   │   ├── dashboard/        # Project dashboard
│   │   ├── eds/              # Edge Delivery Services (→ see src/features/eds/README.md)
│   │   ├── lifecycle/        # Project lifecycle
│   │   ├── mesh/             # API Mesh deployment
│   │   ├── prerequisites/    # Prerequisites system
│   │   ├── project-creation/ # Project creation
│   │   ├── projects-dashboard/ # Projects home screen (card grid)
│   │   ├── sidebar/          # Sidebar navigation (WebviewViewProvider)
│   │   └── updates/          # Auto-update system
│   ├── shared/            # Shared infrastructure (→ see src/shared/CLAUDE.md)
│   │   ├── base/             # Base types & utilities
│   │   ├── command-execution/# Command execution
│   │   ├── communication/    # Webview communication
│   │   ├── logging/          # Logging system
│   │   ├── state/            # State management
│   │   ├── utils/            # Common utilities
│   │   └── validation/       # Validation utilities
│   ├── webviews/          # React UI components (→ see src/webviews/CLAUDE.md)
│   ├── utils/             # Legacy utilities (→ see src/utils/CLAUDE.md)
│   ├── providers/         # VS Code providers
│   └── types/             # TypeScript definitions
├── config files in src/features/*/config/  # Configuration per feature
├── docs/                  # Documentation
│   └── CLAUDE.md         # Development strategy & guidelines
├── dist/                  # Compiled output
└── media/                 # Static assets
```

## Key Components

### 1. **Wizard System**
- Multi-step project creation wizard
- React-based UI using Adobe Spectrum
- Maintains state across steps
- Width constraint solution: Replace Spectrum Flex with div for layouts

### 2. **Prerequisites System**
- JSON-driven prerequisite definitions
- Automatic tool installation
- Progress tracking with multiple strategies
- Supports Node.js multi-version management

### 3. **Component Registry**
- Defines available project components
- Manages dependencies between components
- Dynamic configuration based on selections

### 4. **Webview Communication**
- Bidirectional message passing with handshake protocol
- Type-safe message protocol with request-response pattern
- State synchronization between extension and UI
- Message queuing until both sides ready
- Automatic retry with exponential backoff

### 5. **Logging System**
- Configuration-driven logging via StepLogger
- Template-based messages from logging.json
- Smart context switching for operational logs
- Consistent formatting across all components

### 6. **Race Condition Management**
- ExternalCommandManager for command queuing
- Mutual exclusion for resource access
- Smart polling with exponential backoff
- StateCoordinator for Adobe CLI consistency

### 7. **Auto-Update System**
- GitHub Releases integration for version checking
- Snapshot-based rollback for component updates
- Smart .env merging preserves user configuration
- Stable and beta update channels
- Programmatic write suppression prevents false notifications
- Pre-flight checks (demo running, concurrent updates)

## Critical Design Decisions

### Adobe Spectrum Integration
- **Issue**: Flex component constrains width to 450px
- **Solution**: Use standard HTML div with flex styles for critical layouts
- **Details**: See `src/webviews/CLAUDE.md`

### Spectrum Design Token Support (v1.7.0)
- **Feature**: Layout components support type-safe Spectrum design tokens
- **Components**: `GridLayout`, `TwoColumnLayout` accept `DimensionValue` props
- **Example**: `gap="size-300"` compiles to `"24px"` with TypeScript validation
- **Backward Compatible**: Pixel strings and numbers still work
- **Details**: See `docs/development/ui-patterns.md` and `docs/development/styling-guide.md`

### Adobe Setup Redesign (Two-Column Layout)
- **Unified Experience**: Single step replaces separate auth/org/project steps
- **Two-Column Design**: Active content (60%) + persistent summary (40%)
- **Progressive Disclosure**: Auth → Projects → Workspaces flow
- **Fast Feedback**: 1-second polling (3x faster than before)
- **Always-Visible Controls**: Edit buttons shown at all times for transparency
- **Details**: See `docs/architecture/adobe-setup.md`

### Prerequisites UI
- **Scrollable Container**: Fixed height (360px) with internal scrolling
- **Auto-scroll**: Intelligent scrolling during prerequisite checking
- **Visual Consistency**: Standardized status indicators with icons
- **Details**: See `docs/systems/prerequisites-system.md`

### State Management
- Extension state persisted via StateManager
- Webview state managed with React hooks
- Message passing for state synchronization
- Clear dependent state when parent selection changes

## Key Files to Understand

1. **extension.ts** - Entry point and command registration
2. **src/commands/createProjectWebview.ts** - Main wizard orchestration
3. **src/features/project-creation/ui/wizard/WizardContainer.tsx** - Wizard UI container
4. **src/utils/adobeAuthManager.ts** - Adobe authentication and SDK integration
5. **src/utils/updateManager.ts** - GitHub Releases integration and update checking
6. **src/utils/componentUpdater.ts** - Safe component updates with snapshot/rollback
7. **src/utils/stateManager.ts** - Project state persistence and management
8. **src/features/prerequisites/config/prerequisites.json** - Prerequisite definitions
9. **src/features/components/config/components.json** - Component registry
10. **src/features/project-creation/config/demo-packages.json** - Demo package definitions (storefront configs, addons, content sources)
11. **src/features/project-creation/config/stacks.json** - Stack definitions (frontend+backend combos, global addon definitions with source repos)
12. **src/features/project-creation/config/block-libraries.json** - Block library definitions (EDS block collections, sources, package associations)

## Common Tasks

### Adding a New Prerequisite
→ See `src/features/prerequisites/config/prerequisites.json` and `docs/systems/prerequisites-system.md`

### Modifying Wizard Steps
-> See wizard steps in respective feature directories:
  - `src/features/authentication/ui/steps/` - Adobe auth steps
  - `src/features/components/ui/steps/` - Component selection steps
  - `src/features/prerequisites/ui/steps/` - Prerequisites step
  - `src/features/mesh/ui/steps/` - API Mesh step
  - `src/features/project-creation/ui/steps/` - WelcomeStep (with template selection), ReviewStep, ProjectCreationStep
  - `src/features/project-creation/ui/components/ArchitectureModal.tsx` - Multi-step modal for architecture + block library selection (extracted from BrandGallery)
  - `src/features/project-creation/ui/components/ConnectStoreStepContent.tsx` - Connect Commerce step (step ID: `'settings'`) — Commerce connection fields + store discovery with progressive disclosure
-> Note: WelcomeStep includes demo package selection. Architecture and block library selection happens via ArchitectureModal (multi-step modal in BrandGallery). Custom block libraries are configured in VS Code settings and selected via checkboxes. (see `src/features/project-creation/config/demo-packages.json`, `src/features/project-creation/config/block-libraries.json`, and `src/types/blockLibraries.ts`)
-> See feature documentation for wizard orchestration details

### Debugging Width Issues
→ See `docs/troubleshooting.md` and use WidthDebugger component

### Adding New Commands
→ See `src/commands/CLAUDE.md`

### Debugging Issues
→ Run "Demo Builder: Diagnostics" command
→ Check "Demo Builder: Debug" output channel
→ See `docs/systems/debugging.md`

## Technology Stack

- **Extension**: TypeScript, VS Code Extension API
- **UI**: React, Adobe Spectrum, Webpack
- **Build**: TypeScript compiler, Webpack
- **Testing**: Jest with ts-jest, @testing-library/react, structure-aligned test organization (see tests/README.md)

## Development Workflow

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Watch mode: `npm run watch`
4. Run extension: F5 in VS Code
5. Package: `npm run package`

## Recent Improvements

### v1.6.0 (2025-01-XX) - Auto-Updates & Performance Optimizations
- **Auto-Update System**: Extension and component updates via GitHub Releases
  - Snapshot/rollback safety for component updates
  - Smart .env merging preserves user configuration
  - Stable and beta update channels
  - Programmatic write suppression prevents false notifications
  - Concurrent update lock prevents double-click accidents
  - Post-update verification ensures component integrity
- **Authentication Performance**: Adobe Console SDK integration for 30x faster operations
  - Quick auth checks (< 1s vs 9+ seconds for full validation)
  - Pre-flight authentication for Adobe I/O operations prevents unexpected browser launches
  - Cached organization/project data with TTL (reduces API calls)
  - Async SDK initialization (non-blocking, 5-second timeout)
- **Prerequisite Performance**: Adobe AIO CLI prerequisite optimization
  - In-memory caching with 5-minute TTL reduces checks from 3-6s to <1s (95% faster)
  - Parallel execution for per-Node-version checks (3x faster for multi-version scenarios)
  - Optimized npm flags (`--no-fund`) reduce installation noise; `--prefer-offline` removed from global installs (caused ETARGET on stale caches)
  - Smart cache invalidation on configuration changes and manual rechecks
  - Cache security features: size limits (100 entries), LRU eviction, TTL jitter (±10%)
  - Enhanced progress visibility with elapsed time tracking for long operations
  - Reduced prerequisite check timeout from 60s to 10s for faster failure detection
- **Mesh Deployment Enhancements**: Improved configuration detection and error handling
  - Fetches deployed mesh config from Adobe I/O for accurate comparison
  - Better staleness detection (compares local vs deployed state)
  - Consolidated logging to single "Demo Builder: Logs" channel
  - Pre-flight authentication check before deployment
  - User-friendly error formatting for network/timeout/HTTP failures
- **Dashboard Improvements**: Enhanced project control panel
  - Smart Logs toggle remembers last active channel (Logs/Debug)
  - Asynchronous mesh status checking doesn't block UI
  - Focus retention for in-place actions (Logs toggle, Start/Stop)
  - Component browser with .env file hiding
  - Focus trap for keyboard navigation
- **File Watcher Improvements**: Hash-based change detection with notification management
  - Programmatic write suppression (Configure UI and updates don't trigger false alerts)
  - Show-once-per-session notifications (no notification spam)
  - 10-second startup grace period
  - Separate tracking for restart vs mesh redeploy notifications

### v1.5.0 (2025-01-16) - Backend Call on Continue & Critical Fixes
- **Backend Call on Continue Pattern**: Major UX improvement for selection steps
  - UI updates immediate, backend calls deferred to Continue button
  - Eliminates loading delays during exploration
  - Clear error handling at commitment points
  - Consistent pattern across project/workspace selection
- **Critical Async Handler Fix**: Resolved "Error Loading Projects" issue
  - WebviewCommunicationManager now properly awaits async handlers
  - Fixed Promise objects being sent to UI instead of resolved values
  - Eliminates UI errors despite successful backend operations
- **Adobe CLI Timeout Solutions**: Addressed frequent timeout failures
  - Increased CONFIG_WRITE timeout from 5000ms to 10000ms
  - Added success detection in timeout scenarios via stdout parsing
  - Commands now succeed reliably despite Adobe CLI slowness
- **UI/UX Standardization**: Consistent layout and interaction patterns
  - Standardized 800px content width across selection steps
  - Simple spinner overlays replace verbose loading text
  - Disabled buttons during loading operations
  - Eliminated blank screens during transitions

### v1.4.0 (2025-01-11)
- **Race Condition Solutions**: Comprehensive 4-phase implementation
  - WebviewCommunicationManager with handshake protocol
  - ExternalCommandManager for command queuing and mutual exclusion
  - StateCoordinator for Adobe CLI state consistency
  - BaseWebviewCommand for standardized patterns
- **Configuration-Driven Logging**: StepLogger with templates
  - Step names from wizard-steps.json
  - Message templates from logging.json
  - Smart context switching for operations
- **Improved Reliability**: Eliminated brittle setTimeout delays
  - Smart polling with exponential backoff
  - Condition-based waiting
  - Automatic retry logic

### v1.3.0 (2025-01-10)
- **Enhanced Debugging System**: Dual output channels ("Demo Builder: Logs" and "Demo Builder: Debug")
- **Diagnostics Command**: Comprehensive system analysis for troubleshooting
- **Unified Logging**: Consolidated from 4 channels to 2 clean channels
- **Adobe Setup UX**: Consistent auto-advance, proper success display, eliminated double-loader
- **Command Execution Logging**: Full stdout/stderr/timing capture for debugging

### Previous Updates
- Fixed wizard width inconsistencies (450px → 800px)
- Improved prerequisites UI with scrollable container
- Standardized status message displays
- Enhanced error message parsing for Adobe I/O CLI
- Comprehensive documentation updates

## New Documentation (v1.5.0)

### Design Patterns
- **[Backend Call on Continue Pattern](docs/patterns/selection-pattern.md)**: Complete guide to the new selection UX pattern
- **[State Management Patterns](docs/patterns/state-management.md)**: Comprehensive state handling strategies
- **[Adobe CLI Timeout Troubleshooting](docs/troubleshooting/adobe-cli-timeouts.md)**: Debugging and fixing timeout issues

### Key Implementation Files
- **[WebView Integration](src/webviews/CLAUDE.md)**: Updated with Backend Call on Continue documentation
- **[Utilities](src/utils/CLAUDE.md)**: Added async handler resolution and timeout configuration docs
- **[Commands](src/commands/CLAUDE.md)**: Updated message handling patterns and timeout strategies

## Future Enhancements

- Automated testing framework
- Performance monitoring
- Enhanced error reporting
- Accessibility improvements
- Windows/Linux platform support

---

For detailed information about specific areas, navigate to the CLAUDE.md file in the relevant directory.

## RPTC Verification Configuration
verification-agent-mode: automatic