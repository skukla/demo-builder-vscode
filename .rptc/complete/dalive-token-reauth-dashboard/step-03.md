# Step 3: Remove Dead OAuth PKCE Code

## Overview

Clean up `daLiveAuthService.ts` by removing the localhost callback server and PKCE OAuth flow code that was never functional. DA.live requires the app to be hosted on the da.live domain for OAuth callbacks, which VS Code extensions cannot do. The wizard and new QuickPick flow use bookmarklet/token-paste approach instead.

## Prerequisites

- [ ] None (independent cleanup, can run parallel to Steps 1-2)

**Note**: Coordinate with Step 2 if `storeToken()` method needs to be added before removal.

## Tests to Write First (RED Phase)

### Test File: `tests/features/eds/services/daLiveAuthService.test.ts`

**Test Scenarios for Retained Functionality:**

- [ ] Test: `isAuthenticated()` returns false when no token stored
  - **Given:** Empty globalState (no token)
  - **When:** `isAuthenticated()` called
  - **Then:** Returns `false`
  - **File:** `tests/features/eds/services/daLiveAuthService.test.ts`

- [ ] Test: `isAuthenticated()` returns false when token expired
  - **Given:** Token stored with expiration in the past
  - **When:** `isAuthenticated()` called
  - **Then:** Returns `false`
  - **File:** `tests/features/eds/services/daLiveAuthService.test.ts`

- [ ] Test: `isAuthenticated()` returns true when valid token exists
  - **Given:** Token stored with future expiration
  - **When:** `isAuthenticated()` called
  - **Then:** Returns `true`
  - **File:** `tests/features/eds/services/daLiveAuthService.test.ts`

- [ ] Test: `getStoredToken()` returns null when no token
  - **Given:** Empty globalState
  - **When:** `getStoredToken()` called
  - **Then:** Returns `null`
  - **File:** `tests/features/eds/services/daLiveAuthService.test.ts`

- [ ] Test: `getStoredToken()` returns token info when valid
  - **Given:** Token and expiration in globalState
  - **When:** `getStoredToken()` called
  - **Then:** Returns `DaLiveTokenInfo` object
  - **File:** `tests/features/eds/services/daLiveAuthService.test.ts`

- [ ] Test: `storeToken()` persists token to globalState
  - **Given:** Valid JWT token string (contains exp and email in payload)
  - **When:** `storeToken(token)` called
  - **Then:** globalState contains token, expiration (parsed from JWT), and email
  - **File:** `tests/features/eds/services/daLiveAuthService.test.ts`

- [ ] Test: `logout()` clears all stored token data
  - **Given:** Token stored in globalState
  - **When:** `logout()` called
  - **Then:** globalState accessToken, tokenExpiration, userEmail all undefined
  - **File:** `tests/features/eds/services/daLiveAuthService.test.ts`

- [ ] Test: `dispose()` completes without error
  - **Given:** Service instance exists
  - **When:** `dispose()` called
  - **Then:** No error thrown
  - **File:** `tests/features/eds/services/daLiveAuthService.test.ts`

### Update Security Test File

- [ ] Test: Remove or update `daLiveAuthService.security.test.ts`
  - **Given:** Security tests reference removed `getErrorPage()` method
  - **When:** Tests run after cleanup
  - **Then:** XSS tests removed (no HTML generation), CSRF tests removed (no state param), Token storage tests retained
  - **File:** `tests/features/eds/services/daLiveAuthService.security.test.ts`

## Implementation (GREEN Phase)

### File: `src/features/eds/services/daLiveAuthService.ts`

**Imports to REMOVE:**

```typescript
import * as crypto from 'crypto';
import * as http from 'http';
```

**Constants to REMOVE (~10 lines):**

```typescript
const LOCALHOST_PORT = 9876;
const LOCALHOST_REDIRECT_URI = `http://localhost:${LOCALHOST_PORT}/callback`;

// Also remove from STATE_KEYS:
codeVerifier: 'daLive.pkce.codeVerifier',
state: 'daLive.oauth.state',
```

**Potentially removable constants (verify no other usage):**

```typescript
const IMS_ENDPOINTS = { ... };  // Only used by PKCE flow
const DA_LIVE_CLIENT_ID = 'darkalley';  // Only used by PKCE flow
const DA_LIVE_SCOPES = 'AdobeID,openid,gnav';  // Only used by PKCE flow
```

**Standalone Functions to REMOVE (~35 lines):**

```typescript
function generateCodeVerifier(): string { ... }
function generateCodeChallenge(verifier: string): string { ... }
function generateStateParameter(): string { ... }
```

**Class Members to REMOVE:**

```typescript
private callbackServer: http.Server | undefined;
private authPromiseResolve: ((result: DaLiveAuthResult) => void) | undefined;
private authPromiseReject: ((error: Error) => void) | undefined;
private authTimeout: NodeJS.Timeout | undefined;
```

**Methods to REMOVE (~280 lines):**

```typescript
async authenticate(): Promise<DaLiveAuthResult> { ... }
private startCallbackServer(): Promise<void> { ... }
private stopCallbackServer(): void { ... }
private getSuccessPage(): string { ... }
private getErrorPage(error: string): string { ... }
private async exchangeCodeForToken(code: string): Promise<DaLiveAuthResult> { ... }
private async fetchUserEmail(accessToken: string): Promise<string | undefined> { ... }
private waitForCallback(): Promise<DaLiveAuthResult> { ... }
private resolveAuth(result: DaLiveAuthResult): void { ... }
private escapeHtml(text: string): string { ... }
```

**Code to KEEP (verify still functional):**

```typescript
// Types - KEEP
export interface DaLiveAuthResult { ... }
export interface DaLiveTokenInfo { ... }

// STATE_KEYS - KEEP (subset)
const STATE_KEYS = {
    accessToken: 'daLive.accessToken',
    tokenExpiration: 'daLive.tokenExpiration',
    userEmail: 'daLive.userEmail',
};

// Methods - KEEP
async isAuthenticated(): Promise<boolean> { ... }
async getStoredToken(): Promise<DaLiveTokenInfo | null> { ... }
async logout(): Promise<void> { ... }  // Simplify: remove PKCE state cleanup
dispose(): void { ... }  // Simplify: remove stopCallbackServer call
```

**Code to ADD (for QuickPick flow support):**

```typescript
/**
 * Store token obtained from bookmarklet/clipboard flow
 * Parses JWT to extract expiration and email internally (matches Step 2 usage)
 */
async storeToken(token: string): Promise<void> {
    // Validate and parse token (extract exp and email from JWT payload)
    const validation = validateDaLiveToken(token);
    if (!validation.valid) {
        throw new Error(validation.error || 'Invalid token');
    }

    await this.context.globalState.update(STATE_KEYS.accessToken, token);
    if (validation.expiresAt) {
        await this.context.globalState.update(STATE_KEYS.tokenExpiration, validation.expiresAt);
    }
    if (validation.email) {
        await this.context.globalState.update(STATE_KEYS.userEmail, validation.email);
    }
    this.logger.info('[DA.live Auth] Token stored successfully');
}
```

**Code to MODIFY:**

```typescript
// getAccessToken() - Remove authenticate() call, return null if no token
async getAccessToken(): Promise<string | null> {
    const tokenInfo = await this.getStoredToken();
    return tokenInfo?.accessToken ?? null;
}

// logout() - Remove PKCE state cleanup (codeVerifier, state)
async logout(): Promise<void> {
    await this.context.globalState.update(STATE_KEYS.accessToken, undefined);
    await this.context.globalState.update(STATE_KEYS.tokenExpiration, undefined);
    await this.context.globalState.update(STATE_KEYS.userEmail, undefined);
    this.logger.info('[DA.live Auth] Logged out');
}

// dispose() - Remove stopCallbackServer call (no server to stop)
dispose(): void {
    // No resources to clean up after PKCE removal
}
```

## Refactor Phase

1. **Update file header comment** - Remove PKCE flow description, document bookmarklet/token approach
2. **Remove orphaned imports** - `crypto`, `http` no longer needed
3. **Clean up logout()** - Remove token revocation API call (optional, tokens expire anyway)
4. **Verify dispose()** - Ensure it still works (empty is fine)
5. **Update exports** - Ensure public API (`isAuthenticated`, `getStoredToken`, `storeToken`, `logout`, `dispose`) exported

## Acceptance Criteria

- [ ] All PKCE-related code removed (~300+ lines removed)
- [ ] `isAuthenticated()` still works correctly
- [ ] `getStoredToken()` still works correctly
- [ ] `storeToken()` method added for QuickPick flow
- [ ] `getAccessToken()` returns stored token or null (no auth flow)
- [ ] `logout()` clears token state correctly
- [ ] `dispose()` completes without error
- [ ] No `http` or `crypto` imports remain
- [ ] No references to localhost callback server
- [ ] Existing tests pass (or updated appropriately)
- [ ] File reduced from ~547 lines to ~80-100 lines
- [ ] Security test file updated (XSS/CSRF tests removed)

## Dependencies

- None (cleanup only)
- **Coordination**: If Step 2 expects `storeToken()` to exist, ensure this step adds it

## Estimated Time

30-45 minutes

---

## Summary of Changes

| Before | After |
|--------|-------|
| ~547 lines | ~80-100 lines |
| 2 external imports (crypto, http) | 1 import (vscode) |
| 10+ methods | 5-6 methods |
| OAuth PKCE flow | Token storage only |
| Localhost callback server | No server |

The service becomes a simple token storage wrapper, with authentication handled externally by the wizard's EdsPreflightStep or dashboard's QuickPick flow.
