# Authentication Feature

## Purpose

The Authentication feature handles all aspects of Adobe identity management, authentication, and organizational context within the extension. It provides both browser-based authentication flows and SDK-accelerated operations for optimal performance. This feature ensures secure, cached, and validated access to Adobe I/O services while maintaining organizational and project context throughout the extension lifecycle.

The feature leverages the Adobe Console SDK to achieve 30x faster operations compared to pure CLI approaches, with intelligent fallback mechanisms for resilience.

## Responsibilities

- **Adobe I/O Authentication**: Browser-based login flow with token management
- **Token Validation**: Quick authentication checks (<1s) vs full validation (3-10s)
- **Adobe Console SDK Integration**: High-performance API operations with automatic fallback to CLI
- **Organization Management**: Listing, selecting, and validating Adobe organizations
- **Project Management**: Fetching and selecting Adobe Developer Console projects
- **Workspace Management**: Workspace selection and context switching
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
- `selectOrganization(orgId)` - Set active organization context
- `selectProject(projectId)` - Set active project context
- `selectWorkspace(workspaceId)` - Set active workspace context
- `getCurrentOrganization()` - Get currently selected organization
- `getCurrentProject()` - Get currently selected project
- `getCurrentWorkspace()` - Get currently selected workspace
- `autoSelectOrganizationIfNeeded()` - Auto-select if only one org available
- `getTokenManager()` - Get TokenManager instance for token inspection operations

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

// Get organizations and select one
const orgs = await authService.getOrganizations();
await authService.selectOrganization(orgs[0].id);
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

### AdobeEntityService

**Purpose**: Manages Adobe organizations, projects, and workspaces with SDK acceleration

**Key Methods**:
- `getOrganizations()` - Fetch organizations (SDK-accelerated when available, clears CLI context if zero orgs found)
- `getProjects()` - Fetch projects in current org
- `getWorkspaces()` - Fetch workspaces in current project
- `getCurrentOrganization()` - Get current org context
- `getCurrentProject()` - Get current project context
- `getCurrentWorkspace()` - Get current workspace context
- `selectOrganization(orgId)` - Select organization and update CLI context
- `selectProject(projectId)` - Select project and update CLI context
- `selectWorkspace(workspaceId)` - Select workspace and update CLI context
- `autoSelectOrganizationIfNeeded(skipCurrentCheck?)` - Auto-select single org

**Zero-Organization Behavior**:
When `getOrganizations()` returns an empty array (user has no accessible organizations), the service automatically clears stale Adobe CLI console context (org/project/workspace selections) while preserving the authentication token. This prevents showing outdated organization selections from previous sessions.

**Example Usage**:
```typescript
import { AdobeEntityService } from '@/features/authentication';

const entityService = new AdobeEntityService(
    commandManager,
    sdkClient,
    cacheManager,
    logger,
    stepLogger
);

// Get organizations (SDK-accelerated if available, falls back to CLI)
const orgs = await entityService.getOrganizations();

// Select organization
await entityService.selectOrganization(orgId);

// Get projects in selected org
const projects = await entityService.getProjects();
```

### OrganizationValidator

**Purpose**: Validates user access to selected organizations

**Key Methods**:
- `validateAndClearInvalidOrgContext(forceValidation?)` - Check if user still has access to selected org, clear if not

**Example Usage**:
```typescript
import { OrganizationValidator } from '@/features/authentication';

const validator = new OrganizationValidator(
    commandManager,
    cacheManager,
    logger
);

// Validate current org context (cached for 30 minutes)
await validator.validateAndClearInvalidOrgContext();

// Force validation (bypass cache)
await validator.validateAndClearInvalidOrgContext(true);
```

### PerformanceTracker

**Purpose**: Tracks operation timing for performance optimization

**Key Methods**:
- `startTiming(operation)` - Start timing an operation
- `endTiming(operation)` - End timing and log duration
- `getMetrics()` - Get all tracked performance metrics

**Example Usage**:
```typescript
import { PerformanceTracker } from '@/features/authentication';

const tracker = new PerformanceTracker();

tracker.startTiming('getOrganizations');
// ... perform operation
tracker.endTiming('getOrganizations');

// Get metrics for analysis
const metrics = tracker.getMetrics();
```

## Types

See `services/types.ts` for type definitions:

### Core Types
- `AdobeOrg` - Adobe organization with id, code, and name
- `AdobeProject` - Adobe Developer Console project
- `AdobeWorkspace` - Project workspace
- `AdobeContext` - Complete org/project/workspace context
- `AuthToken` - Access token with expiry
- `AuthTokenValidation` - Token validation result with org and expiry
- `CacheEntry<T>` - Generic cache entry with data and expiry
- `PerformanceMetric` - Operation timing data

### Raw CLI Response Types
- `RawAdobeOrg` - Adobe CLI organization response
- `RawAdobeProject` - Adobe CLI project response
- `RawAdobeWorkspace` - Adobe CLI workspace response
- `AdobeConsoleWhereResponse` - Response from `aio console where` command
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
│   ├── tokenManager.ts            # Token validation
│   ├── authCacheManager.ts        # Multi-layer caching
│   ├── adobeEntityService.ts      # Orgs/projects/workspaces
│   ├── organizationValidator.ts   # Org access validation
│   ├── performanceTracker.ts      # Performance metrics
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
├── AdobeEntityService (org/project/workspace management)
│   ├── AdobeSDKClient (SDK acceleration)
│   ├── AuthCacheManager (caching)
│   └── StepLogger (user-facing logs)
└── PerformanceTracker (metrics)
```

## Integration Points

### Dependencies
- `@/shared/command-execution` - ExternalCommandManager for CLI operations
- `@/shared/logging` - Logger, StepLogger for consistent logging
- `@/shared/validation` - validateAccessToken for security
- `@/utils/timeoutConfig` - TIMEOUTS, CACHE_TTL constants
- `@adobe/aio-lib-console` - Adobe Console SDK (optional, falls back to CLI)
- `@adobe/aio-lib-ims` - Adobe IMS token management

### Used By
- `src/features/mesh` - Pre-flight auth checks before mesh operations
- `src/features/dashboard` - Quick auth status for dashboard loads
- `src/features/project-creation` - Wizard authentication step
- `src/commands/deployMesh.ts` - Auth verification before deployment
- `src/webviews/components/wizard/steps/AdobeSetupStep.tsx` - Authentication UI

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
        // Auto-select org if only one available
        const org = await authService.autoSelectOrganizationIfNeeded();

        if (org) {
            logger.info(`Auto-selected organization: ${org.name}`);
        } else {
            // Show org selection UI
            const orgs = await authService.getOrganizations();
            // ... present to user
        }
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

// Select a project
await authService.selectProject(projects[0].id);

// Get workspaces in selected project
const workspaces = await authService.getWorkspaces();

// Select a workspace
await authService.selectWorkspace(workspaces[0].id);

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
- **Org Access Lost**: Clears invalid org context and prompts user
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
- **[Shared State](../shared/state/CLAUDE.md)** - StateManager integration
- **[Timeout Configuration](../../utils/timeoutConfig.ts)** - TIMEOUTS and CACHE_TTL constants

---

For overall architecture, see `../../CLAUDE.md`
For shared infrastructure, see `../shared/CLAUDE.md`
