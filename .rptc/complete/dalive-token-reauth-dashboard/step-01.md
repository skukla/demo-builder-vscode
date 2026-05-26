# Step 1: Pre-check + Notification Flow

## Overview

Add DA.live token validity pre-check to handleResetEds in both dashboard handlers. When the token is expired or expiring (within 5-minute buffer), show a VS Code warning notification with "Sign In" action button. This follows the existing GitHubAppNotInstalledError pattern at dashboardHandlers.ts:761-786.

## Prerequisites

- [ ] DaLiveAuthService exists at `src/features/eds/services/daLiveAuthService.ts`
- [ ] `isAuthenticated()` method already checks expiration with 5-minute buffer (line 148)

## Tests to Write First (RED Phase)

### Test File: `tests/features/projects-dashboard/handlers/dashboardHandlers-dalive-auth.test.ts`

```typescript
import * as vscode from 'vscode';
import { handleResetEds } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';

// Mock dependencies
jest.mock('vscode');
jest.mock('@/features/eds/services/daLiveAuthService');

describe('handleResetEds DA.live auth pre-check', () => {
  let mockContext: any;
  let mockDaLiveAuthService: jest.Mocked<DaLiveAuthService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = {
      stateManager: {
        loadProjectFromPath: jest.fn(),
      },
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
      extensionContext: {},
    };
    mockDaLiveAuthService = {
      isAuthenticated: jest.fn(),
      authenticate: jest.fn(),
    } as any;
  });

  // Test 1: Valid token proceeds to confirmation dialog
  it('should proceed to confirmation when DA.live token is valid', async () => {
    // Given: Valid DA.live token
    mockDaLiveAuthService.isAuthenticated.mockResolvedValue(true);
    mockContext.stateManager.loadProjectFromPath.mockResolvedValue(mockProjectWithEds);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined); // User cancels

    // When: handleResetEds is called
    const result = await handleResetEds(mockContext, { projectPath: '/test' });

    // Then: Should reach confirmation dialog (cancelled by user)
    expect(result).toEqual({ success: false, cancelled: true });
  });

  // Test 2: Expired token shows notification
  it('should show sign-in notification when DA.live token is expired', async () => {
    // Given: Expired DA.live token
    mockDaLiveAuthService.isAuthenticated.mockResolvedValue(false);
    mockContext.stateManager.loadProjectFromPath.mockResolvedValue(mockProjectWithEds);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    // When: handleResetEds is called
    const result = await handleResetEds(mockContext, { projectPath: '/test' });

    // Then: Should show warning with Sign In button
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Your DA.live session has expired. Please sign in to continue.',
      'Sign In'
    );
    expect(result).toEqual({
      success: false,
      error: 'DA.live authentication required',
      errorType: 'DALIVE_AUTH_REQUIRED',
    });
  });

  // Test 3: User clicks Sign In button
  it('should return authRequired when user clicks Sign In', async () => {
    // Given: Expired token, user clicks Sign In
    mockDaLiveAuthService.isAuthenticated.mockResolvedValue(false);
    mockContext.stateManager.loadProjectFromPath.mockResolvedValue(mockProjectWithEds);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Sign In');

    // When: handleResetEds is called
    const result = await handleResetEds(mockContext, { projectPath: '/test' });

    // Then: Should return with authRequired flag for Step 2 flow
    expect(result).toEqual({
      success: false,
      error: 'DA.live authentication required',
      errorType: 'DALIVE_AUTH_REQUIRED',
      authRequired: true,
    });
  });

  // Test 4: User dismisses notification
  it('should return cancelled when user dismisses notification', async () => {
    // Given: Expired token, user dismisses
    mockDaLiveAuthService.isAuthenticated.mockResolvedValue(false);
    mockContext.stateManager.loadProjectFromPath.mockResolvedValue(mockProjectWithEds);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    // When: handleResetEds is called
    const result = await handleResetEds(mockContext, { projectPath: '/test' });

    // Then: Should return error without authRequired flag
    expect(result.authRequired).toBeUndefined();
  });
});
```

**Test Scenarios:**

- [ ] Test 1: Valid token proceeds to confirmation dialog (happy path)
- [ ] Test 2: Expired token shows notification with "Sign In" button
- [ ] Test 3: User clicks "Sign In" returns `authRequired: true` for Step 2 flow
- [ ] Test 4: User dismisses notification returns error without `authRequired`
- [ ] Test 5: Pre-check happens BEFORE confirmation dialog (order verification)

## Implementation (GREEN Phase)

### File: `src/features/projects-dashboard/handlers/dashboardHandlers.ts`

**Changes:**

1. **Add import for DaLiveAuthService** (near top of file):

```typescript
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
```

2. **Add DA.live auth pre-check** in `handleResetEds` BEFORE the confirmation dialog (after line 582, before line 584):

```typescript
    // Pre-check DA.live authentication
    // Token must be valid to copy demo content during reset
    const daLiveAuthService = new DaLiveAuthService(context.extensionContext);
    const isDaLiveAuthenticated = await daLiveAuthService.isAuthenticated();

    if (!isDaLiveAuthenticated) {
        context.logger.info('[ProjectsList] resetEds: DA.live token expired or missing');

        // Show notification with Sign In action (follows GitHubAppNotInstalledError pattern)
        const signInButton = 'Sign In';
        const selection = await vscode.window.showWarningMessage(
            'Your DA.live session has expired. Please sign in to continue.',
            signInButton,
        );

        const authRequired = selection === signInButton;

        // If user clicked "Sign In", invoke QuickPick auth flow (Step 2)
        if (authRequired) {
            const authResult = await showDaLiveAuthQuickPick(context);
            if (authResult.cancelled || !authResult.success) {
                return {
                    success: false,
                    error: authResult.error || 'DA.live authentication required',
                    errorType: 'DALIVE_AUTH_REQUIRED',
                    cancelled: authResult.cancelled,
                };
            }
            // Token is now valid - continue to confirmation dialog below
        } else {
            // User dismissed notification - abort operation
            return {
                success: false,
                error: 'DA.live authentication required',
                errorType: 'DALIVE_AUTH_REQUIRED',
            };
        }
    }
```

**Note:** The `showDaLiveAuthQuickPick(context)` function is implemented in Step 2. After Step 2, the full flow will be: pre-check -> notification -> QuickPick -> continue to confirmation.

**Location:** Insert after the template/content source validation (line ~582) and BEFORE the confirmation dialog (line 584).

### File: `src/features/dashboard/handlers/dashboardHandlers.ts`

**Changes:**

1. **Add same import** (near top of file):

```typescript
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
```

2. **Add same DA.live auth pre-check** in `handleResetEds` BEFORE confirmation dialog (after line 597, before line 599):

```typescript
    // Pre-check DA.live authentication
    // Token must be valid to copy demo content during reset
    const daLiveAuthService = new DaLiveAuthService(context.extensionContext);
    const isDaLiveAuthenticated = await daLiveAuthService.isAuthenticated();

    if (!isDaLiveAuthenticated) {
        context.logger.info('[Dashboard] resetEds: DA.live token expired or missing');

        // Show notification with Sign In action
        const signInButton = 'Sign In';
        const selection = await vscode.window.showWarningMessage(
            'Your DA.live session has expired. Please sign in to continue.',
            signInButton,
        );

        const authRequired = selection === signInButton;

        // If user clicked "Sign In", invoke QuickPick auth flow (Step 2)
        if (authRequired) {
            const authResult = await showDaLiveAuthQuickPick(context);
            if (authResult.cancelled || !authResult.success) {
                return {
                    success: false,
                    error: authResult.error || 'DA.live authentication required',
                    errorType: 'DALIVE_AUTH_REQUIRED',
                    cancelled: authResult.cancelled,
                };
            }
            // Token is now valid - continue to confirmation dialog below
        } else {
            // User dismissed notification - abort operation
            return {
                success: false,
                error: 'DA.live authentication required',
                errorType: 'DALIVE_AUTH_REQUIRED',
            };
        }
    }
```

**Location:** Insert after the content source validation (line ~597) and BEFORE the confirmation dialog (line 599).

## Refactor Phase

- Extract the DA.live auth check to a shared helper if needed for other handlers
- Consider adding `errorType` constants to a shared error types file
- Both handlers use identical check logic - could be extracted to `@/features/eds/utils/authCheck.ts`

## Acceptance Criteria

- [ ] handleResetEds in `projects-dashboard/handlers` checks DA.live auth before confirmation dialog
- [ ] handleResetEds in `dashboard/handlers` checks DA.live auth before confirmation dialog
- [ ] Expired token shows warning notification with "Sign In" button
- [ ] User clicking "Sign In" returns response with `authRequired: true`
- [ ] User dismissing notification returns response without `authRequired`
- [ ] Response includes `errorType: 'DALIVE_AUTH_REQUIRED'` for UI handling
- [ ] Pre-check happens BEFORE the reset confirmation dialog appears

## Dependencies

- `DaLiveAuthService.isAuthenticated()` - Already implements 5-minute buffer check (line 148)
- `vscode.window.showWarningMessage` - VS Code API for notifications with action buttons
- `context.extensionContext` - Required to instantiate DaLiveAuthService

## Notes

- The `isAuthenticated()` method already includes a 5-minute buffer check (line 148 of daLiveAuthService.ts)
- Pattern follows GitHubAppNotInstalledError handling at line 761-786 in projects-dashboard handler
- **Staged Implementation**: During Step 1 TDD, implement with `authRequired` flag return first (tests below). In Step 2, the `showDaLiveAuthQuickPick` call replaces the flag return - Step 2 tests will cover the integrated flow.
- The implementation code shown above includes the Step 2 integration for clarity, but TDD proceeds in stages
