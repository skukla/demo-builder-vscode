# Step 2: Add Token Expiry Detection

## Purpose

Add robust authentication validation that distinguishes "session expired" (invalid token) from "no organization access" (valid token, 0 orgs) by checking token expiry BEFORE fetching organizations. This provides clear, accurate error messages to users based on their specific authentication state.

**Why this matters:**
- Current code calls `getOrganizations()` without verifying token is still valid
- Cannot distinguish "expired token" from "valid token with no org access"
- User sees generic "No organizations found" regardless of actual problem
- Checking token expiry first allows precise error messaging

## Prerequisites

- [ ] Step 1 completed (frontend defers to backend messages)
- [ ] Development environment ready with TypeScript watch mode
- [ ] Test environment configured for Jest backend testing

## Tests to Write First (RED Phase)

### Unit Tests - authenticationHandlers.ts

- [ ] **Test: handleAuthenticate() calls tokenManager.inspectToken() before getOrganizations()**
  - **Given:** User clicks "Sign In with Adobe" after successful login
  - **When:** handleAuthenticate() executes post-login org selection flow (line 246)
  - **Then:** `tokenManager.inspectToken()` is called BEFORE `authManager.getOrganizations()`
  - **File:** `tests/features/authentication/handlers/authenticationHandlers.test.ts`

- [ ] **Test: Invalid token sends "Session expired" message**
  - **Given:** User has expired or corrupted token
  - **When:** handleAuthenticate() checks token with `inspectToken()` returning `{ valid: false, expiresIn: -30 }`
  - **Then:** auth-status message sent with `{ message: 'Session expired', subMessage: 'Please sign in again to continue', requiresOrgSelection: true, orgLacksAccess: false }`
  - **File:** `tests/features/authentication/handlers/authenticationHandlers.test.ts`

- [ ] **Test: Valid token with 0 orgs sends "No organization access" message**
  - **Given:** User has valid token but organization list is empty
  - **When:** `inspectToken()` returns `{ valid: true, expiresIn: 120 }` AND `getOrganizations()` returns empty array
  - **Then:** auth-status message sent with `{ message: 'No organizations found', subMessage: 'Your Adobe account doesn\'t have access to any organizations with App Builder', requiresOrgSelection: true, orgLacksAccess: true }`
  - **File:** `tests/features/authentication/handlers/authenticationHandlers.test.ts`

- [ ] **Test: Valid token with orgs proceeds normally**
  - **Given:** User has valid token and accessible organizations
  - **When:** `inspectToken()` returns `{ valid: true, expiresIn: 120 }` AND `getOrganizations()` returns organizations array
  - **Then:** Normal flow continues (auto-select single org or prompt for multi-org selection)
  - **File:** `tests/features/authentication/handlers/authenticationHandlers.test.ts`

- [ ] **Test: Token check failure defaults to org fetch (graceful degradation)**
  - **Given:** `inspectToken()` throws error due to CLI issue
  - **When:** handleAuthenticate() catches token inspection error
  - **Then:** Logs warning, continues to `getOrganizations()` (existing behavior as fallback)
  - **File:** `tests/features/authentication/handlers/authenticationHandlers.test.ts`

### Integration Tests

- [ ] **Test: Full auth flow with expired token**
  - **Given:** Extension with expired Adobe CLI token
  - **When:** User clicks "Sign In with Adobe" button
  - **Then:** "Session expired" message appears in UI, user prompted to re-authenticate
  - **File:** `tests/features/authentication/integration/authFlow.test.ts`

- [ ] **Test: Full auth flow with valid token but 0 orgs**
  - **Given:** Extension with valid token, Adobe account has no organizations
  - **When:** User clicks "Sign In with Adobe" button
  - **Then:** "No organization access" message appears in UI with explanation
  - **File:** `tests/features/authentication/integration/authFlow.test.ts`

## Files to Create/Modify

**Files to Modify:**

- [ ] `src/features/authentication/handlers/authenticationHandlers.ts` - Add token expiry check before org fetch (lines 245-250)
- [ ] `src/features/authentication/services/authenticationService.ts` - Expose getTokenManager() method if not already public

**Test Files:**

- [ ] `tests/features/authentication/handlers/authenticationHandlers.test.ts` - Add 5 unit tests for token validation flow
- [ ] `tests/features/authentication/integration/authFlow.test.ts` - Add 2 integration tests for full flows (create if doesn't exist)

## Implementation Details (RED-GREEN-REFACTOR)

### RED: Write Failing Tests First

**Create new test suite in authenticationHandlers.test.ts:**

```typescript
describe('Token Expiry Detection - handleAuthenticate()', () => {
    let mockContext: HandlerContext;
    let mockTokenManager: any;

    beforeEach(() => {
        mockTokenManager = {
            inspectToken: jest.fn(),
        };

        mockContext = {
            authManager: {
                login: jest.fn(),
                isAuthenticated: jest.fn(),  // Note: Step 4 renames isAuthenticatedQuick → isAuthenticated
                ensureSDKInitialized: jest.fn(),
                getOrganizations: jest.fn(),
                selectOrganization: jest.fn(),
                setCachedOrganization: jest.fn(),
                // Expose token manager for testing
                getTokenManager: jest.fn(() => mockTokenManager),
            },
            sendMessage: jest.fn(),
            logger: {
                info: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            },
            sharedState: {
                isAuthenticating: false,
            },
        } as any;
    });

    it('should call inspectToken() before getOrganizations()', async () => {
        // Arrange
        mockContext.authManager!.login = jest.fn().mockResolvedValue(true);
        mockTokenManager.inspectToken.mockResolvedValue({ valid: true, expiresIn: 120 });
        mockContext.authManager!.getOrganizations = jest.fn().mockResolvedValue([
            { id: '1', name: 'Test Org' },
        ]);

        // Act
        await handleAuthenticate(mockContext);

        // Assert - inspectToken called before getOrganizations
        const inspectCall = mockTokenManager.inspectToken.mock.invocationCallOrder[0];
        const getOrgsCall = mockContext.authManager!.getOrganizations.mock.invocationCallOrder[0];
        expect(inspectCall).toBeLessThan(getOrgsCall);
    });

    it('should send "Session expired" message for invalid token', async () => {
        // Arrange
        mockContext.authManager!.login = jest.fn().mockResolvedValue(true);
        mockTokenManager.inspectToken.mockResolvedValue({ valid: false, expiresIn: -30 });

        // Act
        await handleAuthenticate(mockContext);

        // Assert - "Session expired" message sent
        expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
            authenticated: false,
            isAuthenticated: false,
            isChecking: false,
            message: 'Session expired',
            subMessage: 'Please sign in again to continue',
            requiresOrgSelection: true,
            orgLacksAccess: false,
        }));

        // getOrganizations should NOT be called for expired token
        expect(mockContext.authManager!.getOrganizations).not.toHaveBeenCalled();
    });

    it('should send "No organization access" for valid token with 0 orgs', async () => {
        // Arrange
        mockContext.authManager!.login = jest.fn().mockResolvedValue(true);
        mockTokenManager.inspectToken.mockResolvedValue({ valid: true, expiresIn: 120 });
        mockContext.authManager!.getOrganizations = jest.fn().mockResolvedValue([]);

        // Act
        await handleAuthenticate(mockContext);

        // Assert - "No organization access" message sent
        expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
            authenticated: true,
            isAuthenticated: true,
            isChecking: false,
            message: 'No organizations found',
            subMessage: "Your Adobe account doesn't have access to any organizations with App Builder",
            requiresOrgSelection: true,
            orgLacksAccess: true,
        }));
    });

    it('should proceed normally for valid token with orgs', async () => {
        // Arrange
        mockContext.authManager!.login = jest.fn().mockResolvedValue(true);
        mockTokenManager.inspectToken.mockResolvedValue({ valid: true, expiresIn: 120 });
        mockContext.authManager!.getOrganizations = jest.fn().mockResolvedValue([
            { id: '1', name: 'Test Org' },
        ]);
        mockContext.authManager!.selectOrganization = jest.fn().mockResolvedValue(true);

        // Act
        await handleAuthenticate(mockContext);

        // Assert - normal flow continues
        expect(mockContext.authManager!.selectOrganization).toHaveBeenCalledWith('1');
        expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
            authenticated: true,
            isAuthenticated: true,
            message: 'All set!',
        }));
    });

    it('should gracefully degrade if inspectToken() fails', async () => {
        // Arrange
        mockContext.authManager!.login = jest.fn().mockResolvedValue(true);
        mockTokenManager.inspectToken.mockRejectedValue(new Error('CLI timeout'));
        mockContext.authManager!.getOrganizations = jest.fn().mockResolvedValue([
            { id: '1', name: 'Test Org' },
        ]);

        // Act
        await handleAuthenticate(mockContext);

        // Assert - warning logged, flow continues to getOrganizations
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Token inspection failed'),
            expect.any(Error),
        );
        expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
    });
});
```

**Run tests to verify they fail:**

```bash
npm run test:watch -- tests/features/authentication/handlers/authenticationHandlers.test.ts
```

**Expected result:** All 5 tests FAIL because token expiry check doesn't exist yet.

### GREEN: Minimal Implementation

**1. Expose token manager in authenticationService.ts (if needed):**

**File:** `src/features/authentication/services/authenticationService.ts`

**Add method around line 400 (after getCacheManager):**

```typescript
/**
 * Get token manager instance
 * Used for token inspection in handlers
 */
getTokenManager(): TokenManager {
    return this.tokenManager;
}
```

**2. Add token expiry check in authenticationHandlers.ts:**

**File:** `src/features/authentication/handlers/authenticationHandlers.ts`

**Modify lines 225-280 (post-login org selection flow):**

**BEFORE (current code):**
```typescript
// Line 225-280 (simplified)
if (loginSuccess) {
    context.logger.info(`[Auth] Authentication completed successfully after ${loginDuration}ms`);
    context.logger.info('[Auth] Fetching organizations after login');

    const setupStart = Date.now();
    let currentOrg: AdobeOrg | undefined;
    let currentProject: AdobeProject | undefined;
    let requiresOrgSelection = false;
    let orgLacksAccess = false;

    try {
        // Initialize SDK for faster operations (token stable after login)
        context.logger.debug('[Auth] Ensuring SDK is initialized for org fetching');
        await context.authManager?.ensureSDKInitialized();
        await context.sendMessage('auth-status', {
            isChecking: true,
            message: AUTH_LOADING_MESSAGE,
            subMessage: 'Loading organizations...',
            isAuthenticated: true,
        });

        // Fetch organization list (uses SDK if available, falls back to CLI)
        context.logger.debug('[Auth] Fetching available organizations');
        const orgs = await context.authManager?.getOrganizations();
        // ... rest of org selection logic
```

**AFTER (with token expiry check):**
```typescript
// Line 225-280 (with token check added)
if (loginSuccess) {
    context.logger.info(`[Auth] Authentication completed successfully after ${loginDuration}ms`);

    const setupStart = Date.now();
    let currentOrg: AdobeOrg | undefined;
    let currentProject: AdobeProject | undefined;
    let requiresOrgSelection = false;
    let orgLacksAccess = false;

    try {
        // STEP 2 FIX: Check token expiry BEFORE fetching organizations
        context.logger.debug('[Auth] Checking token expiry before org fetch');
        const tokenManager = context.authManager?.getTokenManager();

        let tokenValid = true; // Default to true for graceful degradation
        try {
            const tokenInspection = await tokenManager?.inspectToken();

            if (tokenInspection && !tokenInspection.valid) {
                // Token expired or invalid - send clear message
                context.logger.warn('[Auth] Token expired or invalid, user must re-authenticate');
                context.sharedState.isAuthenticating = false;

                await context.sendMessage('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    message: 'Session expired',
                    subMessage: 'Please sign in again to continue',
                    requiresOrgSelection: true,
                    orgLacksAccess: false,
                });

                return { success: false };
            }

            context.logger.debug(`[Auth] Token valid, expires in ${tokenInspection?.expiresIn || 0} minutes`);
        } catch (tokenError) {
            // Token inspection failed - log warning but continue (graceful degradation)
            context.logger.warn('[Auth] Token inspection failed, continuing with org fetch', tokenError as Error);
        }

        // Token is valid (or inspection failed but we continue) - proceed with org fetch
        context.logger.info('[Auth] Fetching organizations after login');

        // Initialize SDK for faster operations (token stable after login)
        context.logger.debug('[Auth] Ensuring SDK is initialized for org fetching');
        await context.authManager?.ensureSDKInitialized();
        await context.sendMessage('auth-status', {
            isChecking: true,
            message: AUTH_LOADING_MESSAGE,
            subMessage: 'Loading organizations...',
            isAuthenticated: true,
        });

        // Fetch organization list (uses SDK if available, falls back to CLI)
        context.logger.debug('[Auth] Fetching available organizations');
        const orgs = await context.authManager?.getOrganizations();
        context.logger.info(`[Auth] Found ${orgs?.length ?? 0} organization(s) accessible to user`);

        if (orgs?.length === 1) {
            // Auto-select single org (existing code continues...)
```

**Key changes:**
1. Added token expiry check at line 234 (before SDK init)
2. If token invalid → send "Session expired" message and return early
3. If token valid → continue with existing org fetch flow
4. Graceful degradation: If token check fails, log warning but continue
5. Existing "No organizations found" message (line 288-299) now specifically means "valid token, 0 orgs"

**Run tests to verify they pass:**

```bash
npm run test:watch -- tests/features/authentication/handlers/authenticationHandlers.test.ts
```

**Expected result:** All 5 new tests PASS (GREEN).

### REFACTOR: Clean Up

**1. Extract token validation to helper function (optional optimization):**

**Add helper function at top of authenticationHandlers.ts (around line 20):**

```typescript
/**
 * Check if current token is valid
 * Returns true if valid, false if expired/invalid
 * Logs errors and continues gracefully if check fails
 */
async function checkTokenExpiry(context: HandlerContext): Promise<boolean> {
    try {
        const tokenManager = context.authManager?.getTokenManager();
        const tokenInspection = await tokenManager?.inspectToken();

        if (tokenInspection && !tokenInspection.valid) {
            context.logger.warn('[Auth] Token expired or invalid, user must re-authenticate');
            return false;
        }

        context.logger.debug(`[Auth] Token valid, expires in ${tokenInspection?.expiresIn || 0} minutes`);
        return true;
    } catch (error) {
        // Token inspection failed - log warning but continue (graceful degradation)
        context.logger.warn('[Auth] Token inspection failed, assuming valid', error as Error);
        return true; // Graceful degradation
    }
}
```

**Then simplify handleAuthenticate() to use helper:**

```typescript
// STEP 2 FIX: Check token expiry BEFORE fetching organizations
const tokenValid = await checkTokenExpiry(context);

if (!tokenValid) {
    // Token expired or invalid - send clear message
    context.sharedState.isAuthenticating = false;

    await context.sendMessage('auth-status', {
        authenticated: false,
        isAuthenticated: false,
        isChecking: false,
        message: 'Session expired',
        subMessage: 'Please sign in again to continue',
        requiresOrgSelection: true,
        orgLacksAccess: false,
    });

    return { success: false };
}
```

**2. Verify existing tests still pass:**

Run full handler test suite:

```bash
npm run test:watch -- tests/features/authentication/handlers/
```

**Expected:** All existing tests PASS (no regressions).

**3. Update logging for clarity:**

Ensure log messages clearly distinguish scenarios:
- "Token valid, expires in X minutes" → Valid token flow
- "Token expired or invalid" → Session expired flow
- "Found 0 organization(s)" → No org access flow (valid token, 0 orgs)

**4. Manual verification:**

Start extension in debug mode (F5), test authentication scenarios:

1. **Valid token scenario**: Use extension normally → should proceed to org selection
2. **Expired token scenario**: Manually corrupt token expiry in Adobe CLI config → should see "Session expired" message
3. **Zero orgs scenario**: Use account with no organizations → should see "No organization access" message

## Expected Outcome

**Behavior After This Step:**

- Authentication flow checks token expiry BEFORE fetching organizations
- Invalid/expired token displays "Session expired" message (clear, actionable)
- Valid token with 0 orgs displays "No organization access" message (distinct from expired)
- Valid token with orgs proceeds normally (existing behavior preserved)
- Token check failures degrade gracefully (log warning, continue to org fetch)

**Verification:**

- [ ] All 5 new unit tests pass
- [ ] All existing authentication handler tests pass (no regressions)
- [ ] Integration tests pass for expired token and zero-org scenarios
- [ ] Manual testing confirms distinct messages for each scenario

**What Works:**

- Clear distinction between "session expired" and "no org access"
- Token expiry checked atomically via `inspectToken()` (prevents race conditions)
- Graceful degradation if token check fails
- Backend controls all messaging (frontend defers per Step 1)

**What Doesn't Change:**

- Existing org selection logic (auto-select single, prompt for multi, etc.)
- SDK initialization sequence
- Error handling for network failures
- Loading state display

## Acceptance Criteria

- [ ] `tokenManager.inspectToken()` called BEFORE `authManager.getOrganizations()`
- [ ] Invalid token sends auth-status with message "Session expired"
- [ ] Valid token with 0 orgs sends auth-status with message "No organizations found" AND subMessage explaining lack of App Builder access
- [ ] Valid token with orgs proceeds to normal org selection flow
- [ ] Token check failure logs warning and continues (graceful degradation)
- [ ] All 5 new unit tests passing
- [ ] All existing handler tests passing (no regressions)
- [ ] Integration tests passing for expired token and zero-org scenarios
- [ ] No console errors or warnings in browser during normal flow
- [ ] Code follows project TypeScript and error handling conventions

## Dependencies from Other Steps

**Depends on:** Step 1 (frontend defers messaging to backend)

**Used by:** Step 3 (CLI context clearing) needs to know when zero-org scenario detected

## Estimated Time

**1-1.5 hours**

- 20 min: Write 5 failing unit tests (RED)
- 20 min: Implement token expiry check in handlers (GREEN)
- 15 min: Extract helper function, verify existing tests (REFACTOR)
- 15 min: Integration tests for full flows
- 15 min: Manual verification and acceptance criteria check
- 5 min: Buffer for unexpected issues

**Total:** 90 minutes (conservative estimate)
