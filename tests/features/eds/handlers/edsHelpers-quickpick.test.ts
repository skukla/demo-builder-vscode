/**
 * EDS Helpers - DA.live QuickPick Authentication Tests
 *
 * Tests for showDaLiveAuthQuickPick function in edsHelpers:
 * - QuickPick initialization with correct title and items
 * - "Open DA.live" opens browser without closing QuickPick
 * - "Paste from Clipboard" validates and stores token
 * - Error handling for invalid/expired tokens
 * - User cancellation handling
 */

import type { HandlerContext } from '@/types/handlers';

// Explicit test timeout to prevent hanging
jest.setTimeout(5000);

// =============================================================================
// Mock Setup - All mocks must be defined before imports
// =============================================================================

// Mock QuickPick instance for controlling test scenarios
const mockQuickPick = {
    title: '',
    items: [] as Array<{ label: string; id: string; description?: string }>,
    placeholder: '',
    busy: false,
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    onDidAccept: jest.fn(),
    onDidHide: jest.fn(),
    selectedItems: [] as Array<{ label: string; id: string }>,
};

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        createQuickPick: jest.fn(() => mockQuickPick),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
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

// Mock core logging (prevents "Logger not initialized" error)
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

// Mock DaLiveAuthService
const mockStoreToken = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        storeToken: mockStoreToken,
        isAuthenticated: jest.fn().mockResolvedValue(true),
    })),
}));

// Mock GitHub services (required by edsHelpers module)
jest.mock('@/features/eds/services/githubTokenService');
jest.mock('@/features/eds/services/githubRepoOperations');
jest.mock('@/features/eds/services/githubFileOperations');
jest.mock('@/features/eds/services/githubOAuthService');
jest.mock('@/features/eds/services/daLiveOrgOperations');
jest.mock('@/features/eds/services/daLiveContentOperations');

// =============================================================================
// Now import the modules under test (after all mocks are set up)
// =============================================================================

import * as vscode from 'vscode';
import { showDaLiveAuthQuickPick, validateDaLiveToken } from '@/features/eds/handlers/edsHelpers';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create mock handler context with required dependencies
 */
function createMockContext(): HandlerContext {
    return {
        panel: {
            webview: {
                postMessage: jest.fn(),
            },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            loadProjectFromPath: jest.fn(),
            getCurrentProject: jest.fn(),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: {
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as unknown as HandlerContext['context'],
    } as unknown as HandlerContext;
}

/**
 * Reset the mock QuickPick to initial state
 */
function resetMockQuickPick(): void {
    mockQuickPick.title = '';
    mockQuickPick.items = [];
    mockQuickPick.placeholder = '';
    mockQuickPick.busy = false;
    mockQuickPick.show.mockClear();
    mockQuickPick.hide.mockClear();
    mockQuickPick.dispose.mockClear();
    mockQuickPick.onDidAccept.mockClear();
    mockQuickPick.onDidHide.mockClear();
    mockQuickPick.selectedItems = [];
}

// =============================================================================
// Tests - DA.live QuickPick Authentication Flow
// =============================================================================

describe('showDaLiveAuthQuickPick', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        resetMockQuickPick();
        mockContext = createMockContext();
        mockStoreToken.mockClear().mockResolvedValue(undefined);
    });

    // =========================================================================
    // QuickPick Initialization Tests
    // =========================================================================
    describe('QuickPick initialization', () => {
        it('should show QuickPick with title "Sign in to DA.live"', async () => {
            // Given: A valid context
            // Setup: Simulate user dismissal to complete the promise
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                setTimeout(cb, 0);
            });

            const promise = showDaLiveAuthQuickPick(mockContext);
            await promise;

            // Then: QuickPick should be created with correct title
            expect(vscode.window.createQuickPick).toHaveBeenCalled();
            expect(mockQuickPick.title).toBe('Sign in to DA.live');
        });

        it('should include "Open DA.live" and "Paste from Clipboard" items', async () => {
            // Given: A valid context
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                setTimeout(cb, 0);
            });

            // When: showDaLiveAuthQuickPick is called
            const promise = showDaLiveAuthQuickPick(mockContext);
            await promise;

            // Then: QuickPick should have both items with correct labels
            expect(mockQuickPick.items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ label: '$(link-external) Open DA.live' }),
                    expect.objectContaining({ label: '$(clippy) Paste from Clipboard' }),
                ]),
            );
        });

        it('should call show() to display QuickPick', async () => {
            // Given: A valid context
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                setTimeout(cb, 0);
            });

            // When: showDaLiveAuthQuickPick is called
            const promise = showDaLiveAuthQuickPick(mockContext);
            await promise;

            // Then: show() should be called
            expect(mockQuickPick.show).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // "Open DA.live" Selection Tests
    // =========================================================================
    describe('"Open DA.live" selection', () => {
        it('should open https://da.live in external browser', async () => {
            // Given: User selects "Open DA.live"
            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });
            mockQuickPick.onDidHide.mockImplementation(() => {
                // Don't call hide immediately - let accept complete first
            });

            const promise = showDaLiveAuthQuickPick(mockContext);

            // When: User selects "Open DA.live"
            mockQuickPick.selectedItems = [{ label: '$(link-external) Open DA.live', id: 'open' }];
            acceptCallback!();

            // Let async operations complete
            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: Should open https://da.live in external browser
            expect(vscode.env.openExternal).toHaveBeenCalledWith(
                expect.objectContaining({ toString: expect.any(Function) }),
            );
        });

        it('should NOT close QuickPick after opening DA.live (allow paste afterwards)', async () => {
            // Given: User selects "Open DA.live"
            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext);

            // When: User selects "Open DA.live"
            mockQuickPick.selectedItems = [{ label: '$(link-external) Open DA.live', id: 'open' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 10));

            // Then: QuickPick should remain open
            expect(mockQuickPick.hide).not.toHaveBeenCalled();
            expect(mockQuickPick.dispose).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // "Paste from Clipboard" Selection Tests
    // =========================================================================
    describe('"Paste from Clipboard" selection', () => {
        it('should read token from clipboard', async () => {
            // Given: Valid token on clipboard
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig');

            let acceptCallback: () => void;
            let hideCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext);

            // When: User selects "Paste from Clipboard"
            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));
            hideCallback!();

            await promise;

            // Then: Clipboard should be read
            expect(vscode.env.clipboard.readText).toHaveBeenCalled();
        });

        it('should show "Verifying..." busy state during validation', async () => {
            // Given: Valid token on clipboard
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig');

            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext);

            // When: User selects "Paste from Clipboard"
            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];

            // Check busy state is set during validation
            acceptCallback!();

            // Then: Busy should be set to true during validation
            expect(mockQuickPick.busy).toBe(true);
        });

        it('should store token and show "Connected to DA.live" on valid token', async () => {
            // Given: Valid token on clipboard
            const validToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig';
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue(validToken);

            let acceptCallback: () => void;
            let hideCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext);

            // When: User selects "Paste from Clipboard"
            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));
            hideCallback!();

            const result = await promise;

            // Then: Token should be stored and success message shown
            expect(mockStoreToken).toHaveBeenCalledWith(validToken);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'Connected to DA.live',
            );
            expect(result.success).toBe(true);
        });

        it('should show error message on invalid token format', async () => {
            // Given: Invalid token on clipboard (not JWT format)
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('not-a-jwt');

            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext);

            // When: User selects "Paste from Clipboard"
            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));

            // Then: Error message should be shown
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Invalid token format. Please copy the complete token.',
            );
            // QuickPick should remain open for retry
            expect(mockQuickPick.dispose).not.toHaveBeenCalled();
        });

        it('should show error message on expired token', async () => {
            // Given: Expired token on clipboard (created_at in past, short expires_in)
            const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiMTAwMDAwMDAwMDAwMCIsImV4cGlyZXNfaW4iOiIxMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig';
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue(expiredToken);

            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext);

            // When: User selects "Paste from Clipboard"
            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));

            // Then: Error message should be shown
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Token has expired. Please get a fresh token from DA.live.',
            );
        });

        it('should handle empty clipboard gracefully', async () => {
            // Given: Empty clipboard
            (vscode.env.clipboard.readText as jest.Mock).mockResolvedValue('');

            let acceptCallback: () => void;
            mockQuickPick.onDidAccept.mockImplementation((cb: () => void) => {
                acceptCallback = cb;
            });

            showDaLiveAuthQuickPick(mockContext);

            // When: User selects "Paste from Clipboard"
            mockQuickPick.selectedItems = [{ label: '$(clippy) Paste from Clipboard', id: 'paste' }];
            acceptCallback!();

            await new Promise(resolve => setTimeout(resolve, 50));

            // Then: Error message should mention clipboard
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('clipboard'),
            );
        });
    });

    // =========================================================================
    // User Cancellation Tests
    // =========================================================================
    describe('user cancellation', () => {
        it('should return cancelled: true when user dismisses QuickPick', async () => {
            // Given: QuickPick is shown
            let hideCallback: () => void;
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext);

            // When: User presses Escape
            hideCallback!();

            const result = await promise;

            // Then: Should return cancelled
            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should dispose QuickPick on cancellation', async () => {
            // Given: QuickPick is shown
            let hideCallback: () => void;
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext);

            // When: User presses Escape
            hideCallback!();
            await promise;

            // Then: QuickPick should be disposed
            expect(mockQuickPick.dispose).toHaveBeenCalled();
        });

        it('should log cancellation event', async () => {
            // Given: QuickPick is shown
            let hideCallback: () => void;
            mockQuickPick.onDidHide.mockImplementation((cb: () => void) => {
                hideCallback = cb;
            });

            const promise = showDaLiveAuthQuickPick(mockContext);

            // When: User presses Escape
            hideCallback!();
            await promise;

            // Then: Cancellation should be logged
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled'),
            );
        });
    });
});

// =============================================================================
// validateDaLiveToken Tests (unit tests for the token validation function)
// =============================================================================
describe('validateDaLiveToken', () => {
    it('should reject non-JWT tokens', () => {
        const result = validateDaLiveToken('not-a-jwt');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid token format');
    });

    it('should reject empty tokens', () => {
        const result = validateDaLiveToken('');
        expect(result.valid).toBe(false);
    });

    it('should accept valid JWT format tokens', () => {
        // Valid JWT with darkalley client_id and future expiration
        const validToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig';
        const result = validateDaLiveToken(validToken);
        expect(result.valid).toBe(true);
        expect(result.email).toBe('user@example.com');
    });

    it('should reject tokens with wrong client_id', () => {
        // Token with wrong client_id
        const wrongClientToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJ3cm9uZy1jbGllbnQiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIn0.sig';
        const result = validateDaLiveToken(wrongClientToken);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not from DA.live');
    });

    it('should reject expired tokens', () => {
        // Token with expiration in the past
        const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiMTAwMDAwMDAwMDAwMCIsImV4cGlyZXNfaW4iOiIxMDAwIn0.sig';
        const result = validateDaLiveToken(expiredToken);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expired');
    });
});
