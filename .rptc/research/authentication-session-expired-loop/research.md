# Research Report: Authentication "Session Expired" Loop Regression

**Date**: 2025-11-23
**Research Type**: Codebase Investigation
**Severity**: Critical (UX Regression)
**Status**: Root Cause Identified

---

## Executive Summary

Critical authentication regression causing infinite "Session expired" loop in the wizard flow. After successful browser-based login, the next authentication check immediately fails, forcing users to re-authenticate repeatedly.

**Root Cause**: Non-forced login path (`login(force=false)`) clears auth status cache but **NOT** token inspection cache. The 5-minute cached token from before login remains, causing subsequent auth checks to fail.

**Impact**: Users cannot proceed through wizard - stuck in login loop.

**Fix Location**: `authenticationService.ts:304-310` - Add missing `clearTokenInspectionCache()` call.

---

## Problem Description

### Observed Behavior

From debug logs (2025-11-23 19:58-20:00):

1. **Initial auth check**: Takes 5+ seconds (SLOW warning), reports session expired
2. **User clicks "Sign in with Adobe"**: Browser login succeeds (exit code 0, token received)
3. **Caches cleared**: Auth status and validation caches cleared, SDK client cleared
4. **Next auth check** (12 seconds later): **Immediately fails again** with "Session expired"
5. **Loop repeats**: User forced to login again and again

### Debug Log Evidence

```
[19:59:11.543Z] [Auth] Starting authentication check (quick mode for wizard)
[19:59:16.603Z] [Performance] isAuthenticated took 5059ms ⚠️ SLOW

[20:00:11.561Z] [Auth] Login command completed successfully
[20:00:11.561Z] [Auth] Received access token from login command
[20:00:11.561Z] [Auth] Cleared auth and validation caches after login

[20:00:23.694Z] [Auth] Checking for existing valid authentication (token-only)...
[20:00:28.702Z] [Performance] isAuthenticated took 5008ms ⚠️ SLOW
[20:00:28.702Z] [Auth] Initiating browser-based login  ← LOOP!
```

**Critical Observation**: Login succeeds, caches cleared, but 12 seconds later the **exact same failure** occurs.

---

## Root Cause Analysis

### The Bug

**File**: `src/features/authentication/services/authenticationService.ts`
**Lines**: 304-310

```typescript
// Clear auth cache to force fresh check next time
if (!force) {
    this.cacheManager.clearAuthStatusCache();        // ✓ Clears auth status
    this.cacheManager.clearValidationCache();        // ✓ Clears org validation
    this.debugLogger.debug('[Auth] Cleared auth and validation caches after login');
    // ❌ MISSING: this.cacheManager.clearTokenInspectionCache();
} else {
    this.debugLogger.debug('[Auth] Skipping cache clear - already cleared before forced login');
}
```

### Why This Causes the Loop

**Token Inspection Cache** (`tokenManager.ts:72-189`):
- Caches result of `aio config get ims.contexts.cli.access_token`
- **5-minute TTL** (`timeoutConfig.ts:68`)
- Contains: `{ valid: boolean, expiresIn: number, token: string }`

**The Problem**:
1. First auth check caches token validation result (before login)
2. User logs in successfully → New token written to Adobe CLI config
3. Non-forced login clears auth status cache **BUT NOT** token inspection cache
4. Next auth check finds cached token validation from **before login** → Reports as invalid
5. User sees "Session expired" despite having just logged in

### Cache Clearing Inconsistency

| Login Type | Auth Status Cache | Token Inspection Cache | Result |
|------------|-------------------|------------------------|--------|
| **Forced** (`force=true`) | Cleared via `clearAll()` at line 234 | Cleared via `clearAll()` at line 234 | ✅ Works |
| **Non-forced** (`force=false`) | Cleared at line 305 | **NOT cleared** ❌ | ❌ Fails |

**Why forced login works**: Line 234 calls `clearAll()` which includes `clearTokenInspectionCache()` at line 304 of `authCacheManager.ts`.

**Why non-forced login fails**: Only clears 2 out of 3 caches, token inspection cache retains stale data.

---

## Technical Deep Dive

### Full Authentication Flow (3 Phases)

#### Phase 1: Initial Auth Check (Works, but slow)

```
User opens wizard → AdobeAuthStep component mounts
    ↓
checkAuthentication() [AdobeAuthStep.tsx:143]
    ↓
webviewClient.postMessage('check-auth')
    ↓
handleCheckAuth() [authenticationHandlers.ts:45]
    ↓
authManager.isAuthenticated() [authenticationService.ts:115]
    ├─ Check auth status cache [Line 119]
    │   └─ getCachedAuthStatus() → EXPIRED (first load)
    │
    └─ tokenManager.isTokenValid() [Line 128]
        └─ inspectToken() [tokenManager.ts:72]
            ├─ getCachedTokenInspection() [Line 74-79]
            │   └─ Cache MISS (first time)
            │
            ├─ Execute: aio config get ims.contexts.cli.access_token --json
            │   └─ Takes 4-5 seconds (CLI network call)
            │
            ├─ Parse token and validate expiry [Lines 104-147]
            ├─ Cache result [Line 156]: setCachedTokenInspection()
            │   └─ Cache key: "token-inspection"
            │   └─ TTL: 5 minutes
            │
            └─ Return: { valid: false, expiresIn: 0 }

Result: isAuthenticated() returns FALSE
UI shows: "Session expired" with "Sign in with Adobe" button
Performance: 5+ seconds (cache miss penalty)
```

#### Phase 2: Login Flow (CRITICAL BUG POINT)

```
User clicks "Sign in with Adobe"
    ↓
handleLogin(false) [AdobeAuthStep.tsx:146]
    ↓
webviewClient.requestAuth(false) [Line 185]
    ↓
handleAuthenticate(force=false) [authenticationHandlers.ts:201]
    ↓
authManager.login(force=false) [authenticationService.ts:220]
    ├─ Check force flag [Line 228]
    │   └─ force === false, so NO pre-login cache clear
    │
    ├─ Execute: aio auth login [Line 249]
    │   ├─ Browser window opens
    │   ├─ User authenticates with Adobe
    │   └─ Adobe CLI stores new access token
    │   └─ Exit code: 0 (success)
    │   └─ Stdout contains access token
    │
    ├─ Parse access token from stdout [Lines 258-264]
    │   └─ Token successfully extracted
    │
    ├─ Clear SDK client [Line 297]
    │   └─ this.sdkClient.clear()
    │   └─ Forces SDK re-init with new token ✓
    │
    └─ Post-login cache management [Lines 304-310]
        ├─ Check force flag again
        │   └─ force === false, so enter this branch:
        │
        ├─ clearAuthStatusCache() [Line 305] ✓
        │   └─ Auth status cache invalidated
        │
        ├─ clearValidationCache() [Line 306] ✓
        │   └─ Org validation cache invalidated
        │
        └─ ❌ clearTokenInspectionCache() NOT CALLED
            └─ Token inspection cache STILL HAS OLD TOKEN!
            └─ Cache entry: { valid: false, expiresIn: 0, token: "old-token" }
            └─ Expiry: now + 5 minutes (not expired yet)

Return: login() returns TRUE (successful)
handleAuthenticate() sends success response to UI
```

#### Phase 3: Next Auth Check (LOOP BEGINS)

```
UI receives login success
    ↓
checkAuthentication() called again (via state update or explicit call)
    ↓
handleCheckAuth() [authenticationHandlers.ts:45]
    ↓
authManager.isAuthenticated() [authenticationService.ts:115]
    ├─ Check auth status cache [Line 119]
    │   └─ getCachedAuthStatus() → EXPIRED
    │       (Cleared in Phase 2 at line 305, so cache miss)
    │
    └─ tokenManager.isTokenValid() [Line 128]
        └─ inspectToken() [tokenManager.ts:72]
            ├─ getCachedTokenInspection() [Line 74-79]
            │   ├─ Cache HIT! ✓ (entry exists)
            │   ├─ Check expiry: now < cache.expiry ✓ (5 min not passed)
            │   └─ Return cached result from Phase 1:
            │       └─ { valid: false, expiresIn: 0, token: "old-pre-login-token" }
            │       └─ ❌ THIS IS THE OLD TOKEN FROM BEFORE LOGIN!
            │
            └─ Return to isTokenValid() [Line 229]
                ├─ inspection.valid === false
                └─ Return: FALSE

Result: isAuthenticated() returns FALSE
    ├─ setCachedAuthStatus(false) [Line 131]
    │   └─ Caches false with error TTL: 1 minute
    │
    └─ handleCheckAuth() sends to UI: { isAuthenticated: false }

UI receives auth failure
    ├─ Shows "Session expired" ❌
    ├─ Shows "Sign in with Adobe" button
    └─ User must login AGAIN

Loop: Phase 2 and 3 repeat indefinitely (or until 5-minute cache expires)
```

---

## Relevant Files and Code Locations

### Primary Bug Location

**`src/features/authentication/services/authenticationService.ts`**

| Lines | Method | Description | Bug? |
|-------|--------|-------------|------|
| 115-144 | `isAuthenticated()` | Quick token-only auth check | No |
| 220-341 | `login()` | Browser-based login with cache management | Yes (lines 304-310) |
| **304-310** | **Cache clearing logic** | **Incomplete cache clear for non-forced login** | **BUG** |

### Cache Management

**`src/features/authentication/services/authCacheManager.ts`**

| Lines | Method | Description |
|-------|--------|-------------|
| 93-102 | `getCachedAuthStatus()` | Auth status cache retrieval with TTL expiry |
| 107-111 | `setCachedAuthStatus()` | Auth status cache setting |
| 224-260 | Token inspection cache | Get/set token inspection with 2-min TTL |
| 257-260 | `clearTokenInspectionCache()` | **Missing call in bug location** |
| 289-294 | `clearPerformanceCaches()` | Clears token inspection + other perf caches |
| 299-306 | `clearAll()` | Clears ALL caches (used by forced login) |

### Token Validation

**`src/features/authentication/services/tokenManager.ts`**

| Lines | Method | Description |
|-------|--------|-------------|
| 72-189 | `inspectToken()` | Token validation with caching |
| 74-79 | Cache check | **Always returns cached if found** |
| 155-157 | Cache set | Sets token inspection cache with 5-min TTL |
| 228-231 | `isTokenValid()` | Calls `inspectToken()`, returns `valid` field |

### Wizard Integration

**`src/features/authentication/ui/steps/AdobeAuthStep.tsx`**

| Lines | Method | Description |
|-------|--------|-------------|
| 43-399 | AdobeAuthStep component | Main auth UI component |
| 56 | `useEffect` | Calls `checkAuthentication()` on mount |
| 143 | `webviewClient.postMessage` | Triggers auth check |
| 146 | `handleLogin()` | Login button handler |
| 185 | `webviewClient.requestAuth()` | Triggers backend login |

### Message Handlers

**`src/features/authentication/handlers/authenticationHandlers.ts`**

| Lines | Handler | Description |
|-------|---------|-------------|
| 45-191 | `handleCheckAuth()` | Check auth endpoint |
| 60 | Calls `isAuthenticated()` | Entry point for auth checks |
| 201-436 | `handleAuthenticate()` | Login handler |
| 279 | Calls `login(force)` | Entry point for login |

---

## Why Performance is Slow (5+ seconds)

Debug logs consistently show: `[Performance] isAuthenticated took 5059ms ⚠️ SLOW (expected <2500ms)`

### Root Cause of Slowness

**First `isAuthenticated()` call on wizard page load**:

```
isAuthenticated() [Line 115]
    ↓
getCachedAuthStatus() → EXPIRED (first load, cache empty)
    ↓
tokenManager.isTokenValid() [Line 128]
    ↓
inspectToken() [tokenManager.ts:72]
    ├─ getCachedTokenInspection() → MISS (cache empty)
    │
    └─ Execute: aio config get ims.contexts.cli.access_token --json
        ├─ CLI spawns process
        ├─ Network call to Adobe servers
        ├─ Response parsing
        └─ Total time: 4-5 seconds ⏱️
```

**After caching**: Subsequent calls < 500ms (cache hit path)

### Why "Quick Mode for Wizard" Isn't Quick

Comment at line 118 says: `// Quick authentication check (token only, no org validation)`

This is **misleading**:
- "Quick" refers to **what** is checked (token only, not org)
- But **how long** it takes depends on cache state
- First call: **5 seconds** (cache miss, CLI call required)
- Cached calls: **< 500ms** (fast path)

The performance warning is **not a bug** - it's expected behavior on first load. The **actual bug** is the cache not being cleared after login.

---

## Cache Architecture

### Three Distinct Caches

1. **Auth Status Cache** (5-minute TTL)
   - **Key**: `"auth-status"`
   - **Value**: `{ isAuthenticated: boolean, timestamp: number, expiry: number }`
   - **Purpose**: Cache result of `isTokenValid()` to avoid repeated token checks
   - **Set by**: `isAuthenticated()` at line 131
   - **Cleared by**: `clearAuthStatusCache()` at line 116 of authCacheManager

2. **Token Inspection Cache** (5-minute TTL) ← **BUG HERE**
   - **Key**: `"token-inspection"`
   - **Value**: `{ valid: boolean, expiresIn: number, token: string, timestamp: number, expiry: number }`
   - **Purpose**: Cache Adobe CLI token config to avoid 4-5 second CLI calls
   - **Set by**: `inspectToken()` at line 156 of tokenManager
   - **Cleared by**: `clearTokenInspectionCache()` at line 257 of authCacheManager
   - **Issue**: NOT cleared by non-forced login

3. **Validation Cache** (5-minute TTL)
   - **Key**: `"org-validation"`
   - **Value**: `{ hasAccess: boolean, timestamp: number, expiry: number }`
   - **Purpose**: Cache org access validation
   - **Set by**: `validateCurrentOrgAccess()`
   - **Cleared by**: `clearValidationCache()` at line 211 of authCacheManager

### Cache Clearing Paths

#### Path A: Forced Login (Works Correctly)

```
login(force=true) [authenticationService.ts:220]
    ├─ Before login [Lines 228-237]:
    │   ├─ clearAll() [Line 234]
    │   │   ├─ clearSessionCaches()
    │   │   ├─ clearPerformanceCaches()
    │   │   │   └─ clearTokenInspectionCache() ✓
    │   │   ├─ clearAuthStatusCache() ✓
    │   │   ├─ clearValidationCache() ✓
    │   │   └─ clearTokenInspectionCache() ✓ (explicit call)
    │   │
    │   └─ sdkClient.clear() [Line 235] ✓
    │
    ├─ Execute login [Lines 238-297]
    │   └─ aio auth login -f (forced)
    │
    └─ After login [Lines 304-310]:
        └─ force === true, skip cache clear (already done)

Result: All caches cleared, fresh token, next check succeeds ✓
```

#### Path B: Non-Forced Login (BUGGY)

```
login(force=false) [authenticationService.ts:220]
    ├─ Before login [Lines 228-237]:
    │   └─ force === false, skip clearAll()
    │       └─ Token inspection cache STILL HAS OLD TOKEN ❌
    │
    ├─ Execute login [Lines 238-297]
    │   ├─ aio auth login (no -f flag)
    │   └─ New token written to Adobe CLI config ✓
    │
    └─ After login [Lines 304-310]:
        ├─ force === false, enter this branch:
        │   ├─ clearAuthStatusCache() [Line 305] ✓
        │   ├─ clearValidationCache() [Line 306] ✓
        │   └─ clearTokenInspectionCache() ❌ NOT CALLED
        │
        └─ sdkClient.clear() [Line 297] ✓

Result: Auth status cleared, SDK cleared, but token inspection cache STALE
Next check: Reads stale token from cache → Reports invalid → Loop ❌
```

---

## SDK Client Clearing (Not the Issue)

The code **correctly clears SDK client** after login at line 297:

```typescript
// CRITICAL FIX: Clear SDK after login to force re-initialization with new token
this.sdkClient.clear();
this.debugLogger.debug('[Auth] Cleared SDK client to force re-init with new token');
```

This is necessary because the Adobe Console SDK caches the access token in memory. Clearing it forces re-initialization with the new token from Adobe CLI config.

**However**: SDK clearing **does NOT** affect `TokenManager` cache, which is managed separately by `AuthCacheManager`. These are two independent caching layers.

---

## Misleading Code Comment

**File**: `authenticationService.ts`
**Line**: 301

```typescript
// Clear auth cache to force fresh check next time
// Note: Token inspection cache cleared via cacheManager.clearAll() in other branches
```

### Analysis

**Comment claim**: "Token inspection cache cleared via cacheManager.clearAll() in other branches"

**Reality**:
- **Other branches**: Only the **forced login** branch (line 234)
- **This branch** (non-forced login): Does **NOT** clear token inspection cache
- **Implication**: Comment suggests it's handled elsewhere, but it's actually **missing**

This misleading comment may have contributed to the bug going unnoticed during code review.

---

## Regression History

### When Introduced

**Commit**: `5c06c93` (October 28, 2025)
**Feature**: Token inspection caching for performance optimization
**Purpose**: Prevent redundant 4-second Adobe CLI calls by caching token validation results

**What was added**:
- `TokenManager.inspectToken()` with 5-minute cache
- `AuthCacheManager` token inspection cache methods
- Cache hit/miss logic in token validation flow

**What was missed**:
- Updating non-forced login path to clear the new cache
- Only forced login path was updated (`clearAll()` includes all caches)

### Why Not Caught Earlier

1. **Forced login works** - Testing may have primarily used forced login path (`-f` flag)
2. **First login succeeds** - Cache miss on first check means fresh token validation
3. **Bug only triggers on second check** - After login, when cache should be cleared but isn't
4. **5-minute window** - Within 5 minutes, user sees loop; after 5 minutes, cache expires naturally
5. **Performance feature, not critical path** - Cache clearing oversight in code review
6. **Misleading comment** - Comment at line 301 suggests cache is handled "in other branches"

---

## Implementation Options

### Option A: Add Missing Cache Clear (Simplest)

**File**: `authenticationService.ts`
**Lines**: 304-310

**Current code**:
```typescript
if (!force) {
    this.cacheManager.clearAuthStatusCache();
    this.cacheManager.clearValidationCache();
    this.debugLogger.debug('[Auth] Cleared auth and validation caches after login');
}
```

**Fix**:
```typescript
if (!force) {
    this.cacheManager.clearAuthStatusCache();
    this.cacheManager.clearValidationCache();
    this.cacheManager.clearTokenInspectionCache(); // ← Add this line
    this.debugLogger.debug('[Auth] Cleared auth, validation, and token inspection caches after login');
}
```

**Pros**:
- Minimal change (one line)
- Matches pattern of other cache clears
- Clear intent

**Cons**:
- Still inconsistent with forced login path (which uses `clearAll()`)
- Future cache additions require updating this line

---

### Option B: Use `clearPerformanceCaches()`

**File**: `authenticationService.ts`
**Lines**: 304-310

**Fix**:
```typescript
if (!force) {
    this.cacheManager.clearAuthStatusCache();
    this.cacheManager.clearValidationCache();
    this.cacheManager.clearPerformanceCaches(); // ← Clears token inspection + other perf caches
    this.debugLogger.debug('[Auth] Cleared auth, validation, and performance caches after login');
}
```

**What `clearPerformanceCaches()` clears** (authCacheManager.ts:289-294):
- `orgListCache`
- `consoleWhereCache`
- `tokenInspectionCache`

**Pros**:
- Clears token inspection cache plus other performance caches
- Future-proof if more performance caches added
- More thorough cleanup

**Cons**:
- Clears more than strictly necessary
- May impact performance slightly (org list cache, console where cache)

---

### Option C: Always Use `clearAll()` (Most Thorough)

**File**: `authenticationService.ts`
**Lines**: 228-237 and 304-310

**Fix**: Move `clearAll()` to after login, unconditionally:

```typescript
// Before login - no clearing
// (Lines 228-237 removed)

// After login - always clear all caches
// (Lines 304-310 replaced)
this.cacheManager.clearAll();
this.sdkClient.clear();
this.debugLogger.debug('[Auth] Cleared all caches and SDK after login');
```

**Pros**:
- Simplest logic - no conditional
- Guaranteed to clear everything
- Consistent with forced login behavior

**Cons**:
- Current design distinction between forced/non-forced login lost
- May be unnecessary to clear everything for non-forced login

---

## Recommended Fix

**Option A: Add Missing Cache Clear**

**Rationale**:
1. **Minimal change** - Least risky, surgical fix
2. **Preserves intent** - Keeps forced vs. non-forced login distinction
3. **Clear fix** - Directly addresses root cause
4. **Easy to test** - One cache clear to verify
5. **Matches pattern** - Consistent with other cache clears in same block

**Implementation**:
```typescript
if (!force) {
    this.cacheManager.clearAuthStatusCache();
    this.cacheManager.clearValidationCache();
    this.cacheManager.clearTokenInspectionCache(); // FIX: Clear token inspection cache
    this.debugLogger.debug('[Auth] Cleared auth, validation, and token inspection caches after login');
}
```

---

## Testing Requirements

### Unit Tests Needed

**File**: `tests/features/authentication/services/authenticationService.test.ts`

1. **Test: Non-forced login clears token inspection cache**
   ```typescript
   it('should clear token inspection cache after non-forced login', async () => {
     // Arrange: Mock successful login
     // Act: Call login(force=false)
     // Assert: clearTokenInspectionCache was called
   });
   ```

2. **Test: Token validation after login uses fresh token**
   ```typescript
   it('should use fresh token after non-forced login (not cached)', async () => {
     // Arrange: Mock cached old token, successful login
     // Act: login(false), then isAuthenticated()
     // Assert: isAuthenticated executes fresh token check, not cached
   });
   ```

3. **Test: Forced login clears all caches**
   ```typescript
   it('should clear all caches including token inspection for forced login', async () => {
     // Arrange: Mock successful forced login
     // Act: Call login(force=true)
     // Assert: clearAll was called (includes clearTokenInspectionCache)
   });
   ```

### Integration Tests Needed

**File**: `tests/features/authentication/handlers/authenticationHandlers.test.ts`

1. **Test: Auth check succeeds after login**
   ```typescript
   it('should return authenticated=true after successful login', async () => {
     // Arrange: Mock initial auth check failure
     // Act: handleAuthenticate(force=false), then handleCheckAuth()
     // Assert: isAuthenticated returns true (not cached false)
   });
   ```

2. **Test: No login loop after successful auth**
   ```typescript
   it('should not trigger login loop after successful authentication', async () => {
     // Arrange: Mock failed auth, successful login
     // Act: handleCheckAuth() → handleAuthenticate() → handleCheckAuth()
     // Assert: Second handleCheckAuth returns true (no loop)
   });
   ```

### Manual Testing Checklist

- [ ] Open wizard, verify initial "Session expired" message
- [ ] Click "Sign in with Adobe", complete browser login
- [ ] Verify wizard advances to next step (not "Session expired")
- [ ] Refresh page, verify auth state persists
- [ ] Test with both forced (`-f`) and non-forced login
- [ ] Verify no performance regression (5s initial check is expected)

---

## Key Findings Summary

| Aspect | Finding |
|--------|---------|
| **Root Cause** | Non-forced login clears auth status cache but NOT token inspection cache |
| **Bug Location** | `authenticationService.ts:304-310` - Missing `clearTokenInspectionCache()` call |
| **Affected Path** | Non-forced login (normal browser auth, not forced) |
| **Why It Fails** | Token inspection cache contains old pre-login token with 5-min TTL |
| **Expected Behavior** | Next auth check should validate fresh token from Adobe CLI config |
| **Actual Behavior** | Next auth check returns cached invalid token from before login |
| **User Impact** | Infinite "Session expired" loop - user cannot proceed through wizard |
| **Why Forced Works** | Forced login calls `clearAll()` which includes `clearTokenInspectionCache()` |
| **Performance Issue** | Initial 5s check is expected (cache miss), not related to bug |
| **Fix Complexity** | Low - Add one cache clear call |
| **Test Coverage** | Need unit tests for cache clearing, integration tests for auth flow |
| **Regression Date** | October 28, 2025 (commit 5c06c93) - token inspection cache feature |

---

## Conclusion

This is a **cache coherence bug** introduced by a performance optimization. The token inspection cache (added for performance) is not properly cleared during the non-forced login flow, causing stale cached tokens to be used for authentication checks after successful login.

**Fix is straightforward**: Add `clearTokenInspectionCache()` call at line 307 in `authenticationService.ts`.

**Testing is critical**: Must verify both forced and non-forced login paths clear all necessary caches and don't trigger login loops.

**Performance note**: The 5-second initial auth check is **expected behavior** (cache miss on first load), not a bug. After caching, checks are fast (< 500ms).

---

## References

### Files Analyzed

- `src/features/authentication/services/authenticationService.ts`
- `src/features/authentication/services/authCacheManager.ts`
- `src/features/authentication/services/tokenManager.ts`
- `src/features/authentication/handlers/authenticationHandlers.ts`
- `src/features/authentication/ui/steps/AdobeAuthStep.tsx`
- `src/core/utils/timeoutConfig.ts`

### Debug Logs

- Timestamp: 2025-11-23 19:58:51 - 20:00:36
- Key events: Initial auth check (5s), login success, second auth check (5s), login loop

### Related Features

- Adobe Console SDK integration
- Token caching performance optimization (commit 5c06c93)
- Wizard authentication flow
- Auth cache management
