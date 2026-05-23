# Step 2: QuickPick Authentication Flow

**Status**: COMPLETE

## Overview

Create a QuickPick-based DA.live authentication flow that mirrors the wizard experience. When the user clicks "Sign In" from the expired token notification (Step 1), this QuickPick allows them to authenticate without leaving the dashboard context.

## Prerequisites

- [x] Step 1 must be complete (token pre-check and notification flow)
- [x] `handleResetEds` calls `showDaLiveAuthQuickPick` when user clicks "Sign In"

---

## Tests to Write First (RED Phase)

### Test File: `tests/features/projects-dashboard/handlers/dashboardHandlers-dalive-quickpick.test.ts`

```typescript
/**
 * Tests for DA.live QuickPick authentication flow
 *
 * Tests the inline QuickPick-based re-authentication that mirrors
 * the wizard DA.live auth experience from the dashboard.
 */

import * as vscode from 'vscode';
import { showDaLiveAuthQuickPick } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import type { HandlerContext } from '@/types/handlers';

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        createQuickPick: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
    },
    env: {
        clipboard: {
            readText: jest.fn(),
        },
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

// Mock edsHelpers
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    validateDaLiveToken: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));

describe('showDaLiveAuthQuickPick', () => {
    let mockQuickPick: any;
    let mockContext: Partial<HandlerContext>;
    let mockDaLiveAuthService: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock QuickPick
        mockQuickPick = {
            title: '',
            items: [],
            placeholder: '',
            busy: false,
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
            onDidAccept: jest.fn(),
            onDidHide: jest.fn(),
            selectedItems: [],
        };
        (vscode.window.createQuickPick as jest.Mock).mockReturnValue(mockQuickPick);

        // Setup mock DaLiveAuthService
        mockDaLiveAuthService = {
            storeToken: jest.fn().mockResolvedValue(undefined),
        };

        const { getDaLiveAuthService } = require('@/features/eds/handlers/edsHelpers');
        getDaLiveAuthService.mockReturnValue(mockDaLiveAuthService);

        // Setup mock context
        mockContext = {
            context: { globalState: {} } as any,
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn(),
            } as any,
        };
    });

    describe('QuickPick initialization', () => {
        it('should show QuickPick with title "Sign in to DA.live"', async () => {
            // Simulate user cancellation to complete the promise
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                setTimeout(cb, 0);
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);
            await promise;

            expect(vscode.window.createQuickPick).toHaveBeenCalled();
            expect(mockQuickPick.title).toBe('Sign in to DA.live');
        });

        it('should include "Open DA.live" and "Paste from Clipboard" items', async () => {
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                setTimeout(cb, 0);
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);
            await promise;

            expect(mockQuickPick.items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ label: '$(link-external) Open DA.live' }),
                    expect.objectContaining({ label: '$(clippy) Paste from Clipboard' }),
                ])
            );
        });

        it('should call show() to display QuickPick', async () => {
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                setTimeout(cb, 0);
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);
            await promise;

            expect(mockQuickPick.show).toHaveBeenCalled();
        });
    });

    describe('"Open DA.live" selection', () => {
        it('should open https://da.live in external browser', async () => {
            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                // Don't call hide immediately - let accept complete first
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);

            // Simulate selecting "Open DA.live"
            mockQuickPick.selectedItems = [{ label: '$(link-external) Open DA.live', id: 'open' }];
            acceptCallback!();

            // Let async operations complete
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(vscode.env.openExternal).toHaveBeenCalledWith(
                expect.objectContaining({ toString: expect.any(Function) })
            );
        });

        it('should NOT close QuickPick after opening DA.live (allow paste afterwards)', async () => {
            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext as HandlerContext);

            mockQuickPick.selectedItems = [{ label: '$(link-external) Open DA.live', id: 'open' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockQuickPick.hide).not.toHaveBeenCalled();
            expect(mockQuickPick.dispose).not.toHaveBeenCalled();
        });
    });

    describe('"Paste from Clipboard" selection', () => {
        it('should read token from clipboard', async () => {
            const { validateDaLiveToken } = require('@/features/eds/handlers/edsHelpers');
            validateDaLiveToken.mockReturnValue({ valid: true, email: 'user@example.com' });
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('eyJvalidtoken');

            let acceptCallback: () => void;
            let hideCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);

            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));
            hideCallback!();

            await promise;

            expect(vscode.env.clipboard.readText).toHaveBeenCalled();
        });

        it('should show "Verifying..." busy state during validation', async () => {
            const { validateDaLiveToken } = require('@/features/eds/handlers/edsHelpers');
            validateDaLiveToken.mockReturnValue({ valid: true, email: 'user@example.com' });
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('eyJvalidtoken');

            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext as HandlerContext);

            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];

            // Check busy state is set during validation
            const originalBusy = mockQuickPick.busy;
            acceptCallback!();

            // Busy should be set to true during validation
            expect(mockQuickPick.busy).toBe(true);
        });

        it('should store token and show "Connected to DA.live" on valid token', async () => {
            const { validateDaLiveToken } = require('@/features/eds/handlers/edsHelpers');
            validateDaLiveToken.mockReturnValue({ valid: true, email: 'user@example.com' });
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('eyJvalidtoken');

            let acceptCallback: () => void;
            let hideCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);

            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));
            hideCallback!();

            const result = await promise;

            expect(mockDaLiveAuthService.storeToken).toHaveBeenCalledWith('eyJvalidtoken');
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Connected to DA.live'
            );
            expect(result).toEqual({ success: true, email: 'user@example.com' });
        });

        it('should show error message on invalid token format', async () => {
            const { validateDaLiveToken } = require('@/features/eds/handlers/edsHelpers');
            validateDaLiveToken.mockReturnValue({
                valid: false,
                error: 'Invalid token format. Please copy the complete token.'
            });
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('not-a-jwt');

            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext as HandlerContext);

            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Invalid token format. Please copy the complete token.'
            );
            // QuickPick should remain open for retry
            expect(mockQuickPick.dispose).not.toHaveBeenCalled();
        });

        it('should show error message on expired token', async () => {
            const { validateDaLiveToken } = require('@/features/eds/handlers/edsHelpers');
            validateDaLiveToken.mockReturnValue({
                valid: false,
                error: 'Token has expired. Please get a fresh token from DA.live.'
            });
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('eyJexpiredtoken');

            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext as HandlerContext);

            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Token has expired. Please get a fresh token from DA.live.'
            );
        });

        it('should handle empty clipboard gracefully', async () => {
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('');

            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext as HandlerContext);

            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('clipboard')
            );
        });
    });

    describe('user cancellation', () => {
        it('should return cancelled: true when user dismisses QuickPick', async () => {
            let hideCallback: () => void;
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);

            // Simulate user pressing Escape
            hideCallback!();

            const result = await promise;

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should dispose QuickPick on cancellation', async () => {
            let hideCallback: () => void;
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);
            hideCallback!();
            await promise;

            expect(mockQuickPick.dispose).toHaveBeenCalled();
        });

        it('should log cancellation event', async () => {
            let hideCallback: () => void;
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext as HandlerContext);
            hideCallback!();
            await promise;

            expect(mockContext.logger!.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled')
            );
        });
    });
});
```

**Test Scenarios:**

- [ ] Test 1: QuickPick shows with title "Sign in to DA.live"
- [ ] Test 2: QuickPick includes "Open DA.live" and "Paste from Clipboard" items
- [ ] Test 3: QuickPick calls show() to display
- [ ] Test 4: "Open DA.live" opens https://da.live in external browser
- [ ] Test 5: "Open DA.live" does NOT close QuickPick (allows paste afterwards)
- [ ] Test 6: "Paste from Clipboard" reads token from clipboard
- [ ] Test 7: Shows "Verifying..." busy state during validation
- [ ] Test 8: Stores token and shows "Connected to DA.live" on valid token
- [ ] Test 9: Shows error message on invalid token format
- [ ] Test 10: Shows error message on expired token
- [ ] Test 11: Handles empty clipboard gracefully
- [ ] Test 12: Returns cancelled: true when user dismisses QuickPick
- [ ] Test 13: Disposes QuickPick on cancellation
- [ ] Test 14: Logs cancellation event

---

## Implementation (GREEN Phase)

### File: `src/features/projects-dashboard/handlers/dashboardHandlers.ts`

**Add helper function inline (near top of file, after imports):**

```typescript
import * as vscode from 'vscode';
import { validateDaLiveToken, getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import type { HandlerContext } from '@/types/handlers';

// ==========================================================================
// DA.live QuickPick Authentication
// ==========================================================================

interface QuickPickAuthResult {
    success: boolean;
    cancelled?: boolean;
    email?: string;
    error?: string;
}

interface DaLiveQuickPickItem extends vscode.QuickPickItem {
    id: 'open' | 'paste';
}

/**
 * Show QuickPick-based DA.live authentication flow
 *
 * Mirrors the wizard DA.live auth experience:
 * 1. User can open DA.live to get token via bookmarklet
 * 2. User can paste token from clipboard
 * 3. Token is validated and stored
 *
 * @param context - Handler context with extension context for token storage
 * @returns Promise with auth result (success/cancelled/error)
 */
export async function showDaLiveAuthQuickPick(
    context: HandlerContext
): Promise<QuickPickAuthResult> {
    return new Promise((resolve) => {
        const quickPick = vscode.window.createQuickPick<DaLiveQuickPickItem>();

        // Configure QuickPick - use wizard language
        quickPick.title = 'Sign in to DA.live';
        quickPick.placeholder = 'Select an action to authenticate with DA.live';
        quickPick.items = [
            {
                id: 'open',
                label: '$(link-external) Open DA.live',
                description: 'Open DA.live in browser to copy token',
            },
            {
                id: 'paste',
                label: '$(clippy) Paste from Clipboard',
                description: 'Paste token copied from DA.live',
            },
        ];

        let isResolved = false;

        // Handle item selection
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            if (!selected) return;

            if (selected.id === 'open') {
                // Open DA.live in browser - don't close QuickPick
                await vscode.env.openExternal(vscode.Uri.parse('https://da.live'));
                // Keep QuickPick open so user can paste after copying token
                return;
            }

            if (selected.id === 'paste') {
                // Show busy state - wizard language
                quickPick.busy = true;
                quickPick.placeholder = 'Verifying...';

                try {
                    // Read token from clipboard
                    const token = await vscode.env.clipboard.readText();

                    if (!token || token.trim() === '') {
                        quickPick.busy = false;
                        quickPick.placeholder = 'Select an action to authenticate with DA.live';
                        await vscode.window.showErrorMessage(
                            'No token found on clipboard. Copy token from DA.live first.'
                        );
                        return;
                    }

                    // Validate token
                    const validation = validateDaLiveToken(token.trim());

                    if (!validation.valid) {
                        quickPick.busy = false;
                        quickPick.placeholder = 'Select an action to authenticate with DA.live';
                        await vscode.window.showErrorMessage(validation.error!);
                        // Keep QuickPick open for retry
                        return;
                    }

                    // Store valid token
                    const authService = getDaLiveAuthService(context);
                    await authService.storeToken(token.trim());

                    // Success - wizard language
                    await vscode.window.showInformationMessage('Connected to DA.live');

                    isResolved = true;
                    quickPick.hide();
                    quickPick.dispose();

                    resolve({
                        success: true,
                        email: validation.email,
                    });
                } catch (error) {
                    quickPick.busy = false;
                    quickPick.placeholder = 'Select an action to authenticate with DA.live';
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    context.logger.error(`[DA.live Auth] QuickPick error: ${errorMessage}`);
                    await vscode.window.showErrorMessage(`Authentication failed: ${errorMessage}`);
                }
            }
        });

        // Handle dismissal (Escape key or click outside)
        quickPick.onDidHide(() => {
            if (!isResolved) {
                context.logger.info('[DA.live Auth] User cancelled QuickPick authentication');
                quickPick.dispose();
                resolve({
                    success: false,
                    cancelled: true,
                });
            }
        });

        // Show the QuickPick
        quickPick.show();
    });
}
```

**Add storeToken method to DaLiveAuthService (if not exists):**

Check `src/features/eds/services/daLiveAuthService.ts` - if `storeToken` method doesn't exist, add:

```typescript
/**
 * Store a manually-provided token (from bookmarklet flow)
 *
 * @param token - JWT token string to store
 */
async storeToken(token: string): Promise<void> {
    // Validate token format
    const validation = validateDaLiveToken(token);
    if (!validation.valid) {
        throw new Error(validation.error || 'Invalid token');
    }

    // Store token with expiration
    await this.context.globalState.update(STATE_KEYS.accessToken, token);

    if (validation.expiresAt) {
        await this.context.globalState.update(STATE_KEYS.tokenExpiration, validation.expiresAt);
    }

    if (validation.email) {
        await this.context.globalState.update(STATE_KEYS.userEmail, validation.email);
    }

    this.logger.info('[DA.live Auth] Token stored successfully');
}
```

**Integration with Step 1 (handleResetEds):**

The integration is already shown in Step 1's implementation code. When the user clicks "Sign In" on the notification, `showDaLiveAuthQuickPick(context)` is called directly within `handleResetEds`. Step 1's implementation shows the complete flow including QuickPick invocation and result handling.

**Note:** During Step 1 TDD, a temporary `authRequired` flag return is used. When implementing Step 2, update `handleResetEds` to call `showDaLiveAuthQuickPick` as shown in Step 1's final implementation.

---

## Refactor Phase

After tests pass:

1. **Extract constants** - Move QuickPick labels to constants if reused elsewhere
2. **Consolidate validation** - Ensure validateDaLiveToken is the single source of truth
3. **Review error messages** - Ensure all messages use consistent wizard language
4. **Remove any debug logging** - Clean up verbose debug statements

---

## Acceptance Criteria

- [ ] QuickPick shows with title "Sign in to DA.live"
- [ ] "Open DA.live" opens https://da.live in external browser
- [ ] QuickPick remains open after "Open DA.live" (user can paste afterwards)
- [ ] "Paste from Clipboard" reads and validates token
- [ ] Shows "Verifying..." busy state during validation
- [ ] Shows "Connected to DA.live" on success
- [ ] Shows appropriate error on invalid token format
- [ ] Shows appropriate error on expired token
- [ ] Handles empty clipboard gracefully with clear message
- [ ] User can cancel and return to dashboard without errors
- [ ] Logs appropriate events for debugging
- [ ] All 14 tests passing

---

## Dependencies

**VS Code APIs:**
- `vscode.window.createQuickPick()` - Interactive picker
- `vscode.env.clipboard.readText()` - Read clipboard contents
- `vscode.env.openExternal()` - Open URL in browser
- `vscode.window.showInformationMessage()` - Success notification
- `vscode.window.showErrorMessage()` - Error notification

**Existing Services:**
- `validateDaLiveToken()` from `@/features/eds/handlers/edsHelpers`
- `getDaLiveAuthService()` from `@/features/eds/handlers/edsHelpers`
- `DaLiveAuthService.storeToken()` from `@/features/eds/services/daLiveAuthService`

**No new packages required.**

---

## Estimated Time

1.5-2 hours

---

_Step created by Step Generator Sub-Agent_
