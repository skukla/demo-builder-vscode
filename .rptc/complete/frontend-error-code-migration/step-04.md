# Step 4: Replace String-Based Error Checks

## Objective
Replace all string-based error detection (`error === 'timeout'`) with typed error code checks (`code === ErrorCode.TIMEOUT`).

## Files to Modify

### Search Pattern
Find all instances of string-based error checks:
- `authData.error === 'timeout'`
- `adobeAuth.error === 'no_app_builder_access'`
- `error === 'timeout'`
- `error.includes('timeout')`

### Expected Files
1. Authentication-related UI components
2. Mesh-related UI components
3. Any component that handles error responses

## Test Strategy (TDD)

### Find String-Based Checks First

Run grep to identify all string-based error checks:
```bash
grep -rn "error === ['\"]" src/features/ src/core/ui/
grep -rn "error.includes" src/features/ src/core/ui/
grep -rn "\.error === ['\"]" src/features/ src/core/ui/
```

### Test File: `tests/features/authentication/ui/steps/AdobeAuthStep-errorCodes.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import { ErrorCode } from '@/types/errorCodes';

describe('AdobeAuthStep error code handling', () => {
    it('shows timeout UI when code is TIMEOUT', () => {
        render(
            <AdobeAuthStep
                authState={{
                    isAuthenticated: false,
                    error: 'Operation timed out',
                    code: ErrorCode.TIMEOUT,
                }}
            />
        );

        expect(screen.getByText(/timed out/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('shows no-app-builder UI when code is AUTH_NO_APP_BUILDER', () => {
        render(
            <AdobeAuthStep
                authState={{
                    isAuthenticated: false,
                    error: 'No App Builder access',
                    code: ErrorCode.AUTH_NO_APP_BUILDER,
                }}
            />
        );

        expect(screen.getByText(/administrator/i)).toBeInTheDocument();
    });

    it('does NOT use string matching for timeout detection', () => {
        // This test ensures we don't have legacy string checks
        // If code is undefined but error message contains 'timeout',
        // we should NOT show timeout-specific UI
        render(
            <AdobeAuthStep
                authState={{
                    isAuthenticated: false,
                    error: 'Something timeout related',
                    code: undefined, // No code provided
                }}
            />
        );

        // Should show generic error, not timeout-specific UI
        expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
});
```

## Implementation Pattern

### Before (String Matching)

```typescript
// Anti-pattern: String matching
function handleAuthError(authData: AuthData) {
    if (authData.error === 'timeout') {
        setAuthTimeout(true);
    }

    if (adobeAuth.error === 'no_app_builder_access') {
        showNoAppBuilderMessage();
    }
}
```

### After (Typed Error Codes)

```typescript
import { ErrorCode } from '@/types/errorCodes';

// Good: Typed error codes
function handleAuthError(authData: AuthData) {
    if (authData.code === ErrorCode.TIMEOUT) {
        setAuthTimeout(true);
    }

    if (authData.code === ErrorCode.AUTH_NO_APP_BUILDER) {
        showNoAppBuilderMessage();
    }
}
```

### Migration Checklist

For each string check found:

1. **Identify the current string check**
   ```typescript
   if (error === 'timeout')
   ```

2. **Find corresponding ErrorCode**
   - `'timeout'` → `ErrorCode.TIMEOUT`
   - `'no_app_builder_access'` → `ErrorCode.AUTH_NO_APP_BUILDER`
   - `'network'` → `ErrorCode.NETWORK`
   - `'auth_required'` → `ErrorCode.AUTH_REQUIRED`

3. **Replace check**
   ```typescript
   if (code === ErrorCode.TIMEOUT)
   ```

4. **Update import**
   ```typescript
   import { ErrorCode } from '@/types/errorCodes';
   ```

## Acceptance Criteria

- [ ] Tests written for components using string checks (RED)
- [ ] All `error === 'timeout'` replaced with `code === ErrorCode.TIMEOUT`
- [ ] All `error === 'no_app_builder_access'` replaced with `code === ErrorCode.AUTH_NO_APP_BUILDER`
- [ ] All other string-based error checks replaced
- [ ] No string-based error checks remain in frontend code
- [ ] All tests GREEN
- [ ] TypeScript compiles
- [ ] Error handling behavior unchanged (same UX)

## Verification Commands

After implementation, verify no string checks remain:
```bash
# Should return no results
grep -rn "error === ['\"]timeout" src/features/ src/core/ui/
grep -rn "error === ['\"]no_app_builder" src/features/ src/core/ui/
grep -rn "\.error === ['\"]" src/features/ src/core/ui/
```

## Dependencies
- Step 1: Type definitions (COMPLETE in this workflow)
- Step 2: Hooks expose code (COMPLETE in this workflow)
- Step 3: Components accept code prop (COMPLETE in this workflow)

## Risk Assessment
- **Risk**: Missing a string check could cause inconsistent behavior
- **Mitigation**: Comprehensive grep search, test coverage
- **Impact**: MEDIUM - logic change, but behavior should be identical
