# Debug Team: Token Corruption Root Cause Analysis

**Date**: 2025-10-17
**Analyzed By**: Agent 10 (Token Corruption Root Cause Analyzer)
**Target Versions**: Beta 41 (broken) → Beta 50 (stabilized)
**Status**: ⚠️ PRIMARY ISSUE FIXED, SECONDARY RISKS REMAIN

---

## Executive Summary

### Primary Issue: Token/Expiry Race Condition (FIXED in beta.42)
- **Vulnerability**: Non-atomic concurrent queries for token and expiry
- **Root Cause**: `Promise.all()` fetching token and expiry separately via Adobe CLI
- **Attack Surface**: All authentication operations requiring token validation
- **Frequency**: Intermittent (~10-20% based on timing)
- **Impact**: Authentication fails with "expiry = 0", user must re-login
- **Fix**: Atomic JSON query `aio config get ims.contexts.cli.access_token --json`
- **Status**: ✅ **RESOLVED** (beta.42)

### Secondary Issues Identified
- **Auth Cache Staleness** (FIXED in beta.49): Cache not updated after login
- **SDK Not Re-initialized** (FIXED in beta.50): SDK cleared on logout but not re-init on login
- **UI Timing Issues** (FIXED in beta.50): Stale messages shown during authentication
- **Async Handler Resolution** (FIXED in v1.5.0 refactor branch): Promise objects sent to UI

### Remaining Risk Vectors
- **Multi-Window Concurrency**: No protection against multiple VS Code windows
- **Adobe CLI Background Updates**: No staleness detection for external token changes
- **File System Race Conditions**: No file locking on `~/.adobe/config`
- **Cache Invalidation Timing**: TTL-based caching without staleness detection

### Current Risk Level: **MEDIUM**
- ✅ Primary token corruption fixed (atomic reads)
- ⚠️ Secondary race conditions remain
- ❌ No multi-window coordination
- ⚠️ Limited external mutation detection

---

## Multi-Vector Race Condition Analysis

### Vector 1: Concurrent Token Fetches (Beta.41 Issue) ✅ FIXED

**Vulnerability Description**:
Beta.41 used `Promise.all()` to query token and expiry separately:

```typescript
// BROKEN CODE (Beta.41)
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
const expiryStr = expiryResult.stdout?.trim() || '0';
const expiry = parseInt(expiryStr);
```

**Race Window**:
1. **T0**: Query 1 starts: `aio config get ...token`
2. **T1**: Query 2 starts: `aio config get ...expiry`
3. **T2**: Adobe CLI reads config file for token
4. **T3**: [EXTERNAL MUTATION] Another process updates config file
5. **T4**: Adobe CLI reads config file for expiry (now stale/different)
6. **T5**: Query 1 returns token from T2 state
7. **T6**: Query 2 returns expiry from T4 state (corrupted/mismatched)

**Attack Surface**:
- All authentication checks (`isTokenValid()`)
- Post-login token validation
- Dashboard initialization
- Mesh deployment pre-flight checks

**Frequency**:
- Intermittent (~10-20% of operations)
- Higher under load (multiple windows, rapid operations)
- Dependent on Adobe CLI timing and file system caching

**Impact**:
- Token appears valid but expiry = 0
- Authentication fails unexpectedly
- User forced to re-login
- Confusion: "I just logged in!"

**Fix Applied (Beta.42)**:
```typescript
// FIXED CODE (Beta.42+)
const result = await this.commandManager.executeAdobeCLI(
    'aio config get ims.contexts.cli.access_token --json',
    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
);

const tokenData = JSON.parse(cleanOutput);
const token = tokenData.token;
const expiry = tokenData.expiry || 0;
```

**Fix Benefits**:
- **Atomicity**: Single file read, single Adobe CLI invocation
- **Consistency**: Token and expiry from same state snapshot
- **Performance**: One CLI call instead of two (50% faster)
- **Reliability**: Eliminates timing-based race condition

**Status**: ✅ **RESOLVED** (beta.42, commit 99dbdc8)

---

### Vector 2: Multi-Window Concurrency ❌ VULNERABLE

**Vulnerability Description**:
Multiple VS Code windows can access Adobe CLI config simultaneously without coordination.

**Race Scenario**:
```
Window A                          Adobe CLI Config (~/.adobe/config)                     Window B
│                                                                                          │
├─ Read token (valid)                                                                     │
│                                                                                          │
│                                                                                          ├─ Login (overwrites config)
│                                                                                          │
├─ Use cached token                                                                       │
│  (now stale)                                                                            │
│                                                                                          ├─ New token written
├─ Operation fails                                                                        │
│  (token invalid)                                                                        │
```

**Attack Surface**:
- Multiple VS Code windows open simultaneously
- User logs in via one window while another window is active
- Background auth refresh in one window affects others
- Concurrent mesh deployments across windows

**Frequency**:
- Low (requires specific multi-window workflow)
- Higher for developers with multiple workspace folders
- Increases with number of concurrent operations

**Impact**:
- **Auth failures**: Window A uses stale token after Window B logs out
- **Confusing state**: One window authenticated, another not
- **Cache inconsistency**: Each window has separate cache
- **Data corruption**: Concurrent config writes could corrupt file

**Current Mitigation**:
```typescript
// NO COORDINATION EXISTS
// Each CommandExecutor instance operates independently
// No shared state between VS Code windows
```

**Recommendations**:
1. **File Locking**: Use `lockfile` or `proper-lockfile` npm package
   ```typescript
   import lockfile from 'proper-lockfile';

   async function readAdobeConfig() {
       const configPath = '~/.adobe/config';
       const release = await lockfile.lock(configPath, { retries: 3 });
       try {
           // Read config atomically
           return await fs.readFile(configPath);
       } finally {
           await release();
       }
   }
   ```

2. **Inter-Process Communication**: Use VS Code's `globalState` with change detection
   ```typescript
   context.globalState.onDidChange((key) => {
       if (key === 'adobe.token.version') {
           // Another window updated auth state
           this.invalidateCache();
       }
   });
   ```

3. **Token Version Tracking**: Add version number to detect stale caches
   ```typescript
   interface TokenState {
       token: string;
       expiry: number;
       version: number; // Increment on each write
   }
   ```

**Status**: ❌ **VULNERABLE** (no fix implemented)

---

### Vector 3: Adobe CLI SDK Background Updates ⚠️ MITIGATED

**Vulnerability Description**:
Adobe CLI SDK (`@adobe/aio-lib-ims`) may refresh tokens automatically in the background. Extension reads during SDK write.

**Race Scenario**:
```
VS Code Extension                 Adobe CLI SDK                      ~/.adobe/config
│                                                                          │
├─ Cache token (T1)                                                       │
│                                                                          │
│                                      ├─ Background refresh triggered    │
│                                      │  (token approaching expiry)      │
│                                      │                                   │
│                                      ├─ Write new token ─────────────►  │
│                                                                          │
├─ Use cached token                                                       │
│  (now invalid/expired)                                                  │
│                                                                          │
├─ Operation fails                                                        │
```

**Attack Surface**:
- Long-running extension sessions (hours)
- Operations near 2-hour token expiry
- SDK background refresh during critical operations
- Race between extension read and SDK write

**Frequency**:
- Medium (depends on session length and token TTL)
- Higher for users with long-running VS Code sessions
- Predictable timing (around 2-hour intervals)

**Impact**:
- **Operation failures**: Cached token becomes invalid mid-operation
- **Retry storms**: Failed operations trigger re-auth, causing delays
- **User confusion**: "Why do I need to login again?"

**Current Mitigation**:
```typescript
// AuthCacheManager with TTL-based expiration
setCachedAuthStatus(isAuthenticated: boolean, ttlMs: number = CACHE_TTL.AUTH_STATUS): void {
    this.cachedAuthStatus = isAuthenticated;
    this.authCacheExpiry = Date.now() + jitteredTTL;
}

// Cache expires after 30 seconds (CACHE_TTL.AUTH_STATUS)
// Forces re-check from Adobe CLI periodically
```

**TTL Configuration**:
```typescript
// From timeoutConfig.ts
CACHE_TTL.AUTH_STATUS = 30000;        // 30 seconds
CACHE_TTL.ORG_LIST = 300000;          // 5 minutes
CACHE_TTL.CONSOLE_WHERE = 60000;      // 1 minute
CACHE_TTL.VALIDATION = 3600000;       // 1 hour
```

**Recommendations**:
1. **File System Watcher**: Detect config file changes
   ```typescript
   const watcher = fs.watch('~/.adobe/config', (event) => {
       if (event === 'change') {
           this.invalidateCache();
           this.logger.debug('[Auth] Adobe CLI config changed externally');
       }
   });
   ```

2. **Token Version Tracking**: Adobe CLI writes version number
   ```typescript
   interface TokenCheck {
       token: string;
       expiry: number;
       lastModified: number; // File mtime
   }

   async function isTokenStale() {
       const cached = this.cachedToken;
       const fileStats = await fs.stat('~/.adobe/config');
       return fileStats.mtimeMs > cached.lastModified;
   }
   ```

3. **Shorter Cache TTLs Near Expiry**: Adaptive caching
   ```typescript
   function getCacheTTL(tokenExpiry: number): number {
       const timeUntilExpiry = tokenExpiry - Date.now();
       const minutesRemaining = timeUntilExpiry / 1000 / 60;

       if (minutesRemaining < 5) {
           return 5000; // 5 seconds (high risk)
       } else if (minutesRemaining < 30) {
           return 15000; // 15 seconds (medium risk)
       } else {
           return 30000; // 30 seconds (low risk)
       }
   }
   ```

**Status**: ⚠️ **MITIGATED** (short TTL reduces window, not eliminated)

---

### Vector 4: Cache Invalidation Races ⚠️ MITIGATED

**Vulnerability Description**:
Extension caches token/expiry, but Adobe CLI state changes externally without cache notification.

**Race Scenario**:
```
Extension Cache                   Adobe CLI                          External Process
│                                                                          │
├─ Cache: { token: "ABC", expiry: T1 }                                   │
│                                                                          │
│                                                                          ├─ aio auth logout
│                                                                          │
│                                                                          └─ Token cleared
│
├─ Use cached token "ABC"
│  (now invalid, logout happened)
│
├─ Operation fails with 401 Unauthorized
```

**Attack Surface**:
- User runs `aio auth logout` in terminal while extension running
- Other VS Code extensions using Adobe CLI
- Manual config file edits
- CI/CD scripts modifying Adobe CLI config

**Frequency**:
- Low (requires external mutation)
- Higher for power users using CLI directly
- Rare in typical extension-only usage

**Impact**:
- **401 Unauthorized errors**: Cached token invalid
- **Auth state desync**: Extension thinks authenticated, CLI says no
- **Confusing UX**: "Why isn't this working?"

**Current Mitigation**:
```typescript
// AuthCacheManager - Cache expiration
getCachedAuthStatus(): { isAuthenticated: boolean | undefined; isExpired: boolean } {
    const now = Date.now();
    const isExpired = now >= this.authCacheExpiry;

    return {
        isAuthenticated: isExpired ? undefined : this.cachedAuthStatus,
        isExpired,
    };
}

// Forces fresh check after 30 seconds
// Catches external mutations within TTL window
```

**Cache Jitter**:
```typescript
// SECURITY: Randomizes cache expiry by ±10% to prevent timing attacks
private getCacheTTLWithJitter(baseTTL: number): number {
    const jitter = 0.1; // ±10%
    const min = Math.floor(baseTTL * (1 - jitter));
    const max = Math.floor(baseTTL * (1 + jitter));
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

**Recommendations**:
1. **Config File Watcher**: Real-time invalidation (see Vector 3)
2. **Polling with Mtime Check**: Detect stale cache
   ```typescript
   async function validateCache(): Promise<boolean> {
       if (!this.cachedToken) return false;

       const stats = await fs.stat('~/.adobe/config');
       if (stats.mtimeMs > this.cacheTimestamp) {
           this.logger.debug('[Auth] Config file modified, cache stale');
           return false;
       }

       return true;
   }
   ```

3. **Error Recovery**: Detect 401 errors and auto-refresh
   ```typescript
   catch (error) {
       if (error.statusCode === 401) {
           this.logger.debug('[Auth] 401 detected, clearing cache');
           this.cacheManager.clearAuthStatusCache();

           // Retry operation with fresh token
           return this.retryWithFreshToken(operation);
       }
   }
   ```

**Status**: ⚠️ **MITIGATED** (TTL expiration catches within 30s, not real-time)

---

### Vector 5: Login Flow Races ⚠️ MITIGATED

**Vulnerability Description**:
User clicks login → Browser auth completes → Extension checks before Adobe CLI writes new token.

**Race Scenario**:
```
User Action                       Browser Auth                       Adobe CLI                     Extension
│                                                                                                      │
├─ Click "Login"                                                                                      │
│                                      │                                                              │
│                                      ├─ Open browser                                                │
│                                      │                                                              │
│                                      ├─ User authenticates                                          │
│                                      │                                                              │
│                                      ├─ Return token to CLI                                         │
│                                      │                                                              │
│                                                                     ├─ Process token                 │
│                                                                     │  (takes ~500ms)               │
│                                                                     │                                │
│                                                                                                      ├─ Check token (too early!)
│                                                                                                      │  (token not written yet)
│                                                                                                      │
│                                                                     ├─ Write to config               │
│                                                                     │  (~/.adobe/config)            │
│                                                                                                      │
│                                                                                                      ├─ Token missing
│                                                                                                      │  → Show error
```

**Attack Surface**:
- All login operations
- Post-login validation
- Org/project/workspace fetching after login

**Frequency**:
- Low (< 5% of logins)
- Timing-dependent (Adobe CLI write speed)
- Higher on slow file systems or high CPU load

**Impact**:
- **Login appears to fail**: Extension checks too early
- **Retry succeeds**: Second attempt finds token
- **User confusion**: "Why did it fail then work?"

**Current Mitigation (Beta.42+)**:
```typescript
// Login returns token directly (no need to poll)
async login(force = false): Promise<boolean> {
    // Execute login command
    const result = await this.commandManager.executeAdobeCLI(
        loginCommand,
        { encoding: 'utf8', timeout: TIMEOUTS.BROWSER_AUTH }
    );

    // Token returned in stdout (no polling needed)
    const token = result.stdout?.trim();

    if (token && token.length > 50) {
        // Store token immediately
        const stored = await this.tokenManager.storeAccessToken(token);

        if (stored) {
            // Token stored, update cache
            this.cacheManager.setCachedAuthStatus(true);
            return true;
        }
    }
}
```

**Additional Mitigation (Beta.49)**:
```typescript
// Clear auth cache so next check reads fresh state
this.cacheManager.setCachedAuthStatus(true);
this.cacheManager.clearValidationCache();
```

**Recommendations**:
1. **Polling with Timeout**: Wait for token write confirmation
   ```typescript
   async function waitForTokenWrite(timeout = 5000): Promise<boolean> {
       const startTime = Date.now();

       while (Date.now() - startTime < timeout) {
           const token = await this.tokenManager.getAccessToken();
           if (token) return true;

           await new Promise(resolve => setTimeout(resolve, 100));
       }

       return false;
   }
   ```

2. **Atomic Write Detection**: Adobe CLI logs write completion
   ```typescript
   // Watch Adobe CLI stdout for success message
   if (result.stdout.includes('Successfully authenticated')) {
       // Wait an additional 200ms for file write
       await new Promise(resolve => setTimeout(resolve, 200));
   }
   ```

**Status**: ⚠️ **MITIGATED** (login returns token directly, reduced polling)

---

## State Mutation Matrix

| Mutation Source | Frequency | Atomicity | Locking | Cache Invalidation | Risk Level |
|----------------|-----------|-----------|---------|-------------------|-----------|
| **User Login** | Low | Yes (beta.42+) | No | Immediate | **LOW** ✅ |
| **User Logout** | Low | Yes | No | Immediate | **LOW** ✅ |
| **Token Refresh** | Medium (2hr) | No | No | TTL-based (30s lag) | **MEDIUM** ⚠️ |
| **SDK Background** | Medium (2hr) | No | No | TTL-based (30s lag) | **MEDIUM** ⚠️ |
| **Other VS Code Windows** | Low | No | No | None (isolated) | **HIGH** ❌ |
| **External CLI Usage** | Low | No | No | TTL-based (30s lag) | **MEDIUM** ⚠️ |
| **Manual Config Edit** | Very Low | No | No | TTL-based (30s lag) | **LOW** ⚠️ |
| **Org Selection** | Low | Yes | No | Immediate | **LOW** ✅ |
| **Project Selection** | Low | Yes | No | Immediate | **LOW** ✅ |
| **Workspace Selection** | Low | Yes | No | Immediate | **LOW** ✅ |

### Mutation Coordination

**Internal Mutations** (Extension-Initiated):
- ✅ **Atomic**: Login, logout, org/project/workspace selection (beta.42+)
- ✅ **Cache Update**: Immediate invalidation after state change
- ✅ **Logging**: Comprehensive debug logs for all mutations
- ❌ **Locking**: No file locking (relies on Adobe CLI atomicity)

**External Mutations** (Outside Extension):
- ⚠️ **Detection**: TTL-based (30s lag, not real-time)
- ❌ **Coordination**: No inter-process coordination
- ❌ **File Watching**: No file system watchers implemented
- ⚠️ **Recovery**: Error-based recovery (401 → re-auth)

**Consistency Guarantees**:
- ✅ **Single CLI Call**: Beta.42+ uses atomic JSON read for token+expiry
- ✅ **Sequential Config Writes**: CommandExecutor queues Adobe CLI commands
- ⚠️ **Cache Consistency**: Eventually consistent (30s max lag)
- ❌ **Multi-Window Consistency**: No coordination across windows

---

## Token Lifecycle Deep Dive

### Complete Lifecycle Flow

```
[Birth] ──► [Validation] ──► [Usage] ──► [Refresh] ──► [Expiry] ──► [Death]
   │            │               │            │            │            │
   │            │               │            │            │            │
   ▼            ▼               ▼            ▼            ▼            ▼
Login       isTokenValid   API Calls    SDK Auto     Expiry       Logout
Browser     + Cache        + Headers    Refresh      Detected
Auth        Check                       (2hr)        (cache stale)
```

---

### Phase 1: Birth (Login)

**Normal Flow**:
```
User Click                Browser Auth              Adobe CLI                Extension
    │                                                                            │
    ├─ Click "Login" ────────────────────────────────────────────────────────► │
    │                                                                            │
    │                           │                                                │
    │                           ├─ Open browser                                 │
    │                           │                                                │
    │                           ├─ User authenticates                           │
    │                           │                                                │
    │                           ├─ Return token                                 │
    │                           │                        │                       │
    │                                                    ├─ Store token          │
    │                                                    │                       │
    │                                                    ├─ Store expiry         │
    │                                                    │  (now + 2 hours)      │
    │                                                    │                       │
    │                                                    ├─ Return token ──────► │
    │                                                                            │
    │                                                                            ├─ Cache token
    │                                                                            │
    │                                                                            ├─ Verify orgs
    │                                                                            │
    │                                                                            ├─ Success!
```

**Race Windows**:
- ✅ **Race A (FIXED)**: Extension queries token+expiry separately → Atomic JSON read (beta.42)
- ⚠️ **Race B**: Extension checks before Adobe CLI write complete → Mitigated (token returned directly)
- ❌ **Race C**: Another window logs out during login → No coordination

**Error Paths**:
```typescript
// Beta.50 error handling
try {
    const loginSuccess = await this.authManager.login(force);

    if (!loginSuccess) {
        throw new Error('Login failed or timed out');
    }

    // Verify token has valid expiry
    const postLoginToken = await this.inspectToken();

    if (postLoginToken.token && postLoginToken.expiresIn === 0) {
        // Token corruption detected
        throw new Error('ADOBE_CLI_TOKEN_CORRUPTION: ...');
    }

} catch (error) {
    if (error.message.includes('ADOBE_CLI_TOKEN_CORRUPTION')) {
        // Show detailed recovery instructions
        this.showTokenCorruptionError();
    } else if (error.message.includes('timeout')) {
        // Browser auth timed out
        this.showTimeoutError();
    } else {
        // Generic error
        this.showGenericError(error);
    }
}
```

**Current State (Beta.50)**:
- ✅ Atomic token read prevents corruption
- ✅ Token returned directly (no polling)
- ✅ Cache updated immediately after login
- ✅ SDK re-initialized with fresh token
- ⚠️ No protection against concurrent window logout
- ✅ Comprehensive error handling with recovery instructions

---

### Phase 2: Validation

**Quick Auth Check** (`isAuthenticatedQuick`):
```typescript
// Performance: < 1 second (token only, no org validation)
async isAuthenticatedQuick(): Promise<boolean> {
    // 1. Check cache first (30s TTL)
    const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
    if (!isExpired && isAuthenticated !== undefined) {
        return isAuthenticated;
    }

    // 2. Query Adobe CLI (atomic read)
    const isValid = await this.tokenManager.isTokenValid();

    // 3. Update cache
    this.cacheManager.setCachedAuthStatus(isValid);

    return isValid;
}
```

**Full Auth Check** (`isAuthenticated`):
```typescript
// Performance: 3-10 seconds (includes org validation + SDK init)
async isAuthenticated(): Promise<boolean> {
    // 1. Check cache first (30s TTL)
    const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
    if (!isExpired && isAuthenticated !== undefined) {
        return isAuthenticated;
    }

    // 2. Validate token
    const isValid = await this.tokenManager.isTokenValid();

    if (isValid) {
        // 3. Validate org context
        await this.organizationValidator.validateAndClearInvalidOrgContext();

        // 4. Initialize SDK (non-blocking)
        this.sdkClient.initialize().catch(error => {
            // SDK failure not critical - fall back to CLI
        });

        // 5. Update cache
        this.cacheManager.setCachedAuthStatus(true);

        return true;
    }

    return false;
}
```

**Token Validation** (`isTokenValid`):
```typescript
async isTokenValid(): Promise<boolean> {
    // 1. Get token (atomic read, beta.42+)
    const token = await this.getAccessToken();
    if (!token) return false;

    // 2. Get expiry (atomic read with token)
    const expiry = await this.getTokenExpiry();
    if (!expiry) return true; // Assume valid if no expiry info

    // 3. Check expiry timestamp
    const now = Date.now();
    const isValid = expiry > now;

    return isValid;
}
```

**Race Windows**:
- ✅ **Race A (FIXED)**: Separate token/expiry queries → Atomic JSON read (beta.42)
- ⚠️ **Race B**: Token valid during check, expires before use → TTL cache (30s)
- ⚠️ **Race C**: Adobe CLI updates token after check → TTL cache (30s lag)
- ❌ **Race D**: Another window logs out after check → No coordination

**Signature Validation**:
```typescript
// SECURITY: Generic token validation without disclosing format
if (typeof cleanOutput === 'string' && cleanOutput.length > 100) {
    return cleanOutput; // Adobe tokens are typically 100+ characters
}
```
**Note**: No cryptographic signature validation. Extension trusts Adobe CLI to validate token.

**Current State (Beta.50)**:
- ✅ Atomic token+expiry read
- ✅ Cache with 30s TTL (reduces CLI calls)
- ✅ Length-based validation (> 100 chars)
- ⚠️ No cryptographic validation
- ⚠️ Cache staleness up to 30s

---

### Phase 3: Usage

**Token Injection Methods**:

1. **Adobe CLI Commands** (Most Common):
```typescript
// Token automatically used by Adobe CLI
await this.commandManager.executeAdobeCLI('aio console org list');
// Adobe CLI reads token from ~/.adobe/config internally
```

2. **Adobe Console SDK** (30x Faster):
```typescript
// Token passed explicitly to SDK
const accessToken = await getToken('cli');
this.sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');

// SDK uses token for direct API calls (bypasses CLI)
const orgs = await this.sdkClient.getOrganizations();
```

3. **Manual Token Injection** (Rare):
```typescript
// For non-Adobe APIs that need Adobe auth
const token = await this.tokenManager.getAccessToken();
const headers = {
    'Authorization': `Bearer ${token}`
};
```

**Race Windows**:
- ⚠️ **Race A**: Token cached, expires before use → Operation fails with 401
- ⚠️ **Race B**: Adobe CLI refreshes token mid-operation → Operation may fail
- ⚠️ **Race C**: Another window logs out during operation → Operation fails
- ⚠️ **Race D**: SDK auto-refresh during CLI operation → Inconsistent state

**Error Handling**:
```typescript
try {
    const result = await this.adobeOperation();
} catch (error) {
    if (error.statusCode === 401 || error.message.includes('unauthorized')) {
        // Token expired or invalid
        this.cacheManager.clearAuthStatusCache();

        // Show re-auth prompt
        const action = await vscode.window.showWarningMessage(
            'Authentication expired. Sign in again?',
            'Sign In',
            'Cancel'
        );

        if (action === 'Sign In') {
            await this.authManager.login();
            // Retry operation
            return this.adobeOperation();
        }
    }
}
```

**Current State (Beta.50)**:
- ✅ Adobe CLI handles token automatically
- ✅ SDK provides 30x speedup for list operations
- ✅ Error recovery with re-auth prompt
- ⚠️ No token refresh logic (relies on Adobe CLI)
- ⚠️ 401 errors trigger full re-auth (not token refresh)

---

### Phase 4: Refresh

**Who Initiates Refresh?**

1. **Adobe CLI SDK** (Automatic):
   - Background refresh ~30 minutes before expiry
   - Extension has no control or visibility
   - May cause race conditions during operations

2. **Extension** (Manual):
   - No automatic refresh implemented
   - Relies on Adobe CLI SDK for refresh
   - Cache expiration forces re-check, not refresh

**Refresh Timing**:
```
Token Created                    Refresh Window                      Expiry
     │                                                                  │
     │◄────────────────── 2 Hours ─────────────────────────────────►  │
     │                                                                  │
     │                              │◄──── 30 min ────►│               │
     │                              │                  │               │
     │                              │                  │               │
     │                          SDK Refresh       Token Expires        │
     │                          (~90 min)         (120 min)            │
     │                                                                  │
     └──────────────────────────────────────────────────────────────► Time
```

**Race Windows**:
- ⚠️ **Race A**: SDK refreshes during extension operation
  ```
  Extension                          Adobe CLI SDK                     Config File
      │                                                                      │
      ├─ Read token (T1) ──────────────────────────────────────────────► Read
      │                                                                      │
      │                                   ├─ Refresh triggered               │
      │                                   │                                  │
      │                                   ├─ Write new token ─────────────► Write (T2)
      │                                                                      │
      ├─ Use token (T1)                                                      │
      │  (now invalid)                                                       │
      │                                                                      │
      ├─ Operation fails (401)                                              │
  ```
  **Mitigation**: Cache TTL (30s) reduces window, 401 triggers re-auth

- ⚠️ **Race B**: Multiple windows trigger refresh simultaneously
  ```
  Window A                          Window B                           Adobe CLI SDK
      │                                │                                      │
      ├─ Operation (token T1)          │                                      │
      │                                │                                      │
      │                                ├─ Operation (token T1)                │
      │                                │                                      │
      ├─ Cache miss ───────────────────────────────────────────────────────► │
      │                                │                                      │
      │                                ├─ Cache miss ──────────────────────► │
      │                                │                                      │
      │                                                                       ├─ Refresh (2x!)
  ```
  **Mitigation**: None (no multi-window coordination)

**Current Refresh Logic**:
```typescript
// NO EXPLICIT REFRESH IMPLEMENTED
// Relies on:
// 1. Adobe CLI SDK automatic refresh
// 2. Cache expiration forcing re-check
// 3. 401 errors triggering re-auth
```

**Recommendations**:
1. **Proactive Refresh**: Check expiry and refresh before operations
   ```typescript
   async function ensureFreshToken(): Promise<void> {
       const expiry = await this.getTokenExpiry();
       const now = Date.now();
       const minutesRemaining = (expiry - now) / 1000 / 60;

       if (minutesRemaining < 10) {
           // Less than 10 minutes remaining, trigger refresh
           await this.authManager.login(true); // Force refresh
       }
   }
   ```

2. **Refresh Lock**: Prevent concurrent refreshes
   ```typescript
   private isRefreshing = false;

   async function refreshToken(): Promise<void> {
       if (this.isRefreshing) {
           // Wait for existing refresh
           await this.pollUntilCondition(() => !this.isRefreshing);
           return;
       }

       this.isRefreshing = true;
       try {
           await this.authManager.login(true);
       } finally {
           this.isRefreshing = false;
       }
   }
   ```

3. **Refresh Events**: Notify all windows of token update
   ```typescript
   context.globalState.update('adobe.token.version', version);

   context.globalState.onDidChange((key) => {
       if (key === 'adobe.token.version') {
           this.cacheManager.clearAll();
           this.logger.info('Token refreshed in another window');
       }
   });
   ```

**Current State (Beta.50)**:
- ⚠️ No explicit refresh logic
- ⚠️ Relies on Adobe CLI SDK background refresh
- ⚠️ No visibility into refresh timing
- ⚠️ No coordination across windows
- ✅ 401 errors trigger re-auth as fallback

---

### Phase 5: Expiry & Death

**Expiry Detection**:
```typescript
async function isTokenExpired(): Promise<boolean> {
    const expiry = await this.getTokenExpiry();
    if (!expiry) return false; // No expiry info, assume valid

    const now = Date.now();
    return now >= expiry;
}
```

**Grace Periods**:
```typescript
// Cache TTL provides implicit grace period
CACHE_TTL.AUTH_STATUS = 30000; // 30 seconds

// Token may be expired but cache still valid
// Next operation after cache expiry will detect expiration
```

**Cleanup Procedures**:
```typescript
async function logout(): Promise<void> {
    // 1. Clear Adobe CLI config
    await this.commandManager.executeAdobeCLI('aio auth logout');

    // 2. Clear SDK client
    this.sdkClient = undefined;

    // 3. Clear all caches
    this.cacheManager.clearAll();

    // 4. Log success
    this.stepLogger.logTemplate('adobe-setup', 'success', { item: 'Logout' });
}
```

**Race Windows**:
- ⚠️ **Race A**: Token expires between cache check and usage
  ```
  T0: Check cache (valid, 29s remaining)
  T1: Use cached result (isAuthenticated = true)
  T2: Start operation
  T3: Cache expires (30s)
  T4: Token expires (60s)
  T5: Operation fails (token expired)
  ```
  **Window**: Up to 31 seconds (cache TTL + timing skew)
  **Mitigation**: Short cache TTL (30s) limits exposure

- ⚠️ **Race B**: Logout in one window, operation in another
  ```
  Window A                          Window B                           Adobe CLI
      │                                │                                      │
      ├─ Check auth (valid)            │                                      │
      │                                │                                      │
      │                                ├─ Logout ──────────────────────────► │
      │                                │                                      │
      │                                                                       ├─ Clear token
      │                                                                       │
      ├─ Start operation (cached)                                            │
      │  (token now invalid)                                                 │
      │                                                                       │
      ├─ Operation fails (401)                                               │
  ```
  **Mitigation**: None (no multi-window coordination)

- ⚠️ **Race C**: External logout during operation
  ```
  Extension                          Terminal                           Adobe CLI
      │                                │                                      │
      ├─ Check auth (valid)            │                                      │
      │                                │                                      │
      │                                ├─ aio auth logout                     │
      │                                │                                      │
      │                                                                       ├─ Clear token
      │                                                                       │
      ├─ Start operation (cached)                                            │
      │  (token now invalid)                                                 │
      │                                                                       │
      ├─ Operation fails (401)                                               │
  ```
  **Mitigation**: Cache expiration (30s) + 401 error recovery

**Current State (Beta.50)**:
- ✅ Clean logout procedure
- ✅ All caches cleared on logout
- ✅ SDK client cleared on logout
- ✅ 401 error recovery with re-auth
- ⚠️ Cache staleness up to 30s
- ❌ No multi-window logout coordination
- ⚠️ No external logout detection (TTL-based)

---

## Historical Bug Timeline

| Beta | Issue | Root Cause | Fix Applied | Effectiveness | Recurrence |
|------|-------|------------|-------------|---------------|-----------|
| **34** | Auth rewrite | Legacy `@adobe/aio-lib-ims` issues | Complete rewrite with new auth system | ✅ Successful | N/A |
| **35** | Timeout issues | Aggressive timeouts (5s) | Increased to 10s for config writes | ⚠️ Partial | Beta 36-40 |
| **36** | Expiry logging | No visibility into token expiry | Added debug logging for expiry | ✅ Successful | - |
| **39** | Corrupted token detection | No validation after login | Added post-login token inspection | ⚠️ Partial | Beta 41 |
| **40** | Enhanced logging | Insufficient debugging info | Added comprehensive token inspection logs | ✅ Successful | - |
| **41** | **Token corruption** | **`Promise.all()` race condition** | None (broken version) | ❌ Broken | - |
| **42** | **Token corruption** | **`Promise.all()` race condition** | **Atomic JSON query** | ✅ **FIXED** | - |
| **47** | Org switching | Logs unclear, timing issues | Standardized log symbols | ✅ Successful | - |
| **49** | Login timeout | Auth cache not updated after login | Update cache immediately post-login | ✅ **FIXED** | - |
| **50** | UI timing | Stale messages shown during auth | Clear state immediately on auth start | ✅ **FIXED** | - |
| **50** | SDK not re-init | SDK cleared on logout but not re-init | Re-initialize SDK after login | ✅ **FIXED** | - |
| **50** | Verbose logs | Excessive debug logging | Reduced verbosity, key events only | ✅ Successful | - |

### Pattern Analysis: Why 16+ Betas to Stabilize?

**Primary Factors**:

1. **Complex State Management** (8 betas: 34-42)
   - Token, expiry, org, project, workspace, SDK state
   - Multiple caches with different TTLs
   - Cache invalidation dependencies
   - State sync between Adobe CLI and extension

2. **External Dependencies** (6 betas: 35-40)
   - Adobe CLI reliability issues
   - Adobe Console SDK initialization failures
   - Network timeouts
   - File system timing variations

3. **Async Race Conditions** (4 betas: 39-42)
   - Token/expiry non-atomic reads (beta.41 → beta.42)
   - Cache staleness after login (beta.48 → beta.49)
   - SDK not re-initialized (beta.49 → beta.50)
   - UI state timing issues (beta.49 → beta.50)

4. **Limited Testing Coverage** (All betas)
   - No automated integration tests
   - Manual testing only
   - Edge cases discovered in production
   - Multi-window scenarios not tested

5. **Incremental Discovery** (Beta 34-50)
   ```
   Beta 34: Rewrite authentication system
      ↓
   Beta 35-36: Discover timeout issues
      ↓
   Beta 39-40: Discover token corruption
      ↓
   Beta 41: Corruption worsens (Promise.all race)
      ↓
   Beta 42: Fix atomic token read (PRIMARY FIX)
      ↓
   Beta 47: Polish logging
      ↓
   Beta 49: Fix cache not updated after login
      ↓
   Beta 50: Fix SDK not re-init, UI timing
   ```

**Secondary Factors**:
- Adobe CLI behavior changes between versions
- macOS file system caching variability
- VS Code extension host restart timing
- Browser auth flow timing variations

**Key Insight**: Authentication is inherently difficult due to:
- Multiple sources of truth (Adobe CLI, SDK, cache, UI)
- External mutations (CLI, SDK, other windows, manual edits)
- Timing-dependent operations (browser auth, file I/O, network)
- State consistency across boundaries

---

## Defensive Programming Assessment (Beta.50)

### Strengths ✅

#### 1. Atomic Token Fetching (Beta.42+)
```typescript
// ✅ GOOD: Single JSON query for token+expiry
const result = await this.commandManager.executeAdobeCLI(
    'aio config get ims.contexts.cli.access_token --json',
    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
);

const tokenData = JSON.parse(cleanOutput);
const token = tokenData.token;
const expiry = tokenData.expiry || 0;
```
**Why Good**: Eliminates race condition between separate queries.

#### 2. Comprehensive Timeout Handling
```typescript
// ✅ GOOD: Timeout configuration with success detection
try {
    const result = await this.commandManager.executeAdobeCLI(
        command,
        { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_WRITE } // 10s
    );
} catch (error) {
    // Check for success despite timeout
    if (error.stdout && error.stdout.includes('Project selected :')) {
        return true; // Command succeeded despite timeout
    }
    throw error;
}
```
**Why Good**: Adobe CLI slow but succeeds; extension detects success in timeout scenario.

#### 3. Type System (TypeScript)
```typescript
// ✅ GOOD: Strong typing prevents many runtime errors
interface AdobeOrg {
    id: string;
    code: string;
    name: string;
}

async function getOrganizations(): Promise<AdobeOrg[]> {
    // Type-safe return value
}
```
**Why Good**: Compile-time type checking catches many bugs.

#### 4. Structured Error Handling
```typescript
// ✅ GOOD: Specific error types with recovery instructions
if (error.message.includes('ADOBE_CLI_TOKEN_CORRUPTION')) {
    vscode.window.showErrorMessage(
        'Adobe CLI token corrupted. Try:\n' +
        '1. aio logout -f && aio login -f\n' +
        '2. If that fails, reinstall: npm install -g @adobe/aio-cli',
        'Open Terminal'
    );
}
```
**Why Good**: Users get actionable recovery steps.

#### 5. Cache with TTL
```typescript
// ✅ GOOD: Cache expiration prevents stale data
setCachedAuthStatus(isAuthenticated: boolean, ttlMs: number = 30000): void {
    this.cachedAuthStatus = isAuthenticated;
    this.authCacheExpiry = Date.now() + ttlMs;
}

getCachedAuthStatus(): { isAuthenticated: boolean | undefined; isExpired: boolean } {
    const now = Date.now();
    const isExpired = now >= this.authCacheExpiry;
    return {
        isAuthenticated: isExpired ? undefined : this.cachedAuthStatus,
        isExpired,
    };
}
```
**Why Good**: Balances performance (caching) with consistency (TTL expiration).

#### 6. Security: Input Validation
```typescript
// ✅ GOOD: Validate before using in commands
import { validateOrgId, validateProjectId } from '@/shared/validation';

async function selectOrganization(orgId: string): Promise<boolean> {
    // SECURITY: Validate to prevent command injection
    validateOrgId(orgId);

    await this.commandManager.executeAdobeCLI(
        `aio console org select ${orgId}`
    );
}
```
**Why Good**: Prevents command injection attacks.

#### 7. Resource Locking
```typescript
// ✅ GOOD: Mutual exclusion for Adobe CLI config access
class ResourceLocker {
    async executeExclusive<T>(resource: string, operation: () => Promise<T>): Promise<T> {
        const currentLock = this.locks.get(resource) || Promise.resolve();

        let releaseLock: () => void;
        const newLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        const resultPromise = currentLock
            .then(() => operation())
            .finally(() => releaseLock!());

        this.locks.set(resource, newLock);
        return resultPromise;
    }
}
```
**Why Good**: Prevents concurrent Adobe CLI operations from corrupting state.

#### 8. Logging with Context
```typescript
// ✅ GOOD: Structured logging with timing
this.logger.debug(`[Auth] Operation completed in ${duration}ms`);
this.logger.debug(`[Token] Expiry: ${expiry}, Current: ${now}, Diff: ${expiry - now}`);
```
**Why Good**: Makes debugging timing-based issues much easier.

---

### Weaknesses ⚠️

#### 1. No File Locking on Adobe Config
```typescript
// ⚠️ WEAK: No file-level locking
async function readAdobeConfig(): Promise<string> {
    // Multiple processes can read/write simultaneously
    return await fs.readFile('~/.adobe/config');
}
```
**Why Weak**: Multiple VS Code windows or external processes can cause corruption.

**Recommendation**:
```typescript
import lockfile from 'proper-lockfile';

async function readAdobeConfig(): Promise<string> {
    const configPath = '~/.adobe/config';
    const release = await lockfile.lock(configPath, {
        retries: { retries: 3, minTimeout: 100 }
    });

    try {
        return await fs.readFile(configPath, 'utf8');
    } finally {
        await release();
    }
}
```

#### 2. No Request Serialization
```typescript
// ⚠️ WEAK: No serialization of concurrent requests
async function getOrganizations(): Promise<AdobeOrg[]> {
    // If called twice concurrently, both hit Adobe API
    const result = await this.commandManager.executeAdobeCLI(
        'aio console org list --json'
    );
    // ...
}
```
**Why Weak**: Wasted API calls, potential rate limiting.

**Recommendation**:
```typescript
private pendingOrgFetch: Promise<AdobeOrg[]> | null = null;

async function getOrganizations(): Promise<AdobeOrg[]> {
    // Check cache first
    const cached = this.cacheManager.getCachedOrgList();
    if (cached) return cached;

    // If already fetching, wait for that
    if (this.pendingOrgFetch) {
        return this.pendingOrgFetch;
    }

    // Start new fetch
    this.pendingOrgFetch = this.fetchOrganizations();

    try {
        const result = await this.pendingOrgFetch;
        return result;
    } finally {
        this.pendingOrgFetch = null;
    }
}
```

#### 3. No Cache Staleness Detection
```typescript
// ⚠️ WEAK: Cache TTL only, no staleness detection
getCachedAuthStatus(): { isAuthenticated: boolean | undefined; isExpired: boolean } {
    const now = Date.now();
    const isExpired = now >= this.authCacheExpiry;

    // Only checks TTL, not actual config file state
    return {
        isAuthenticated: isExpired ? undefined : this.cachedAuthStatus,
        isExpired,
    };
}
```
**Why Weak**: External changes to Adobe config not detected until cache expires.

**Recommendation**:
```typescript
async function getCachedAuthStatus(): Promise<{ isAuthenticated: boolean | undefined; isExpired: boolean }> {
    const now = Date.now();
    const isTTLExpired = now >= this.authCacheExpiry;

    // Check if config file changed since cache was set
    if (!isTTLExpired && this.cacheTimestamp) {
        try {
            const stats = await fs.stat('~/.adobe/config');
            if (stats.mtimeMs > this.cacheTimestamp) {
                // File changed externally, cache is stale
                return { isAuthenticated: undefined, isExpired: true };
            }
        } catch (error) {
            // File doesn't exist or can't read
            return { isAuthenticated: undefined, isExpired: true };
        }
    }

    return {
        isAuthenticated: isTTLExpired ? undefined : this.cachedAuthStatus,
        isExpired: isTTLExpired,
    };
}
```

#### 4. No Retry Strategy for Transient Failures
```typescript
// ⚠️ WEAK: No retry for transient failures
async function getAccessToken(): Promise<string | undefined> {
    try {
        const result = await this.commandManager.executeAdobeCLI(
            'aio config get ims.contexts.cli.access_token.token'
        );
        // Single attempt, no retry
        return result.stdout?.trim();
    } catch (error) {
        return undefined;
    }
}
```
**Why Weak**: Network blips or file system delays cause failures.

**Recommendation**:
```typescript
async function getAccessToken(retries = 2): Promise<string | undefined> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await this.commandManager.executeAdobeCLI(
                'aio config get ims.contexts.cli.access_token.token',
                { timeout: TIMEOUTS.CONFIG_READ }
            );
            return result.stdout?.trim();
        } catch (error) {
            if (attempt < retries) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
                continue;
            }
            this.logger.debug(`[Token] Failed to get token after ${retries + 1} attempts`);
            return undefined;
        }
    }
}
```

---

### Missing ❌

#### 1. Multi-Window Coordination
```typescript
// ❌ MISSING: No coordination across VS Code windows
// Window A and Window B operate independently
// No shared state, no event notifications
```
**Why Missing**: Complex to implement, requires IPC or shared state.

**Recommendation**:
```typescript
// Use VS Code globalState with change notifications
async function initializeMultiWindowCoordination(context: vscode.ExtensionContext) {
    // Subscribe to token changes
    context.globalState.onDidChange((key) => {
        if (key === 'adobe.token.version') {
            const version = context.globalState.get<number>('adobe.token.version');

            if (version !== this.currentTokenVersion) {
                this.logger.info('[Auth] Token updated in another window');
                this.cacheManager.clearAll();
                this.currentTokenVersion = version;
            }
        }
    });

    // Increment token version on login/logout
    async function updateTokenVersion() {
        const current = context.globalState.get<number>('adobe.token.version', 0);
        await context.globalState.update('adobe.token.version', current + 1);
    }
}
```

#### 2. File System Watcher for Adobe Config
```typescript
// ❌ MISSING: No file system watcher
// External changes to ~/.adobe/config not detected until cache expires
```
**Why Missing**: Would add complexity, file system watchers can be finicky.

**Recommendation**:
```typescript
import * as chokidar from 'chokidar';

function initializeConfigWatcher() {
    const configPath = path.join(os.homedir(), '.adobe', 'config');

    const watcher = chokidar.watch(configPath, {
        persistent: false,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 100,
            pollInterval: 25
        }
    });

    watcher.on('change', (path) => {
        this.logger.debug('[Auth] Adobe CLI config changed externally');
        this.cacheManager.clearAll();
    });

    return watcher;
}
```

#### 3. Adobe CLI State Polling
```typescript
// ❌ MISSING: No polling for Adobe CLI state changes
// Relies entirely on cache expiration
```
**Why Missing**: Polling adds overhead, may not be worth the cost.

**Recommendation**:
```typescript
// Optional: Lightweight polling every 5 minutes
async function startBackgroundStateCheck() {
    setInterval(async () => {
        // Check if config file changed
        const stats = await fs.stat('~/.adobe/config');
        if (stats.mtimeMs > this.lastConfigCheck) {
            this.logger.debug('[Auth] Config file modified, clearing cache');
            this.cacheManager.clearAll();
            this.lastConfigCheck = stats.mtimeMs;
        }
    }, 300000); // 5 minutes
}
```

#### 4. Comprehensive Retry Logic
```typescript
// ❌ MISSING: Limited retry strategies
// Only Adobe CLI commands have retry via RetryStrategyManager
// Auth operations don't use retry strategies
```
**Why Missing**: Added incrementally, auth system predates RetryStrategyManager.

**Recommendation**:
```typescript
// Use RetryStrategyManager for auth operations
const retryStrategy = this.retryManager.getStrategy('adobe-cli');

async function getAccessToken(): Promise<string | undefined> {
    return this.retryManager.executeWithRetry(
        async () => {
            const result = await this.commandManager.executeAdobeCLI(
                'aio config get ims.contexts.cli.access_token --json'
            );
            return result.stdout?.trim();
        },
        retryStrategy,
        'getAccessToken'
    );
}
```

---

## Testing Gap Analysis

### Critical Gaps (Must Address)

#### 1. Multi-Window Concurrency Testing
**Current**: No tests
**Risk**: HIGH
**Recommendation**: Add integration tests

**Test Scenarios**:
```typescript
describe('Multi-Window Authentication', () => {
    it('should handle login in Window A while Window B is active', async () => {
        // 1. Open two VS Code windows
        const windowA = await openVSCodeWindow();
        const windowB = await openVSCodeWindow();

        // 2. Login in Window A
        await windowA.executeCommand('demoBuilder.login');

        // 3. Verify Window B detects new auth state
        const isAuthB = await windowB.getAuthStatus();
        expect(isAuthB).toBe(true);
    });

    it('should handle logout in Window A while Window B is running operation', async () => {
        const windowA = await openVSCodeWindow();
        const windowB = await openVSCodeWindow();

        // Both windows authenticated
        await windowA.executeCommand('demoBuilder.login');

        // Window B starts long-running operation
        const operationPromise = windowB.executeCommand('demoBuilder.deployMesh');

        // Window A logs out mid-operation
        await windowA.executeCommand('demoBuilder.logout');

        // Window B operation should fail gracefully
        await expect(operationPromise).rejects.toThrow('Authentication expired');

        // Window B should show re-auth prompt
        const notifications = await windowB.getNotifications();
        expect(notifications).toContainEqual(
            expect.objectContaining({ message: 'Sign in again?' })
        );
    });

    it('should handle concurrent org selection in multiple windows', async () => {
        const windowA = await openVSCodeWindow();
        const windowB = await openVSCodeWindow();

        await windowA.executeCommand('demoBuilder.login');

        // Both windows select different orgs simultaneously
        await Promise.all([
            windowA.selectOrganization('org-A'),
            windowB.selectOrganization('org-B')
        ]);

        // Verify one org wins (last write)
        const currentOrg = await windowA.getCurrentOrganization();
        const currentOrgB = await windowB.getCurrentOrganization();

        expect(currentOrg).toBe(currentOrgB); // Same org in both windows
        expect(['org-A', 'org-B']).toContain(currentOrg); // One of the two
    });
});
```

#### 2. Token Expiry Boundary Testing
**Current**: No tests
**Risk**: MEDIUM
**Recommendation**: Add unit tests

**Test Scenarios**:
```typescript
describe('Token Expiry Boundaries', () => {
    it('should handle token exactly at expiry', async () => {
        const now = Date.now();
        mockAdobeCLI({
            token: 'valid-token',
            expiry: now // Exactly now
        });

        const isValid = await tokenManager.isTokenValid();
        expect(isValid).toBe(false); // Expired (now >= expiry)
    });

    it('should handle token 1 second before expiry', async () => {
        const now = Date.now();
        mockAdobeCLI({
            token: 'valid-token',
            expiry: now + 1000 // 1 second remaining
        });

        const isValid = await tokenManager.isTokenValid();
        expect(isValid).toBe(true); // Still valid
    });

    it('should handle token 1 second after expiry', async () => {
        const now = Date.now();
        mockAdobeCLI({
            token: 'valid-token',
            expiry: now - 1000 // Expired 1 second ago
        });

        const isValid = await tokenManager.isTokenValid();
        expect(isValid).toBe(false);
    });

    it('should handle token with no expiry field', async () => {
        mockAdobeCLI({
            token: 'valid-token',
            expiry: undefined
        });

        const isValid = await tokenManager.isTokenValid();
        expect(isValid).toBe(true); // Assume valid if no expiry
    });

    it('should handle malformed expiry values', async () => {
        mockAdobeCLI({
            token: 'valid-token',
            expiry: 'invalid' // String instead of number
        });

        const isValid = await tokenManager.isTokenValid();
        expect(isValid).toBe(true); // Graceful degradation
    });
});
```

#### 3. Cache Staleness Testing
**Current**: No tests
**Risk**: MEDIUM
**Recommendation**: Add integration tests

**Test Scenarios**:
```typescript
describe('Cache Staleness', () => {
    it('should detect when Adobe CLI config changes externally', async () => {
        // 1. Cache token
        await authService.isAuthenticated(); // Caches result

        // 2. Externally modify config
        await modifyAdobeConfigFile({ token: 'new-token' });

        // 3. Check if cache is invalidated (within TTL)
        const isAuth = await authService.isAuthenticated();

        // Should detect change and use new token
        expect(authService.getToken()).toBe('new-token');
    });

    it('should handle cache expiration during long-running operation', async () => {
        // 1. Cache token (30s TTL)
        await authService.isAuthenticated();

        // 2. Wait 31 seconds (cache expires)
        await sleep(31000);

        // 3. Start operation (should re-check auth)
        const operation = authService.deployMesh();

        // Should not use stale cache
        expect(authService.wasCacheUsed()).toBe(false);
    });

    it('should handle concurrent cache invalidation', async () => {
        // Multiple operations invalidating cache simultaneously
        await Promise.all([
            authService.clearCache(),
            authService.clearCache(),
            authService.clearCache()
        ]);

        // Should not throw errors
        const isAuth = await authService.isAuthenticated();
        expect(typeof isAuth).toBe('boolean');
    });
});
```

#### 4. Adobe CLI Timeout Scenarios
**Current**: Manual testing only
**Risk**: HIGH
**Recommendation**: Add integration tests

**Test Scenarios**:
```typescript
describe('Adobe CLI Timeouts', () => {
    it('should detect success in stdout despite timeout', async () => {
        mockAdobeCLI({
            timeout: true,
            stdout: 'Project selected : my-project\n',
            exitCode: null // Timeout, no exit code
        });

        const result = await authService.selectProject('my-project');
        expect(result).toBe(true); // Success detected despite timeout
    });

    it('should handle timeout with no success indicator', async () => {
        mockAdobeCLI({
            timeout: true,
            stdout: 'Still processing...\n',
            exitCode: null
        });

        await expect(authService.selectProject('my-project')).rejects.toThrow('timeout');
    });

    it('should retry on timeout', async () => {
        let attempt = 0;
        mockAdobeCLI(() => {
            attempt++;
            if (attempt < 3) {
                return { timeout: true, stdout: '', exitCode: null };
            }
            return { stdout: 'Project selected :', exitCode: 0 };
        });

        const result = await authService.selectProject('my-project');
        expect(result).toBe(true);
        expect(attempt).toBe(3);
    });
});
```

---

### Recommended Test Suite

```typescript
describe('Authentication System', () => {
    describe('Token Corruption Prevention', () => {
        it('should fetch token and expiry atomically');
        it('should handle concurrent token queries');
        it('should handle Adobe CLI state changes during query');
        it('should detect corrupted token (expiry = 0)');
        it('should recover from token corruption automatically');
    });

    describe('Multi-Window Scenarios', () => {
        it('should coordinate login across windows');
        it('should coordinate logout across windows');
        it('should handle concurrent org selection');
        it('should handle logout during operation in another window');
    });

    describe('Cache Consistency', () => {
        it('should invalidate cache on external config change');
        it('should handle cache expiration mid-operation');
        it('should prevent stale cache usage');
        it('should apply TTL jitter correctly');
    });

    describe('Token Lifecycle', () => {
        it('should handle login flow end-to-end');
        it('should validate token expiry correctly');
        it('should refresh token before expiry');
        it('should detect token expiration');
        it('should handle logout cleanup');
    });

    describe('Error Recovery', () => {
        it('should recover from 401 errors');
        it('should recover from timeout with success');
        it('should handle Adobe CLI hangs');
        it('should handle corrupted config file');
        it('should handle network failures');
    });

    describe('Concurrency', () => {
        it('should serialize Adobe CLI config writes');
        it('should handle rapid authentication clicks');
        it('should handle concurrent API calls');
        it('should prevent double-login');
    });

    describe('Security', () => {
        it('should validate org IDs before use');
        it('should validate project IDs before use');
        it('should sanitize token logs (no token in logs)');
        it('should prevent command injection');
    });
});
```

---

## Root Cause Taxonomy

### Category 1: Concurrency Issues

#### 1.1 Non-Atomic Operations
- **Beta.41 Issue**: `Promise.all()` fetching token and expiry separately
- **Status**: ✅ FIXED (beta.42) - Atomic JSON query
- **Lesson**: Always fetch related state atomically when consistency matters

#### 1.2 Missing Locks
- **Issue**: No file locking on `~/.adobe/config`
- **Status**: ❌ VULNERABLE - Multiple windows can corrupt state
- **Lesson**: External resources need locking when multiple processes access

#### 1.3 Race Conditions
- **Issue**: Token cached, Adobe CLI updates externally
- **Status**: ⚠️ MITIGATED - TTL cache (30s lag)
- **Lesson**: TTL-based caching is eventually consistent, not immediately

#### 1.4 TOCTOU (Time-Of-Check to Time-Of-Use)
- **Issue**: Check auth status → Use cached token → Token expires between check and use
- **Status**: ⚠️ MITIGATED - Short cache TTL (30s) limits window
- **Lesson**: Short TTLs reduce race windows but don't eliminate them

---

### Category 2: State Management

#### 2.1 Cache Invalidation
- **Issue**: Cache not updated after login (beta.49)
- **Status**: ✅ FIXED (beta.49) - Immediate cache update
- **Lesson**: State mutations must update all related caches

#### 2.2 Stale Data
- **Issue**: Extension uses cached token, Adobe CLI updated externally
- **Status**: ⚠️ MITIGATED - TTL expiration (30s lag)
- **Lesson**: External mutations need detection mechanism (file watcher or polling)

#### 2.3 Inconsistent State
- **Issue**: SDK not re-initialized after login (beta.50)
- **Status**: ✅ FIXED (beta.50) - Re-init SDK on login
- **Lesson**: All components using auth state must be updated on change

#### 2.4 Missing Validation
- **Issue**: Token stored but never validated for corruption
- **Status**: ✅ FIXED (beta.42) - Post-login validation
- **Lesson**: Always validate critical state after mutations

---

### Category 3: External Dependencies

#### 3.1 Adobe CLI Behavior
- **Issue**: Adobe CLI slow (10s+ for config writes)
- **Status**: ✅ MITIGATED - Increased timeouts + success detection
- **Lesson**: Don't rely on exit codes alone; parse stdout for success

#### 3.2 SDK Background Operations
- **Issue**: Adobe CLI SDK may refresh tokens automatically
- **Status**: ⚠️ MITIGATED - TTL cache limits exposure
- **Lesson**: Background operations by dependencies are hard to control

#### 3.3 File System Timing
- **Issue**: File writes not immediately visible to other processes
- **Status**: ⚠️ MITIGATED - Polling with delays
- **Lesson**: File system operations need grace periods

#### 3.4 Network Latency
- **Issue**: Browser auth flow timing varies (20s-120s)
- **Status**: ✅ MITIGATED - 2-minute timeout + user feedback
- **Lesson**: Network operations need generous timeouts

---

### Category 4: Error Handling

#### 4.1 Missing Timeouts
- **Issue**: Operations hung indefinitely
- **Status**: ✅ FIXED - All operations have timeouts
- **Lesson**: Every I/O operation must have a timeout

#### 4.2 Incomplete Retries
- **Issue**: Single failure → immediate error
- **Status**: ⚠️ PARTIAL - Adobe CLI has retries, auth operations don't
- **Lesson**: Retry strategies should be applied consistently

#### 4.3 Poor Error Messages
- **Issue**: "Authentication failed" with no context
- **Status**: ✅ FIXED (beta.42-50) - Detailed error messages with recovery steps
- **Lesson**: Error messages should include "what happened" + "what to do"

#### 4.4 No Recovery Mechanisms
- **Issue**: Errors required extension reload
- **Status**: ✅ FIXED - Automatic cache clearing + re-auth prompts
- **Lesson**: Provide self-healing mechanisms where possible

---

## Recommendations for Refactor Branch

### Priority 1: Must-Have (Critical) 🔴

These fixes address known vulnerabilities and should be applied immediately.

#### 1.1 Adopt Atomic Token Fetching (Beta.42 Fix)
**Effort**: 30 minutes
**Impact**: Eliminates primary token corruption issue

**Code Pattern**:
```typescript
// ❌ OLD (Broken)
const [tokenResult, expiryResult] = await Promise.all([
    this.getToken(),
    this.getExpiry()
]);

// ✅ NEW (Fixed)
const result = await this.commandManager.executeAdobeCLI(
    'aio config get ims.contexts.cli.access_token --json',
    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
);

const tokenData = JSON.parse(result.stdout);
const token = tokenData.token;
const expiry = tokenData.expiry || 0;
```

**Test Coverage**:
```typescript
it('should fetch token and expiry atomically', async () => {
    mockAdobeCLI({ token: 'abc123', expiry: 1234567890 });

    const result = await tokenManager.inspectToken();

    expect(result.token).toBe('abc123');
    expect(result.expiry).toBe(1234567890);
    expect(mockAdobeCLI).toHaveBeenCalledTimes(1); // Single call
});
```

**Files to Modify**:
- `src/features/authentication/services/tokenManager.ts` (or equivalent)

---

#### 1.2 Adopt Auth Cache Updates (Beta.49 Fix)
**Effort**: 15 minutes
**Impact**: Prevents login timeout errors

**Code Pattern**:
```typescript
async function login(force = false): Promise<boolean> {
    // ... perform login ...

    if (loginSuccess) {
        // ✅ CRITICAL: Update cache immediately
        this.cacheManager.setCachedAuthStatus(true);
        this.cacheManager.clearValidationCache();

        return true;
    }
}
```

**Test Coverage**:
```typescript
it('should update auth cache after successful login', async () => {
    await authService.login();

    const { isAuthenticated } = authService.getCachedAuthStatus();
    expect(isAuthenticated).toBe(true);
});
```

**Files to Modify**:
- Authentication service (wherever `login()` is implemented)

---

#### 1.3 Adopt SDK Re-Initialization (Beta.50 Fix)
**Effort**: 15 minutes
**Impact**: Restores 30x performance boost after login

**Code Pattern**:
```typescript
async function login(force = false): Promise<boolean> {
    // ... perform login ...

    if (loginSuccess) {
        // Update cache
        this.cacheManager.setCachedAuthStatus(true);

        // ✅ CRITICAL: Re-initialize SDK with fresh token
        await this.sdkClient.initialize();

        return true;
    }
}

async function logout(): Promise<void> {
    await this.commandManager.executeAdobeCLI('aio auth logout');

    // ✅ Clear SDK client
    this.sdkClient.clear();

    this.cacheManager.clearAll();
}
```

**Test Coverage**:
```typescript
it('should re-initialize SDK after login', async () => {
    await authService.logout(); // SDK cleared
    await authService.login();  // SDK should be re-initialized

    expect(authService.sdkClient.isInitialized()).toBe(true);
});
```

**Files to Modify**:
- Authentication service
- SDK client manager

---

### Priority 2: Should-Have (High) 🟠

These improvements significantly reduce race condition windows.

#### 2.1 File System Watcher for Adobe Config
**Effort**: 2 hours
**Impact**: Real-time cache invalidation on external changes

**Code Pattern**:
```typescript
import * as chokidar from 'chokidar';
import * as path from 'path';
import * as os from 'os';

class AuthCacheManager {
    private configWatcher: chokidar.FSWatcher | undefined;

    startConfigWatcher(): void {
        const configPath = path.join(os.homedir(), '.adobe', 'config');

        this.configWatcher = chokidar.watch(configPath, {
            persistent: false,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 25
            }
        });

        this.configWatcher.on('change', () => {
            this.logger.debug('[Auth] Adobe CLI config changed externally, clearing cache');
            this.clearAll();
        });
    }

    stopConfigWatcher(): void {
        if (this.configWatcher) {
            this.configWatcher.close();
            this.configWatcher = undefined;
        }
    }
}
```

**Dependencies**:
```json
{
  "dependencies": {
    "chokidar": "^3.5.3"
  }
}
```

**Test Coverage**:
```typescript
it('should invalidate cache when config file changes', async () => {
    authService.startConfigWatcher();

    // Cache auth status
    await authService.isAuthenticated();
    expect(authService.isCacheValid()).toBe(true);

    // Modify config externally
    await fs.writeFile('~/.adobe/config', JSON.stringify({ token: 'new' }));
    await sleep(200); // Wait for file watcher

    // Cache should be invalidated
    expect(authService.isCacheValid()).toBe(false);
});
```

---

#### 2.2 File Locking for Adobe Config Access
**Effort**: 3 hours
**Impact**: Prevents multi-window corruption

**Code Pattern**:
```typescript
import lockfile from 'proper-lockfile';

class CommandExecutor {
    async executeAdobeCLI(command: string, options?: ExecuteOptions): Promise<CommandResult> {
        // Get Adobe config path
        const configPath = path.join(os.homedir(), '.adobe', 'config');

        // Acquire file lock
        let release;
        try {
            release = await lockfile.lock(configPath, {
                retries: {
                    retries: 3,
                    minTimeout: 100,
                    maxTimeout: 1000
                },
                stale: 5000 // Consider lock stale after 5 seconds
            });
        } catch (error) {
            this.logger.warn('[Command Executor] Could not acquire lock on Adobe config, proceeding without lock');
            // Proceed without lock (degraded mode)
        }

        try {
            // Execute Adobe CLI command
            return await this.execute(command, options);
        } finally {
            // Release lock
            if (release) {
                await release();
            }
        }
    }
}
```

**Dependencies**:
```json
{
  "dependencies": {
    "proper-lockfile": "^4.1.2"
  }
}
```

**Test Coverage**:
```typescript
it('should serialize concurrent Adobe CLI operations', async () => {
    const start = Date.now();

    // Execute 3 operations concurrently
    await Promise.all([
        authService.selectOrganization('org-1'),
        authService.selectOrganization('org-2'),
        authService.selectOrganization('org-3')
    ]);

    const duration = Date.now() - start;

    // Should take ~3x longer than single operation (serialized)
    expect(duration).toBeGreaterThan(3000);
});
```

---

#### 2.3 Timeout Configuration Review
**Effort**: 1 hour
**Impact**: Reduces timeout-related failures

**Review Checklist**:
```typescript
// Current timeouts (from timeoutConfig.ts)
TIMEOUTS = {
    COMMAND_DEFAULT: 120000,      // 2 minutes - ✅ GOOD
    CONFIG_READ: 3000,            // 3 seconds - ⚠️ May be too short
    CONFIG_WRITE: 10000,          // 10 seconds - ✅ GOOD (increased from 5s)
    TOKEN_READ: 5000,             // 5 seconds - ⚠️ May be too short
    BROWSER_AUTH: 120000,         // 2 minutes - ✅ GOOD
    PROJECT_LIST: 30000,          // 30 seconds - ✅ GOOD
    WORKSPACE_LIST: 30000,        // 30 seconds - ✅ GOOD
};

// Recommended changes
TIMEOUTS = {
    COMMAND_DEFAULT: 120000,      // Keep
    CONFIG_READ: 5000,            // Increase to 5s
    CONFIG_WRITE: 10000,          // Keep
    TOKEN_READ: 10000,            // Increase to 10s (atomic JSON query may be slower)
    BROWSER_AUTH: 120000,         // Keep
    PROJECT_LIST: 30000,          // Keep
    WORKSPACE_LIST: 30000,        // Keep
};
```

**Success Detection Pattern**:
```typescript
try {
    const result = await this.executeWithTimeout(command, timeout);
    return result;
} catch (error) {
    // Check for success despite timeout
    if (error.stdout && error.stdout.includes(successIndicator)) {
        this.logger.debug(`[Command] Succeeded despite timeout: ${successIndicator}`);
        return { code: 0, stdout: error.stdout, stderr: error.stderr };
    }
    throw error;
}
```

---

### Priority 3: Nice-to-Have (Medium) 🟡

These enhancements improve robustness but are not critical.

#### 3.1 Request Deduplication
**Effort**: 2 hours
**Impact**: Reduces redundant API calls

**Code Pattern**:
```typescript
class AdobeEntityService {
    private pendingFetches = new Map<string, Promise<any>>();

    async getOrganizations(): Promise<AdobeOrg[]> {
        // Check cache first
        const cached = this.cacheManager.getCachedOrgList();
        if (cached) return cached;

        // Check if already fetching
        const pending = this.pendingFetches.get('organizations');
        if (pending) {
            this.logger.debug('[Entity Service] Waiting for pending org fetch');
            return pending;
        }

        // Start new fetch
        const fetchPromise = this.fetchOrganizations();
        this.pendingFetches.set('organizations', fetchPromise);

        try {
            const result = await fetchPromise;
            return result;
        } finally {
            this.pendingFetches.delete('organizations');
        }
    }
}
```

---

#### 3.2 Adaptive Cache TTLs
**Effort**: 1 hour
**Impact**: Reduces cache staleness near token expiry

**Code Pattern**:
```typescript
function getAdaptiveCacheTTL(tokenExpiry: number): number {
    const timeUntilExpiry = tokenExpiry - Date.now();
    const minutesRemaining = timeUntilExpiry / 1000 / 60;

    if (minutesRemaining < 5) {
        return 5000; // 5 seconds (very close to expiry)
    } else if (minutesRemaining < 30) {
        return 15000; // 15 seconds (approaching expiry)
    } else {
        return 30000; // 30 seconds (far from expiry)
    }
}
```

---

#### 3.3 Token Refresh Before Expiry
**Effort**: 3 hours
**Impact**: Reduces 401 errors from expired tokens

**Code Pattern**:
```typescript
async function ensureFreshToken(): Promise<void> {
    const expiry = await this.tokenManager.getTokenExpiry();
    if (!expiry) return; // No expiry info

    const now = Date.now();
    const minutesRemaining = (expiry - now) / 1000 / 60;

    if (minutesRemaining < 10) {
        this.logger.debug('[Auth] Token expiring soon, refreshing proactively');
        await this.login(true); // Force refresh
    }
}
```

---

### Priority 4: Future Enhancements 🔵

These are longer-term architectural improvements.

#### 4.1 Multi-Window Coordination via globalState
**Effort**: 8 hours
**Impact**: Eliminates multi-window race conditions

**Design**:
```typescript
// Token versioning for multi-window coordination
interface TokenState {
    version: number;          // Increment on every login/logout
    timestamp: number;        // Last update time
    authenticated: boolean;   // Current auth state
}

class MultiWindowCoordinator {
    private currentVersion = 0;

    constructor(private context: vscode.ExtensionContext) {
        // Listen for changes from other windows
        context.globalState.onDidChange((key) => {
            if (key === 'adobe.token.state') {
                this.handleTokenStateChange();
            }
        });
    }

    async updateTokenState(authenticated: boolean): Promise<void> {
        const state: TokenState = {
            version: ++this.currentVersion,
            timestamp: Date.now(),
            authenticated
        };

        await this.context.globalState.update('adobe.token.state', state);
    }

    private async handleTokenStateChange(): Promise<void> {
        const state = this.context.globalState.get<TokenState>('adobe.token.state');

        if (state && state.version > this.currentVersion) {
            this.logger.info('[Multi-Window] Token state updated in another window');
            this.currentVersion = state.version;
            this.cacheManager.clearAll();

            // Re-check auth status
            await this.authService.isAuthenticated();
        }
    }
}
```

---

#### 4.2 Comprehensive Test Suite
**Effort**: 40 hours
**Impact**: Prevents regressions

See "Testing Gap Analysis" section for complete test suite specification.

---

#### 4.3 Token Refresh Strategy
**Effort**: 5 hours
**Impact**: Reduces user interruptions

**Design**:
- Background token refresh at 90-minute mark (30 minutes before expiry)
- Refresh lock to prevent concurrent refreshes
- Event notification on successful refresh
- Graceful degradation if refresh fails

---

## Prevention Strategies

### Design Principles

1. **Assume Concurrency**
   - Always design for multiple VS Code windows
   - Never assume exclusive access to Adobe CLI config
   - Use locks for shared resources
   - Test multi-window scenarios

2. **Minimize State**
   - Reduce cached state to minimum necessary
   - Query when needed rather than cache extensively
   - Use short TTLs for cached data
   - Validate cached data before use

3. **Validate Everything**
   - Never trust cached data without validation
   - Validate external data (Adobe CLI responses)
   - Check file modification times before trusting cache
   - Validate tokens after login

4. **Fail Gracefully**
   - Provide clear error messages
   - Include recovery instructions
   - Auto-retry transient failures
   - Degrade gracefully (SDK → CLI fallback)

---

### Code Patterns

#### 1. Atomic Operations
```typescript
// ✅ GOOD: Bundle related queries
const config = await this.executeAdobeCLI(
    'aio config get ims.contexts.cli.access_token --json'
);
const { token, expiry } = JSON.parse(config.stdout);

// ❌ BAD: Separate queries
const token = await this.getToken();
const expiry = await this.getExpiry();
```

#### 2. Defensive Copying
```typescript
// ✅ GOOD: Clone before mutating
const orgsCopy = [...this.cachedOrgs];
orgsCopy.push(newOrg);
this.cachedOrgs = orgsCopy;

// ❌ BAD: Direct mutation
this.cachedOrgs.push(newOrg);
```

#### 3. Timeout Everything
```typescript
// ✅ GOOD: All I/O has timeout
await Promise.race([
    this.operation(),
    this.timeout(10000)
]);

// ❌ BAD: Unbounded wait
await this.operation();
```

#### 4. Log All Mutations
```typescript
// ✅ GOOD: Audit trail
async function setState(newState: State): Promise<void> {
    this.logger.debug(`[State] Changing from ${this.state} to ${newState}`);
    this.state = newState;
}

// ❌ BAD: Silent mutations
this.state = newState;
```

---

### Testing Requirements

#### 1. Unit Tests
- Token validation logic
- Token parsing (JSON, error cases)
- Cache expiration calculations
- TTL jitter generation
- Input validation

**Coverage Target**: 90%+

#### 2. Integration Tests
- Full auth flow (login → validate → use → logout)
- Multi-window coordination
- External config changes
- Cache invalidation scenarios
- Timeout recovery

**Coverage Target**: 80%+

#### 3. Stress Tests
- Rapid clicking (login spam)
- Concurrent operations (10+ parallel requests)
- Long-running sessions (hours)
- Memory leak detection
- File handle leaks

**Pass Criteria**: No crashes, no leaks, graceful degradation

#### 4. Chaos Tests
- Network failures (simulate offline)
- Adobe CLI hangs (timeout scenarios)
- Corrupted config files
- File system errors (ENOSPC, EACCES)
- Race conditions (multi-window)

**Pass Criteria**: Recoverable errors, clear user feedback

---

## Risk Assessment

### Current Risk Level (Beta.50): **MEDIUM** ⚠️

#### ✅ **Resolved Risks**
- Primary token corruption (atomic reads)
- Auth cache staleness after login
- SDK not re-initialized after login
- UI timing issues during authentication
- Timeout detection (success despite timeout)

#### ⚠️ **Mitigated Risks**
- Token expiry during operation (short TTL limits window)
- Adobe CLI background updates (TTL detects within 30s)
- External config changes (TTL detects within 30s)
- Login flow races (token returned directly)

#### ❌ **Remaining Vulnerabilities**
- Multi-window concurrency (no coordination)
- File system race conditions (no file locking)
- Real-time cache invalidation (TTL-based only)
- Token refresh timing (relies on Adobe CLI SDK)

### Risk Breakdown by Category

| Category | Risk Level | Mitigation | Recommendation |
|----------|-----------|------------|----------------|
| **Token Corruption** | ✅ LOW | Atomic reads (beta.42) | Maintain atomic pattern |
| **Cache Staleness** | ⚠️ MEDIUM | 30s TTL | Add file watcher |
| **Multi-Window** | ❌ HIGH | None | Add globalState coordination |
| **External Mutations** | ⚠️ MEDIUM | TTL-based detection | Add file watcher |
| **Token Expiry** | ⚠️ MEDIUM | Short TTL + 401 recovery | Add proactive refresh |
| **Adobe CLI Timeouts** | ✅ LOW | Success detection | Maintain pattern |
| **Login Flow** | ⚠️ MEDIUM | Direct token return | Add polling fallback |

---

### Refactor Branch Risk Level: **UNKNOWN** ⚠️

**Must Verify**:
- [ ] Does refactor branch have atomic token fetching (beta.42 fix)?
- [ ] Does refactor branch have auth cache updates (beta.49 fix)?
- [ ] Does refactor branch have SDK re-initialization (beta.50 fixes)?
- [ ] Does refactor branch introduce new race conditions?
- [ ] Does refactor branch maintain timeout handling patterns?

**Verification Steps**:
1. **Code Review**: Search for `Promise.all` in auth code
2. **Test Execution**: Run multi-window scenarios
3. **Timing Analysis**: Measure cache TTLs and timeout values
4. **Regression Testing**: Test all beta.41 failure scenarios

**Recommendation**: Apply all Priority 1 fixes (beta.42, 49, 50) before merging refactor branch.

---

## Appendix: Authentication Code Evolution

### Beta.41 (Broken) - Token Corruption

**File**: `src/utils/adobeAuthManager.ts` (line 444-464)

```typescript
// ❌ BROKEN: Non-atomic token/expiry fetching
private async inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }> {
    try {
        // RACE CONDITION: Two separate Adobe CLI calls
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

        const token = tokenResult.stdout?.trim().split('\n')
            .filter(line => !line.startsWith('Using Node') && !line.includes('fnm'))
            .join('').trim();
        const expiryStr = expiryResult.stdout?.trim() || '0';
        const expiry = parseInt(expiryStr);

        // Token from T1, expiry from T2 (potentially different states)
        const now = Date.now();

        if (!token || token.length < 50) {
            return { valid: false, expiresIn: 0 };
        }

        if (expiry === 0) {
            // CORRUPTION: Token exists but expiry = 0
            return { valid: false, expiresIn: 0, token };
        }

        const expiresIn = Math.floor((expiry - now) / 1000 / 60);
        return { valid: true, expiresIn, token };
    } catch (error) {
        return { valid: false, expiresIn: 0 };
    }
}
```

**Issues**:
1. Two separate Adobe CLI calls → Race condition
2. Token from T1, expiry from T2 (different states)
3. No retry logic
4. Silent failure (returns `{ valid: false }`)

---

### Beta.42 (Fixed) - Atomic Token Fetching

**File**: `src/utils/adobeAuthManager.ts` (line 444-504)

```typescript
// ✅ FIXED: Atomic token+expiry fetching
private async inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }> {
    try {
        // SINGLE Adobe CLI call with --json flag
        const result = await this.commandManager.executeAdobeCLI(
            'aio config get ims.contexts.cli.access_token --json',
            { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
        );

        if (result.code !== 0 || !result.stdout) {
            this.debugLogger.debug('[Auth Token] No access token found in CLI config');
            return { valid: false, expiresIn: 0 };
        }

        // Clean output (remove fnm/node version warnings)
        const cleanOutput = result.stdout.trim().split('\n')
            .filter(line => !line.startsWith('Using Node') && !line.includes('fnm') && !line.includes('Warning:'))
            .join('\n').trim();

        // Parse the JSON object {token: "...", expiry: 123456789}
        let tokenData;
        try {
            tokenData = JSON.parse(cleanOutput);
        } catch (parseError) {
            this.debugLogger.warn(`[Auth Token] Failed to parse token config as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            return { valid: false, expiresIn: 0 };
        }

        // Token and expiry from SAME state snapshot
        const token = tokenData.token;
        const expiry = tokenData.expiry || 0;
        const now = Date.now();

        // Debug logging
        this.debugLogger.debug(`[Auth Token] Fetched token config (single JSON call)`);
        this.debugLogger.debug(`[Auth Token] Expiry timestamp: ${expiry}`);
        this.debugLogger.debug(`[Auth Token] Current timestamp: ${now}`);
        this.debugLogger.debug(`[Auth Token] Difference (ms): ${expiry - now}`);

        if (!token || token.length < 50) {
            this.debugLogger.debug('[Auth Token] Token not found or invalid length');
            return { valid: false, expiresIn: 0 };
        }

        if (expiry === 0) {
            // CORRUPTION: Token exists but expiry = 0
            // Should be EXTREMELY rare now (atomic read)
            this.debugLogger.warn('[Auth Token] Token found but expiry = 0 (possible corruption)');
            return { valid: false, expiresIn: 0, token };
        }

        const expiresIn = Math.floor((expiry - now) / 1000 / 60);
        this.debugLogger.debug(`[Auth Token] Token valid, expires in ${expiresIn} minutes`);
        return { valid: true, expiresIn, token };
    } catch (error) {
        this.debugLogger.warn(`[Auth Token] Exception during token inspection: ${error instanceof Error ? error.message : String(error)}`);
        return { valid: false, expiresIn: 0 };
    }
}
```

**Improvements**:
1. ✅ Single Adobe CLI call (atomic read)
2. ✅ Token and expiry from same state snapshot
3. ✅ JSON parsing with error handling
4. ✅ Comprehensive debug logging
5. ✅ Clean output filtering (fnm warnings)

---

### Beta.50 (Stabilized) - Current Implementation

**File**: `src/features/authentication/services/tokenManager.ts` (line 32-110)

```typescript
// ✅ CURRENT: Atomic reads, comprehensive error handling
class TokenManager {
    /**
     * Get current access token
     */
    async getAccessToken(): Promise<string | undefined> {
        try {
            const result = await this.commandManager.executeAdobeCLI(
                'aio config get ims.contexts.cli.access_token.token',
                { encoding: 'utf8', timeout: TIMEOUTS.TOKEN_READ },
            );

            if (result.code !== 0) {
                return undefined;
            }

            const cleanOutput = this.cleanCommandOutput(result.stdout || '');

            // SECURITY: Generic token validation without disclosing format
            if (typeof cleanOutput === 'string' && cleanOutput.length > 100) {
                return cleanOutput;
            }

            return undefined;
        } catch (error) {
            this.logger.error('[Token] Failed to get access token', error as Error);
            return undefined;
        }
    }

    /**
     * Get token expiry timestamp
     */
    async getTokenExpiry(): Promise<number | undefined> {
        try {
            const result = await this.commandManager.executeAdobeCLI(
                'aio config get ims.contexts.cli.access_token.expiry',
                { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ },
            );

            if (result.code !== 0 || !result.stdout) {
                return undefined;
            }

            const expiryOutput = this.cleanCommandOutput(result.stdout);
            const expiry = parseInt(expiryOutput);
            return isNaN(expiry) ? undefined : expiry;
        } catch (error) {
            this.logger.error('[Token] Failed to get token expiry', error as Error);
            return undefined;
        }
    }

    /**
     * Check if token is valid and not expired
     */
    async isTokenValid(): Promise<boolean> {
        const token = await this.getAccessToken();
        if (!token) {
            this.logger.debug('[Token] No access token found');
            return false;
        }

        const expiry = await this.getTokenExpiry();
        if (!expiry) {
            // No expiry info, but we have a token - assume valid
            this.logger.debug('[Token] Token found but no expiry info - assuming valid');
            return true;
        }

        const now = Date.now();
        const isValid = expiry > now;

        if (isValid) {
            const minutesRemaining = Math.floor((expiry - now) / 1000 / 60);
            this.logger.debug(`[Token] Token valid (expires in ${minutesRemaining} minutes)`);
        } else {
            const minutesAgo = Math.floor((now - expiry) / 1000 / 60);
            this.logger.debug(`[Token] Token expired ${minutesAgo} minutes ago`);
        }

        return isValid;
    }
}
```

**Note**: Beta.50 refactored code reverted to separate token/expiry queries. This is **ACCEPTABLE** because:
1. Both queries read the same fields from the same config object
2. Queries are sequential (not concurrent `Promise.all`)
3. Cache TTL (30s) limits race window
4. Error handling is comprehensive

However, **RECOMMEND** reverting to beta.42 atomic pattern for maximum safety.

---

### Diff Analysis: Beta.41 → Beta.42 → Beta.50

**Key Change (Beta.41 → Beta.42)**:
```diff
- const [tokenResult, expiryResult] = await Promise.all([
-     this.commandManager.executeAdobeCLI('aio config get ...token'),
-     this.commandManager.executeAdobeCLI('aio config get ...expiry')
- ]);
+ const result = await this.commandManager.executeAdobeCLI(
+     'aio config get ims.contexts.cli.access_token --json',
+     { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ }
+ );
+ const tokenData = JSON.parse(cleanOutput);
+ const token = tokenData.token;
+ const expiry = tokenData.expiry || 0;
```

**Evolution (Beta.42 → Beta.50)**:
- Refactored to separate `TokenManager` class
- Separate methods for `getAccessToken()` and `getTokenExpiry()`
- Methods called sequentially (not concurrently)
- Comprehensive error handling and logging
- Security validation (token length > 100)

**Risk Assessment**:
- Beta.41: ❌ HIGH (concurrent queries)
- Beta.42: ✅ LOW (atomic query)
- Beta.50: ⚠️ MEDIUM (sequential queries, small race window)

**Recommendation**: Adopt beta.42 atomic pattern in refactor branch for maximum safety.

---

## Conclusion

The authentication system in Adobe Demo Builder has undergone significant stabilization from beta.34 to beta.50, addressing multiple race conditions, state management issues, and external dependency challenges. The **primary token corruption issue** (beta.41) has been **successfully resolved** through atomic token fetching (beta.42), and **secondary issues** related to cache staleness and SDK initialization have been **fixed** in subsequent betas.

However, **remaining vulnerabilities** exist:
- **Multi-window concurrency**: No coordination mechanism
- **File system races**: No file locking on Adobe CLI config
- **Cache staleness**: TTL-based detection (30s lag)
- **Token refresh**: Relies on Adobe CLI SDK background refresh

**For the refactor branch**, it is **critical** to:
1. ✅ Apply beta.42 atomic token fetching pattern
2. ✅ Apply beta.49 auth cache update fix
3. ✅ Apply beta.50 SDK re-initialization fix
4. ⚠️ Consider implementing file system watcher (Priority 2)
5. ⚠️ Consider implementing file locking (Priority 2)
6. ⚠️ Consider comprehensive test suite (Priority 4)

The authentication system is now **stable for single-window usage** but **vulnerable to multi-window scenarios**. Future enhancements should focus on multi-window coordination and real-time cache invalidation.

---

**End of Report**
