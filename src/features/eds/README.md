# EDS (Edge Delivery Services) Feature

## Overview

The EDS feature provides complete integration with Adobe Edge Delivery Services, enabling users to create and manage EDS projects with GitHub repositories, DA.live content, and Helix 5 configuration.

## Architecture

```
src/features/eds/
├── services/
│   ├── githubService.ts      # GitHub OAuth, token management, repo operations
│   ├── daLiveService.ts      # DA.live content management
│   ├── edsProjectService.ts  # Project setup orchestration
│   ├── toolManager.ts        # Commerce demo ingestion tool management
│   ├── errorFormatters.ts    # User-friendly error message formatting
│   └── types.ts              # TypeScript type definitions
├── ui/
│   ├── steps/                # Wizard step components
│   │   ├── DataSourceConfigStep.tsx
│   │   └── GitHubDaLiveSetupStep.tsx
│   └── hooks/
│       └── useGitHubAuth.ts  # GitHub authentication hook
├── handlers/
│   ├── index.ts              # Handler exports
│   └── edsHandlers.ts        # Message handlers for wizard operations
└── index.ts                  # Public API exports
```

## Key Services

### EdsProjectService

Orchestrates complete EDS project setup through these phases:

| Phase | Progress | Operations |
|-------|----------|------------|
| `github-repo` | 0-15% | Create GitHub repository from CitiSignal template |
| `github-clone` | 15-25% | Clone repository to local path |
| `helix-config` | 25-40% | Configure Helix 5 via Configuration Service API |
| `code-sync` | 40-55% | Verify Code Bus synchronization |
| `dalive-content` | 55-70% | Copy CitiSignal content to DA.live |
| `tools-clone` | 70-85% | Clone commerce-demo-ingestion tool |
| `env-config` | 85-95% | Generate .env file with configuration |
| `complete` | 100% | Setup complete |

### GitHubService

Handles GitHub OAuth authentication and repository operations:

- OAuth popup flow with CSRF protection
- Token storage via VS Code SecretStorage
- Repository creation from templates
- File operations (read, write, commit)
- Rate limiting and error handling

### DaLiveService

Manages DA.live content operations:

- IMS token integration via AuthenticationService
- Organization access verification
- Directory listing and content copy
- CitiSignal content workflow with progress tracking

### Error Formatters

Transform technical errors into user-friendly messages:

```typescript
import { formatGitHubError, formatDaLiveError, formatHelixError } from '@/features/eds';

// Example usage
try {
    await githubService.createFromTemplate(...);
} catch (error) {
    const edsError = formatGitHubError(error);
    // edsError.userMessage: "A repository with this name already exists..."
    // edsError.recoveryHint: "Go back and enter a different project name..."
}
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

The `EdsPartialState` interface tracks setup progress for recovery:

```typescript
interface EdsPartialState {
    repoCreated?: boolean;    // GitHub repo was created
    repoUrl?: string;         // URL for cleanup if needed
    contentCopied?: boolean;  // DA.live content was copied
    failedFiles?: string[];   // Files that failed to copy
    phase: EdsSetupPhase;     // Current/failed phase
}
```

## Usage

### Basic Project Setup

```typescript
import { EdsProjectService } from '@/features/eds';

const service = new EdsProjectService(
    githubService,
    daLiveService,
    authService,
    componentManager
);

const result = await service.setupProject({
    projectName: 'My EDS Site',
    projectPath: '/path/to/project',
    repoName: 'my-eds-site',
    daLiveOrg: 'my-org',
    daLiveSite: 'my-site',
    accsEndpoint: 'https://commerce.example.com/graphql',
    githubOwner: 'username',
}, (phase, progress, message) => {
    console.log(`${phase}: ${progress}% - ${message}`);
});

if (result.success) {
    console.log(`Preview: ${result.previewUrl}`);
    console.log(`Live: ${result.liveUrl}`);
}
```

### Error Handling

```typescript
const result = await service.setupProject(config, progressCallback);

if (!result.success) {
    // Result includes partial state info for recovery
    console.log(`Failed at phase: ${result.phase}`);
    console.log(`Repo URL (for cleanup): ${result.repoUrl}`);
    console.log(`Error: ${result.error}`);
}
```

## Testing

Tests are organized as:

- **Unit tests**: `tests/unit/features/eds/services/`
- **Integration tests**: `tests/integration/features/eds/`

Run EDS tests:

```bash
npm test -- tests/unit/features/eds/
npm test -- tests/integration/features/eds/
```

## Dependencies

- `@octokit/core` - GitHub API client
- `@octokit/plugin-retry` - Retry logic for API calls
- VS Code SecretStorage - Secure token storage
- AuthenticationService - IMS token management
- ComponentManager - Tool installation

## Configuration

The feature uses these timeouts (configurable in `timeoutConfig.ts`):

| Timeout | Default | Description |
|---------|---------|-------------|
| `EDS_HELIX_CONFIG` | 30s | Helix configuration API timeout |
| `EDS_CODE_SYNC_POLL` | 5s | Code sync polling interval |
| `EDS_CODE_SYNC_TOTAL` | 125s | Total code sync timeout |
| `DA_LIVE_API` | 30s | DA.live API timeout |
