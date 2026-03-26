# EDS (Edge Delivery Services) Feature

## Overview

The EDS feature provides complete integration with Adobe Edge Delivery Services, enabling users to create and manage EDS projects with GitHub repositories, DA.live content, and Helix 5 configuration.

## Architecture

```
src/features/eds/
├── services/
│   ├── githubTokenService.ts       # GitHub token management via SecretStorage
│   ├── githubRepoOperations.ts     # Repository CRUD (create from template, delete)
│   ├── githubFileOperations.ts     # File read/write/commit via GitHub API
│   ├── githubOAuthService.ts       # GitHub OAuth popup flow with CSRF protection
│   ├── githubAppService.ts         # AEM Code Sync GitHub App installation check
│   ├── githubHelpers.ts            # Shared GitHub utilities
│   ├── daLiveAuthService.ts        # DA.live IMS authentication
│   ├── daLiveContentOperations.ts  # DA.live content copy with progress
│   ├── daLiveOrgOperations.ts      # DA.live org access verification
│   ├── daLiveConfigService.ts      # DA.live config/permissions spreadsheets
│   ├── daLiveOrgConfigService.ts   # DA.live org-level configuration
│   ├── daLiveConstants.ts          # DA.live shared constants
│   ├── daLiveMimeTypes.ts          # MIME type mapping for DA.live uploads
│   ├── daLiveSpreadsheetUtils.ts   # Spreadsheet parsing utilities
│   ├── helixService.ts             # Helix Admin API (preview/publish/unpublish, API key management)
│   ├── inspectorHelpers.ts         # Demo Inspector SDK vendoring and tagging
│   ├── configurationService.ts     # AEM Configuration Service (site registration)
│   ├── configGenerator.ts          # config.json generation for storefronts
│   ├── configSyncService.ts        # Config.json sync between DA.live and repo
│   ├── commerceStoreDiscovery.ts   # Commerce REST API store hierarchy discovery (PaaS + ACCS)
│   ├── cleanupService.ts           # External resource cleanup on project deletion
│   ├── resourceCleanupHelpers.ts   # Shared cleanup helper functions
│   ├── toolManager.ts              # Commerce demo ingestion tool management
│   ├── contentPatchRegistry.ts     # Content patch definitions for demo customization
│   ├── blockCollectionHelpers.ts   # Block collection installation from source repo with version tracking
│   ├── edsResetService.ts          # Core reset logic (template reset, code sync)
│   ├── edsResetUI.ts               # Reset UI orchestration (auth, progress, notifications)
│   ├── edsPipeline.ts              # EDS setup pipeline orchestration
│   ├── featurePackInstaller.ts     # Feature pack artifact installation
│   ├── fstabGenerator.ts           # fstab.yaml generation
│   ├── storefrontRepublishService.ts # Storefront config republish
│   ├── storefrontStalenessDetector.ts # Config.json staleness detection
│   ├── errorFormatters.ts          # User-friendly error message formatting
│   ├── codeSyncErrors.ts           # Code sync error hierarchy
│   └── types.ts                    # TypeScript type definitions
├── commands/
│   ├── cleanupDaLiveSites.ts      # DA.live site cleanup command
│   └── manageGitHubRepos.ts       # GitHub repo management command
├── config/
│   ├── config-template.json       # EDS config.json template
│   └── content-patches.json       # Content patch definitions
├── utils/
│   └── daLiveTokenBookmarklet.ts  # DA.live token bookmarklet generator
├── ui/
│   ├── components/
│   │   ├── DaLiveOrgConfigSection.tsx   # DA.live org configuration
│   │   ├── DaLiveServiceCard.tsx        # DA.live service card
│   │   ├── GitHubAppInstallDialog.tsx   # GitHub App install dialog
│   │   ├── GitHubServiceCard.tsx        # GitHub service card
│   │   ├── VerifiedField.tsx            # Verified field indicator
│   │   └── index.ts                     # Component exports
│   ├── helpers/
│   │   ├── bookmarkletSetupPage.ts  # Bookmarklet setup HTML
│   │   └── validationHelpers.ts     # Form validation helpers
│   ├── hooks/
│   │   ├── useGitHubAuth.ts         # GitHub authentication hook
│   │   └── useDaLiveAuth.ts         # DA.live authentication hook
│   ├── steps/
│   │   ├── ConnectServicesStep.tsx      # GitHub + DA.live auth connection
│   │   ├── GitHubRepoSelectionStep.tsx  # Repository selection/creation
│   │   ├── GitHubSetupStep.tsx          # GitHub configuration
│   │   ├── DaLiveSetupStep.tsx          # DA.live site configuration
│   │   ├── DataSourceConfigStep.tsx     # Commerce data source config
│   │   └── StorefrontSetupStep.tsx      # Storefront setup execution
│   └── styles/
│       ├── connect-services.css     # Connect services step styles
│       └── eds-steps.css            # EDS step shared styles
├── handlers/
│   ├── index.ts                     # Handler exports
│   ├── edsHandlers.ts              # Core EDS message handlers
│   ├── edsGitHubHandlers.ts        # GitHub-specific handlers
│   ├── edsDaLiveHandlers.ts        # DA.live content handlers
│   ├── edsDaLiveAuthHandlers.ts    # DA.live auth handlers
│   ├── edsDaLiveOrgHandlers.ts     # DA.live org handlers
│   ├── edsDaLiveOrgConfigHandlers.ts # DA.live org config handlers
│   ├── storefrontSetupHandlers.ts  # Storefront setup orchestration + cleanup
│   ├── storefrontSetupPhases.ts    # Storefront setup phase executors
│   ├── edsHelpers.ts               # Shared handler utilities (ensureDaLiveAuth, service cache)
│   └── cleanupDaLiveSitesHandler.ts # DA.live site cleanup handler
└── index.ts                         # Public API exports
```

## Key Services

### Storefront Setup (storefrontSetupHandlers + storefrontSetupPhases)

Orchestrates complete EDS project setup through phases:

| Phase | Progress | Operations |
|-------|----------|------------|
| `repository` | 0-15% | Create/configure GitHub repository from template |
| `storefront-code` | 15-35% | Push fstab.yaml, install block libraries (built-in + custom) with inspector tagging, install feature packs |
| `code-sync` | 35-42% | Verify code synchronization, publish code to CDN |
| `site-config` | 42-49% | Configure DA.live permissions, register with Configuration Service, set folder mapping |
| `content` | 49-58% | Clear existing DA.live content, copy demo content from source |
| `block-library` | 58-65% | Create block library in DA.live, apply EDS settings |
| `publish` | 65-95% | Purge CDN cache, publish content and block library to CDN |
| `auth-recovery` | (paused) | DA.live token expired; prompts re-authentication (up to 2 attempts) |
| `complete` | 100% | Setup complete |

#### Mid-Pipeline Token Recovery

If the DA.live token expires during content pipeline execution (phases 4-5), the pipeline catches `DaLiveAuthError` and pauses to prompt re-authentication via `ensureDaLiveAuth()`. Up to 2 re-auth attempts are allowed before failing. The UI receives an `auth-recovery` phase progress message during re-authentication.

### GitHub Services (extracted modules)

- **GitHubTokenService** - Token storage via VS Code SecretStorage
- **GitHubRepoOperations** - Repository creation from templates, deletion
- **GitHubFileOperations** - File read/write/commit via GitHub API
- **GitHubOAuthService** - OAuth popup flow with CSRF protection
- **GitHubAppService** - AEM Code Sync app installation verification

### DA.live Services (extracted modules)

- **DaLiveAuthService** - IMS token management for DA.live
- **DaLiveContentOperations** - Content copy with progress tracking
- **DaLiveOrgOperations** - Organization access verification
- **DaLiveConfigService** - Config/permissions spreadsheet management

### EDS Reset (edsResetService + edsResetUI)

- **edsResetService** - Core reset logic: template reset, block library reinstallation (built-in + custom), inspector tagging, code sync, config service update, mesh redeploy
- **edsResetUI** - UI orchestration: auth checks, progress notifications, confirmation dialogs

### Commerce Store Discovery (commerceStoreDiscovery)

Fetches store hierarchy (websites, store groups, store views) from the Commerce REST API:

- **discoverStoreStructure** — Orchestrator: dispatches to PaaS or ACCS auth path
- **getAdminToken** — PaaS admin token via `POST /rest/V1/integration/admin/token`
- **fetchStoreStructurePaas** — PaaS store hierarchy (Bearer token auth)
- **fetchStoreStructureAccs** — ACCS store hierarchy (IMS OAuth + x-api-key auth)
- **extractTenantId** — Extract tenant ID from ACCS GraphQL endpoint URL

### Error Formatters

Transform technical errors into user-friendly messages:

```typescript
import { formatGitHubError, formatDaLiveError, formatHelixError } from '@/features/eds';
```

## Error Codes

### GitHub Errors

| Code | Description | User Message Pattern |
|------|-------------|---------------------|
| `OAUTH_CANCELLED` | User cancelled OAuth flow | "sign in was cancelled" |
| `REPO_EXISTS` | Repository name conflict | "already exists...different name" |
| `AUTH_EXPIRED` | Token expired mid-flow | "session expired...sign in again" |
| `RATE_LIMITED` | GitHub API rate limit | "too many requests...few minutes" |
| `NETWORK_ERROR` | Connection issues | "could not connect" |

### DA.live Errors

| Code | Description | User Message Pattern |
|------|-------------|---------------------|
| `ACCESS_DENIED` | Organization access denied | "do not have permission" |
| `NETWORK_ERROR` | Connection/timeout issues | "connection timed out" |
| `NOT_FOUND` | Content not found | "could not be found" |

### Helix Errors

| Code | Description | User Message Pattern |
|------|-------------|---------------------|
| `SERVICE_UNAVAILABLE` | Helix service down | "temporarily unavailable" |
| `SYNC_TIMEOUT` | Code sync taking too long | "longer than expected" |
| `CONFIG_FAILED` | Configuration failed | "server encountered an error" |

## Partial State Tracking

The `StorefrontSetupPartialState` interface tracks setup progress for cleanup on cancel:

```typescript
interface StorefrontSetupPartialState {
    repoCreated: boolean;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    contentCopied: boolean;
    phase: string;
}
```

## Testing

Tests are located at `tests/features/eds/`:

```bash
npm test -- tests/features/eds/
```

## Dependencies

- `@octokit/core` - GitHub API client
- `@octokit/plugin-retry` - Retry logic for API calls
- VS Code SecretStorage - Secure token storage
- AuthenticationService - IMS token management

## Configuration

The feature uses timeouts from `@/core/utils/timeoutConfig`:

| Timeout | Default | Description |
|---------|---------|-------------|
| `EDS_HELIX_CONFIG` | 30s | Helix configuration API timeout |
| `EDS_CODE_SYNC_POLL` | 5s | Code sync polling interval |
| `EDS_CODE_SYNC_TOTAL` | 125s | Total code sync timeout |
| `DA_LIVE_API` | 30s | DA.live API timeout |
