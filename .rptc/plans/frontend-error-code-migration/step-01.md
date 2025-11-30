# Step 1: Type Definition Updates

## Objective
Add `code?: ErrorCode` field to webview state interfaces to enable typed error code propagation from backend.

## Files to Modify

### Primary File
- `src/types/webview.ts` - Add code field to error state interfaces

## Test Strategy (TDD)

### Test File: `tests/types/webview-errorCodes.test.ts`

**Tests to Write FIRST:**
1. `AdobeAuthState` interface accepts `code?: ErrorCode`
2. `WizardState.apiMesh` field accepts `code?: ErrorCode`
3. Type checking validates ErrorCode values
4. Type checking rejects invalid code values

### Test Implementation Pattern
```typescript
import { ErrorCode } from '@/types/errorCodes';
import type { AdobeAuthState, WizardState } from '@/types/webview';

describe('webview types with ErrorCode', () => {
    describe('AdobeAuthState', () => {
        it('accepts code field with valid ErrorCode', () => {
            const state: AdobeAuthState = {
                isAuthenticated: false,
                error: 'timeout',
                code: ErrorCode.TIMEOUT,
                // ... other required fields
            };
            expect(state.code).toBe(ErrorCode.TIMEOUT);
        });

        it('allows undefined code field', () => {
            const state: AdobeAuthState = {
                isAuthenticated: false,
                error: 'some error',
                // code is optional
            };
            expect(state.code).toBeUndefined();
        });
    });

    describe('WizardState.apiMesh', () => {
        it('accepts code field in apiMesh state', () => {
            const meshState = {
                error: 'deployment failed',
                code: ErrorCode.MESH_DEPLOY_FAILED,
            };
            expect(meshState.code).toBe(ErrorCode.MESH_DEPLOY_FAILED);
        });
    });
});
```

## Implementation

### `src/types/webview.ts` Changes

**Current State (Anti-Pattern):**
```typescript
export interface AdobeAuthState {
    isAuthenticated: boolean;
    error?: string;
    // ...
}
```

**Target State:**
```typescript
import { ErrorCode } from './errorCodes';

export interface AdobeAuthState {
    isAuthenticated: boolean;
    error?: string;
    code?: ErrorCode; // NEW: Typed error code
    // ...
}
```

**Fields to Update:**
1. `AdobeAuthState.code?: ErrorCode`
2. `ApiMeshState.code?: ErrorCode` (or wherever mesh errors are stored)

## Acceptance Criteria

- [ ] Tests written and RED (fail because types don't have code field yet)
- [ ] `code?: ErrorCode` added to `AdobeAuthState`
- [ ] `code?: ErrorCode` added to mesh-related state interfaces
- [ ] TypeScript compiles without errors
- [ ] Tests GREEN (pass after implementation)
- [ ] No runtime behavior changes (code is optional)

## Dependencies
- `src/types/errorCodes.ts` must exist (COMPLETE)

## Risk Assessment
- **Risk**: Breaking existing code that spreads state objects
- **Mitigation**: Field is optional, so spreading still works
- **Impact**: LOW - purely additive change
