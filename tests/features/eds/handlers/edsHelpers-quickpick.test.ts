/**
 * EDS Helpers - DA.live Token-First Authentication Tests
 *
 * Tests for showDaLiveAuthQuickPick function in edsHelpers:
 * - Step 1: Info message with "Open DA.live" / "I have my token"
 * - Step 2: Token input (password-masked)
 * - Step 3: Org name input (with default from settings)
 * - Token format validation and org access + write-access verification
 * - Token and org storage on success
 * - User cancellation at each step
 */

import type { HandlerContext } from '@/types/handlers';

// Explicit test timeout to prevent hanging
jest.setTimeout(5000);

// =============================================================================
// Mock Setup - All mocks must be defined before imports
// =============================================================================

// Track showInputBox calls (token + org inputs)
let showInputBoxCalls: Array<{
    title?: string;
    prompt?: string;
    placeHolder?: string;
    value?: string;
    password?: boolean;
}> = [];
let showInputBoxResponses: Array<string | undefined> = [];
let showInputBoxIndex = 0;

// Track showInformationMessage calls (Step 1: open DA.live prompt)
let showInfoMessageResponse: string | undefined;

// Mock fetch for org verification
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock hasWriteAccess (from edsDaLiveOrgHandlers)
const mockHasWriteAccess = jest.fn();
jest.mock('@/features/eds/handlers/edsDaLiveOrgHandlers', () => ({
    hasWriteAccess: (...args: unknown[]) => mockHasWriteAccess(...args),
}));

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
            showQuickPick: jest.fn(),
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
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue(''),
            }),
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
jest.mock('@/features/eds/services/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLiveAuthService');
    return {
        ...actual,
        DaLiveAuthService: jest.fn().mockImplementation(() => ({
            storeToken: mockStoreToken,
            isAuthenticated: jest.fn().mockResolvedValue(true),
        })),
    };
});

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

function createMockContext(): HandlerContext {
    return {
        panel: {
            webview: { postMessage: jest.fn() },
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

function resetTrackingState(): void {
    showInputBoxCalls = [];
    showInputBoxResponses = [];
    showInputBoxIndex = 0;
    showInfoMessageResponse = undefined;
    (vscode.window.showInputBox as jest.Mock).mockClear();
    (vscode.window.showInformationMessage as jest.Mock).mockClear();
}

// Valid token for tests (darkalley client_id, future expiry, email)
const validToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig';

// =============================================================================
// Tests - DA.live Token-First Authentication Flow
// =============================================================================

describe('showDaLiveAuthQuickPick', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        resetTrackingState();
        mockContext = createMockContext();
        mockStoreToken.mockClear().mockResolvedValue(undefined);
        mockFetch.mockReset();
        mockHasWriteAccess.mockReset();
    });

    // =========================================================================
    // Input Flow Tests
    // =========================================================================
    describe('Token-first input flow', () => {
        it('should show info message as first step', async () => {
            showInfoMessageResponse = undefined;

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('token from DA.live'),
                expect.anything(),
                'Open DA.live',
                'I have my token',
            );
        });

        it('should show token input with password masking as step 2', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls[0]).toMatchObject({
                title: expect.stringContaining('Step 1/2'),
                password: true,
            });
        });

        it('should show org input as step 3 after token', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, undefined]; // enter token, cancel at org

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(2);
            expect(showInputBoxCalls[1]).toMatchObject({
                title: expect.stringContaining('Step 2/2'),
                prompt: expect.stringContaining('organization'),
            });
        });

        it('should open DA.live when user clicks Open DA.live button', async () => {
            showInfoMessageResponse = 'Open DA.live';
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.env.openExternal).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Org Verification Tests
    // =========================================================================
    describe('org access and write-access verification', () => {
        it('should verify org access and write permissions', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'my-org'];
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockHasWriteAccess.mockResolvedValueOnce(true);

            const result = await showDaLiveAuthQuickPick(mockContext);

            // Should check org access via fetch
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.da.live/list/my-org/',
                expect.objectContaining({ method: 'GET' }),
            );
            // Should check write access
            expect(mockHasWriteAccess).toHaveBeenCalledWith('my-org', validToken);
            expect(result.success).toBe(true);
        });

        it('should show error when org returns 403 (access denied)', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'forbidden-org'];
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Access denied'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error when org returns 404 (not found)', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'nonexistent-org'];
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('not found'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error when user has read-only access', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'readonly-org'];
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockHasWriteAccess.mockResolvedValueOnce(false);

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('read-only access'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error on server error', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'my-org'];
            mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Failed to verify organization'),
            );
            expect(result.success).toBe(false);
        });
    });

    // =========================================================================
    // Successful Authentication Tests
    // =========================================================================
    describe('successful authentication', () => {
        it('should store token via auth service on success', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'my-org'];
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockHasWriteAccess.mockResolvedValueOnce(true);

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockStoreToken).toHaveBeenCalledWith(
                validToken,
                expect.objectContaining({
                    email: 'user@example.com',
                    orgName: 'my-org',
                }),
            );
        });

        it('should return success with email on valid auth', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'my-org'];
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockHasWriteAccess.mockResolvedValueOnce(true);

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({
                success: true,
                email: 'user@example.com',
            });
        });

        it('should show success message with org name', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'my-org'];
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockHasWriteAccess.mockResolvedValueOnce(true);

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                '✅ Connected to DA.live (my-org)',
                expect.any(Number),
            );
        });
    });

    // =========================================================================
    // Error Tests
    // =========================================================================
    describe('error handling', () => {
        it('should show error on invalid token format', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = ['not-a-jwt-token', 'my-org'];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Invalid token format'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error on expired token', async () => {
            const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiMTAwMDAwMDAwMDAwMCIsImV4cGlyZXNfaW4iOiIxMDAwIn0.sig';
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [expiredToken, 'my-org'];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('expired'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error on network failure', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, 'my-org'];
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Network error'),
            );
            expect(result.success).toBe(false);
        });
    });

    // =========================================================================
    // User Cancellation Tests
    // =========================================================================
    describe('user cancellation', () => {
        it('should return cancelled when user dismisses info message', async () => {
            showInfoMessageResponse = undefined;

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should return cancelled when user cancels at token step', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should return cancelled when user cancels at org step', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should log cancellation at info message step', async () => {
            showInfoMessageResponse = undefined;

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at info message'),
            );
        });

        it('should log cancellation at token step', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at token step'),
            );
        });

        it('should log cancellation at org step', async () => {
            showInfoMessageResponse = 'I have my token';
            showInputBoxResponses = [validToken, undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at org step'),
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
        const token = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig';
        const result = validateDaLiveToken(token);
        expect(result.valid).toBe(true);
        expect(result.email).toBe('user@example.com');
    });

    it('should reject tokens with wrong client_id', () => {
        const wrongClientToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJ3cm9uZy1jbGllbnQiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIn0.sig';
        const result = validateDaLiveToken(wrongClientToken);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not from DA.live');
    });

    it('should reject expired tokens', () => {
        const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiMTAwMDAwMDAwMDAwMCIsImV4cGlyZXNfaW4iOiIxMDAwIn0.sig';
        const result = validateDaLiveToken(expiredToken);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expired');
    });
});
