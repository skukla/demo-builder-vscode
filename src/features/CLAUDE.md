# Features Architecture

## Overview

The `features/` directory contains self-contained feature modules organized by business domain (vertical slice architecture). Each feature owns its complete vertical slice: services, types, utilities, and tests.

## Feature-Based Architecture

**Philosophy**: Group code by **what it does** (business domain) rather than **how it works** (technical layer).

**Benefits:**
- **Cohesion**: Related code lives together
- **Discoverability**: Easy to find all code for a feature
- **Modularity**: Features are loosely coupled
- **Scalability**: Add features without impacting structure

## Directory Structure

```
features/
├── authentication/       # Adobe authentication & SDK
│   ├── index.ts         # Public API exports
│   ├── services/        # Authentication services
│   └── README.md        # Feature documentation
├── components/          # Component management
├── dashboard/           # Project dashboard (detail view)
├── eds/                 # Edge Delivery Services (→ README.md)
├── lifecycle/           # Project lifecycle
├── mesh/                # API Mesh deployment
├── prerequisites/       # Prerequisites system
├── project-creation/    # Project creation workflow
├── projects-dashboard/  # Projects home screen (card grid)
├── sidebar/             # Sidebar navigation (WebviewViewProvider)
└── updates/             # Auto-update system
```

## Feature Structure Pattern

Each feature follows this consistent structure:

```
features/my-feature/
├── index.ts              # Public API (what other modules can import)
├── services/            # Business logic & services
│   ├── myFeatureService.ts
│   ├── myHelper.ts
│   └── types.ts         # Feature-specific types
├── ui/                  # Feature-specific UI components (if any)
├── utils/               # Feature-specific utilities
└── README.md            # Feature documentation
```

## Import Rules

**✅ Features CAN import:**
- `@/shared/*` - Shared infrastructure (logging, state, communication, etc.)
- `@/types` - Global type definitions
- `@/types/*` - Specific type modules

**⚠️ Features SHOULD AVOID:**
- Importing from other features (keep loosely coupled)
- If cross-feature dependencies are needed, consider:
  - Moving shared code to `@/shared/*`
  - Using events/messages for communication
  - Refactoring feature boundaries

**✅ Commands CAN import:**
- Any feature (commands orchestrate features)
- `@/shared/*`
- `@/types`

## Feature Descriptions

### authentication

**Purpose**: Adobe authentication, Console SDK integration, token management

**Key Services:**
- `AuthenticationService` - Adobe I/O authentication with SDK
- `AuthCacheManager` - Token and org/project caching with TTL

**Responsibilities:**
- Adobe I/O CLI authentication (browser-based login)
- Adobe Console SDK integration (30x faster operations)
- Token validation and caching
- Organization/project/workspace selection
- Pre-flight authentication checks

**Path Alias**: `@/features/authentication`

### components

**Purpose**: Component registry, definitions, lifecycle management

**Key Services:**
- `ComponentRegistry` - Component definitions and metadata
- `ComponentManager` - Component lifecycle operations

**Responsibilities:**
- Component definition loading from templates/components.json
- Component dependency resolution
- Component selection validation
- Component metadata and configuration

**Path Alias**: `@/features/components`

### dashboard

**Purpose**: Project dashboard UI and controls

**Key Services:**
- Dashboard state management
- Component browser integration
- Mesh status display

**Responsibilities:**
- Project control panel UI
- Start/Stop demo controls
- Logs/Debug channel toggle
- Component file browser (with .env hiding)
- Mesh deployment status

**Path Alias**: `@/features/dashboard`

### eds

**Purpose**: Edge Delivery Services integration with GitHub, DA.live, and Helix 5

**Key Services:**
- `GitHubService` - OAuth authentication, repository creation from templates
- `DaLiveService` - DA.live content management with IMS token integration
- `EdsProjectService` - Project setup orchestration (GitHub + DA.live + Helix)
- `ToolManager` - Commerce demo ingestion tool management
- `CleanupService` - External resource cleanup on project deletion
- `HelixService` - Helix 5 Configuration Service integration
- Error formatters for user-friendly error messages

**Responsibilities:**
- GitHub OAuth popup flow with CSRF protection
- Repository creation from CitiSignal template
- DA.live content copy for brand content
- Helix 5 configuration via Configuration Service API
- Code sync verification with polling
- Tool installation for data population
- Partial state tracking for recovery
- Project cleanup (GitHub repo, DA.live content, Helix site)

**Path Alias**: `@/features/eds`

### lifecycle

**Purpose**: Project lifecycle management (start/stop/restart)

**Key Services:**
- Process management
- Terminal integration
- Demo server lifecycle

**Responsibilities:**
- Starting demo servers
- Stopping running demos
- Restarting after config changes
- Terminal output management
- Process cleanup on exit

**Path Alias**: `@/features/lifecycle`

### mesh

**Purpose**: API Mesh deployment and verification

**Key Services:**
- `MeshDeploymentService` - Mesh deployment orchestration
- `MeshEndpointService` - Endpoint URL generation
- `MeshVerificationService` - Deployment verification
- `StalenessDetector` - Config staleness detection

**Responsibilities:**
- Mesh configuration building
- Deployment to Adobe I/O Runtime
- Endpoint URL generation (workspace-based)
- Staleness detection (local vs deployed)
- Fetching deployed mesh config from Adobe I/O
- Pre-flight authentication checks

**Path Alias**: `@/features/mesh`

### prerequisites

**Purpose**: Tool detection, installation, and version checking

**Key Services:**
- `PrerequisitesManager` - Tool checking and installation
- Node.js multi-version support via fnm/nvm

**Responsibilities:**
- Tool detection (Node.js, npm, fnm, Adobe CLI, etc.)
- Automatic tool installation
- Version checking and validation
- Progress tracking during installation
- Multi-version Node.js support

**Path Alias**: `@/features/prerequisites`

### project-creation

**Purpose**: Project creation workflow, demo template selection, and environment setup

**Key Services:**
- Demo template loading and validation (`templateLoader.ts`)
- Template defaults application (`templateDefaults.ts`)
- Project template application
- Environment file generation
- Directory structure creation
- Component installation

**Responsibilities:**
- Demo template selection on WelcomeStep
- Applying template defaults to component selections
- Creating project directory structure
- Applying component templates
- Generating .env files
- Installing npm dependencies
- Setting up git repository
- Initial project configuration

**Path Alias**: `@/features/project-creation`

### projects-dashboard

**Purpose**: Main entry point showing all projects in a card grid layout

**Key Services:**
- `ShowProjectsListCommand` - Main webview command (home screen)
- `projectsListHandlers` - Message handler map (object literal with `dispatchHandler`)
- `ProjectsDashboard` - Main dashboard component with search/filter
- `ProjectCard` - Individual project card display
- `ProjectsGrid` - Responsive grid layout
- `DashboardEmptyState` - First-time user empty state

**Responsibilities:**
- Display all projects in responsive card grid
- Project search/filtering (when > 5 projects)
- Project selection to navigate to detail view
- Create new project CTA
- Loading states and empty states
- Auto-show on extension activation (home screen)

**Path Alias**: `@/features/projects-dashboard`

### sidebar

**Purpose**: Contextual sidebar navigation using WebviewViewProvider

**Key Services:**
- `SidebarProvider` - VS Code WebviewViewProvider implementation
- `Sidebar` - Main sidebar component
- `SidebarNav` - Navigation list component
- `WizardProgress` - Wizard step progress display

**Responsibilities:**
- Context-aware navigation (projects, project detail, wizard, configure)
- Wizard step progress display
- Back navigation
- Project-specific navigation (Overview, Configure, Updates)

**Path Alias**: `@/features/sidebar`

### updates

**Purpose**: Auto-update system for extension and components

**Key Services:**
- `UpdateManager` - GitHub Releases integration
- `ComponentUpdater` - Component updates with snapshot/rollback
- `ExtensionUpdater` - VSIX download and installation

**Responsibilities:**
- Checking GitHub Releases for updates
- Semantic version comparison
- Component updates with automatic rollback on failure
- Smart .env merging (preserves user config)
- Extension VSIX download and installation
- Stable/beta channel support
- Programmatic write suppression

**Path Alias**: `@/features/updates`

## Adding a New Feature

1. **Create feature directory**: `features/my-feature/`
2. **Create index.ts**: Export public API
3. **Add services/**: Business logic goes here
4. **Add types.ts**: Feature-specific types
5. **Update this documentation**: Add feature description
6. **Follow import rules**: Only import from `@/shared/*` and `@/types`
7. **Add README.md**: Feature-specific documentation

## Migration from utils/

**Pattern**: Many features were migrated from `utils/` to `features/`:

**Before** (Technical Layer Organization):
```
utils/
├── adobeAuthManager.ts       # Mixed concerns
├── prerequisitesManager.ts   # Mixed concerns
├── updateManager.ts          # Mixed concerns
└── meshDeployer.ts           # Mixed concerns
```

**After** (Feature-Based Organization):
```
features/
├── authentication/
│   └── services/
│       └── authenticationService.ts
├── prerequisites/
│   └── services/
│       └── prerequisitesManager.ts
├── updates/
│   └── services/
│       └── updateManager.ts
└── mesh/
    └── services/
        └── meshDeployment.ts
```

**Benefits of Migration:**
- Clear feature boundaries
- Easier to find related code
- Reduced coupling between features
- Better testability

## Testing Features

Each feature should have its own test suite:

```
features/my-feature/
├── services/
│   ├── myService.ts
│   └── myService.test.ts
└── utils/
    ├── myHelper.ts
    └── myHelper.test.ts
```

## Documentation

Each feature should have a README.md documenting:
- Purpose and responsibilities
- Key services and their APIs
- Usage examples
- Integration points
- Testing approach

---

For shared infrastructure, see `../shared/CLAUDE.md`
For overall architecture, see `../CLAUDE.md`
