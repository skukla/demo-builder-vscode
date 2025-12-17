# Step 3: Component Updates - Accept Error Code Props

## Objective
Update error display components to accept `code?: ErrorCode` prop for conditional rendering based on error type.

## Files to Modify

### Primary Files
1. `src/features/authentication/ui/steps/components/AuthErrorState.tsx` - Accept code prop
2. `src/features/mesh/ui/steps/components/MeshErrorDialog.tsx` - Accept code prop
3. `src/core/ui/components/feedback/StatusDisplay.tsx` - Optional code prop

### Supporting Files (if needed)
- `src/core/ui/components/feedback/ErrorDisplay.tsx` - Optional enhancement

## Test Strategy (TDD)

### 3.1: AuthErrorState.tsx Tests

**Test File:** `tests/features/authentication/ui/steps/components/AuthErrorState-errorCodes.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { AuthErrorState } from '@/features/authentication/ui/steps/components/AuthErrorState';
import { ErrorCode } from '@/types/errorCodes';

describe('AuthErrorState with error codes', () => {
    it('accepts code prop', () => {
        render(<AuthErrorState error="timeout" code={ErrorCode.TIMEOUT} />);
        // Component renders without error
        expect(screen.getByText(/timeout/i)).toBeInTheDocument();
    });

    it('renders timeout-specific message for TIMEOUT code', () => {
        render(<AuthErrorState error="timeout" code={ErrorCode.TIMEOUT} />);
        expect(screen.getByText(/try again/i)).toBeInTheDocument();
    });

    it('renders auth-specific message for AUTH_NO_APP_BUILDER code', () => {
        render(
            <AuthErrorState
                error="no app builder access"
                code={ErrorCode.AUTH_NO_APP_BUILDER}
            />
        );
        expect(screen.getByText(/administrator/i)).toBeInTheDocument();
    });

    it('renders generic message when code is undefined', () => {
        render(<AuthErrorState error="something went wrong" />);
        // Should still work without code (backward compat)
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it('renders network-specific recovery instructions', () => {
        render(<AuthErrorState error="network error" code={ErrorCode.NETWORK} />);
        expect(screen.getByText(/connection/i)).toBeInTheDocument();
    });
});
```

### 3.2: MeshErrorDialog.tsx Tests

**Test File:** `tests/features/mesh/ui/steps/components/MeshErrorDialog-errorCodes.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { MeshErrorDialog } from '@/features/mesh/ui/steps/components/MeshErrorDialog';
import { ErrorCode } from '@/types/errorCodes';

describe('MeshErrorDialog with error codes', () => {
    it('accepts code prop', () => {
        render(
            <MeshErrorDialog
                isOpen={true}
                error="deployment failed"
                code={ErrorCode.MESH_DEPLOY_FAILED}
                onClose={() => {}}
            />
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows deploy-specific recovery for MESH_DEPLOY_FAILED', () => {
        render(
            <MeshErrorDialog
                isOpen={true}
                error="deployment failed"
                code={ErrorCode.MESH_DEPLOY_FAILED}
                onClose={() => {}}
            />
        );
        expect(screen.getByText(/redeploy/i)).toBeInTheDocument();
    });

    it('shows not-found recovery for MESH_NOT_FOUND', () => {
        render(
            <MeshErrorDialog
                isOpen={true}
                error="mesh not found"
                code={ErrorCode.MESH_NOT_FOUND}
                onClose={() => {}}
            />
        );
        expect(screen.getByText(/create/i)).toBeInTheDocument();
    });

    it('shows timeout recovery for TIMEOUT', () => {
        render(
            <MeshErrorDialog
                isOpen={true}
                error="operation timed out"
                code={ErrorCode.TIMEOUT}
                onClose={() => {}}
            />
        );
        expect(screen.getByText(/try again/i)).toBeInTheDocument();
    });

    it('handles missing code gracefully', () => {
        render(
            <MeshErrorDialog
                isOpen={true}
                error="unknown error"
                onClose={() => {}}
            />
        );
        // Should show generic error without code
        expect(screen.getByText(/unknown error/i)).toBeInTheDocument();
    });
});
```

### 3.3: StatusDisplay.tsx Tests (Optional Enhancement)

**Test File:** `tests/core/ui/components/feedback/StatusDisplay-errorCodes.test.tsx`

```typescript
describe('StatusDisplay with error codes', () => {
    it('accepts optional code prop', () => {
        render(
            <StatusDisplay
                status="error"
                message="Something failed"
                code={ErrorCode.UNKNOWN}
            />
        );
        expect(screen.getByText(/something failed/i)).toBeInTheDocument();
    });
});
```

## Implementation Pattern

### Adding code prop to component

```typescript
// Before
interface AuthErrorStateProps {
    error: string;
    onRetry?: () => void;
}

export function AuthErrorState({ error, onRetry }: AuthErrorStateProps) {
    return (
        <div className="error-state">
            <p>{error}</p>
            {onRetry && <Button onPress={onRetry}>Try Again</Button>}
        </div>
    );
}

// After
import { ErrorCode, getErrorTitle, isRecoverableError } from '@/types/errorCodes';

interface AuthErrorStateProps {
    error: string;
    code?: ErrorCode; // NEW
    onRetry?: () => void;
}

export function AuthErrorState({ error, code, onRetry }: AuthErrorStateProps) {
    const title = code ? getErrorTitle(code) : 'Error';
    const canRetry = code ? isRecoverableError(code) : true;
    const recoveryHint = getRecoveryHint(code); // Helper function

    return (
        <div className="error-state">
            <h3>{title}</h3>
            <p>{error}</p>
            {recoveryHint && <p className="hint">{recoveryHint}</p>}
            {canRetry && onRetry && <Button onPress={onRetry}>Try Again</Button>}
        </div>
    );
}

function getRecoveryHint(code?: ErrorCode): string | null {
    switch (code) {
        case ErrorCode.TIMEOUT:
            return 'Please try again.';
        case ErrorCode.NETWORK:
            return 'Check your internet connection.';
        case ErrorCode.AUTH_NO_APP_BUILDER:
            return 'Contact your administrator for App Builder access.';
        default:
            return null;
    }
}
```

## Acceptance Criteria

- [ ] Tests written for all components (RED)
- [ ] AuthErrorState accepts `code?: ErrorCode` prop
- [ ] AuthErrorState conditionally renders based on code
- [ ] MeshErrorDialog accepts `code?: ErrorCode` prop
- [ ] MeshErrorDialog shows code-specific recovery instructions
- [ ] StatusDisplay accepts optional `code?: ErrorCode` prop (if applicable)
- [ ] All tests GREEN
- [ ] TypeScript compiles
- [ ] Backward compatible (components work without code prop)

## Dependencies
- Step 1 must be complete (type definitions)
- Step 2 should be complete (hooks provide code to components)

## Risk Assessment
- **Risk**: Changing component props could break consuming code
- **Mitigation**: Code prop is optional, existing usage unchanged
- **Impact**: LOW - purely additive change
