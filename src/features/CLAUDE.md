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
├── ai/                  # AI context verification + standalone MCP server
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
- `@/core/*` - Core infrastructure (logging, state, communication, etc.)
- `@/types` - Global type definitions
- `@/types/*` - Specific type modules

**⚠️ Features SHOULD AVOID:**
- Importing from other features (keep loosely coupled)
- If cross-feature dependencies are needed, consider:
  - Moving shared code to `@/core/*`
  - Using events/messages for communication
  - Refactoring feature boundaries

**✅ Commands CAN import:**
- Any feature (commands orchestrate features)
- `@/core/*`
- `@/types`

## Feature Descriptions

### ai

**Purpose**: AI context file verification + AI inventory backend — the harness is Claude Code (CLI), not VS Code Chat

**Key Services:**
- `verifyAiSetup(projectPath, extensionDistPath)` - Checks that `.claude/CLAUDE.md`, `.claude/mcp.json`, the MCP binary, and `.claude/skills/` are present and valid; returns `AiVerificationResult` with `{ status, checks, inventory }`
- `gatherInventory(projectPath)` - Orchestrator that runs the three inspectors below via `Promise.allSettled`; failures degrade to empty lists with `*Error` diagnostic fields
- `inspectSkills(projectPath)` - Walks `.claude/skills/`, parses YAML frontmatter, classifies as `demo-builder` / `adobe` / `unknown`
- `inspectAllServers(projectPath)` + `clearMcpCache(serverId?)` - Spawns each `.claude/mcp.json` server via `@modelcontextprotocol/sdk` stdio client, returns tool list per server; 15s per-server timeout, 5-min TTL cache (success-only), SDK env allowlist (no host secret leakage)
- `detectSessionMcps()` - Reads `~/.claude.json::claudeAiMcpEverConnected` + `~/.claude/mcp-needs-auth-cache.json` for Adobe MCPs the user connected via Claude Code's catalog (best-effort; undocumented Claude Code internal state)
- `dist/mcp-server.js` (compiled from `src/mcp-server.ts`) - Standalone stdio MCP server exposing 7 project tools to AI agents

**Responsibilities:**
- Verifying project AI context files — feeds the Project Dashboard's "AI Ready" health badge (via `useDashboardStatus`)
- Providing the skills inventory rendered by the dashboard's "View Skills" capability surface (`AiSkillsModal`), plus the project-MCP / session-MCP inventory used by health diagnostics
- Standalone MCP server process for AI agent tool access via Claude Code (CLI), discoverable through `~/.claude.json` (user-scope, consent-gated) and project `.mcp.json`

**Path Alias**: `@/features/ai`

---

### authentication

**Purpose**: Adobe authentication, Console SDK integration, token management

**Key Services:**
- `AuthenticationService` - Adobe I/O authentication with SDK
- `createEntityServices` / `EntityServices` - Factory for org/project/workspace operations
- `AuthCacheManager` - Token and org/project caching with TTL
- `TokenManager` - Token validation and refresh

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
- Component definition loading from config/components.json
- Component dependency resolution
- Component selection validation
- Component metadata and configuration

**Path Alias**: `@/features/components`

### dashboard

**Purpose**: Project dashboard UI, controls, and per-project configuration

**Key Services:**
- `dashboardHandlers` - Handler map for project dashboard messages
- `configureHandlers` - Handler map for Configure screen messages (cancel, components data, store discovery)
- `aiHandlers` - Handler map for the standalone AI surface, 8 handlers: verify-ai-setup (returns inventory), inspect-mcp, regenerate-ai-files, save-ai-prompt / delete-ai-prompt / list-ai-prompts (scope-routed by `pinned`: `pinned: true` prompts persist in globalState under `demoBuilder.ai.globalPrompts` and appear in every project; unpinned prompts persist in the current project's `.demo-builder.json` manifest; a pin toggle is a cross-scope move, and list returns the merged deduped list), openInClaude, copyAiPrompt (clipboard write for the kebab Copy prompt action)
- `AiSkillsModal` / `AiSkillsList` - The dashboard's "View Skills" capability catalog (task-framed name + description) carrying the Regenerate AI files action; opened from a link beside the "AI Ready" health badge (NOT the badge itself)
- Dashboard state management
- Component browser integration
- Mesh status display

**Responsibilities:**
- Project control panel UI
- Start/Stop demo controls
- Logs/Debug channel toggle
- Component file browser (with .env hiding)
- Mesh deployment status
- Project configuration editing (Configure screen)
- AI health + capability (separate concerns): the passive "AI Ready" badge reflects AI-setup health (from `verify-ai-setup`); a distinct "View Skills" link opens the capability catalog (skills) and carries Regenerate AI files. A conditional Regenerate link appears beside the badge when health needs attention. MCP/session-MCP plumbing stays in the "Demo Builder: Diagnostics" command.

**Path Alias**: `@/features/dashboard`

### eds

**Purpose**: Edge Delivery Services integration with GitHub, DA.live, and Helix 5

**Key Services:**
- `GitHubTokenService`, `GitHubRepoOperations`, `GitHubFileOperations`, `GitHubOAuthService` - GitHub integration (extracted modules)
- `DaLiveAuthService`, `DaLiveContentOperations`, `DaLiveOrgOperations` - DA.live integration (extracted modules)
- `ConfigurationService` - AEM Configuration Service (site registration)
- `HelixService` - Helix Admin API (preview/publish/unpublish, API key management)
- `CleanupService` - External resource cleanup on project deletion
- `ToolManager` - Commerce demo ingestion tool management
- `edsResetParams` + `edsResetRepoHelper` + `edsResetMeshHelper` + `edsResetService` + `edsResetUI` - Project reset (parameter validation, repo helpers, mesh redeploy, pipeline orchestration, UI)
- `blockCollectionHelpers` - Block collection installation from config-driven source
- `inspectorHelpers` - Demo Inspector SDK vendoring and tagging
- Error formatters for user-friendly error messages

**Responsibilities:**
- GitHub OAuth popup flow with CSRF protection
- Repository creation from CitiSignal template
- DA.live content copy for brand content
- Helix 5 configuration via Configuration Service API
- Code sync verification with polling
- Tool installation for data population
- Partial state tracking for recovery
- Pre-flight authentication checks (Adobe I/O and DA.live)
- Mid-pipeline DA.live token expiry recovery with re-authentication
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
- Demo package loading, storefront resolution, and mesh requirement resolution (`services/demoPackageLoader.ts`)
- Custom block library URL parsing and validation (`services/customBlockLibraryUtils.ts`)
- `aiContextWriter.ts` - Generates `AGENTS.md` at the project root with project-specific AI agent context; writes `CLAUDE.md` (root) and `.claude/CLAUDE.md` as one-line `see @AGENTS.md` pointers
- `mcpConfigWriter.ts` - Generates `.claude/mcp.json`, `.mcp.json`, and `.claude/settings.json` (Cursor and Codex read `.mcp.json` natively — no per-tool config files)
- `skillsWriter.ts` - Writes three lifecycle skills to `.claude/skills/` (add-component, sync-changes, update-credentials); EDS storefront skills come from Adobe's `@adobe-commerce/commerce-extensibility-tools` package
- `generateAIContextFiles` (in `projectFinalizationService.ts`) - Orchestrates all three AI writers as project finalization phase 6
- Project template application
- Environment file generation
- Directory structure creation
- Component installation

**Responsibilities:**
- Demo template selection on WelcomeStep
- Custom block library management (URL parsing, deduplication, VS Code settings integration)
- Applying template defaults to component selections
- Creating project directory structure
- Applying component templates
- Generating .env files
- Installing npm dependencies
- Setting up git repository
- Initial project configuration
- Generating AI context files (MCP config, CLAUDE.md, skill files) at project creation and on demand

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
6. **Follow import rules**: Only import from `@/core/*` and `@/types`
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
