# Step 3: JSX Validation Chains

## Objective

Extract long `&&` chains (>3 conditions) in JSX conditionals to named predicate functions per SOP §10.

## Violations

### AdobeAuthStep.tsx (5 JSX conditionals with 3-4 conditions each)

| Line | Current | Suggested Helper |
|------|---------|------------------|
| 55 | `!adobeAuth.isChecking && adobeAuth.isAuthenticated && adobeAuth.tokenExpiringSoon` | `isTokenExpiringSoon()` |
| 74 | `!adobeAuth.isChecking && adobeAuth.isAuthenticated && adobeOrg && !adobeAuth.tokenExpiringSoon` | `isAuthenticatedWithOrg()` |
| 90 | `!adobeAuth.isChecking && adobeAuth.isAuthenticated && !adobeOrg` | `needsOrgSelection()` |
| 115 | `!adobeAuth.isChecking && !authTimeout && adobeAuth.isAuthenticated === false && !adobeAuth.error` | `isNotAuthenticated()` |
| 134 | `!adobeAuth.isChecking && adobeAuth.error && !authTimeout` | `hasAuthError()` |
| 176 | `authTimeout && !adobeAuth.isChecking && !adobeAuth.isAuthenticated` | `hasAuthTimeout()` |

### ProjectCreationStep.tsx

| Line | Current | Suggested Helper |
|------|---------|------------------|
| 37 | `progress && !progress.error && !isCancelled && !isFailed && !isCompleted` | `isProgressActive()` |

## TDD Approach

### RED: Write Tests First

```typescript
// tests/features/authentication/ui/steps/AdobeAuthStep-predicates.test.ts
import {
    isTokenExpiringSoon,
    isAuthenticatedWithOrg,
    needsOrgSelection,
    isNotAuthenticated,
    hasAuthError,
    hasAuthTimeout
} from '@/features/authentication/ui/steps/AdobeAuthStep';

describe('AdobeAuthStep predicates', () => {
    describe('isAuthenticatedWithOrg', () => {
        it('returns true when authenticated with org and not expiring', () => {
            const adobeAuth = { isChecking: false, isAuthenticated: true, tokenExpiringSoon: false };
            const adobeOrg = { id: '123', name: 'Test Org' };
            expect(isAuthenticatedWithOrg(adobeAuth, adobeOrg)).toBe(true);
        });

        it('returns false when checking', () => {
            const adobeAuth = { isChecking: true, isAuthenticated: true, tokenExpiringSoon: false };
            const adobeOrg = { id: '123', name: 'Test Org' };
            expect(isAuthenticatedWithOrg(adobeAuth, adobeOrg)).toBe(false);
        });

        it('returns false when no org', () => {
            const adobeAuth = { isChecking: false, isAuthenticated: true, tokenExpiringSoon: false };
            expect(isAuthenticatedWithOrg(adobeAuth, undefined)).toBe(false);
        });

        it('returns false when token expiring', () => {
            const adobeAuth = { isChecking: false, isAuthenticated: true, tokenExpiringSoon: true };
            const adobeOrg = { id: '123', name: 'Test Org' };
            expect(isAuthenticatedWithOrg(adobeAuth, adobeOrg)).toBe(false);
        });
    });

    // Similar tests for other predicates...
});
```

### GREEN: Implementation

1. **Create predicate functions** in `AdobeAuthStep.tsx`:

```typescript
// Helper predicates for JSX conditionals (SOP §10 compliance)
function isTokenExpiringSoon(
    adobeAuth: AdobeAuthState
): boolean {
    return !adobeAuth.isChecking &&
           adobeAuth.isAuthenticated === true &&
           adobeAuth.tokenExpiringSoon === true;
}

function isAuthenticatedWithOrg(
    adobeAuth: AdobeAuthState,
    adobeOrg: AdobeOrg | undefined
): boolean {
    return !adobeAuth.isChecking &&
           adobeAuth.isAuthenticated === true &&
           adobeOrg !== undefined &&
           !adobeAuth.tokenExpiringSoon;
}

function needsOrgSelection(
    adobeAuth: AdobeAuthState,
    adobeOrg: AdobeOrg | undefined
): boolean {
    return !adobeAuth.isChecking &&
           adobeAuth.isAuthenticated === true &&
           adobeOrg === undefined;
}

function isNotAuthenticated(
    adobeAuth: AdobeAuthState,
    authTimeout: boolean
): boolean {
    return !adobeAuth.isChecking &&
           !authTimeout &&
           adobeAuth.isAuthenticated === false &&
           !adobeAuth.error;
}

function hasAuthError(
    adobeAuth: AdobeAuthState,
    authTimeout: boolean
): boolean {
    return !adobeAuth.isChecking &&
           adobeAuth.error !== undefined &&
           !authTimeout;
}

function hasAuthTimeout(
    adobeAuth: AdobeAuthState,
    authTimeout: boolean
): boolean {
    return authTimeout &&
           !adobeAuth.isChecking &&
           !adobeAuth.isAuthenticated;
}
```

2. **Update JSX conditionals**:

```tsx
{/* Token expiring soon */}
{isTokenExpiringSoon(adobeAuth) && (
    <Flex ...>

{/* Authenticated with valid organization */}
{isAuthenticatedWithOrg(adobeAuth, adobeOrg) && (
    <Flex ...>

{/* Authenticated but organization selection required */}
{needsOrgSelection(adobeAuth, adobeOrg) && (
    <Flex ...>

{/* Not authenticated */}
{isNotAuthenticated(adobeAuth, authTimeout) && (
    <Flex ...>

{/* Error state */}
{hasAuthError(adobeAuth, authTimeout) && (
    <Flex ...>

{/* Timeout state */}
{hasAuthTimeout(adobeAuth, authTimeout) && (
    <Flex ...>
```

3. **ProjectCreationStep.tsx** - Extract helper:

```typescript
function isProgressActive(
    progress: Progress | undefined,
    isCancelled: boolean,
    isFailed: boolean,
    isCompleted: boolean
): boolean {
    return progress !== undefined &&
           !progress.error &&
           !isCancelled &&
           !isFailed &&
           !isCompleted;
}

// Usage
const isActive = isProgressActive(progress, isCancelled, isFailed, isCompleted);
```

### REFACTOR: Verify

- Run full test suite
- Verify JSX is more readable
- Verify no `&&` chains with >3 conditions remain

## Files Changed

- `src/features/authentication/ui/steps/AdobeAuthStep.tsx` - Add 6 predicate functions
- `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` - Add 1 predicate function

## Acceptance Criteria

- [ ] All 6 predicates extracted in AdobeAuthStep.tsx
- [ ] 1 predicate extracted in ProjectCreationStep.tsx
- [ ] JSX conditionals use named predicates
- [ ] Unit tests cover all predicate edge cases
- [ ] All existing tests pass
- [ ] No `&&` chains with >3 conditions in JSX
