<!-- Last verified: 2026-07-16 -->
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
├── ai/                  # AI context verification + in-extension MCP server
├── app-builder/         # App Builder app attach/deploy (→ README.md)
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
- `inspectAllServers(projectPath)` + `clearMcpCache(serverId?)` - Inspects each `.claude/mcp.json` server (third-party via `@modelcontextprotocol/sdk` stdio client; the in-extension `demo-builder` server — the entry carrying `DEMO_BUILDER_MCP_SOCKET` — via a direct socket probe, no subprocess), returns tool list per server; 15s per-server timeout, 5-min TTL cache (success-only), SDK env allowlist on the spawned path (no host secret leakage)
- `detectSessionMcps()` - Reads `~/.claude.json::claudeAiMcpEverConnected` + `~/.claude/mcp-needs-auth-cache.json` for Adobe MCPs the user connected via Claude Code's catalog (best-effort; undocumented Claude Code internal state)
- `InExtensionMcpServer` (`server/inExtensionMcpServer.ts`) - In-extension MCP server on a per-workspace Unix socket; reuses extension services so tools do the same work as the UI. Clients reach it through the `dist/mcp-proxy.js` stdio↔socket forwarder. Exposes the full agent tool surface (project reads, auth, lifecycle, cloud, storefront, updates) — including `promote_block_to_library` (registers a custom block in DA.live's authoring picker). The `vscode`-free `src/mcp-server.ts` still provides the shared file-based `registerProjectTools`; its standalone process is retired. **Full reference: `docs/systems/mcp-server.md`**

**Responsibilities:**
- Verifying project AI context files — feeds the Project Dashboard's "AI Ready" health badge (via `useDashboardStatus`)
- Providing the skills inventory rendered by the dashboard's "View Skills" capability surface (`AiCapabilitiesModal`), plus the project-MCP / session-MCP inventory used by health diagnostics
- In-extension MCP server for AI agent tool access via Claude Code (CLI), reached through the per-project `.mcp.json` (which points at the `dist/mcp-proxy.js` stdio↔socket forwarder); the former standalone process is retired. Global `~/.claude.json` registration is an explicit opt-in ("Demo Builder: Register Global MCP") whose entry has no pinned socket — the proxy discovers a running extension window at launch (`server/mcpSocketDiscovery.ts`, newest live socket wins), enabling global ops from any cwd

**Path Alias**: `@/features/ai`

---

### app-builder

**Purpose**: Attach, deploy, and remove **N custom Adobe App Builder integrations** on a demo
project, dashboard-first. Sibling of the mesh deploy path (not a fork) — and since ADR-011 D3
they share ONE state model: the keyed `project.appBuilderComponents` map
(`kind: 'mesh' | 'integration'`) is the single persisted authority. The mesh is one component
kind in that map; the legacy singular `meshState`/`appState` fields are legacy-read-only
(manifests migrate on load, forward-migrate on first save).

**Key Services:**
- `deployAppComponent(path, cmdMgr, logger, onProgress?)` (`services/appDeployment.ts`) -
  org-agnostic deploy helper: shared `buildComponent` → `aio app deploy` (idempotent, issued
  once) → defensive parse of `aio app get-url --json` into `{ url, deployedUrls }`. Callers
  wrap it in `withOrgContext`, exactly like `deployMeshComponent`.
- `addAppBuilderComponent` / `removeAppBuilderComponent`
  (`services/appBuilderComponentRunner.ts`) - additive add / per-id remove on a LIVE project
  (N integrations coexist — ADR-011 D3 Step 05). Add clones+installs via
  `componentManager.installComponent` (leaving siblings untouched), attaches the component
  instance, keys the entry in `appBuilderComponents[id]`, and reconciles the SELECTION lists
  (`reconcileComponentSelections`). Remove undeploys remotely (`aio app undeploy`,
  best-effort, org-context targeted) then cleans up ONLY that integration's files + keyed
  state. A parallel `appComponentManager` used to own add/remove under the singular model;
  it went callerless when the runner took over and was deleted 2026-08-10 — while it lived,
  it was the only code maintaining `componentSelections`, so dashboard-added components went
  unselected and project RESET dropped them.
- `appBuilderComponentState.ts` - the keyed-map accessors (`getMeshAppBuilderComponent`,
  `getIntegrationAppBuilderComponents`, `listAppBuilderComponents`, `getProvidedEnvVars`);
  legacy synthesis only for pre-migration in-memory projects. `appBuilderDeployOutcome.ts` -
  `recordDeployOutcome`, the one keyed deploy-record writer every deploy path lands on.
- Every per-integration deploy — UI and AI alike — goes through the keyed runner
  (`appBuilderComponentRunner.ts`) behind the per-id handlers. There is no singular
  headless variant: `deployAppHeadless` was retired 2026-08-04 once its only caller
  (the projects-list `redeployApp` kebab item) was replaced by a route to the
  Integrations page. It never earned the second caller its mesh sibling has, because
  the MCP tools were already on the keyed path — and being UI-free turned out to be
  the wrong goal for an agent-triggered deploy, which is precisely when the user
  needs telling.

**Responsibilities:**
- First-class `appBuilder` registry category + `componentSelections.appBuilder` round-trip
- Per-id integration deploy/redeploy/remove/rename (rename is display name only —
  `renameAppBuilderComponent` updates `appBuilderComponents[id].name`; the id/folder/ow.package
  are immutable; pre-built catalog entries keep their catalog names) from the dashboard
  integrations card grid (`IntegrationsBlock` → `integrations/IntegrationsGrid`, mesh as the
  first peer card via `deriveMeshCard`; detail + actions live in the card's detail drawer)
- Reuses (no fork): `withOrgContext` + `buildOrgTargetFromProjectAdobe`, `CommandExecutor`,
  `componentManager.installComponent`/`removeComponent`, `ensureAdobeIOAuth`,
  `detectProjectOrgMismatch`, the dashboard status channel. Only new abstraction is the shared
  `buildComponent` step (two callers, byte-identical).

**History:** slice 1 (2026-06) shipped a singular model (one app, `project.appState`, dashboard
`AppBuilderCard`, `DeployAppCommand`); ADR-011 D1–D3 replaced it with the keyed model and
deleted the singular surfaces. Deferred: package-binding, scaffolding, app-only projects,
multi-workspace.

**Path Alias**: `@/features/app-builder`

---

### authentication

**Purpose**: Adobe authentication, Console SDK integration, token management

**Key Services:**
- `AuthenticationService` - Adobe I/O authentication with SDK
- `createEntityServices` / `EntityServices` - Factory for org/project/workspace operations
- `AuthCacheManager` - Token and org/project caching with TTL
- `TokenManager` - Token validation and refresh
- `teardownConsoleProject` (`consoleProjectTeardown.ts` + `ioEventsClient.ts`) - Console-project delete: removes event registrations/3rd-party providers first (pre-empts the opaque 409), collect-don't-throw, org-gated

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
- `aiHandlers` - Handler map for the standalone AI surface, 7 handlers: verify-ai-setup (returns inventory), regenerate-ai-files, save-ai-prompt / delete-ai-prompt / list-ai-prompts (scope-routed by `pinned`: `pinned: true` prompts persist in globalState under `demoBuilder.ai.globalPrompts` and appear in every project; unpinned prompts persist in the current project's `.demo-builder.json` manifest; a pin toggle is a cross-scope move, and list returns the merged deduped list), openInClaude, copyAiPrompt (clipboard write for the kebab Copy prompt action)
- `AiCapabilitiesModal` / `AiSkillsList` - The dashboard's "View Skills" capability catalog (task-framed name + description) carrying the Regenerate AI files action; opened from a link beside the "AI Ready" health badge (NOT the badge itself)
- Dashboard state management
- Mesh status display

**Responsibilities:**
- Project control panel UI
- Start/Stop demo controls
- **Status placement rule** (documented in full at the top of `ui/components/ActionGrid.tsx`):
  environment health → the masthead band (`DashboardStatusHeader`: AI Ready, IMS Org);
  artifact state → the ActionGrid zone that owns the part, as a **remedy tile** (the button that
  fixes it, wearing an amber dot when due, tooltip explaining why): `Restart` in Primary,
  `Republish` in Storefront, plus the Integrations summary tile. The rule exists because the
  Frontend badge broke it — it sat in the band while its remedies sat in the grid, so it was the
  only status that named a problem and offered nothing. Note which tile takes the dot: Republish,
  not Sync Storefront, because Sync pushes storefront *code* and never clears
  `edsStorefrontStatusSummary`. **Every dotted tile goes through `DashboardTile`**, whose
  `status` prop carries the dot and its tooltip as one value — a dot with no explanation is
  not expressible. The integrations tile shipped one for months before that was enforced.
- Project configuration editing (Configure screen)
- AI health + capability (separate concerns): the passive "AI Ready" badge reflects AI-setup health (from `verify-ai-setup`); a distinct "View Skills" link opens the capability catalog (skills) and carries Regenerate AI files. A conditional Regenerate link appears beside the badge when health needs attention. MCP/session-MCP plumbing stays in the "Demo Builder: Diagnostics" command.

**Path Alias**: `@/features/dashboard`

### eds

**Purpose**: Edge Delivery Services integration with GitHub, DA.live, and Helix 5

**Key Services:**
- `GitHubTokenService`, `GitHubRepoOperations`, `GitHubFileOperations`, `GitHubOAuthService` - GitHub integration (extracted modules)
- `DaLiveAuthService`, `DaLiveContentOperations`, `DaLiveOrgOperations` - DA.live integration (extracted modules)
- `ConfigurationService` - AEM Configuration Service (site registration)
- `configServiceAccess` - the ADMIN-ROLE side of the Configuration Service: org roster read (`config/{org}.json`), site grant read/write (`config/{org}/sites/{site}/access/admin.json`), `probeConfigWriteAccess` (the 403→200 oracle), and the Code Sync setup deep link. Use `ensureSiteAdmin`/`revokeSiteAdmin` (read-merge-write); `grantSiteAdmin` is module-private BECAUSE it REPLACES the role list. `restoreSiteRoles` re-applies grants captured before a delete/re-register cycle; an edit refuses to save when the current list cannot be read, and reports masked `lostGrants` when they cannot be handed back
- `configAccessRecovery` - `announceConfigAccess` (telegraphs access to log AND wizard before the write that depends on it), `pinSiteAdmin`, and `waitForConfigAccess` (the post-bootstrap verification poll)
- `siteAccessManagerHeadless` - UI-free list/add/remove behind the Manage Site Access command; every mutation confirmed by a re-read
- `siteConfigRegistrar` - the 409/401/403 site-registration protocol, shared by the setup wizard, the reset path and the repair command
- `repairSiteConfigHeadless` - UI-free re-registration behind the Repair Site Configuration command; `verified` comes from a read-back, never from the write's status
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
- `stalenessDetector.ts` - Config staleness detection (function surface: `detectMeshChanges`, `updateMeshState`, `detectFrontendChanges`, …; the parallel service class was deleted 2026-08-23 — zero production callers)

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
- `aiContextWriter.ts` - Generates `AGENTS.md` at the project root with project-specific AI agent context; writes `CLAUDE.md` (root) and `.claude/CLAUDE.md` as one-line `see @AGENTS.md` pointers. The section content lives in `agentsMdSections.ts` — including the "Finding Adobe Documentation" section routing agents to Adobe's Wayfinder doc router, PINNED to a commit (`WAYFINDER_ROUTER_URL`) — never `@main`, since that line becomes part of the agent's instructions in a user's repo. Re-pinning is a bundle change: bump `AI_CONTEXT_VERSION`.
- `mcpConfigWriter.ts` - Generates `.claude/mcp.json`, `.mcp.json`, and `.claude/settings.json` (Cursor and Codex read `.mcp.json` natively — no per-tool config files)
- `skillsWriter.ts` - Writes thirteen always-on Demo-Builder skills to `.claude/skills/`: four lifecycle (add-component, sync-changes, update-credentials, create-eds-project) plus diagnose-demo (the only one that tells an agent how to LOOK rather than how to DO — routes a symptom to the check that answers it) plus six EDS site-scraping skills (scrape-reference-site, connect-authenticated-site, commerce-block-mapper, demo-data-injector, header-nav-footer, refine-visual-match) plus two block-library registration skills (register-custom-block, remove-custom-block); App Builder-adjacent projects (per `aiToolingGate`) also get extend-app-builder-app (the list_console_apis → add_console_apis loop) and the `commerce-extensibility-tools` integration-starter-kit bundle (`appbuilder-*` prefix, from the isolated tools dir); EDS projects additionally copy the AEM skill bundle declared via `aiSkillBundle`
- `generateAIContextFiles` (in `aiBundleService.ts`; tier functions `refreshMcpConfigs`/`refreshContextAndSkills` beside it) - Orchestrates all three AI writers (each through the ADR-013 `generatedFileWriter` hash-and-skip seam) as project finalization phase 6; `aiBundleActivationRefresh.ts` silently repairs/refreshes stale bundles at activation
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
- `AiZone` - AI icon pair (Chat + Prompts), globally available
- `UtilityBar` - Four-icon utility row (Tools, Help, Settings, Logs)

**Responsibilities:**
- Single rendered layout across all three context types (`projects`, `projectsList`, `project`): centered AiZone + UtilityBar group
- AI access (Chat + Prompts) globally — MCP is wired at the extension level, not per project
- Wizard and Configure screens are NOT sidebar contexts — they own their own surfaces (TimelineNav in the wizard webview, Cancel footer in the Configure webview)

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

For core infrastructure, see `../core/CLAUDE.md`
For overall architecture, see `../CLAUDE.md`
