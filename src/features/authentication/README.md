# Authentication Feature

## Purpose

The Authentication feature handles all aspects of Adobe identity management, authentication, and organizational context within the extension. It provides both browser-based authentication flows and SDK-accelerated operations for optimal performance. This feature ensures secure, cached, and validated access to Adobe I/O services while maintaining organizational and project context throughout the extension lifecycle.

The feature leverages the Adobe Console SDK to achieve 30x faster operations compared to pure CLI approaches, with intelligent fallback mechanisms for resilience.

## Responsibilities

- **Adobe I/O Authentication**: Browser-based login flow with token management
- **Token Validation**: Quick authentication checks (<1s) vs full validation (3-10s)
- **Adobe Console SDK Integration**: High-performance API operations with automatic fallback to CLI
- **Organization Targeting**: Listing organizations and targeting one per invocation via env-scoped context (no global `aio console` mutation)
- **Project Management**: Fetching Adobe Developer Console projects
- **Workspace Management**: Fetching workspaces
- **Caching Strategy**: Multi-layer caching with TTL and security jitter for optimal performance
- **Pre-flight Checks**: Authentication verification before expensive Adobe I/O operations
- **Performance Tracking**: Operation timing and optimization metrics

## Key Services

### AuthenticationService

**Purpose**: Main orchestration service for all authentication operations

**Key Methods**:
- `isAuthenticated()` - Token-only check (2-3s, no org validation, no SDK initialization)
- `isFullyAuthenticated()` - Full authentication check with org validation and SDK initialization (3-10s)
- `login(force?: boolean)` - Browser-based authentication flow with automatic retry
- `logout()` - Sign out and clear all caches
- `getOrganizations()` - Fetch available Adobe organizations
- `getProjects()` - Fetch projects in current organization
- `getWorkspaces()` - Fetch workspaces in current project
- `getCurrentOrganization()` - Get currently targeted organization
- `getCurrentProject()` - Get currently targeted project
- `getCurrentWorkspace()` - Get currently targeted workspace
- `getTokenManager()` - Get TokenManager instance for token inspection operations
- `getWorkspaceCredential()` - Get existing OAuth S2S credential from current workspace
- `createWorkspaceCredential(name, description)` - Create OAuth S2S credential on current workspace

**Example Usage**:
```typescript
import { AuthenticationService } from '@/features/authentication';

const authService = new AuthenticationService(
    extensionPath,
    logger,
    commandManager
);

// Token-only check for dashboard loads (fast, 2-3s)
const isAuth = await authService.isAuthenticated();

// Full check with SDK initialization (slower but comprehensive, 3-10s)
const isFullyAuth = await authService.isFullyAuthenticated();

// Login flow
await authService.login();

// List organizations (selection is targeted per-invocation, not stored globally)
const orgs = await authService.getOrganizations();
```

### AdobeSDKClient

**Purpose**: Manages Adobe Console SDK client for high-performance operations

**Key Methods**:
- `initialize()` - Initialize SDK with CLI access token (5-second timeout)
- `ensureInitialized()` - Blocking initialization wait for SDK-dependent operations
- `isInitialized()` - Check if SDK is ready
- `getClient()` - Get underlying SDK client instance
- `clear()` - Force re-initialization on next use

**Example Usage**:
```typescript
import { AdobeSDKClient } from '@/features/authentication';

const sdkClient = new AdobeSDKClient(logger);

// Initialize in background (non-blocking)
sdkClient.initialize().catch(err => {
    // SDK failure is not critical - operations fall back to CLI
    logger.debug('SDK init failed, using CLI fallback:', err);
});

// Wait for SDK before SDK-dependent operations
const isReady = await sdkClient.ensureInitialized();
if (isReady) {
    // Use SDK for fast operations
} else {
    // Fallback to CLI
}
```

### TokenManager

**Purpose**: Handles Adobe access token validation and storage

**Key Methods**:
- `isTokenValid()` - Validate current access token
- `storeAccessToken(token)` - Store access token securely

**Example Usage**:
```typescript
import { TokenManager } from '@/features/authentication';

const tokenManager = new TokenManager(commandManager);

// Check token validity
const isValid = await tokenManager.isTokenValid();

// Store new token after login
await tokenManager.storeAccessToken(accessToken);
```

### AuthCacheManager

**Purpose**: Multi-layer caching strategy with TTL and security features

**Key Methods**:
- `getCachedAuthStatus()` - Get cached auth status with expiry check
- `setCachedAuthStatus(isAuth, ttl?)` - Cache auth status with custom TTL
- `getCachedOrganization()` - Get cached current organization
- `setCachedOrganization(org)` - Cache organization selection
- `getCachedOrgList()` - Get cached organization list (short TTL)
- `setCachedOrgList(orgs)` - Cache org list for performance
- `getValidationCache()` - Get org validation cache (org-specific)
- `setValidationCache(org, isValid)` - Cache validation result
- `clearAll()` - Clear all caches (logout, login, context switch)
- `clearAuthStatusCache()` - Clear only auth status (force recheck)
- `clearSessionCaches()` - Clear org/project/workspace caches

**Security Features**:
- Random jitter (±10%) on cache TTLs to prevent timing attacks
- Separate TTLs for different cache types (auth: 5min, validation: 30min, org list: 5min)
- Automatic expiry checking

**Example Usage**:
```typescript
import { AuthCacheManager } from '@/features/authentication';

const cacheManager = new AuthCacheManager();

// Check cached auth status
const { isAuthenticated, isExpired } = cacheManager.getCachedAuthStatus();
if (!isExpired && isAuthenticated !== undefined) {
    // Use cached result
    return isAuthenticated;
}

// Cache new auth status (default 5-minute TTL with jitter)
cacheManager.setCachedAuthStatus(true);

// Cache with custom TTL (e.g., shorter TTL for errors)
cacheManager.setCachedAuthStatus(false, 30000); // 30 seconds
```

### EntityServices (via createEntityServices)

**Purpose**: Manages Adobe organizations, projects, and workspaces with SDK acceleration

**Sub-services**:
- `fetcher` (AdobeEntityFetcher) — `getOrganizations()`, `getProjects()`, `getWorkspaces()`, `getWorkspaceCredential()`, `createWorkspaceCredential()`
- `resolver` (AdobeContextResolver) — `getCurrentOrganization()`, `getCurrentProject()`, `getCurrentWorkspace()`, `getCurrentContext()`
- `selector` (AdobeEntitySelector) — `clearConsoleContext()` plus read helpers for the current org/project/workspace. It never mutates the global `aio` selection; ops are targeted per-invocation via `ensureOrgContext`/`withOrgContext`.

**Zero-Organization Behavior**:
When `getOrganizations()` returns an empty array (user has no accessible organizations), the service automatically clears stale Adobe CLI console context (org/project/workspace selections) while preserving the authentication token. This prevents showing outdated organization selections from previous sessions.

**Example Usage**:
```typescript
import { createEntityServices } from '@/features/authentication';

const { fetcher, resolver, selector } = createEntityServices(
    commandManager, sdkClient, cacheManager,
    organizationValidator, logger, stepLogger
);

// Get organizations (SDK-accelerated if available, falls back to CLI)
const orgs = await fetcher.getOrganizations();

// Get projects (each fetch targets the org per-invocation via withOrgContext)
const projects = await fetcher.getProjects();
```

### Per-Invocation Org Targeting

**Purpose**: Target a specific Adobe org/project/workspace for each operation without mutating the global `aio console` selection.

Adobe ops are scoped per invocation through an internal `withOrgContext`/`buildAioConsoleEnv` mechanism: the target is passed as env to that single `aio` call. The extension never runs `aio console org select`, so it cannot clobber the user's terminal or other processes.

`ensureOrgContext(orgId, options)` is the one canonical entry point. It resolves the target and returns a typed result:

- `ok` - the org is reachable; the operation may proceed targeted at it
- `org_mismatch` - the active context targets a different org (surfaced to callers as a non-retryable `ORG_MISMATCH`)
- `needs_relogin` - the org isn't selectable on the current account; only a deliberate account switch (re-login) can surface it
- `access_revoked` - a targeted probe still 403'd; the user lost access to the org

A wrong org produces a typed `ORG_MISMATCH` that the UI resolves via the in-app org picker — never the old "run `aio console org select` in your terminal" message.

**Example Usage**:
```typescript
import { ensureOrgContext } from '@/features/authentication/services/ensureOrgContext';

const result = await ensureOrgContext(orgId, {
    listSelectableOrgs: () => fetcher.getOrganizations(),
});

switch (result.status) {
    case 'ok':
        // Proceed; the operation runs targeted at result.targetOrg via withOrgContext
        break;
    case 'org_mismatch':
        // Surface ORG_MISMATCH (non-retryable); resolve via the in-app picker
        break;
    case 'needs_relogin':
        // Prompt a deliberate account switch (force re-login)
        break;
    case 'access_revoked':
        // User lost access to the org
        break;
}
```

`OrganizationValidator` is constructed as `new OrganizationValidator(commandManager, logger)`.

### withTiming

**Purpose**: Wraps async operations with automatic performance monitoring

Logs a debug warning when an operation exceeds its expected duration threshold.
Used internally by `AuthenticationService` to monitor all entity operations.

**Example Usage**:
```typescript
import { withTiming } from '@/features/authentication';

const orgs = await withTiming('getOrganizations', async () => {
    return fetcher.getOrganizations();
});
// Automatically logs warning if operation exceeds 5s threshold
```

## Types

See `services/types.ts` for type definitions:

### Core Types
- `AdobeOrg` - Adobe organization with id, code, and name
- `AdobeProject` - Adobe Developer Console project
- `AdobeWorkspace` - Project workspace
- `AdobeContext` - Complete org/project/workspace context
- `AuthTokenValidation` - Token validation result with org and expiry
- `WorkspaceCredential` - OAuth S2S credential with clientId, name, and source
- `CacheEntry<T>` - Generic cache entry with data and expiry

### Raw CLI Response Types
- `RawAdobeOrg` - Adobe CLI organization response
- `RawAdobeProject` - Adobe CLI project response
- `RawAdobeWorkspace` - Adobe CLI workspace response
- `AdobeConsoleWhereResponse` - Response from `aio console where` command
- `RawWorkspaceCredential` - Raw workspace credential from Adobe Console SDK
- `AdobeCLIError` - Adobe CLI error with code and output

### SDK Types
- `SDKResponse<T>` - Adobe Console SDK response wrapper

## Architecture

**Directory Structure**:
```
features/authentication/
├── index.ts                    # Public API exports
├── services/
│   ├── authenticationService.ts    # Main orchestration
│   ├── adobeSDKClient.ts          # SDK management
│   ├── adobeContextResolver.ts    # CLI context resolution
│   ├── adobeEntityFetcher.ts      # SDK-accelerated fetching
│   ├── adobeEntityMapper.ts       # Entity data mapping
│   ├── adobeEntitySelector.ts     # Entity selection logic
│   ├── adobeEntityService.ts      # Orgs/projects/workspaces
│   ├── authCacheManager.ts        # Multi-layer caching
│   ├── authPredicates.ts          # Auth state predicates
│   ├── authenticationErrorFormatter.ts # Error formatting
│   ├── organizationValidator.ts   # Org access validation
│   ├── performanceTracker.ts      # Performance metrics
│   ├── tokenManager.ts            # Token validation
│   └── types.ts                   # Type definitions
├── handlers/
│   ├── authenticationHandlers.ts  # Auth message handlers
│   ├── projectHandlers.ts         # Project selection handlers
│   └── workspaceHandlers.ts       # Workspace selection handlers
└── README.md                      # This file
```

**Service Dependencies**:
```
AuthenticationService (orchestrator)
├── TokenManager (token validation)
├── AdobeSDKClient (high-performance SDK operations)
├── AuthCacheManager (multi-layer caching)
├── OrganizationValidator (org access validation)
├── EntityServices (org/project/workspace management via createEntityServices)
│   ├── AdobeEntityFetcher (SDK-accelerated fetching)
│   ├── AdobeContextResolver (CLI context resolution)
│   └── AdobeEntitySelector (entity selection)
└── withTiming (performance monitoring)
```

## Integration Points

### Dependencies
- `@/core/shell` - CommandExecutor for CLI operations
- `@/core/logging` - Logger, StepLogger for consistent logging
- `@/core/validation` - validateAccessToken for security
- `@/core/utils/timeoutConfig` - TIMEOUTS, CACHE_TTL constants
- `@adobe/aio-lib-console` - Adobe Console SDK (optional, falls back to CLI)
- `@adobe/aio-lib-ims` - Adobe IMS token management

### Used By
- `src/features/mesh` - Pre-flight auth checks before mesh operations
- `src/features/dashboard` - Quick auth status for dashboard loads
- `src/features/project-creation` - Wizard authentication step
- `src/commands/deployMesh.ts` - Auth verification before deployment
- `src/features/authentication/ui/steps/` - Authentication UI steps

## Usage Examples

### Example 1: Quick Auth Check (Dashboard Load)
```typescript
import { AuthenticationService } from '@/features/authentication';

// Token-only auth check for dashboard loads (2-3 seconds)
const authService = new AuthenticationService(
    context.extensionPath,
    logger,
    commandManager
);

const isAuthenticated = await authService.isAuthenticated();

if (isAuthenticated) {
    // Load dashboard
} else {
    // Show login prompt
}
```

### Example 2: Full Authentication Flow
```typescript
import { AuthenticationService } from '@/features/authentication';

const authService = new AuthenticationService(
    context.extensionPath,
    logger,
    commandManager
);

// Full authentication check with org validation
const isAuth = await authService.isAuthenticated();

if (!isAuth) {
    // Trigger browser login
    const success = await authService.login();

    if (success) {
        // Present the in-app org picker; the chosen org is targeted per-invocation
        const orgs = await authService.getOrganizations();
        // ... present to user, then target the choice via ensureOrgContext
    }
}
```

### Example 3: Project and Workspace Selection
```typescript
import { AuthenticationService } from '@/features/authentication';

const authService = new AuthenticationService(
    context.extensionPath,
    logger,
    commandManager
);

// Get projects in current org
const projects = await authService.getProjects();

// Get workspaces in the chosen project (fetches are targeted per-invocation)
const workspaces = await authService.getWorkspaces();

// Verify current context
const context = await authService.getCurrentContext();
console.log('Current context:', {
    org: context.organization?.name,
    project: context.project?.name,
    workspace: context.workspace?.name
});
```

### Example 4: Pre-flight Auth Check (Before Expensive Operations)
```typescript
import { AuthenticationService } from '@/features/authentication';

const authService = new AuthenticationService(
    context.extensionPath,
    logger,
    commandManager
);

// Pre-flight check before mesh deployment
const isAuth = await authService.isAuthenticated();

if (!isAuth) {
    logger.warn('Not authenticated. Triggering login before mesh deployment...');
    await authService.login();
}

// Ensure SDK is initialized for fast operations
await authService.ensureSDKInitialized();

// Proceed with mesh deployment
await deployMesh();
```

### Example 5: Caching for Performance
```typescript
import { AuthCacheManager } from '@/features/authentication';

const cacheManager = new AuthCacheManager();

// Check cache first
const { isAuthenticated, isExpired } = cacheManager.getCachedAuthStatus();
if (!isExpired && isAuthenticated !== undefined) {
    // Use cached result (no network call)
    return isAuthenticated;
}

// Cache miss - perform expensive check
const isAuth = await performAuthCheck();

// Cache result with default TTL (5 minutes with jitter)
cacheManager.setCachedAuthStatus(isAuth);
```

## Performance Considerations

### Authentication Speed
- **Token-Only Check**: `isAuthenticated()` - 2-3 seconds (token validation only)
- **Full Check**: `isFullyAuthenticated()` - 3-10 seconds (with org validation)
- **SDK Operations**: 30x faster than pure CLI approach
- **Caching**: 5-30 minute TTLs reduce redundant checks

### Best Practices
1. **Use Token-Only Checks**: For dashboard loads and non-critical paths, use `isAuthenticated()`
2. **Pre-flight Authentication**: Verify auth BEFORE expensive operations to avoid surprise browser launches
3. **SDK Initialization**: Initialize SDK in background after auth for future performance gains
4. **Cache Appropriately**:
   - Auth status: 5 minutes
   - Org validation: 30 minutes
   - Org list: 5 minutes
5. **Handle Fallbacks**: Always handle SDK initialization failure gracefully (fall back to CLI)

### Caching Strategy
```
┌─────────────────────────────────────────────┐
│        AuthCacheManager Layers              │
├─────────────────────────────────────────────┤
│ 1. Auth Status Cache (5 min)                │
│    - Fast dashboard loads                   │
│    - Prevents redundant token checks        │
├─────────────────────────────────────────────┤
│ 2. Session Caches (session-scoped)          │
│    - Current org/project/workspace          │
│    - Cleared on context changes             │
├─────────────────────────────────────────────┤
│ 3. Validation Cache (30 min, org-specific)  │
│    - Org access validation                  │
│    - Cleared after login                    │
├─────────────────────────────────────────────┤
│ 4. API Result Caches (5 min)                │
│    - Org list                               │
│    - console.where response                 │
│    - Cleared on context changes             │
└─────────────────────────────────────────────┘
```

## Error Handling

### Common Errors
- **Token Expired**: Automatically triggers re-authentication
- **Org Mismatch / Access Lost**: `ensureOrgContext` returns a typed status; a wrong org surfaces as a non-retryable `ORG_MISMATCH` resolved via the in-app org picker
- **Network Timeout**: Provides helpful error messages with retry guidance
- **Browser Auth Cancelled**: Detects timeout and suggests retry
- **SDK Initialization Failed**: Falls back to CLI operations automatically

### Error Recovery
```typescript
import { toAppError, isTimeout, isNetwork } from '@/types/errors';

try {
    await authService.login();
} catch (error) {
    const appError = toAppError(error);

    if (isTimeout(appError)) {
        // User closed browser or session expired
        showMessage('Authentication timed out. Please try again.');
    } else if (isNetwork(appError)) {
        // Network error
        showMessage('Network error. Check your internet connection.');
    } else {
        // Generic error - use user-friendly message from typed error
        showMessage(`Authentication failed: ${appError.userMessage}`);
    }
}
```

## Security Considerations

### Token Security
- Tokens stored via Adobe CLI's secure storage mechanism
- No tokens logged or exposed in extension output
- Validation via `validateAccessToken()` before use

### Cache Security
- Random jitter (±10%) on cache TTLs prevents timing-based cache enumeration attacks
- Sensitive data (tokens) never cached - only auth status and metadata
- Cache cleared on logout and forced login

### Organization Validation
- Regular validation checks ensure user still has org access
- Invalid org contexts automatically cleared
- Prevents operations on inaccessible organizations

## Testing

### Manual Testing Checklist
- [ ] Browser login flow opens and completes successfully
- [ ] Quick auth check completes in <1 second
- [ ] Full auth check validates org access
- [ ] SDK initialization succeeds and provides performance boost
- [ ] SDK failure falls back to CLI gracefully
- [ ] Cache provides performance improvement
- [ ] Cache clears appropriately on logout/login
- [ ] Org validation detects lost access
- [ ] Pre-flight checks prevent unexpected browser launches
- [ ] Token expiry triggers re-authentication

### Integration Testing
- Test auth flow in wizard
- Test dashboard auth checks
- Test mesh deployment pre-flight checks
- Test org/project/workspace selection
- Test cache behavior across commands

## See Also

- **[Adobe Setup Architecture](../../docs/architecture/adobe-setup.md)** - Two-column setup flow design
- **[Mesh Feature](../mesh/README.md)** - Pre-flight auth checks
- **[Dashboard Feature](../dashboard/README.md)** - Quick auth status
- **[Core State](../../core/state/README.md)** - StateManager integration
- **[Timeout Configuration](../../core/utils/timeoutConfig.ts)** - TIMEOUTS and CACHE_TTL constants

---

For overall architecture, see `../../CLAUDE.md`
For core infrastructure, see `../../core/CLAUDE.md`
