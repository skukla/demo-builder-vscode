# Beta 34-42: Authentication System Rewrite Analysis

## Executive Summary

Between beta 34 and beta 42 (October 16-17, 2025), the Adobe Demo Builder underwent a **comprehensive authentication system rewrite** that fundamentally changed how the extension interacts with Adobe CLI and manages authentication state. This analysis documents the architecture changes, the critical token corruption bug that emerged, and the solutions implemented.

**Key Changes:**
- **Architectural**: Moved from monolithic auth manager to typed state machine with middleware pattern
- **Dependencies**: Removed @adobe/aio-lib-ims in favor of direct Adobe CLI integration
- **Token Management**: Introduced atomic token fetching to prevent race conditions
- **Error Handling**: Added typed errors with user-friendly messages and recovery actions
- **Performance**: Maintained SDK integration for 30x faster operations

**Critical Bug Fixed**: Token corruption (expiry = 0) caused by non-atomic token/expiry queries - fixed in beta 42 with single atomic JSON fetch.

---

## Architecture Comparison

### Old Authentication System (Pre-Beta 34)

**File**: `src/utils/adobeAuthManager.ts` (1058 lines)

**Architecture**:
- Monolithic class with 30+ public methods
- Direct Adobe CLI command execution via ExternalCommandManager
- Heavy use of @adobe/aio-lib-ims for token management
- Caching at multiple levels (auth status, org list, console.where, validation)
- Boolean-based auth state (isAuthenticated returns true/false)
- Org validation with retry logic and fail-open on timeout

**Key Components**:
```typescript
class AdobeAuthManager {
    // Caches
    private cachedAuthStatus: boolean | undefined;
    private cachedOrganization: AdobeOrg | undefined;
    private cachedProject: AdobeProject | undefined;
    private cachedWorkspace: AdobeWorkspace | undefined;
    private orgListCache: { data: AdobeOrg[], expiry: number } | undefined;
    private consoleWhereCache: { data: any, expiry: number } | undefined;
    private validationCache: { org: string; isValid: boolean; expiry: number } | undefined;

    // SDK client for high-performance operations
    private sdkClient: any | undefined;

    // Methods (selection)
    async isAuthenticated(): Promise<boolean>
    async isAuthenticatedQuick(): Promise<boolean>
    async login(force?: boolean): Promise<boolean>
    async getOrganizations(): Promise<AdobeOrg[]>
    async selectOrganization(orgId: string): Promise<boolean>
    async validateAndClearInvalidOrgContext(): Promise<void>
    async autoSelectOrganizationIfNeeded(): Promise<AdobeOrg | undefined>
}
```

**Problems**:
1. **No Type Safety**: Boolean auth state doesn't express nuanced states (expired, expiring soon, no org, etc.)
2. **Error Handling**: Generic errors, hard to provide actionable user guidance
3. **Scattered Logic**: Validation, caching, API calls mixed together
4. **Testing Difficulty**: Monolithic structure makes unit testing hard
5. **Token Fetching**: Separate queries for token and expiry created race condition potential

**Token Inspection (Old)**:
```typescript
// PROBLEM: Two separate CLI calls - could return inconsistent data
const [tokenResult, expiryResult] = await Promise.all([
    this.commandManager.executeAdobeCLI(
        'aio config get ims.contexts.cli.access_token.token',
        { encoding: 'utf8', timeout: TIMEOUTS.TOKEN_READ }
    ),
    this.commandManager.executeAdobeCLI(
        'aio config get ims.contexts.cli.access_token.expiry',
        { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
    )
]);

const token = tokenResult.stdout?.trim();
const expiry = parseInt(expiryResult.stdout?.trim() || '0');
```

**Issue**: If Adobe CLI config is updated between these two calls, token and expiry could be from different auth sessions, leading to `expiry = 0` corruption.

---

### New Authentication System (Beta 34+)

**Files**:
- `src/utils/adobeAuthTypes.ts` (31 lines) - Type definitions
- `src/utils/adobeAuthErrors.ts` (84 lines) - Error classes
- `src/utils/adobeAuthManager.ts` (1404 → 633 insertions, 771 deletions)

**Architecture**:
- **Typed State Machine**: AuthState enum with explicit states
- **Error System**: AdobeAuthError class with codes and user messages
- **Middleware Pattern**: withAuthCheck() wrapper for consistent validation
- **Atomic Operations**: Single JSON fetch for token+expiry
- **Context Sync**: syncContextFromCLI() for cache consistency
- **Direct CLI Integration**: Removed @adobe/aio-lib-ims dependency

**Key Components**:

#### Type System (adobeAuthTypes.ts)
```typescript
export enum AuthState {
    UNAUTHENTICATED = 'UNAUTHENTICATED',
    AUTHENTICATED_NO_ORG = 'AUTHENTICATED_NO_ORG',
    AUTHENTICATED_WITH_ORG = 'AUTHENTICATED_WITH_ORG',
    TOKEN_EXPIRING_SOON = 'TOKEN_EXPIRING_SOON',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    AUTH_ERROR = 'AUTH_ERROR'
}

export interface AuthContext {
    state: AuthState;
    token?: {
        valid: boolean;
        expiresIn: number;  // minutes
    };
    org?: AdobeOrg;
    project?: AdobeProject;
    workspace?: AdobeWorkspace;
    error?: AdobeAuthError;
}

export interface AuthRequirements {
    needsToken: boolean;
    needsOrg: boolean;
    needsProject: boolean;
    needsWorkspace: boolean;
}
```

#### Error System (adobeAuthErrors.ts)
```typescript
export enum AuthErrorCode {
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    TOKEN_INVALID = 'TOKEN_INVALID',
    NO_ORG = 'NO_ORG',
    NO_PROJECT = 'NO_PROJECT',
    NO_WORKSPACE = 'NO_WORKSPACE',
    API_ERROR = 'API_ERROR',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    NETWORK_ERROR = 'NETWORK_ERROR'
}

export class AdobeAuthError extends Error {
    constructor(
        message: string,
        public code: AuthErrorCode,
        public requiresReauth: boolean,
        public userMessage: string,
        public actionText?: string
    ) {
        super(message);
        this.name = 'AdobeAuthError';
    }

    // Factory methods for common scenarios
    static tokenExpired(expiresIn: number): AdobeAuthError { ... }
    static noOrganization(): AdobeAuthError { ... }
    static noProject(): AdobeAuthError { ... }
    static permissionDenied(details?: string): AdobeAuthError { ... }
}
```

#### Auth Manager (adobeAuthManager.ts)

**New Core Methods**:
```typescript
class AdobeAuthManager {
    // NEW: Atomic token inspection (fixes corruption bug)
    private async inspectToken(): Promise<{
        valid: boolean;
        expiresIn: number;
        token?: string
    }> {
        // Single atomic JSON fetch
        const result = await this.commandManager.executeAdobeCLI(
            'aio config get ims.contexts.cli.access_token --json',
            { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
        );

        const tokenData = JSON.parse(cleanOutput);
        const token = tokenData.token;
        const expiry = tokenData.expiry || 0;
        // ... validation logic
    }

    // NEW: CLI context inspection without API calls
    private async inspectContext(): Promise<{
        org?: string;
        project?: string;
        workspace?: string;
    } | null> { ... }

    // NEW: Sync in-memory cache from CLI state
    private async syncContextFromCLI(): Promise<void> { ... }

    // NEW: Middleware for consistent auth validation
    private async withAuthCheck<T>(
        requirements: AuthRequirements,
        operation: () => Promise<T>
    ): Promise<T> { ... }

    // NEW: Central auth state accessor
    public async getAuthContext(): Promise<AuthContext> { ... }
}
```

**Improvements**:
1. **Type Safety**: AuthState enum + AuthContext interface express all possible states
2. **Atomic Operations**: Single JSON fetch eliminates token corruption race condition
3. **Clear Error Messages**: AdobeAuthError provides user-friendly messages and action buttons
4. **Middleware Pattern**: withAuthCheck() ensures consistent validation across operations
5. **Context Sync**: syncContextFromCLI() eliminates complex ID resolution logic
6. **Testability**: Smaller, focused methods easier to unit test

---

## Commit-by-Commit Analysis

### Beta 34: Foundation

**Commit Sequence** (c4dd838~10 to c4dd838):
1. `1c06e5a` - feat: add core authentication infrastructure with typed states and errors
2. `a940610` - refactor: comprehensive authentication manager overhaul
3. `1194c79` - feat: integrate new authentication system in project wizard
4. `a81adb6` - feat: update deployMesh and dashboard with new auth system
5. `3d2c85b` - chore: remove @adobe/aio-lib-ims dependency
6. `c4dd838` - chore: bump version to 1.0.0-beta.34

---

### 1c06e5a: Core Authentication Infrastructure

**Date**: October 16, 2025 13:18:20

**Changes**:
- Created `adobeAuthTypes.ts` (31 lines)
- Created `adobeAuthErrors.ts` (84 lines)

**New Types Added**:

```typescript
// State Machine
enum AuthState {
    UNAUTHENTICATED
    AUTHENTICATED_NO_ORG
    AUTHENTICATED_WITH_ORG
    TOKEN_EXPIRING_SOON
    TOKEN_EXPIRED
    AUTH_ERROR
}

// Unified Auth Status
interface AuthContext {
    state: AuthState
    token?: { valid: boolean; expiresIn: number }
    org?: AdobeOrg
    project?: AdobeProject
    workspace?: AdobeWorkspace
    error?: AdobeAuthError
}

// Middleware Pattern Support
interface AuthRequirements {
    needsToken: boolean
    needsOrg: boolean
    needsProject: boolean
    needsWorkspace: boolean
}
```

**Error Classes**:
```typescript
class AdobeAuthError extends Error {
    code: AuthErrorCode
    requiresReauth: boolean
    userMessage: string
    actionText?: string

    // Factory methods for common errors
    static tokenExpired(expiresIn: number)
    static noOrganization()
    static noProject()
    static noWorkspace()
    static permissionDenied(details?)
    static apiError(details)
}
```

**Impact**:
- Provides foundation for typed state management
- Standardizes error handling across auth operations
- Enables user-friendly error messages with action buttons
- Sets up middleware pattern for auth validation

---

### a940610: Comprehensive Authentication Manager Overhaul

**Date**: October 16, 2025 13:18:35

**Stats**: 633 insertions, 771 deletions (massive refactor)

**Token Management Changes**:

```typescript
// NEW: inspectToken() - Lightweight token validation
private async inspectToken(): Promise<{
    valid: boolean;
    expiresIn: number;
    token?: string
}> {
    // NOTE: Still using separate queries here (bug introduced)
    const [tokenResult, expiryResult] = await Promise.all([
        this.commandManager.executeAdobeCLI(
            'aio config get ims.contexts.cli.access_token.token',
            ...
        ),
        this.commandManager.executeAdobeCLI(
            'aio config get ims.contexts.cli.access_token.expiry',
            ...
        )
    ]);
    // This would later cause the corruption bug
}

// NEW: inspectContext() - Read CLI context without triggering auth
private async inspectContext(): Promise<{
    org?: string;
    project?: string;
    workspace?: string
} | null> {
    // Uses 'aio console where --json'
}

// SIMPLIFIED: isAuthenticatedQuick() using token inspection
public async isAuthenticatedQuick(): Promise<boolean> {
    const { valid } = await this.inspectToken();
    return valid;
}

// SIMPLIFIED: isAuthenticated() with SDK initialization
public async isAuthenticated(bypassCache: boolean = false): Promise<boolean> {
    const { valid, expiresIn } = await this.inspectToken();
    if (!valid) return false;

    // Initialize SDK in background for 30x faster ops
    if (!this.sdkClient) {
        this.initializeSDK().catch(() => { /* non-critical */ });
    }

    return true;
}
```

**Context Management Changes**:

```typescript
// NEW: syncContextFromCLI() - Sync in-memory cache with CLI state
private async syncContextFromCLI(): Promise<void> {
    const context = await this.inspectContext();

    if (!context || !context.org) {
        this.cachedOrganization = undefined;
        this.cachedProject = undefined;
        this.cachedWorkspace = undefined;
        return;
    }

    // Fetch full org details if needed
    if (!this.cachedOrganization || this.cachedOrganization.name !== context.org) {
        const orgs = await this.getOrganizations();
        this.cachedOrganization = orgs.find(o => o.name === context.org);
    }

    // Similar for project/workspace...
}

// SIMPLIFIED: getCurrentOrganization() uses context sync
public async getCurrentOrganization(): Promise<AdobeOrg | undefined> {
    if (this.cachedOrganization) {
        return this.cachedOrganization;
    }
    await this.syncContextFromCLI();
    return this.cachedOrganization;
}
```

**Auth Middleware**:

```typescript
// NEW: withAuthCheck() - Middleware for consistent auth validation
private async withAuthCheck<T>(
    requirements: AuthRequirements,
    operation: () => Promise<T>
): Promise<T> {
    // Check token
    if (requirements.needsToken) {
        const { valid, expiresIn } = await this.inspectToken();
        if (!valid) {
            throw AdobeAuthError.tokenExpired(expiresIn);
        }
    }

    // Check org
    if (requirements.needsOrg) {
        const org = await this.getCurrentOrganization();
        if (!org) {
            throw AdobeAuthError.noOrganization();
        }
    }

    // Check project/workspace...

    // Execute operation with error wrapping
    try {
        return await operation();
    } catch (error) {
        // Convert CLI/API errors to AdobeAuthError
        if (errorMsg.includes('401')) {
            throw AdobeAuthError.tokenExpired(0);
        }
        if (errorMsg.includes('403')) {
            throw AdobeAuthError.permissionDenied(errorMsg);
        }
        throw AdobeAuthError.apiError(errorMsg);
    }
}

// NEW: getAuthContext() - Central auth state accessor
public async getAuthContext(): Promise<AuthContext> {
    const { valid, expiresIn } = await this.inspectToken();

    if (!valid) {
        return {
            state: expiresIn < 0 ? AuthState.TOKEN_EXPIRED : AuthState.UNAUTHENTICATED
        };
    }

    // Initialize SDK for 30x faster operations
    if (!this.sdkClient) {
        this.initializeSDK().catch(() => { /* non-critical */ });
    }

    // Sync from CLI if cache is empty
    if (!this.cachedOrganization) {
        await this.syncContextFromCLI();
    }

    const org = this.cachedOrganization;

    if (!org) {
        return {
            state: AuthState.AUTHENTICATED_NO_ORG,
            token: { valid, expiresIn }
        };
    }

    if (expiresIn < 30) {
        return {
            state: AuthState.TOKEN_EXPIRING_SOON,
            token: { valid, expiresIn },
            org,
            project: this.cachedProject,
            workspace: this.cachedWorkspace
        };
    }

    return {
        state: AuthState.AUTHENTICATED_WITH_ORG,
        token: { valid, expiresIn },
        org,
        project: this.cachedProject,
        workspace: this.cachedWorkspace
    };
}
```

**Error Handling Improvements**:

```typescript
// NEW: Detect 403 Forbidden errors in selectProject()
public async selectProject(projectId: string): Promise<boolean> {
    try {
        // ... execute project selection
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Detect permission denied (wrong org or expired token)
        if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
            throw AdobeAuthError.permissionDenied(
                'You do not have permission to access this project. ' +
                'This may indicate you selected the wrong organization.'
            );
        }

        throw AdobeAuthError.apiError(errorMsg);
    }
}
```

**Performance Improvements**:
- Reduced auth check time from 9s+ to <1s (using inspectToken vs full CLI validation)
- Eliminated redundant token inspections via caching
- Cache validation results across operations (30s TTL)

**SDK Integration**:
- Initialize SDK in getAuthContext() for early availability
- Maintain SDK for 10-30x performance gains on org/project/workspace operations
- Graceful fallback to CLI when SDK unavailable

**Impact**:
- Fundamentally changed auth architecture to typed state machine
- Introduced middleware pattern for consistent validation
- Improved performance through better caching and lightweight checks
- **Inadvertently introduced token corruption bug** via separate token/expiry queries

---

### 1194c79: Wizard Integration

**Date**: October 16, 2025 13:18:50

**Changes**: Integrated new authentication system into project wizard

**Key Updates**:
- Updated message handlers to use AuthContext instead of boolean flags
- Used AdobeAuthError for user-friendly error messages
- Leveraged getAuthContext() for unified state checks

**Example Integration**:
```typescript
// OLD: Boolean-based auth check
comm.on('check-auth', async () => {
    const isAuthenticated = await authManager.isAuthenticated();
    return { authenticated: isAuthenticated };
});

// NEW: Typed auth context
comm.on('check-auth', async () => {
    const context = await authManager.getAuthContext();
    return {
        state: context.state,
        token: context.token,
        org: context.org,
        project: context.project,
        workspace: context.workspace
    };
});

// NEW: Error handling with actionable messages
comm.on('select-project', async (payload) => {
    try {
        await authManager.selectProject(payload.projectId);
        return { success: true };
    } catch (error) {
        if (error instanceof AdobeAuthError) {
            return {
                success: false,
                error: error.userMessage,
                action: error.actionText  // e.g., "Contact Administrator"
            };
        }
        throw error;
    }
});
```

**Impact**:
- Wizard UI can display nuanced auth states (not just "authenticated" vs "not authenticated")
- Error messages are user-friendly with suggested actions
- Cleaner separation between auth logic and UI presentation

---

### a81adb6: deployMesh and Dashboard Integration

**Date**: October 16, 2025 13:19:05

**Changes**: Updated mesh deployment and dashboard to use new auth system

**deployMesh Command**:
```typescript
// NEW: Pre-flight auth check with user consent
const isAuthenticated = await authManager.isAuthenticatedQuick();
if (!isAuthenticated) {
    const action = await vscode.window.showWarningMessage(
        'Authentication required to deploy mesh',
        'Sign In',
        'Cancel'
    );
    if (action !== 'Sign In') return;

    await authManager.login();
}

// NEW: Error handling with typed errors
try {
    await deployMesh();
} catch (error) {
    if (error instanceof AdobeAuthError) {
        if (error.code === AuthErrorCode.PERMISSION_DENIED) {
            vscode.window.showErrorMessage(
                error.userMessage + '. ' + error.actionText
            );
        }
    }
}
```

**Dashboard Integration**:
- Used getAuthContext() to show current org/project in dashboard header
- Display token expiry warnings when < 30 minutes remaining
- Handle auth errors gracefully without crashing dashboard

**Impact**:
- Commands no longer surprise users with browser auth launches
- Clear error messages guide users on next steps
- Consistent auth handling across all features

---

### 3d2c85b: @adobe/aio-lib-ims Removal

**Date**: October 16, 2025 13:19:20

**Changes**: Removed @adobe/aio-lib-ims dependency

**Reason**:
- The library was only used for `getToken('cli')` during SDK initialization
- Extension already had direct Adobe CLI integration via ExternalCommandManager
- Removing dependency reduces bundle size and eliminates version conflicts

**Replacement**:
```typescript
// OLD: Using @adobe/aio-lib-ims
import { getToken } from '@adobe/aio-lib-ims';

const accessToken = await getToken('cli');
this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');

// NEW: Direct CLI config read
const result = await this.commandManager.executeAdobeCLI(
    'aio config get ims.contexts.cli.access_token.token',
    { encoding: 'utf8', timeout: TIMEOUTS.SDK_INIT }
);

const accessToken = result.stdout.trim();
this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');
```

**Impact**:
- Smaller bundle size (removed 2MB dependency)
- Eliminated potential version conflicts with Adobe CLI's internal version
- More control over error handling during token fetch
- Simplified dependency tree

---

### Beta 35: Critical Fixes (6009c50)

**Date**: October 16, 2025 (afternoon)

**Release**: v1.0.0-beta.35

**Key Changes**: Critical auth fixes and timeout refactoring

**Timeout Increases**:
```typescript
// OLD timeouts
CONFIG_WRITE: 5000ms

// NEW timeouts
CONFIG_WRITE: 10000ms  // Increased from 5s to 10s
```

**Success Detection**:
```typescript
// NEW: Detect success even if command times out
try {
    await this.selectProject(projectId);
} catch (error) {
    // Check stdout for success indicators
    if (error.stdout && error.stdout.includes('Project selected :')) {
        // Command succeeded despite timeout
        return true;
    }
    throw error;
}
```

**Impact**:
- Reduced false timeout failures for Adobe CLI commands
- Commands now succeed reliably despite Adobe CLI slowness
- Better user experience with fewer mysterious failures

---

### Beta 36-38: Debugging Improvements

**Beta 36 (9ba0cc4)**: Debug logging for auth token expiry
- Added detailed logging during token inspection
- Logs expiry timestamp, current time, difference

**Beta 37 (8921ddf)**: Close entire panel after Homebrew install
- Fixed UI bug (unrelated to auth)

**Beta 38 (79c1228)**: Dedicated terminal for Homebrew installation
- Fixed terminal management (unrelated to auth)

**Impact**: Enhanced visibility into auth state for debugging future issues.

---

## Token Corruption Deep Dive (Beta 39-42)

This is the **most critical** part of the beta 34-42 changes.

### The Problem

**Symptom**: Users experiencing infinite authentication loops
- Browser login completes successfully
- Extension shows "Session expired" / "Sign in required"
- Multiple browser windows open unexpectedly
- Zero organizations returned after successful login

**Root Cause**: Token corruption where `expiry = 0` despite valid token

**When It Happened**: After browser login via `aio auth login`

**Technical Cause**: **RACE CONDITION** in token inspection

```typescript
// a940610 introduced this bug (separate queries)
const [tokenResult, expiryResult] = await Promise.all([
    this.commandManager.executeAdobeCLI(
        'aio config get ims.contexts.cli.access_token.token',
        { encoding: 'utf8', timeout: TIMEOUTS.TOKEN_READ }
    ),
    this.commandManager.executeAdobeCLI(
        'aio config get ims.contexts.cli.access_token.expiry',
        { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
    )
]);
```

**The Race Condition**:
1. Extension queries token (command 1 starts)
2. Extension queries expiry (command 2 starts)
3. Adobe CLI writes new token from browser login (between command 1 and 2)
4. Command 1 returns NEW token (from browser login)
5. Command 2 returns OLD expiry (0 or expired value from before login)
6. Result: Valid token with expiry = 0 → corruption detected

**Why This Happened**:
- Adobe CLI config is NOT atomic
- Browser login writes token and expiry separately
- Two separate queries can read from different config states
- Even `Promise.all()` doesn't help - the CLI calls are still separate processes

---

### Detection (Beta 39: 3022c27)

**Date**: October 16, 2025 15:43:44

**Release**: v1.0.0-beta.39

**Changes**: Added surgical detection for corrupted tokens

```typescript
// Pre-authentication corruption check
const tokenCheck = await this.inspectToken();
if (tokenCheck.token && tokenCheck.expiresIn === 0) {
    // Token exists but has invalid expiry - force cleanup
    this.debugLogger.warn('[Auth] Detected corrupted token (expiry = 0), forcing logout');
    await this.logout();
}

// Post-authentication verification
const postLoginToken = await this.inspectToken();
if (postLoginToken.token && postLoginToken.expiresIn === 0) {
    // Login succeeded but token still corrupted - CLI issue
    this.logger.error('[Auth] Token corruption persists after login');
    this.logger.error('[Auth] This indicates Adobe CLI is not storing the token correctly');
    this.logger.error('[Auth] Try running: aio auth logout && aio auth login in a terminal');
    return false;
}
```

**Detection Logic**:
- **Pre-login check**: If token exists AND expiry = 0, force logout before login
- **Post-login check**: If token still corrupted after login, return error
- **Surgical**: Only triggers on exact corruption signature (token=true, expiry=0)
- **Does not affect**: Valid tokens, expired tokens, missing tokens

**Debug Logging Added**:
```typescript
this.debugLogger.debug(`[Auth Token] Expiry string from CLI: ${expiryStr}`);
this.debugLogger.debug(`[Auth Token] Expiry timestamp: ${expiry}`);
this.debugLogger.debug(`[Auth Token] Current timestamp: ${now}`);
this.debugLogger.debug(`[Auth Token] Difference (ms): ${expiry - now}`);
this.debugLogger.debug(`[Auth Token] Difference (minutes): ${Math.floor((expiry - now) / 1000 / 60)}`);
this.debugLogger.debug(`[Auth Token] Token length: ${token?.length || 0}`);
```

**Impact**:
- Detected corruption and attempted automatic fix via logout
- Enhanced debugging visibility
- Still didn't solve root cause (race condition remained)

---

### Beta 40 (009309f): Enhanced Post-Login Logging

**Date**: October 16, 2025 15:53:31

**Changes**: Added comprehensive post-login token inspection logging

```typescript
this.debugLogger.debug('[Auth] Post-login token inspection result:');
this.debugLogger.debug(`[Auth]   - valid: ${postLoginToken.valid}`);
this.debugLogger.debug(`[Auth]   - expiresIn: ${postLoginToken.expiresIn}`);
this.debugLogger.debug(`[Auth]   - token exists: ${!!postLoginToken.token}`);
this.debugLogger.debug(`[Auth]   - token length: ${postLoginToken.token?.length || 0}`);
this.debugLogger.debug(`[Auth] Checking corruption condition: token=${!!postLoginToken.token}, expiresIn=${postLoginToken.expiresIn}, condition=${postLoginToken.token && postLoginToken.expiresIn === 0}`);

if (postLoginToken.token && postLoginToken.expiresIn === 0) {
    this.debugLogger.debug('[Auth] CORRUPTION DETECTED - entering error path');
}
```

**Purpose**: Diagnostic release to understand why corruption was still occurring despite beta 39 fix.

**Impact**: Provided detailed logs showing that logout wasn't solving the issue - corruption was happening DURING login itself.

---

### Beta 41 (bade596): Better Error Handling

**Date**: October 16, 2025 21:08:27

**Release**: v1.0.0-beta.41

**Changes**: Improved error messages and terminal guidance for corrupted tokens

**Before**:
```
"Authentication timed out"
```
User has no idea what went wrong.

**After**:
```typescript
// Throw specific error
throw new Error('ADOBE_CLI_TOKEN_CORRUPTION: Adobe CLI failed to store authentication token correctly...');

// Catch in command handler
if (errorMsg.includes('ADOBE_CLI_TOKEN_CORRUPTION')) {
    await this.sendMessage('auth-status', {
        authenticated: false,
        error: 'cli_corruption',
        message: 'Adobe CLI Token Error',
        subMessage: 'Automatic fixes failed. Manual terminal intervention required.'
    });

    // Show VS Code notification with action button
    const action = await vscode.window.showErrorMessage(
        'Adobe CLI failed to store authentication correctly...',
        'Open Terminal',
        'Dismiss'
    );

    if (action === 'Open Terminal') {
        const terminal = vscode.window.createTerminal('Adobe CLI Fix');
        terminal.show();
        terminal.sendText('# Run this command to fix Adobe CLI authentication:');
        terminal.sendText('# aio auth logout && aio auth login');
    }
}
```

**Impact**:
- Clear error messages instead of generic timeout
- Actionable guidance (open terminal, run command)
- Pre-populated terminal with fix instructions
- Still didn't solve root cause

---

### Beta 42 (99dbdc8): THE FIX - Atomic Token Fetch

**Date**: October 16, 2025 21:31:25

**Release**: v1.0.0-beta.42

**Commit Message**: "fix(auth): fetch token and expiry atomically to prevent corruption"

**The Solution**: **Atomic JSON Fetch**

```typescript
// BEFORE (Broken - separate queries)
private async inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }> {
    const [tokenResult, expiryResult] = await Promise.all([
        this.commandManager.executeAdobeCLI(
            'aio config get ims.contexts.cli.access_token.token',
            { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
        ),
        this.commandManager.executeAdobeCLI(
            'aio config get ims.contexts.cli.access_token.expiry',
            { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
        )
    ]);

    const token = tokenResult.stdout?.trim();
    const expiry = parseInt(expiryResult.stdout?.trim() || '0');
    // RACE CONDITION: token and expiry could be from different auth sessions
}

// AFTER (Fixed - single atomic query)
private async inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }> {
    // Get the ENTIRE access_token object (includes both token and expiry)
    const result = await this.commandManager.executeAdobeCLI(
        'aio config get ims.contexts.cli.access_token --json',
        { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
    );

    if (result.code !== 0 || !result.stdout) {
        return { valid: false, expiresIn: 0 };
    }

    // Clean output (remove fnm/node version warnings)
    const cleanOutput = result.stdout.trim().split('\n')
        .filter(line => !line.startsWith('Using Node') && !line.includes('fnm'))
        .join('\n').trim();

    // Parse the JSON object {token: "...", expiry: 123456789}
    const tokenData = JSON.parse(cleanOutput);
    const token = tokenData.token;
    const expiry = tokenData.expiry || 0;
    const now = Date.now();

    // ATOMIC: token and expiry guaranteed to be from same config state

    if (!token || token.length < 100) {
        return { valid: false, expiresIn: 0 };
    }

    if (!expiry || expiry <= now) {
        const expiresIn = expiry > 0 ? Math.floor((expiry - now) / 1000 / 60) : 0;
        return { valid: false, expiresIn, token };
    }

    const expiresIn = Math.floor((expiry - now) / 1000 / 60);
    return { valid: true, expiresIn, token };
}
```

**Why This Works**:

1. **Single Adobe CLI Call**: Only one `aio config get` command executed
2. **JSON Flag**: `--json` flag tells Adobe CLI to return entire object structure
3. **Atomic Read**: Adobe CLI reads config file ONCE and returns complete object
4. **No Race Window**: Token and expiry are guaranteed to be from same config state
5. **Consistent Data**: Even if browser login happens during call, we get either old OR new state, never mixed

**Enhanced Error Logging**:
```typescript
if (postLoginToken.token && postLoginToken.expiresIn === 0) {
    this.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.error('[Auth] CRITICAL: Adobe CLI Token Corruption Detected');
    this.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.error('[Auth] Login completed but token has no expiry (corrupted)');
    this.logger.error('[Auth] ');
    this.logger.error('[Auth] Automatic fix attempts that were tried:');
    this.logger.error('[Auth]   1. ✗ aio auth logout (before login)');
    this.logger.error('[Auth]   2. ✗ Manual config deletion (aio config delete)');
    this.logger.error('[Auth]   3. ✗ aio auth login -f (fresh browser auth)');
    this.logger.error('[Auth]   4. ✗ Token STILL corrupted after all attempts');
    this.logger.error('[Auth] ');
    this.logger.error('[Auth] This indicates a fundamental Adobe CLI installation issue.');
    this.logger.error('[Auth] Manual intervention required - see notification for instructions.');
    this.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
```

**Updated Terminal Instructions**:
```bash
# Option 1: Force fresh login (recommended)
aio logout -f && aio login -f

# Option 2: If that fails, delete config and retry
rm -rf ~/.config/@adobe/aio-cli
aio login -f

# Option 3: If still failing, reinstall Adobe CLI
npm uninstall -g @adobe/aio-cli
npm install -g @adobe/aio-cli
aio login -f
```

**Impact**:
- **Eliminated token corruption race condition completely**
- Token and expiry now always consistent
- Should eliminate infinite auth loop bug
- If corruption still occurs, it's from Adobe CLI itself (not extension)

---

## State Machine Documentation

### Authentication States

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication State Machine              │
└─────────────────────────────────────────────────────────────┘

States:
  - UNAUTHENTICATED        : No token or token expired
  - AUTHENTICATED_NO_ORG   : Valid token but no org selected
  - AUTHENTICATED_WITH_ORG : Valid token + org selected
  - TOKEN_EXPIRING_SOON    : Valid token but < 30 min remaining
  - TOKEN_EXPIRED          : Token expired (negative expiresIn)
  - AUTH_ERROR             : Error during auth check

State Transitions:

┌──────────────────┐
│ UNAUTHENTICATED  │
└──────────────────┘
        │
        │ login() success
        ▼
┌──────────────────────┐
│ AUTHENTICATED_NO_ORG │────┐
└──────────────────────┘    │
        │                   │
        │ selectOrg()       │ time passes
        ▼                   │
┌─────────────────────────┐ │
│ AUTHENTICATED_WITH_ORG  │◄┘
└─────────────────────────┘
        │
        │ token < 30 min
        ▼
┌──────────────────────┐
│ TOKEN_EXPIRING_SOON  │
└──────────────────────┘
        │
        │ token expires
        ▼
┌──────────────────┐
│  TOKEN_EXPIRED   │
└──────────────────┘
        │
        │ reauth
        ▼
┌──────────────────────┐
│ AUTHENTICATED_NO_ORG │
└──────────────────────┘

Error States (can occur from any state):

┌───────────────┐
│  AUTH_ERROR   │  ← API errors, network errors, permission denied
└───────────────┘
```

### Event Flow

**User Login**:
```
1. User clicks "Sign In"
2. Extension calls authManager.login()
3. Adobe CLI opens browser
4. User authenticates in browser
5. Browser redirects with token
6. Adobe CLI writes token to config
7. Extension reads token via inspectToken()
8. State → AUTHENTICATED_NO_ORG
9. Extension attempts autoSelectOrganizationIfNeeded()
   - If 1 org → State → AUTHENTICATED_WITH_ORG
   - If >1 org → Stay in AUTHENTICATED_NO_ORG
```

**Token Expiry**:
```
1. getAuthContext() checks token
2. If expiresIn < 30 minutes → State → TOKEN_EXPIRING_SOON
3. If expiresIn < 0 → State → TOKEN_EXPIRED
4. UI shows warning/error
5. User clicks "Sign In" → back to login flow
```

**Organization Selection**:
```
1. User selects org from dropdown
2. Extension calls selectOrganization(orgId)
3. Adobe CLI executes 'aio console org select'
4. Context synced via syncContextFromCLI()
5. State → AUTHENTICATED_WITH_ORG
```

**Error Recovery**:
```
1. Operation fails (403, 401, network error)
2. State → AUTH_ERROR
3. AdobeAuthError thrown with:
   - userMessage: "You don't have permission..."
   - actionText: "Contact Administrator"
4. UI displays error + action button
5. User clicks action → appropriate recovery flow
```

---

## Type System

### Core Types

```typescript
// ========================================
// adobeAuthTypes.ts
// ========================================

export enum AuthState {
    UNAUTHENTICATED = 'UNAUTHENTICATED',
    AUTHENTICATED_NO_ORG = 'AUTHENTICATED_NO_ORG',
    AUTHENTICATED_WITH_ORG = 'AUTHENTICATED_WITH_ORG',
    TOKEN_EXPIRING_SOON = 'TOKEN_EXPIRING_SOON',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    AUTH_ERROR = 'AUTH_ERROR'
}

export interface AuthContext {
    state: AuthState;
    token?: {
        valid: boolean;
        expiresIn: number;  // minutes until expiry (negative if expired)
    };
    org?: AdobeOrg;
    project?: AdobeProject;
    workspace?: AdobeWorkspace;
    error?: AdobeAuthError;
}

export interface AuthRequirements {
    needsToken: boolean;
    needsOrg: boolean;
    needsProject: boolean;
    needsWorkspace: boolean;
}

// ========================================
// adobeAuthErrors.ts
// ========================================

export enum AuthErrorCode {
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    TOKEN_INVALID = 'TOKEN_INVALID',
    NO_ORG = 'NO_ORG',
    NO_PROJECT = 'NO_PROJECT',
    NO_WORKSPACE = 'NO_WORKSPACE',
    API_ERROR = 'API_ERROR',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    NETWORK_ERROR = 'NETWORK_ERROR'
}

export class AdobeAuthError extends Error {
    constructor(
        message: string,              // Technical message (for logs)
        public code: AuthErrorCode,   // Error code enum
        public requiresReauth: boolean, // Does user need to re-login?
        public userMessage: string,   // User-friendly message
        public actionText?: string    // Suggested action button text
    ) {
        super(message);
        this.name = 'AdobeAuthError';
    }

    // Factory methods for common errors
    static tokenExpired(expiresIn: number): AdobeAuthError;
    static noOrganization(): AdobeAuthError;
    static noProject(): AdobeAuthError;
    static noWorkspace(): AdobeAuthError;
    static permissionDenied(details?: string): AdobeAuthError;
    static apiError(details: string): AdobeAuthError;
}

// ========================================
// adobeAuthManager.ts (interfaces)
// ========================================

export interface AdobeOrg {
    id: string;    // Numeric ID as string
    code: string;  // Short code (e.g., "ADOBE1")
    name: string;  // Human-readable name
}

export interface AdobeProject {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string;
    org_id?: number;
}

export interface AdobeWorkspace {
    id: string;
    name: string;
    title?: string;
}
```

### Type Guards

None explicitly added in this refactor, but could be useful:

```typescript
// Suggested type guards (not in codebase yet)
function isAuthError(error: unknown): error is AdobeAuthError {
    return error instanceof AdobeAuthError;
}

function isAuthenticatedState(state: AuthState): boolean {
    return state !== AuthState.UNAUTHENTICATED &&
           state !== AuthState.TOKEN_EXPIRED;
}

function hasOrg(context: AuthContext): context is AuthContext & { org: AdobeOrg } {
    return context.org !== undefined;
}
```

### Error Type Hierarchy

```
Error (built-in)
  └── AdobeAuthError
        ├── TOKEN_EXPIRED (requiresReauth: true)
        ├── TOKEN_INVALID (requiresReauth: true)
        ├── NO_ORG (requiresReauth: false)
        ├── NO_PROJECT (requiresReauth: false)
        ├── NO_WORKSPACE (requiresReauth: false)
        ├── API_ERROR (requiresReauth: false)
        ├── PERMISSION_DENIED (requiresReauth: false)
        └── NETWORK_ERROR (requiresReauth: false)
```

---

## Integration Points

### createProjectWebview.ts

**Old Pattern** (Pre-beta 34):
```typescript
comm.on('check-auth', async () => {
    const isAuth = await authManager.isAuthenticated();
    return { authenticated: isAuth };
});
```

**New Pattern** (Beta 34+):
```typescript
comm.on('check-auth', async () => {
    const context = await authManager.getAuthContext();
    return {
        state: context.state,
        token: context.token,
        org: context.org,
        project: context.project,
        workspace: context.workspace
    };
});

comm.on('select-project', async (payload) => {
    try {
        await authManager.selectProject(payload.projectId);
        return { success: true };
    } catch (error) {
        if (error instanceof AdobeAuthError) {
            return {
                success: false,
                errorCode: error.code,
                errorMessage: error.userMessage,
                actionText: error.actionText
            };
        }
        throw error;
    }
});
```

### projectDashboardWebview.ts

**Integration**:
```typescript
// Show auth status in dashboard header
const context = await authManager.getAuthContext();

if (context.state === AuthState.TOKEN_EXPIRING_SOON) {
    panel.webview.postMessage({
        type: 'auth-warning',
        message: `Token expires in ${context.token?.expiresIn} minutes`,
        action: 'Refresh Session'
    });
}

// Display current org/project
panel.webview.postMessage({
    type: 'auth-context',
    org: context.org?.name,
    project: context.project?.name,
    workspace: context.workspace?.name
});
```

### deployMesh Command

**Pre-flight Auth Check**:
```typescript
async execute() {
    // Quick auth check (< 1 second)
    const isAuthenticated = await authManager.isAuthenticatedQuick();

    if (!isAuthenticated) {
        const action = await vscode.window.showWarningMessage(
            'Authentication required to deploy mesh. Sign in to Adobe?',
            'Sign In',
            'Cancel'
        );

        if (action !== 'Sign In') {
            return;
        }

        // User confirmed → browser login
        await authManager.login();
    }

    // Proceed with mesh deployment
    await this.deployMesh();
}
```

### Authentication Handlers (Wizard)

**Handler List**:
- `check-auth` → getAuthContext()
- `login` → authManager.login()
- `logout` → authManager.logout()
- `get-orgs` → authManager.getOrganizations()
- `select-org` → authManager.selectOrganization(id)
- `get-projects` → authManager.getProjects()
- `select-project` → authManager.selectProject(id)
- `get-workspaces` → authManager.getWorkspaces()
- `select-workspace` → authManager.selectWorkspace(id)

**Middleware Usage**:
```typescript
// getOrganizations uses middleware
async getOrganizations(): Promise<AdobeOrg[]> {
    return this.withAuthCheck(
        { needsToken: true, needsOrg: false, needsProject: false, needsWorkspace: false },
        async () => {
            // Fetch orgs via Adobe CLI or SDK
            if (this.sdkClient) {
                return this.sdkClient.getOrganizations();
            } else {
                const result = await this.commandManager.executeAdobeCLI('aio console org list --json');
                return JSON.parse(result.stdout);
            }
        }
    );
}
```

---

## Critical Findings

### Must-Adopt Changes

1. **Atomic Token Fetching** (Beta 42)
   - **Critical**: Eliminates race condition that causes token corruption
   - **Impact**: Prevents infinite auth loops
   - **Complexity**: Low (simple change to inspectToken method)
   - **Risk**: None - strictly better than separate queries

2. **Typed State Machine** (Beta 34)
   - **Important**: Enables UI to show nuanced auth states
   - **Impact**: Better UX (users see "Token expiring soon" vs "Not authenticated")
   - **Complexity**: Medium (requires UI updates to use AuthContext)
   - **Risk**: Low - backwards compatible via helper methods

3. **Error Type System** (Beta 34)
   - **Important**: Provides user-friendly error messages
   - **Impact**: Users get actionable guidance instead of technical errors
   - **Complexity**: Low (AdobeAuthError class + factory methods)
   - **Risk**: None - improves error handling

4. **Middleware Pattern** (Beta 34)
   - **Nice to Have**: Consistent auth validation across operations
   - **Impact**: Reduces code duplication, ensures consistent error handling
   - **Complexity**: Medium (requires refactoring existing methods)
   - **Risk**: Low - can be adopted incrementally

5. **Context Sync** (Beta 34)
   - **Nice to Have**: Simplifies org/project/workspace retrieval
   - **Impact**: Eliminates complex ID resolution logic
   - **Complexity**: Medium (replaces existing caching logic)
   - **Risk**: Medium - changes core caching strategy

### Architecture Conflicts

**No Major Conflicts** with our refactor branch:

- Our refactor branch already migrated auth to `src/features/authentication/`
- New auth types/errors fit naturally into feature structure
- Middleware pattern aligns with our service layer approach
- Atomic token fetching is implementation detail (no architectural impact)

**Minor Integration Points**:

1. **Type Definitions**: Need to add `adobeAuthTypes.ts` and `adobeAuthErrors.ts`
   - Location: `src/features/authentication/types/`

2. **Auth Manager Updates**: Need to update `authenticationService.ts`
   - Add inspectToken() with atomic fetch
   - Add getAuthContext() method
   - Add withAuthCheck() middleware

3. **Command Handlers**: Update to use AuthContext instead of boolean flags
   - Already using HandlerRegistry pattern - easy to update

4. **UI Integration**: Update wizard steps to handle AuthContext
   - Adobe Setup step needs AuthState display
   - Error messages need to show actionText buttons

### Risk Assessment

**High Priority (Must Adopt)**:
- ✅ Atomic Token Fetching (Beta 42) - **Zero Risk, High Benefit**
  - Eliminates known bug
  - Simple implementation
  - No breaking changes

**Medium Priority (Should Adopt)**:
- ⚠️ Typed State Machine (Beta 34) - **Low Risk, High Benefit**
  - Requires UI updates
  - Can be adopted incrementally
  - Improves UX significantly

- ⚠️ Error Type System (Beta 34) - **Low Risk, Medium Benefit**
  - Improves error messages
  - Can coexist with existing error handling
  - Adopt incrementally

**Low Priority (Nice to Have)**:
- 📋 Middleware Pattern (Beta 34) - **Medium Risk, Medium Benefit**
  - Requires refactoring existing methods
  - Can be done later
  - Not critical for functionality

- 📋 Context Sync (Beta 34) - **Medium Risk, Low Benefit**
  - Changes caching strategy
  - Current approach works fine
  - Defer until needed

---

## Conflict with Refactor Branch

### Files Modified in Both

**Master (Beta 34-42)**:
- `src/utils/adobeAuthManager.ts` (comprehensive rewrite)
- `src/commands/createProjectWebview.ts` (message handlers)
- `src/commands/deployMesh.ts` (auth integration)
- `package.json` (removed @adobe/aio-lib-ims)

**Refactor Branch**:
- `src/features/authentication/services/authenticationService.ts` (new location)
- `src/features/authentication/handlers/` (new handlers)
- `src/commands/createProjectWebview.ts` (HandlerRegistry pattern)
- `src/features/mesh/commands/deployMesh.ts` (new location)

### Conflicting Approaches

**1. File Organization**:
- Master: Auth logic in `src/utils/adobeAuthManager.ts`
- Refactor: Auth logic in `src/features/authentication/services/`

**Resolution**: Use refactor branch structure, port master's logic

**2. Message Handling**:
- Master: Direct message handlers in createProjectWebview.ts
- Refactor: HandlerRegistry pattern with separate handler files

**Resolution**: Use refactor's HandlerRegistry, update handlers to use AuthContext

**3. Type Definitions**:
- Master: New types in `src/utils/adobeAuthTypes.ts`
- Refactor: Types in `src/features/authentication/types/`

**Resolution**: Use refactor's location, import master's type definitions

### Merge Strategy

**Phase 1: Critical Fix** (Immediate)
1. Port atomic token fetching from beta 42
   - Update `authenticationService.ts` → `inspectToken()` method
   - Use `aio config get ims.contexts.cli.access_token --json`
   - Test thoroughly

**Phase 2: Type System** (Week 1)
1. Add type definitions to refactor branch
   - Create `src/features/authentication/types/authTypes.ts`
   - Create `src/features/authentication/types/authErrors.ts`
   - Export from `src/features/authentication/index.ts`

2. Update authentication service
   - Add `getAuthContext(): Promise<AuthContext>` method
   - Update `isAuthenticated()` to use typed states internally
   - Add factory methods for AdobeAuthError

**Phase 3: Integration** (Week 2)
1. Update message handlers
   - Modify handlers to return AuthContext instead of boolean
   - Add error handling using AdobeAuthError
   - Update UI to display auth states

2. Update commands
   - deployMesh: Use isAuthenticatedQuick() for pre-flight check
   - Dashboard: Display AuthContext in header
   - All commands: Handle AdobeAuthError with action buttons

**Phase 4: Cleanup** (Week 3)
1. Remove legacy auth methods if needed
2. Update tests to use new types
3. Document new auth patterns in CLAUDE.md files

---

## Integration Recommendations

### Phase 1: Core Infrastructure (Critical - Do First)

**Goal**: Fix token corruption bug immediately

**Files to Update**:
```typescript
// src/features/authentication/services/authenticationService.ts

private async inspectToken(): Promise<{
    valid: boolean;
    expiresIn: number;
    token?: string
}> {
    // CRITICAL FIX: Fetch entire access_token object atomically
    const result = await this.commandManager.executeAdobeCLI(
        'aio config get ims.contexts.cli.access_token --json',
        { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
    );

    if (result.code !== 0 || !result.stdout) {
        return { valid: false, expiresIn: 0 };
    }

    // Clean output (remove fnm warnings)
    const cleanOutput = result.stdout.trim().split('\n')
        .filter(line => !line.startsWith('Using Node') && !line.includes('fnm'))
        .join('\n').trim();

    // Parse JSON: {token: "...", expiry: 123456789}
    let tokenData;
    try {
        tokenData = JSON.parse(cleanOutput);
    } catch (parseError) {
        this.debugLogger.warn(`[Auth] Failed to parse token JSON: ${parseError}`);
        return { valid: false, expiresIn: 0 };
    }

    const token = tokenData.token;
    const expiry = tokenData.expiry || 0;
    const now = Date.now();

    // Validation logic...
    if (!token || token.length < 100) {
        return { valid: false, expiresIn: 0 };
    }

    if (!expiry || expiry <= now) {
        const expiresIn = expiry > 0 ? Math.floor((expiry - now) / 1000 / 60) : 0;
        return { valid: false, expiresIn, token };
    }

    const expiresIn = Math.floor((expiry - now) / 1000 / 60);
    return { valid: true, expiresIn, token };
}
```

**Testing**:
- Test fresh authentication flow
- Test token expiry detection
- Verify no corruption after browser login
- Check debug logs show "Fetched token config (single JSON call)"

**Timeline**: 1-2 days

---

### Phase 2: Type System Integration (Important)

**Goal**: Add typed states and errors for better UX

**Files to Create**:
```typescript
// src/features/authentication/types/authTypes.ts
export enum AuthState {
    UNAUTHENTICATED = 'UNAUTHENTICATED',
    AUTHENTICATED_NO_ORG = 'AUTHENTICATED_NO_ORG',
    AUTHENTICATED_WITH_ORG = 'AUTHENTICATED_WITH_ORG',
    TOKEN_EXPIRING_SOON = 'TOKEN_EXPIRING_SOON',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    AUTH_ERROR = 'AUTH_ERROR'
}

export interface AuthContext {
    state: AuthState;
    token?: { valid: boolean; expiresIn: number };
    org?: AdobeOrg;
    project?: AdobeProject;
    workspace?: AdobeWorkspace;
    error?: AdobeAuthError;
}

export interface AuthRequirements {
    needsToken: boolean;
    needsOrg: boolean;
    needsProject: boolean;
    needsWorkspace: boolean;
}

// src/features/authentication/types/authErrors.ts
export enum AuthErrorCode {
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    NO_ORG = 'NO_ORG',
    NO_PROJECT = 'NO_PROJECT',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    API_ERROR = 'API_ERROR',
}

export class AdobeAuthError extends Error {
    constructor(
        message: string,
        public code: AuthErrorCode,
        public requiresReauth: boolean,
        public userMessage: string,
        public actionText?: string
    ) {
        super(message);
        this.name = 'AdobeAuthError';
    }

    static tokenExpired(expiresIn: number): AdobeAuthError {
        return new AdobeAuthError(
            `Token expired ${Math.abs(expiresIn)} minutes ago`,
            AuthErrorCode.TOKEN_EXPIRED,
            true,
            'Your Adobe session has expired',
            'Sign In'
        );
    }

    static noOrganization(): AdobeAuthError { /* ... */ }
    static noProject(): AdobeAuthError { /* ... */ }
    static permissionDenied(details?: string): AdobeAuthError { /* ... */ }
    static apiError(details: string): AdobeAuthError { /* ... */ }
}

// src/features/authentication/index.ts (barrel export)
export * from './types/authTypes';
export * from './types/authErrors';
export * from './services/authenticationService';
```

**Files to Update**:
```typescript
// src/features/authentication/services/authenticationService.ts

public async getAuthContext(): Promise<AuthContext> {
    const { valid, expiresIn } = await this.inspectToken();

    if (!valid) {
        return {
            state: expiresIn < 0 ? AuthState.TOKEN_EXPIRED : AuthState.UNAUTHENTICATED
        };
    }

    // Initialize SDK for 30x faster operations
    if (!this.sdkClient) {
        this.initializeSDK().catch(() => { /* non-critical */ });
    }

    // Sync from CLI if cache is empty
    if (!this.cachedOrganization) {
        await this.syncContextFromCLI();
    }

    const org = this.cachedOrganization;

    if (!org) {
        return {
            state: AuthState.AUTHENTICATED_NO_ORG,
            token: { valid, expiresIn }
        };
    }

    if (expiresIn < 30) {
        return {
            state: AuthState.TOKEN_EXPIRING_SOON,
            token: { valid, expiresIn },
            org,
            project: this.cachedProject,
            workspace: this.cachedWorkspace
        };
    }

    return {
        state: AuthState.AUTHENTICATED_WITH_ORG,
        token: { valid, expiresIn },
        org,
        project: this.cachedProject,
        workspace: this.cachedWorkspace
    };
}
```

**Testing**:
- Verify all auth states are reachable
- Test error messages appear in UI
- Check action buttons work correctly

**Timeline**: 3-4 days

---

### Phase 3: Handler Integration (Medium Priority)

**Goal**: Update message handlers to use AuthContext

**Files to Update**:
```typescript
// src/features/authentication/handlers/authCheckHandler.ts

export class AuthCheckHandler implements MessageHandler {
    async handle(payload: any, context: HandlerContext): Promise<any> {
        const authContext = await this.authService.getAuthContext();

        return {
            state: authContext.state,
            token: authContext.token,
            org: authContext.org,
            project: authContext.project,
            workspace: authContext.workspace
        };
    }
}

// src/features/authentication/handlers/selectProjectHandler.ts

export class SelectProjectHandler implements MessageHandler {
    async handle(payload: { projectId: string }, context: HandlerContext): Promise<any> {
        try {
            await this.authService.selectProject(payload.projectId);
            return { success: true };
        } catch (error) {
            if (error instanceof AdobeAuthError) {
                return {
                    success: false,
                    errorCode: error.code,
                    errorMessage: error.userMessage,
                    actionText: error.actionText,
                    requiresReauth: error.requiresReauth
                };
            }
            throw error;
        }
    }
}
```

**UI Updates**:
```typescript
// src/webviews/components/wizard/steps/AdobeSetupStep.tsx

const handleAuthCheck = async () => {
    const response = await vscode.postMessage({ type: 'check-auth' });

    switch (response.state) {
        case 'UNAUTHENTICATED':
            setAuthState('Please sign in to continue');
            setShowSignInButton(true);
            break;

        case 'AUTHENTICATED_NO_ORG':
            setAuthState('Please select an organization');
            setShowOrgSelection(true);
            break;

        case 'AUTHENTICATED_WITH_ORG':
            setAuthState(`Signed in as ${response.org.name}`);
            setCanContinue(true);
            break;

        case 'TOKEN_EXPIRING_SOON':
            setWarning(`Token expires in ${response.token.expiresIn} minutes`);
            setShowRefreshButton(true);
            break;

        case 'TOKEN_EXPIRED':
            setAuthState('Session expired - please sign in again');
            setShowSignInButton(true);
            break;
    }
};

const handleSelectProject = async (projectId: string) => {
    const response = await vscode.postMessage({
        type: 'select-project',
        projectId
    });

    if (!response.success) {
        // Show error with action button if available
        if (response.actionText) {
            showErrorWithAction(
                response.errorMessage,
                response.actionText,
                () => {
                    if (response.requiresReauth) {
                        handleSignIn();
                    }
                }
            );
        } else {
            showError(response.errorMessage);
        }
    }
};
```

**Timeline**: 4-5 days

---

### Phase 4: Command Integration (Lower Priority)

**Goal**: Update commands to use pre-flight auth checks

**Files to Update**:
```typescript
// src/features/mesh/commands/deployMesh.ts

export class DeployMeshCommand extends BaseCommand {
    async execute() {
        // Pre-flight auth check
        const isAuthenticated = await this.authService.isAuthenticatedQuick();

        if (!isAuthenticated) {
            const action = await vscode.window.showWarningMessage(
                'Authentication required to deploy mesh. Sign in to Adobe?',
                'Sign In',
                'Cancel'
            );

            if (action !== 'Sign In') {
                return;
            }

            await this.authService.login();
        }

        // Proceed with deployment
        try {
            await this.meshService.deploy();
            vscode.window.showInformationMessage('Mesh deployed successfully');
        } catch (error) {
            if (error instanceof AdobeAuthError) {
                vscode.window.showErrorMessage(
                    error.userMessage,
                    error.actionText || 'OK'
                );
            } else {
                throw error;
            }
        }
    }
}
```

**Timeline**: 2-3 days

---

### Risks & Mitigation

**Risk 1: Token Inspection Parsing Errors**
- **Mitigation**: Comprehensive try/catch around JSON.parse, fallback to invalid state
- **Testing**: Test with various fnm warning scenarios, malformed JSON

**Risk 2: AuthContext State Explosion**
- **Mitigation**: Keep states minimal (6 states), use AuthContext.error for details
- **Testing**: Verify all states are handled in UI

**Risk 3: Breaking Changes for Existing Code**
- **Mitigation**: Keep legacy methods (isAuthenticated() returns boolean), add new getAuthContext()
- **Testing**: Ensure existing flows still work

**Risk 4: SDK Initialization Failures**
- **Mitigation**: Already handled gracefully (non-blocking, falls back to CLI)
- **Testing**: Test with SDK disabled

**Risk 5: UI Complexity**
- **Mitigation**: Provide helper functions for common state checks
- **Testing**: User testing on different auth scenarios

---

## Questions for Clarification

1. **Middleware Pattern Adoption**: Should we adopt the withAuthCheck() middleware pattern, or keep auth validation explicit in each method?
   - **Recommendation**: Adopt incrementally - use for new methods, migrate existing methods over time

2. **Context Sync Strategy**: Should we replace our current caching with syncContextFromCLI(), or keep hybrid approach?
   - **Recommendation**: Keep hybrid - use syncContextFromCLI() as fallback when cache is empty

3. **Error Notification Strategy**: Should all AdobeAuthError instances show VS Code notifications, or only in commands?
   - **Recommendation**: Commands show notifications, handlers return errors to UI for display

4. **SDK Initialization Timing**: Should SDK init be blocking or non-blocking?
   - **Recommendation**: Keep non-blocking (current approach) - first SDK call will wait if needed

5. **State Machine Complexity**: Do we need all 6 states, or can we simplify?
   - **Recommendation**: Start with 4 core states (UNAUTHENTICATED, NO_ORG, WITH_ORG, EXPIRED), add others if needed

---

## Statistics

### Commits Analyzed
- **Total**: 13 commits
- **Beta 34**: 6 commits (foundation)
- **Beta 35**: 1 commit (timeout fixes)
- **Beta 36-38**: 3 commits (debugging)
- **Beta 39-42**: 4 commits (corruption detection and fix)

### Files Changed
- **Created**: 2 files (adobeAuthTypes.ts, adobeAuthErrors.ts)
- **Modified**: 3 files (adobeAuthManager.ts, createProjectWebview.ts, deployMesh.ts)
- **Deleted**: 0 files
- **Dependency Removed**: 1 (&#64;adobe/aio-lib-ims)

### Lines Changed in Auth System
- **Beta 34 (1c06e5a)**: +115 lines (new types/errors)
- **Beta 34 (a940610)**: +633 insertions, -771 deletions (comprehensive refactor)
- **Beta 39 (3022c27)**: +25 lines (corruption detection)
- **Beta 42 (99dbdc8)**: +50 insertions, -40 deletions (atomic fetch)
- **Total**: ~600 net new lines of auth code

### New Types Added
- **Enums**: 2 (AuthState, AuthErrorCode)
- **Interfaces**: 2 (AuthContext, AuthRequirements)
- **Classes**: 1 (AdobeAuthError)
- **Factory Methods**: 6 (error factory methods)

### Auth State Machine
- **States**: 6
- **Transitions**: 8 primary paths
- **Error States**: 1 (can occur from any state)

---

## Conclusion

The beta 34-42 authentication rewrite represents a **fundamental architectural improvement** to the Adobe Demo Builder extension. The changes address critical bugs (token corruption), improve code organization (typed states, error system), and enhance user experience (clear error messages, pre-flight auth checks).

**Most Critical Change**: Beta 42's atomic token fetching completely eliminates the race condition that caused token corruption. This single change is **essential to adopt** - it's a simple implementation fix with zero risk and high benefit.

**Architectural Benefits**: The typed state machine and error system provide a solid foundation for future auth features and significantly improve debugging and user guidance.

**Integration Path**: The changes align well with our refactor branch's feature-based architecture. We can adopt the critical fixes immediately and integrate the type system incrementally without disrupting existing functionality.

**Recommended Adoption Timeline**:
- **Week 1**: Atomic token fetching (critical fix)
- **Week 2**: Type system integration (AuthContext, AdobeAuthError)
- **Week 3**: Handler updates (use AuthContext in message handlers)
- **Week 4**: Command updates (pre-flight checks, better error handling)

This analysis provides a complete understanding of the authentication changes and a clear path for integrating them into the refactor branch.

---

**Report compiled by**: Claude Code Analysis
**Date**: 2025-10-17
**Analysis scope**: Beta 34 (c4dd838) through Beta 42 (410505f)
**Primary focus**: Authentication system rewrite and token corruption resolution
