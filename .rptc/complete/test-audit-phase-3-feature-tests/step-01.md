# Step 1: Authentication Feature Tests (60 files)

> **Phase:** 3 - Feature Tests
> **Step:** 1 of 9
> **Feature:** authentication
> **Test Files:** 60
> **Estimated Time:** 5-6 hours

---

## Purpose

Audit all 60 authentication test files to ensure tests accurately reflect the current authentication implementation. Authentication is the foundation of Adobe integration and affects many other features (dashboard, mesh, project-creation).

---

## Prerequisites

- [ ] Phase 1 (Foundation) complete
- [ ] All current tests pass before starting audit
- [ ] Read current authentication implementation structure

---

## Test Files to Audit

### Handlers (15 files)

- [ ] `tests/features/authentication/handlers/authenticationHandlers-authenticate-re-auth.test.ts`
- [ ] `tests/features/authentication/handlers/authenticationHandlers-messages.test.ts`
- [ ] `tests/features/authentication/handlers/authenticationHandlers-tokenExpiry.test.ts`
- [ ] `tests/features/authentication/handlers/projectHandlers-apis.test.ts`
- [ ] `tests/features/authentication/handlers/projectHandlers-fetch.test.ts`
- [ ] `tests/features/authentication/handlers/projectHandlers-select.test.ts`
- [ ] `tests/features/authentication/handlers/projectHandlers-validate.test.ts`
- [ ] `tests/features/authentication/handlers/workspaceHandlers.test.ts`

### UI Steps (16 files)

- [ ] `tests/features/authentication/ui/steps/AdobeAuthStep-authentication.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeAuthStep-errors.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeAuthStep-messages.test.ts`
- [ ] `tests/features/authentication/ui/steps/AdobeAuthStep-messaging.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeAuthStep-organization.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeAuthStep-predicates.test.ts`
- [ ] `tests/features/authentication/ui/steps/AdobeProjectStep-layout.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeProjectStep-loading-errors.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeProjectStep-search-refresh.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeProjectStep-selection.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeWorkspaceStep-loading-errors.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeWorkspaceStep-search-refresh.test.tsx`
- [ ] `tests/features/authentication/ui/steps/AdobeWorkspaceStep-selection.test.tsx`

### UI Step Components (3 files)

- [ ] `tests/features/authentication/ui/steps/components/AuthErrorState-errorCodes.test.tsx`
- [ ] `tests/features/authentication/ui/steps/components/AuthErrorState.test.tsx`
- [ ] `tests/features/authentication/ui/steps/components/AuthLoadingState.test.tsx`

### UI Hooks (6 files)

- [ ] `tests/features/authentication/ui/hooks/useAuthStatus-errorCodes.test.tsx`
- [ ] `tests/features/authentication/ui/hooks/useAuthStatus.test.tsx`
- [ ] `tests/features/authentication/ui/hooks/useSelectionStep-basic.test.tsx`
- [ ] `tests/features/authentication/ui/hooks/useSelectionStep-errorCodes.test.tsx`
- [ ] `tests/features/authentication/ui/hooks/useSelectionStep-searchAndErrors.test.tsx`
- [ ] `tests/features/authentication/ui/hooks/useSelectionStep-stateManagement.test.tsx`

### Services (remaining files in authentication feature)

Search for additional test files in:
- `tests/features/authentication/services/`
- Any other subdirectories

---

## Audit Checklist Per File

For each test file, verify:

### 1. Mock Data Accuracy

```typescript
// VERIFY: Mock interfaces match current types
// Check src/features/authentication/types.ts for current definitions

// Example: AuthContext mock
const mockAuthContext = {
  // Verify all fields exist in current AuthContext type
  isAuthenticated: boolean,
  accessToken: string | null,
  organization: AdobeOrganization | null,
  project: AdobeProject | null,
  workspace: AdobeWorkspace | null,
  // ... check for any new fields added to type
};
```

### 2. Handler Response Shapes

```typescript
// VERIFY: Handler responses match current implementation
// Check src/features/authentication/handlers/ for current responses

// Example: checkAuthStatus handler
expect(result).toEqual({
  success: true,
  data: {
    // Verify these fields match actual handler return type
    authenticated: boolean,
    needsReauth: boolean,
    organization: { /* verify structure */ },
    // ... check for missing or changed fields
  }
});
```

### 3. Token/Auth Flow Accuracy

```typescript
// VERIFY: Auth flow tests match current SDK integration
// Check src/utils/adobeAuthManager.ts for current implementation

// Key areas to verify:
// - Token refresh logic
// - Token expiry handling
// - Re-authentication triggers
// - Session management
```

### 4. Organization/Project/Workspace Selection

```typescript
// VERIFY: Selection tests match current selection flow
// Check "Backend Call on Continue" pattern in docs

// Key areas to verify:
// - Selection state management
// - Validation before navigation
// - Error handling on selection failure
```

### 5. Error Codes and Messages

```typescript
// VERIFY: Error handling tests match current error definitions
// Check src/features/authentication/ for error types

// Example: Verify error codes still exist and messages match
expect(error.code).toBe('AUTH_EXPIRED'); // Verify this code is current
expect(error.message).toMatch(/session expired/i); // Verify message format
```

---

## Key Source Files to Reference

| Source File | Purpose |
|-------------|---------|
| `src/features/authentication/types.ts` | Type definitions for auth entities |
| `src/features/authentication/handlers/` | Handler implementations |
| `src/features/authentication/ui/steps/` | UI step components |
| `src/features/authentication/ui/hooks/` | React hooks |
| `src/features/authentication/services/` | Auth services |
| `src/utils/adobeAuthManager.ts` | Adobe SDK integration |
| `src/types/auth.ts` | Shared auth types (if exists) |

---

## Common Issues to Look For

### Issue 1: Outdated AuthContext Shape

```typescript
// OLD (might be in tests):
const mockAuthContext = {
  token: 'abc123', // Might be renamed
  org: {...},      // Might be 'organization'
};

// CURRENT (verify against types):
const mockAuthContext = {
  accessToken: 'abc123',
  organization: {...},
};
```

### Issue 2: Deprecated Auth Methods

```typescript
// OLD: Direct auth methods
expect(mockAuth.login).toHaveBeenCalled();

// CURRENT: SDK-based auth (verify)
expect(mockAdobeAuth.authenticate).toHaveBeenCalled();
```

### Issue 3: Changed Handler Signatures

```typescript
// OLD: Handler with direct parameters
await handler.checkAuth(token);

// CURRENT: Handler with context (verify)
await handler.checkAuth({ context, logger });
```

### Issue 4: Missing Error Code Tests

```typescript
// Ensure all current error codes have test coverage
// Check for new error codes added since test was written
```

---

## Expected Outcomes

After auditing all 60 authentication test files:

- [ ] All mock AuthContext objects match current type definition
- [ ] All handler tests use correct response shapes
- [ ] All token handling tests reflect current SDK integration
- [ ] All error codes in tests exist in current implementation
- [ ] All tests pass with no modifications to implementation
- [ ] No version references (v2/v3) remain in auth tests

---

## Acceptance Criteria

- [ ] All 60 authentication test files reviewed
- [ ] Mock data matches current TypeScript interfaces
- [ ] Handler responses match current implementation
- [ ] Token flow tests match current SDK integration
- [ ] Error handling tests match current error definitions
- [ ] All authentication tests pass
- [ ] No hardcoded values (timeouts use TIMEOUTS.*)
- [ ] No version-specific logic remains

---

## Notes

- Authentication tests are foundational - errors here may indicate issues affecting other features
- Pay special attention to cross-feature mocks (auth mocks used in dashboard, etc.)
- Document any shared mock patterns that should be consolidated

---

## Implementation Log

_To be filled during audit_

### Files Audited

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
