# Step 2: Hook Updates - Extract and Use Error Codes

## Objective
Update frontend hooks to extract `code` field from backend responses and expose it to consuming components.

## Files to Modify

### Primary Files
1. `src/features/authentication/ui/hooks/useAuthStatus.ts` - Extract and return code
2. `src/core/ui/hooks/useSelectionStep.ts` - Change error shape to include code
3. `src/features/mesh/ui/hooks/useMeshOperations.ts` - Extract and return code
4. `src/features/components/ui/hooks/useComponentConfig.ts` - Extract and return code

## Test Strategy (TDD)

### 2.1: useAuthStatus.ts Tests

**Test File:** `tests/features/authentication/ui/hooks/useAuthStatus-errorCodes.test.tsx`

```typescript
import { renderHook } from '@testing-library/react';
import { useAuthStatus } from '@/features/authentication/ui/hooks/useAuthStatus';
import { ErrorCode } from '@/types/errorCodes';

describe('useAuthStatus error code handling', () => {
    it('extracts code from backend response', async () => {
        // Mock backend returning { error: 'timeout', code: 'TIMEOUT' }
        mockWebviewClient.onMessage.mockImplementation((type, callback) => {
            if (type === 'auth-status') {
                callback({
                    authenticated: false,
                    error: 'timeout',
                    code: ErrorCode.TIMEOUT
                });
            }
        });

        const { result } = renderHook(() => useAuthStatus());

        expect(result.current.code).toBe(ErrorCode.TIMEOUT);
    });

    it('returns undefined code when backend omits it', async () => {
        mockWebviewClient.onMessage.mockImplementation((type, callback) => {
            if (type === 'auth-status') {
                callback({ authenticated: false, error: 'some error' });
            }
        });

        const { result } = renderHook(() => useAuthStatus());

        expect(result.current.code).toBeUndefined();
    });
});
```

### 2.2: useSelectionStep.ts Tests

**Test File:** `tests/core/ui/hooks/useSelectionStep-errorCodes.test.tsx`

```typescript
describe('useSelectionStep error code handling', () => {
    it('exposes error object with message and code', async () => {
        // Mock failed selection response
        mockWebviewClient.send.mockResolvedValue({
            success: false,
            error: 'Project not found',
            code: ErrorCode.PROJECT_NOT_FOUND,
        });

        const { result } = renderHook(() => useSelectionStep({ ... }));

        // Trigger selection
        await act(async () => {
            await result.current.handleContinue();
        });

        expect(result.current.error).toEqual({
            message: 'Project not found',
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
    });

    it('handles legacy string-only errors', async () => {
        // Backend returns string error without code (backward compat)
        mockWebviewClient.send.mockResolvedValue({
            success: false,
            error: 'Unknown error',
        });

        const { result } = renderHook(() => useSelectionStep({ ... }));

        await act(async () => {
            await result.current.handleContinue();
        });

        expect(result.current.error).toEqual({
            message: 'Unknown error',
            code: undefined,
        });
    });
});
```

### 2.3: useMeshOperations.ts Tests

**Test File:** `tests/features/mesh/ui/hooks/useMeshOperations-errorCodes.test.tsx`

```typescript
describe('useMeshOperations error code handling', () => {
    it('extracts code from check response', async () => {
        mockWebviewClient.send.mockResolvedValue({
            success: false,
            error: 'Mesh not found',
            code: ErrorCode.MESH_NOT_FOUND,
        });

        const { result } = renderHook(() => useMeshOperations());

        await act(async () => {
            await result.current.checkMesh();
        });

        expect(result.current.errorCode).toBe(ErrorCode.MESH_NOT_FOUND);
    });

    it('extracts code from create response', async () => {
        mockWebviewClient.send.mockResolvedValue({
            success: false,
            error: 'Deployment failed',
            code: ErrorCode.MESH_DEPLOY_FAILED,
        });

        const { result } = renderHook(() => useMeshOperations());

        await act(async () => {
            await result.current.createMesh();
        });

        expect(result.current.errorCode).toBe(ErrorCode.MESH_DEPLOY_FAILED);
    });
});
```

## Implementation Pattern

### Pattern: Extract code from response

```typescript
// Before (string only)
const [error, setError] = useState<string | null>(null);

const handleResponse = (response) => {
    if (!response.success) {
        setError(response.error);
    }
};

// After (object with code)
interface ErrorState {
    message?: string;
    code?: ErrorCode;
}

const [error, setError] = useState<ErrorState | null>(null);

const handleResponse = (response) => {
    if (!response.success) {
        setError({
            message: response.error,
            code: response.code,
        });
    }
};
```

## Acceptance Criteria

- [ ] Tests written for all 4 hooks (RED)
- [ ] useAuthStatus extracts and exposes code
- [ ] useSelectionStep changes error from `string | null` to `ErrorState | null`
- [ ] useMeshOperations exposes errorCode
- [ ] useComponentConfig extracts code (if applicable)
- [ ] All tests GREEN
- [ ] TypeScript compiles
- [ ] No runtime regressions

## Dependencies
- Step 1 must be complete (type definitions)
- Backend handlers must return code field (COMPLETE)

## Risk Assessment
- **Risk**: Breaking consuming components that expect `error: string`
- **Mitigation**: Provide both `error.message` and `error.code`
- **Impact**: MEDIUM - requires updating component error handling
