# Changelog

All notable changes to the Adobe Demo Builder VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-beta.109] - 2026-04-13

### Fixed
- **Config Service lookup key**: `buildSiteConfigParams` now uses DA.live org/site as the Configuration Service lookup key instead of GitHub repo identifiers. The da.live editor resolves preview URLs from the DA.live site path; using GitHub identifiers caused "invalid fstab" errors when the site name differed from the repo name.
- **fstab input validation**: `generateFstabContent` validates `daLiveOrg` and `daLiveSite` for characters unsafe in URL path segments (newlines, whitespace, colons) before constructing the mountpoint URL.
- **EDS Reset bounded loop**: Replaced `while(true)` with `while(pipelineAttempt <= MAX_REAUTH_ATTEMPTS)` to make the DA.live re-auth retry bound explicit.

### Security
- **SSRF protection in useAutoStoreDetect**: URL protocol is validated to `http:` or `https:` before forwarding `baseUrl` to store discovery, preventing Server-Side Request Forgery via `file://`, `ftp://`, or other non-HTTP schemes in component config fields.
- **SSRF protection in extractResetParams**: `repoOwner`, `repoName`, `daLiveOrg`, and `daLiveSite` are validated against the slug allowlist (`^[a-zA-Z0-9_-]+$`) before they reach Helix Admin API and DA.live URL construction. Invalid slugs return `CONFIG_INVALID` without making any outbound request.

### Refactored
- **EDS Reset static imports**: Removed all 24 dynamic `await import()` calls in `edsResetService.ts`, replacing them with static top-level imports for tree-shaking and load-time consistency.
- **EDS Reset helper extraction**: Decomposed oversized functions in `edsResetService.ts` into focused private helpers: `reinstallBlockLibraries`, `collectLibrarySources`, `installWithBlockLibraries`, `installInspectorOnly`, `publishConfigAndRegisterSite`, `handlePipelineAuthRetry`, `runContentPipeline`, `finalizeReset`, and `assertValidGitHubSlug`.
- **EDS Reset mesh helpers extracted**: `redeployApiMesh` and `deployMeshAndPersist` moved to `edsResetMeshHelper.ts`, keeping `edsResetService.ts` within a manageable size and isolating the Adobe I/O auth re-validation logic.
- **EDS Reset params extracted**: `EdsResetParams`, `EdsResetProgress`, `EdsResetResult`, `ExtractParamsResult`, `assertValidGitHubSlug`, and `extractResetParams` moved to `edsResetParams.ts`. Re-exported from `edsResetService.ts` for backward compatibility.
- **EDS Reset repo helpers extracted**: `resetRepoToTemplate`, `reinstallBlockLibraries`, `collectLibrarySources`, `installWithBlockLibraries`, `installInspectorOnly`, and `fetchPlaceholderFiles` moved to `edsResetRepoHelper.ts`. Brings `edsResetService.ts` to ~330 lines.
- **`mapPipelineProgress` extracted**: Inline progress-mapping callback in `runContentPipeline` extracted to a named function.
- **`handleResetError` extracted**: Catch block in `executeEdsReset` extracted to a named function, trimming the function under 50 lines.
- **ArchitectureModal Extraction**: Extracted step content into `ArchitectureStepContent` and `BlockLibrariesStepContent` sub-components. Extracted modal state management into `useModalState` hook. Generalized step navigation from hardcoded 2-step to computed N-step sequence.
- **useComponentConfig Narrow Interface**: Replaced `WizardState` dependency with specific props (`selectedStack`, `componentConfigs`, `packageConfigDefaults`), making the hook reusable outside the wizard context.
- **Prop Grouping**: Grouped related props into domain-specific objects (ArchitectureStepContent) to reduce prop drilling.
- **BlockLibrariesStepContent prop rename**: Event handler props renamed from `handle*` to `on*` convention (`onBlockLibraryToggle`, `onCustomLibraryToggle`, `onOpenCustomSettings`).

### Added
- **storeFieldHelpers**: Shared helpers (`isWebsiteCodeField`, `isStoreCodeField`, `CONNECTION_FIELDS`, `STORE_GROUP_IDS`) for routing store config field rendering across components.
- **useAutoStoreDetect**: Hook that watches connection fields and triggers store discovery automatically when all required fields are filled.
- **`storeDiscoveryData` on `WizardState`**: New optional field (`storeDiscoveryData?: CommerceStoreStructure`) persists the discovered store structure (websites, store groups, store views) across wizard steps.
- **`currentComponentConfigs` on `SharedState`**: New optional field (`currentComponentConfigs?: ComponentConfigs`) syncs user-entered component config values from the webview to the extension host, enabling credential access during store discovery without re-passing them in each postMessage payload.
- **Customer Group removed from `optionalEnvVars`**: Removed `ACCS_CUSTOMER_GROUP` and `ADOBE_COMMERCE_CUSTOMER_GROUP` from component service group `optionalEnvVars` lists. The storefront auth dropin manages customer group headers at runtime.

### Changed
- **Connect Commerce wizard step**: Replaces "Settings Collection" with a simplified single-column layout and progressive disclosure. Repositioned after Adobe auth steps so Commerce connection happens right after workspace selection. Shows for all flows (no longer conditional on `showWhenNoStack`).

## [1.0.0-beta.108] - 2026-03-25

### Changed
- **AEM Assets Enabled by Default**: EDS storefronts now default to AEM Assets enabled (`commerce-assets-enabled: true`). All demo backends have AEM Assets integration configured; users can disable in Configure if needed.
- **Customer Group Field**: Removed auto-populated default hash from `ACCS_CUSTOMER_GROUP` and `ADOBE_COMMERCE_CUSTOMER_GROUP`. The storefront auth dropin handles customer group headers automatically at runtime. Field remains optional for B2B Shared Catalog edge cases.

### Added
- **Multi-Site Research Documentation**: Comprehensive design research for multi-site storefront feature including repoless architecture, Commerce store structure discovery, per-site configuration, and content data management (`docs/research/`).

## [1.0.0-beta.107] - 2026-03-24

### Added
- **Optional API Mesh**: API Mesh is now optional and driven by demo package configuration. Each package declares `requiresMesh` (true/false/'optional'). Storefronts can override at the storefront level.
- **Mesh Toggle in Architecture Modal**: Custom projects show an "Include API Mesh" toggle. Curated packages respect their definition without user choice.
- **Conditional Wizard Steps**: Adobe Auth, I/O Project, and Workspace steps are hidden when no mesh is selected. Timeline updates live as the user toggles mesh.
- **Merged Config Generator**: `mergeComponentConfigs()` replaces component-specific lookups. The config generator no longer knows which component owns which env var.
- **Tests for Mesh Resolution**: 8 tests for `getResolvedMeshRequirement`, 8 tests for `mergeComponentConfigs`.

### Changed
- **Progress Step Refactoring**: Deployment phases split from 5 → 7 (repository, storefront-code, code-sync, site-config, content, block-library, publish). Reset steps expanded from 6-7 → 11-12.
- **Wizard Step Rename**: "Deploy Mesh" → "Create Project" throughout the wizard.
- **Review Step Layout**: Project Configuration spans full width when no Adobe I/O section.
- **Storefront Setup Payload**: Now includes explicit `dependencies` field for mesh-aware auth decisions.

### Fixed
- **Inspector Tagging**: Fixed `SDK_CONFIG is not defined` — was referencing wrong constant (`SDK_SOURCE`).
- **Block Doc Page 404s**: Downgraded from warning to debug level (expected for blocks without CDN doc pages).
- **ConfigService 409**: Logged at info level instead of error (handled scenario: delete + re-create).
- **Phase 5 Config Sync**: Removed `meshState.endpoint` guard that blocked config.json push for meshless projects.
- **Review Step Continue**: Adobe I/O selections only required when mesh is in dependencies.
- **BrandGallery Truthy Bug**: `pkg.requiresMesh` used strict `=== true` instead of truthy check that matched `'optional'`.
- **Stack Change Propagation**: `handleStackSelect` now propagates optional deps immediately for live timeline updates.

## [1.0.0-beta.106] - 2026-03-18

### Added
- **Custom Block Library Docs**: Documentation for creating standalone block libraries compatible with the Demo Builder (`docs/systems/custom-block-libraries.md`)

### Fixed
- **Folder Mapping Re-Auth**: 401 responses from the Configuration Service now throw `DaLiveAuthError`, triggering the existing mid-pipeline re-auth prompt instead of silently skipping folder mapping. Non-auth failures are logged at error level with a visible UI warning about product detail page impact.
- **CLI Warning Stripping**: `aio` CLI upgrade warnings mixed into stdout no longer break JSON parsing. Uses JSON-character filtering to keep only parsable content, with stderr fallback for CLI versions that write JSON to stderr.
- **Org Mismatch Detection**: When the CLI org context doesn't match the authenticated org (causing 403 on project listing), the error message now tells the user to run `aio console org select` instead of showing the generic "Failed to load projects."
- **Case-Insensitive Org Matching**: Organization name resolution now uses case-insensitive, whitespace-trimmed matching with ID fallback, preventing silent fallback to a broken org context.
- **Inspector SDK Lint Errors**: Vendored `scripts/demo-inspector-sdk/` files are now added to `.eslintignore` during storefront setup, preventing GitHub Actions build failures.
- **Custom Block Library Settings Sync**: Adding a custom block library via VS Code settings while the Architecture Modal is open now immediately shows the new library without needing to close and re-open the modal.

## [1.0.0-beta.100] - 2025-03-13

### Added
- **Upstream Sync System**: Detect and sync forked source repos with their upstream via GitHub merge-upstream API
- **Add-on Update Detection**: Block library and Demo Inspector SDK commit-SHA comparison against source HEAD
- **B2B Feature Packs**: Bundle blocks, config flags, initializers, and dependencies into installable feature packs
- **B2B Commerce Demo Package**: New B2B demo package with addon and config flag injection
- **Isle5 Demo Package**: Branded demo package with native block library
- **Demo Inspector SDK Vendoring**: Vendor SDK files and tagging script into storefront at project creation
- **Block Library Selection UX**: Multi-step architecture modal for selecting block libraries during project creation
- **Global Block Library Selection**: Dynamic block discovery with settings-based custom library support
- **Config-Driven Block Collections**: Block collection source and handler extraction driven by configuration
- **DA.live Bookmarklet Setup**: New command for DA.live bookmarklet setup with extracted `openUrl` utility
- **Content Patches**: ACCS content patch to replace Orchard7 with Orchard1-1 on index page
- **Auth Route Stub Pages**: Create stub pages for auth routes missing from source content
- **Column-Based Brand Tiles**: Column layout with compact expansion and settings sync for brand selection

### Changed
- **Block Library Sources**: Switched Isle5 source from fork to upstream repo; renamed library IDs for clarity
- **Authentication Performance**: Update `console.where` cache instead of clearing after entity selection
- **Projects Dashboard**: Sort projects alphabetically for deterministic grid ordering
- **Update Pipeline**: Shared `githubApiClient` module centralizes GitHub API calls across all update services
- **Update Pipeline**: Removed dead code and simplified update service internals

### Fixed
- **EDS Content Copy**: Filter CDN doc page copy to installed blocks only; fall back to CDN index when DA.live list API returns 0 files
- **EDS Content Enumeration**: Enumerate content via DA.live list API to include nav/footer fragments
- **EDS Block Installation**: Preserve template blocks during block library installation; merge component-models.json and component-filters.json
- **EDS Block Deduplication**: Deduplicate blocks across multiple block libraries
- **EDS Rate Limits**: Batch preview DELETEs and handle 429 rate limits from Helix Admin API
- **EDS Auth Recovery**: Add DA.live re-auth recovery to EDS reset pipeline and DaLiveAuthError recovery to phases 2-3
- **EDS DA.live Token**: Use DA.live token for all DA.live API calls in content setup
- **EDS Helix DELETE**: Use DA.live Bearer token for DELETE operations to bypass "source exists" restriction
- **EDS Patch Fetches**: Deduplicate concurrent external patch fetches
- **EDS Navigation**: Patch nav registration link to match create-account path
- **EDS DA.live Org**: Sync DA.live default org into input field on async arrival
- **EDS Block Doc Pages**: Add section wrapper to block doc pages and always overwrite; copy pages from content sources for Custom projects
- **EDS CDN Probe**: Probe customer auth pages in CDN fallback content copy
- **EDS Mid-Pipeline Auth**: Add mid-pipeline auth guard for mesh redeployment and fix config service registration
- **Updates**: Decouple npm install from buildScript gate and check extraction exit code
- **Updates**: Add repoUrl fallback for components not in components.json
- **Brand Tiles**: Preserve JSON config order for brand tiles instead of alphabetical sort
- **B2B**: Rename B2B brand card to "B2B Boilerplate"

### Security
- **Helix API Keys**: Migrate from globalState to SecretStorage

### Refactored
- **Authentication**: Decompose entity services, simplify perf tracking, consolidate DaLiveAuth; consolidate auth guards and remove dead code
- **EDS**: Remove bulk unpublish dead code and simplify to page-by-page DELETE; remove unused selectedAddons parameter
- **Inspector**: Remove git submodule infrastructure (dead code after inspector removal); remove demo inspector from extension and clean up stale docs
- **ESLint**: Resolve all ESLint errors and warnings across codebase

### Performance
- **EDS Unpublish**: Batch Helix live partition unpublish with concurrency 5

### Fixed (Prior Unreleased)
- **Prerequisites Node.js Installation**: Fixed fnm list ENOENT errors by adding shell context to all fnm list commands
- **Prerequisites UI**: Added milestone substep display showing "(Step X of Y)" for multi-step operations with progress milestones
- **Authentication Flow**: Fixed fnm ENOENT errors during environment setup when VS Code launched from Dock (non-terminal launch)
- **Adobe CLI Commands**: Fixed all aio commands (auth, config, org/project selection, mesh deployment) failing with ENOENT when VS Code launched from Dock

## [1.3.0] - 2025-01-10

### Added
- **Enhanced Debugging System**: 
  - New diagnostics command (`Demo Builder: Diagnostics`) for comprehensive system analysis
  - Dual output channel architecture: "Demo Builder: Logs" for user messages, "Demo Builder: Debug" for detailed diagnostics
  - Command execution logging with stdout, stderr, exit codes, and timing information
  - Environment variable and PATH logging for troubleshooting platform-specific issues
  - Export debug log capability for sharing diagnostic reports
- **Adobe Authentication Debugging**:
  - Detailed logging of `aio config` commands and responses
  - Token expiry parsing with step-by-step debugging
  - Browser launch command tracing with environment context

### Changed
- **Adobe Setup UX Improvements**:
  - Workspace selection now auto-advances to next step (consistent with project selection behavior)
  - Authentication success message always displays for 2 seconds on initial load
  - Removed redundant "Loading your projects..." text from authentication success screen
  - Redesigned "Ready to proceed" section to match UI consistency (removed green background)
- **Unified Logging System**:
  - Consolidated from 4 output channels to 2 clean channels
  - Logger class now wraps DebugLogger for backward compatibility
  - ErrorLogger uses unified DebugLogger while maintaining status bar features
  - viewStatus command uses main logger instead of creating separate channel

### Fixed
- **Adobe Setup Flow Issues**:
  - Fixed inconsistent auto-advance behavior between project and workspace selection
  - Fixed authentication success message not showing when already authenticated on initial load
  - Eliminated double-loader display after authentication success
  - Fixed "Ready to proceed" styling to be consistent with rest of UI
- **Logging System Issues**:
  - Eliminated duplicate "Demo Builder" output channels
  - Fixed ErrorLogger creating redundant output channel
  - Resolved Logger class initialization issues

## [1.2.0] - 2025-01-09

### Added
- **Unified Progress Tracking System**: Real-time progress bars during prerequisite installation with different strategies:
  - Exact progress parsing for fnm (shows actual download percentages)
  - Milestone-based progress for brew and npm installations
  - Synthetic time-based progress for operations without output
  - Immediate completion for fast operations
- **Comprehensive Documentation System**: 
  - Created detailed prerequisites system documentation (`docs/systems/prerequisites-system.md`)
  - Added documentation index (`docs/README.md`) for better navigation
  - Organized docs into architecture/, systems/, development/ directories
- **Build Automation**: 
  - Added `postinstall` script for automatic compilation after `npm install`
  - New `npm run setup` command combining install and compile steps
  - Ensures consistent builds across different development environments
- **Centralized CSS System**: Created `custom-spectrum.css` with 850+ lines of reusable CSS classes for React Spectrum components
- **Class Name Utilities**: Added `classNames.ts` utility module with `cn()` function for composing CSS classes
- **Per-Node-Version Prerequisites**: Support for installing prerequisites in specific Node.js versions
- **Prerequisite Continuation**: Ability to continue prerequisite checking from a specific index after installation
- **Version-to-Component Mapping**: Shows which components require which Node.js versions during prerequisite checking
- **Enhanced Sub-Prerequisites Display**: Sub-prerequisites (plugins) now only appear when actively checking or completed
- **Graph-Based Dependency Architecture**: Documented future architecture for flexible entity relationships (see `docs/architecture/graph-based-dependencies.md`)

### Changed
- **Complete Style Migration**: Migrated all 118+ inline `UNSAFE_style` declarations to `UNSAFE_className` with CSS classes
- **Prerequisite Status Messages**: Changed initial status from "Checking version..." to "Waiting..." for unchecked prerequisites
- **Sub-Prerequisites UI**: Removed bullet points from sub-prerequisites, maintaining indentation for hierarchy
- **Improved Scrolling**: Better auto-scroll behavior during prerequisite checking with proper alignment
- **Prerequisites JSON Structure**: Enhanced with `perNodeVersion`, `plugins`, and component requirements support
- **Documentation Structure**: Reorganized all documentation for better discoverability and maintenance

### Fixed
- **Progress Bar Display**: Fixed unified progress data not being passed to UI state, preventing progress bars from showing
- **Prerequisite Check Flow**: Fixed issue where Git prerequisite showed "Checking version" while waiting
- **Plugin Display Logic**: Fixed premature display of "not installed" status for unchecked plugins
- **Scroll Positioning**: Fixed last prerequisite item visibility during checking
- **fnm Shell Configuration**: Automatically configures shell profile after fnm installation (adds to .zshrc/.bashrc)
- **Cross-System Consistency**: Fixed issues where extension wouldn't work on different systems due to missing build artifacts

### Technical Improvements
- **Maintainability**: All styles now centralized in CSS files rather than scattered inline styles
- **Performance**: CSS classes cached by browser, reducing re-render overhead
- **Type Safety**: Added TypeScript interfaces for prerequisite plugins and enhanced checking
- **Code Organization**: Created dedicated utilities directory for shared functions

## [1.0.0] - Previous Release

Initial release of Adobe Demo Builder VS Code Extension.