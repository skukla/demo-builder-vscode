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

// Track showInformationMessage calls. The auth flow shows up to two info messages:
// (1) initial "Open DA.live" / "I have my token" picker, (2) post-browser "Paste Token"
// gate when the user took the browser route. Mock returns responses[i] for the i-th call.
let showInfoMessageResponses: Array<string | undefined> = [];
let showInfoMessageIndex = 0;

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
                const response = showInfoMessageResponses[showInfoMessageIndex];
                showInfoMessageIndex++;
                return Promise.resolve(response);
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
    showInfoMessageResponses = [];
    showInfoMessageIndex = 0;
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
            showInfoMessageResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('token from DA.live'),
                expect.anything(),
                'Open DA.live',
                'I have my token',
            );
        });

        it('should show token input with password masking as step 2', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls[0]).toMatchObject({
                title: expect.stringContaining('Step 1/2'),
                password: true,
            });
        });

        it('should show org input as step 3 after token', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken, undefined]; // enter token, cancel at org

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(2);
            expect(showInputBoxCalls[1]).toMatchObject({
                title: expect.stringContaining('Step 2/2'),
                prompt: expect.stringContaining('organization'),
            });
        });

        it('should open DA.live when user clicks Open DA.live button', async () => {
            // After the browser opens, a post-browser "Paste Token" gate is shown;
            // confirm it so the flow continues into the input box.
            showInfoMessageResponses = ['Open DA.live', 'Paste Token'];
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.env.openExternal).toHaveBeenCalled();
        });

        it('should show a Paste Token gate after opening the browser', async () => {
            showInfoMessageResponses = ['Open DA.live', 'Paste Token'];
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            // Two info messages total: initial choice + post-browser paste gate.
            const infoCalls = (vscode.window.showInformationMessage as jest.Mock).mock.calls;
            expect(infoCalls).toHaveLength(2);
            expect(infoCalls[1][0]).toEqual(expect.stringContaining('Paste Token'));
            expect(infoCalls[1]).toContain('Paste Token');
        });

        it('should open the token input box only AFTER the Paste Token gate is clicked', async () => {
            showInfoMessageResponses = ['Open DA.live', 'Paste Token'];
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            // showInputBox is called after the gate — verify it ran exactly once
            // for the token step (org input wouldn't fire because we cancelled).
            expect(showInputBoxCalls).toHaveLength(1);
            expect(showInputBoxCalls[0].title).toEqual(expect.stringContaining('Step 1/2'));
        });

        it('should cancel the flow when the Paste Token gate is dismissed', async () => {
            // User dismissed the post-browser gate (clicked X / pressed Escape).
            showInfoMessageResponses = ['Open DA.live', undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
            // Input box must not open — user never confirmed they have the token.
            expect(showInputBoxCalls).toHaveLength(0);
        });

        it('should skip the Paste Token gate when the user already has a token', async () => {
            // User picked "I have my token" — no browser opens, no gate shown.
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            const infoCalls = (vscode.window.showInformationMessage as jest.Mock).mock.calls;
            expect(infoCalls).toHaveLength(1); // only the initial choice, no gate
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });
    });

    // Org access + write verification tests deleted in Step 6 of the
    // namespace-picker plan. The pre-auth verification gate (GET
    // /list/<org>/ for existence, HEAD for write access) was removed
    // because it blocked first-time DA.live users whose AEM Code Sync
    // wasn't installed yet. Verification now happens at the actual write
    // site (Phase 3 of the create pipeline) where the error is
    // contextual and actionable. Six tests removed (verify-success,
    // 403, 404, read-only, server-error, network-failure) — all
    // asserted on behavior that no longer exists.

    // =========================================================================
    // Successful Authentication Tests
    // =========================================================================
    describe('successful authentication', () => {
        it('should store token via auth service on success', async () => {
            showInfoMessageResponses = ['I have my token'];
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
            showInfoMessageResponses = ['I have my token'];
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
            showInfoMessageResponses = ['I have my token'];
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
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['not-a-jwt-token', 'my-org'];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Invalid token format'),
            );
            expect(result.success).toBe(false);
        });

        it('should show error on expired token', async () => {
            const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiMTAwMDAwMDAwMDAwMCIsImV4cGlyZXNfaW4iOiIxMDAwIn0.sig';
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [expiredToken, 'my-org'];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('expired'),
            );
            expect(result.success).toBe(false);
        });

        // Network-failure test (originally in this block) was deleted
        // alongside the org-verification tests above — it tested the same
        // removed pre-auth gate (a fetch against admin.da.live/list).
    });

    // =========================================================================
    // User Cancellation Tests
    // =========================================================================
    describe('user cancellation', () => {
        it('should return cancelled when user dismisses info message', async () => {
            showInfoMessageResponses = [undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should return cancelled when user cancels at token step', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should return cancelled when user cancels at org step', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken, undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should log cancellation at info message step', async () => {
            showInfoMessageResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at info message'),
            );
        });

        it('should log cancellation at token step', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at token step'),
            );
        });

        it('should log cancellation at org step', async () => {
            showInfoMessageResponses = ['I have my token'];
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
