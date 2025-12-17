# Step 5: Update Tests with Error Code Assertions

## Objective
Update existing tests to include `code` field in mock responses and add assertions for error code handling.

## Files to Modify

### Test Files to Update
1. `tests/features/authentication/**/*.test.ts(x)` - Auth handler and UI tests
2. `tests/features/mesh/**/*.test.ts(x)` - Mesh handler and UI tests
3. `tests/features/components/**/*.test.ts(x)` - Component tests
4. `tests/core/ui/hooks/**/*.test.ts(x)` - Hook tests

## Test Strategy (Meta-Testing)

This step is about ensuring test quality - the tests themselves should verify error code handling.

### Pattern 1: Update Mock Responses

**Before (string-only error):**
```typescript
mockWebviewClient.send.mockResolvedValue({
    success: false,
    error: 'Operation timed out',
});
```

**After (with error code):**
```typescript
import { ErrorCode } from '@/types/errorCodes';

mockWebviewClient.send.mockResolvedValue({
    success: false,
    error: 'Operation timed out',
    code: ErrorCode.TIMEOUT,
});
```

### Pattern 2: Add Error Code Assertions

**Before (checking error string):**
```typescript
expect(result.current.error).toBe('Operation timed out');
```

**After (checking error object with code):**
```typescript
expect(result.current.error).toEqual({
    message: 'Operation timed out',
    code: ErrorCode.TIMEOUT,
});
```

### Pattern 3: Test Both Code and No-Code Scenarios

```typescript
describe('error handling', () => {
    it('handles error with code', async () => {
        mockResponse({
            success: false,
            error: 'Timeout',
            code: ErrorCode.TIMEOUT,
        });

        await triggerAction();

        expect(result.current.error?.code).toBe(ErrorCode.TIMEOUT);
    });

    it('handles legacy error without code', async () => {
        // Backward compatibility test
        mockResponse({
            success: false,
            error: 'Timeout',
            // No code field
        });

        await triggerAction();

        expect(result.current.error?.message).toBe('Timeout');
        expect(result.current.error?.code).toBeUndefined();
    });
});
```

## Implementation Checklist

### 1. Update Test Utilities

If test utilities exist for creating mock responses, update them:

**File:** `tests/testUtils.ts` or similar

```typescript
import { ErrorCode } from '@/types/errorCodes';

export function mockErrorResponse(error: string, code?: ErrorCode) {
    return {
        success: false,
        error,
        code,
    };
}

export function mockTimeoutError() {
    return mockErrorResponse('Operation timed out', ErrorCode.TIMEOUT);
}

export function mockNetworkError() {
    return mockErrorResponse('Network error', ErrorCode.NETWORK);
}

export function mockAuthRequiredError() {
    return mockErrorResponse('Authentication required', ErrorCode.AUTH_REQUIRED);
}
```

### 2. Update Handler Tests

**Example: Authentication Handler Tests**

```typescript
describe('authenticationHandlers', () => {
    describe('error responses', () => {
        it('returns TIMEOUT code on timeout', async () => {
            mockExecutor.mockRejectedValue(new TimeoutError());

            const result = await handler.authenticate();

            expect(result.code).toBe(ErrorCode.TIMEOUT);
        });

        it('returns AUTH_NO_APP_BUILDER code when org has no access', async () => {
            mockOrgValidator.mockReturnValue({ hasAppBuilder: false });

            const result = await handler.validateOrg(orgId);

            expect(result.code).toBe(ErrorCode.AUTH_NO_APP_BUILDER);
        });
    });
});
```

### 3. Update UI Component Tests

**Example: Step Component Tests**

```typescript
describe('AdobeAuthStep', () => {
    it('displays timeout-specific UI when code is TIMEOUT', () => {
        const state = {
            isAuthenticated: false,
            error: 'Timed out',
            code: ErrorCode.TIMEOUT,
        };

        render(<AdobeAuthStep authState={state} />);

        expect(screen.getByText(/try again/i)).toBeInTheDocument();
    });
});
```

### 4. Update Hook Tests

**Example: Hook Tests**

```typescript
describe('useAuthStatus', () => {
    it('exposes error code from response', async () => {
        mockMessage('auth-status', {
            authenticated: false,
            error: 'Timeout',
            code: ErrorCode.TIMEOUT,
        });

        const { result } = renderHook(() => useAuthStatus());

        await waitFor(() => {
            expect(result.current.code).toBe(ErrorCode.TIMEOUT);
        });
    });
});
```

## Search Commands

Find tests that need updating:

```bash
# Find tests with error-related assertions
grep -rn "error:" tests/features/ | grep -v ".code"
grep -rn "error.*toBe" tests/features/
grep -rn "mockResolvedValue.*error" tests/features/

# Find tests that might need code field
grep -rn "success: false" tests/features/ tests/core/
```

## Acceptance Criteria

- [ ] All mock error responses include appropriate `code` field
- [ ] Test utilities updated with error code helpers
- [ ] Handler tests assert on error codes
- [ ] UI tests verify code-specific rendering
- [ ] Hook tests verify code extraction
- [ ] Backward compatibility tests exist (no code scenarios)
- [ ] All tests pass
- [ ] Test coverage maintained or improved

## Dependencies
- Steps 1-4 must be complete (code is used throughout)

## Risk Assessment
- **Risk**: Forgetting to update some tests, causing false confidence
- **Mitigation**: Grep search for all error-related tests
- **Impact**: LOW - test-only changes, no production code affected
