/**
 * EDS Helpers - DA.live Multi-Step Input Authentication Tests
 *
 * Tests for showDaLiveAuthQuickPick function in edsHelpers:
 * - Step 1: Organization input with validation
 * - Step 2: Token input (password-masked) with validation
 * - Token format validation and org access verification
 * - Token and org storage on success
 * - User cancellation at each step
 */

import type { HandlerContext } from '@/types/handlers';

// Explicit test timeout to prevent hanging
jest.setTimeout(5000);

// =============================================================================
// Mock Setup - All mocks must be defined before imports
// =============================================================================

// Track showInputBox calls (Step 1: org, Step 2b: token)
let showInputBoxCalls: Array<{
    title?: string;
    prompt?: string;
    placeHolder?: string;
    value?: string;
    password?: boolean;
}> = [];
let showInputBoxResponses: Array<string | undefined> = [];
let showInputBoxIndex = 0;

// Track showInformationMessage calls (Step 2a: open DA.live prompt)
let showInfoMessageResponse: string | undefined;

// Mock fetch for org verification
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock vscode
jest.mock('vscode', () => {
    return {
        window: {
            showInputBox: jest.fn().mockImplementation((options) => {
                showInputBoxCalls.push(options);
                const response = showInputBoxResponses[showInputBoxIndex];
                showInputBoxIndex++;
                return Promise.resolve(response);
            }),
            showInformationMessage: jest.fn().mockImplementation(() => {
                return Promise.resolve(showInfoMessageResponse);
            }),
            showErrorMessage: jest.fn(),
            showWarningMessage: jest.fn(),
            withProgress: jest.fn().mockImplementation((_options, callback) => {
                return callback();
            }),
            setStatusBarMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        },
        env: {
            openExternal: jest.fn(),
        },
        Uri: {
            parse: jest.fn((url: string) => ({ toString: () => url })),
        },
        ProgressLocation: {
            Notification: 15,
        },
    };
}, { virtual: true });

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
 * Reset input box tracking state
 */
function resetInputBoxState(): void {
    showInputBoxCalls = [];
    showInputBoxResponses = [];
    showInputBoxIndex = 0;
    showInfoMessageResponse = undefined;
    (vscode.window.showInputBox as jest.Mock).mockClear();
    (vscode.window.showInformationMessage as jest.Mock).mockClear();
}

// =============================================================================
// Tests - DA.live Multi-Step Input Authentication Flow
// =============================================================================

describe('showDaLiveAuthQuickPick', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        resetInputBoxState();
        mockContext = createMockContext();
        mockStoreToken.mockClear().mockResolvedValue(undefined);
        mockFetch.mockReset();
    });

    // =========================================================================
    // Input Flow Tests
    // =========================================================================
    describe('Multi-step input flow', () => {
        it('should show organization input as Step 1/2', async () => {
            // Given: User will cancel at org step
            showInputBoxResponses = [undefined]; // Cancel at org step

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: First input should be for organization
            expect(showInputBoxCalls[0]).toMatchObject({
                title: 'Sign in to DA.live (Step 1/2)',
                prompt: 'Enter your DA.live organization name',
            });
        });

        it('should show info message with Open DA.live option after org input', async () => {
            // Given: User provides org, then dismisses info message
            showInputBoxResponses = ['my-org'];
            showInfoMessageResponse = undefined; // User dismisses

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Info message should be shown with DA.live options
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('token from DA.live'),
                expect.anything(),
                'Open DA.live',
                'I have my token',
            );
        });

        it('should show token input as Step 2/2 with password masking', async () => {
            // Given: User provides org, clicks "I have my token", then cancels at token step
            showInputBoxResponses = ['my-org', undefined];
            showInfoMessageResponse = 'I have my token';

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Token input should have Step 2/2 title and password masking
            expect(showInputBoxCalls[1]).toMatchObject({
                title: 'Sign in to DA.live (Step 2/2)',
                password: true,
            });
        });

        it('should pre-fill organization with stored value for returning users', async () => {
            // Given: User has a stored org name
            (mockContext.context.globalState.get as jest.Mock).mockReturnValue('stored-org');
            showInputBoxResponses = [undefined]; // Cancel to see the value

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Org input should have stored value pre-filled
            expect(showInputBoxCalls[0].value).toBe('stored-org');
        });

        it('should open DA.live when user clicks Open DA.live button', async () => {
            // Given: User provides org and clicks "Open DA.live", then cancels at token step
            showInputBoxResponses = ['my-org', undefined];
            showInfoMessageResponse = 'Open DA.live';

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Should open DA.live in browser
            expect(vscode.env.openExternal).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Successful Authentication Tests
    // =========================================================================
    describe('successful authentication', () => {
        const validToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig';

        it('should verify org access with token', async () => {
            // Given: Valid inputs and successful org verification
            showInputBoxResponses = ['my-org', validToken];
            showInfoMessageResponse = 'I have my token';
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Should call DA.live API to verify org access
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.da.live/list/my-org/',
                expect.objectContaining({
                    method: 'GET',
                    headers: { Authorization: `Bearer ${validToken}` },
                }),
            );
        });

        it('should store token, org, and email on success', async () => {
            // Given: Valid inputs and successful org verification
            showInputBoxResponses = ['my-org', validToken];
            showInfoMessageResponse = 'I have my token';
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Should store all credentials
            expect(mockContext.context.globalState.update).toHaveBeenCalledWith(
                'daLive.accessToken',
                validToken,
            );
            expect(mockContext.context.globalState.update).toHaveBeenCalledWith(
                'daLive.orgName',
                'my-org',
            );
            expect(mockContext.context.globalState.update).toHaveBeenCalledWith(
                'daLive.userEmail',
                'user@example.com',
            );
        });

        it('should return success with email on valid auth', async () => {
            // Given: Valid inputs and successful org verification
            showInputBoxResponses = ['my-org', validToken];
            showInfoMessageResponse = 'I have my token';
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should return success
            expect(result).toEqual({
                success: true,
                email: 'user@example.com',
            });
        });

        it('should show success message with org name', async () => {
            // Given: Valid inputs and successful org verification
            showInputBoxResponses = ['my-org', validToken];
            showInfoMessageResponse = 'I have my token';
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Should show success message in status bar
            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                '✅ Connected to DA.live (my-org)',
                expect.any(Number),
            );
        });
    });

    // =========================================================================
    // Org Verification Error Tests
    // =========================================================================
    describe('org verification errors', () => {
        const validToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIn0.sig';

        it('should show error when access denied to org (403)', async () => {
            // Given: Valid token but access denied
            showInputBoxResponses = ['forbidden-org', validToken];
            showInfoMessageResponse = 'I have my token';
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should show access denied error
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Access denied'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error when org not found (404)', async () => {
            // Given: Valid token but org doesn't exist
            showInputBoxResponses = ['nonexistent-org', validToken];
            showInfoMessageResponse = 'I have my token';
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should show not found error
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('not found'),
            );
            expect(result.success).toBe(false);
        });
    });

    // =========================================================================
    // Token Validation Error Tests
    // =========================================================================
    describe('token validation errors', () => {
        it('should show error on invalid token format', async () => {
            // Given: Invalid token format
            showInputBoxResponses = ['my-org', 'not-a-jwt-token'];
            showInfoMessageResponse = 'I have my token';

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should show format error
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Invalid token format'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error on expired token', async () => {
            // Given: Expired token
            const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiMTAwMDAwMDAwMDAwMCIsImV4cGlyZXNfaW4iOiIxMDAwIn0.sig';
            showInputBoxResponses = ['my-org', expiredToken];
            showInfoMessageResponse = 'I have my token';

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should show expired error
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('expired'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error on wrong client_id', async () => {
            // Given: Token from wrong service
            const wrongClientToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJ3cm9uZy1jbGllbnQiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIn0.sig';
            showInputBoxResponses = ['my-org', wrongClientToken];
            showInfoMessageResponse = 'I have my token';

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should show wrong service error
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('not from DA.live'),
            );
            expect(result.success).toBe(false);
        });
    });

    // =========================================================================
    // User Cancellation Tests
    // =========================================================================
    describe('user cancellation', () => {
        it('should return cancelled when user cancels at org step', async () => {
            // Given: User cancels org input
            showInputBoxResponses = [undefined];

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should return cancelled
            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should return cancelled when user dismisses info message', async () => {
            // Given: User provides org but dismisses info message
            showInputBoxResponses = ['my-org'];
            showInfoMessageResponse = undefined; // User dismissed

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should return cancelled
            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should return cancelled when user cancels at token step', async () => {
            // Given: User provides org, clicks continue, but cancels token input
            showInputBoxResponses = ['my-org', undefined];
            showInfoMessageResponse = 'I have my token';

            // When: showDaLiveAuthQuickPick is called
            const result = await showDaLiveAuthQuickPick(mockContext);

            // Then: Should return cancelled
            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should log cancellation at org step', async () => {
            // Given: User cancels at org step
            showInputBoxResponses = [undefined];

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Should log cancellation
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at organization step'),
            );
        });

        it('should log cancellation at token step', async () => {
            // Given: User cancels at token step
            showInputBoxResponses = ['my-org', undefined];
            showInfoMessageResponse = 'I have my token';

            // When: showDaLiveAuthQuickPick is called
            await showDaLiveAuthQuickPick(mockContext);

            // Then: Should log cancellation
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at token step'),
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
