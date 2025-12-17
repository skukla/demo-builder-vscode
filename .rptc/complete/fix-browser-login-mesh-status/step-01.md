# Step 1: Replace CLI Auth Check with Token Inspection

## Purpose

Replace the `aio console where --json` pre-flight check in `fetchDeployedMeshConfig()` with `AuthenticationService.getTokenStatus()` to prevent automatic browser login when the token is expired.

## Prerequisites

- None (first step)

## Tests to Write First (RED Phase)

### Test File: `tests/features/mesh/services/stalenessDetector-auth.test.ts`

- [ ] **Test: Returns null when token is expired**
  - Mock `authService.getTokenStatus()` to return `{ isAuthenticated: false, expiresInMinutes: -5 }`
  - Call `fetchDeployedMeshConfig()`
  - Assert: Returns `null`
  - Assert: `commandManager.execute` NOT called with `aio api-mesh:get`

- [ ] **Test: Proceeds with mesh fetch when token is valid**
  - Mock `authService.getTokenStatus()` to return `{ isAuthenticated: true, expiresInMinutes: 30 }`
  - Mock `commandManager.execute` for `aio api-mesh:get` to return valid mesh data
  - Call `fetchDeployedMeshConfig()`
  - Assert: Returns parsed mesh config
  - Assert: `commandManager.execute` called with `aio api-mesh:get`

- [ ] **Test: Does not call aio console where (regression test)**
  - Mock `authService.getTokenStatus()` to return valid token
  - Call `fetchDeployedMeshConfig()`
  - Assert: `commandManager.execute` NOT called with `aio console where`

## Files to Modify

### `src/features/mesh/services/stalenessDetector.ts`

**Current code (lines 69-83):**
```typescript
// Pre-check: Verify authentication status without triggering browser auth
// Use a fast command that doesn't trigger interactive login
try {
    const authCheckResult = await commandManager.execute('aio console where --json', {
        timeout: TIMEOUTS.API_CALL,
    });

    if (authCheckResult.code !== 0) {
        logger.debug('[Mesh Staleness] Not authenticated or no org selected, skipping mesh fetch');
        return null;
    }
} catch (authError) {
    logger.debug('[Mesh Staleness] Auth check failed, skipping mesh fetch:', authError);
    return null;
}
```

**New code:**
```typescript
// Pre-check: Verify authentication status without triggering browser auth
// Use TokenManager.inspectToken() which reads token file directly (no CLI call)
try {
    const { ServiceLocator } = await import('@/core/di');
    const authService = ServiceLocator.getAuthenticationService();
    const tokenStatus = await authService.getTokenStatus();

    if (!tokenStatus.isAuthenticated) {
        logger.debug('[Mesh Staleness] Token expired or invalid, skipping mesh fetch');
        return null;
    }
} catch (authError) {
    logger.debug('[Mesh Staleness] Auth check failed, skipping mesh fetch:', authError);
    return null;
}
```

## Implementation Details (GREEN Phase)

1. Remove the `aio console where --json` command execution
2. Import and use `ServiceLocator.getAuthenticationService()`
3. Call `authService.getTokenStatus()` which returns `{ isAuthenticated: boolean, expiresInMinutes: number }`
4. Check `isAuthenticated` instead of CLI exit code
5. Update log message to reflect token-based check

## Refactor Phase

- Consider extracting auth check to a helper function if used elsewhere
- Update the misleading comment that claimed CLI command doesn't trigger login

## Expected Outcome

- Dashboard loads without opening browser window when token is expired
- Mesh status shows "Session expired" with "Sign in" button
- User can manually click to re-authenticate

## Acceptance Criteria

- [ ] No browser window opens during dashboard load with expired token
- [ ] `aio console where` command is NOT executed
- [ ] Mesh status correctly shows needs-auth state when token expired
- [ ] All new tests pass
- [ ] All existing tests pass

## Estimated Complexity

Simple - replacing one method call with another existing method.
