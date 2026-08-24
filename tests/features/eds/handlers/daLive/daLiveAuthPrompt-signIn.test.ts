/**
 * daLiveAuthPrompt - DA.live Sign-In Tests
 *
 * Tests for showDaLiveAuthQuickPick and validateDaLiveToken:
 * - Org step: skipped entirely when a namespace is already pinned, otherwise
 *   asked FIRST (before the token) — the org is the GitHub namespace, and
 *   re-typing it on every expiry is what the flow used to demand
 * - Info message with "Open DA.live" / "I have my token"
 * - Token step: taken from the clipboard when it holds a valid one (the
 *   bookmarklet just put it there), input box only as the fallback
 * - Token format validation, token and org storage on success
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
// (1) initial "Open DA.live" / "I have my token" picker, (2) post-browser "Continue"
// gate when the user took the browser route. Mock returns responses[i] for the i-th call.
let showInfoMessageResponses: Array<string | undefined> = [];
let showInfoMessageIndex = 0;

// Clipboard contents the token step reads. Empty by default so a test that says
// nothing about the clipboard exercises the input-box fallback.
let clipboardText = '';

// Mock vscode
jest.mock(
    'vscode',
    () => {
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
                clipboard: {
                    readText: jest.fn().mockImplementation(() => Promise.resolve(clipboardText)),
                },
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
    },
    { virtual: true }
);

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
// The pinned namespace. `undefined` = nothing pinned yet (first sign-in or
// after an explicit logout); a string = the org survived the token's expiry,
// which is the case the flow must not re-ask about.
const mockGetOrgName = jest.fn<string | undefined, []>();
jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLive/daLiveAuthService');
    return {
        ...actual,
        DaLiveAuthService: jest.fn().mockImplementation(() => ({
            storeToken: mockStoreToken,
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getOrgName: mockGetOrgName,
        })),
    };
});

// Mock GitHub services (required by daLiveAuthPrompt to load)
jest.mock('@/features/eds/services/github/githubTokenService');
jest.mock('@/features/eds/services/github/githubRepoOperations');
jest.mock('@/features/eds/services/github/githubFileOperations');
jest.mock('@/features/eds/services/github/githubOAuthService');
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations');
jest.mock('@/features/eds/services/daLive/daLiveContentOperations');

// =============================================================================
// Now import the modules under test (after all mocks are set up)
// =============================================================================

import * as vscode from 'vscode';
import {
    showDaLiveAuthQuickPick,
    validateDaLiveToken,
} from '@/features/eds/handlers/daLive/daLiveAuthPrompt';

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
    clipboardText = '';
    (vscode.window.showInputBox as jest.Mock).mockClear();
    (vscode.window.showInformationMessage as jest.Mock).mockClear();
    (vscode.env.clipboard.readText as jest.Mock).mockClear();
}

/**
 * Build a DA.live-shaped JWT from a payload.
 *
 * Assembled rather than pasted so no JWT literal lands in the repo — a secret
 * scanner flags the literal and cannot tell a fixture from a live credential.
 * The signature is the word "signature": nothing here verifies one, and
 * `parseJwtPayload` only base64-decodes the second part.
 */
function makeToken(payload: Record<string, string>): string {
    const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64');
    return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

// created_at + expires_in land in the year 2286 — valid whenever this runs.
const validToken = makeToken({
    client_id: 'darkalley',
    created_at: '9999999999999',
    expires_in: '3600000',
    email: 'user@example.com',
});

// Correct shape, correct client_id, expired back in 2001 — what a user's
// clipboard holds when they re-copy the token that just went stale.
const expiredToken = makeToken({
    client_id: 'darkalley',
    created_at: '1000000000000',
    expires_in: '1000',
});

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
        // Default: nothing pinned, so the org step runs. Tests about the
        // expiry path set a value.
        mockGetOrgName.mockReset().mockReturnValue(undefined);
    });

    // =========================================================================
    // Input Flow Tests
    // =========================================================================
    describe('org step', () => {
        it('should not ask for an org when a namespace is already pinned', async () => {
            // The expiry path: the token went stale, the pinned org did not.
            mockGetOrgName.mockReturnValue('demo-system-stores');
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(showInputBoxCalls[0]).toMatchObject({
                title: 'Sign in to DA.live — token',
                password: true,
            });
        });

        it('should store the pinned org rather than a re-typed one', async () => {
            mockGetOrgName.mockReturnValue('demo-system-stores');
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockStoreToken).toHaveBeenCalledWith(
                validToken,
                expect.objectContaining({ orgName: 'demo-system-stores' })
            );
        });

        it('should ask for the org before the token when nothing is pinned', async () => {
            showInputBoxResponses = [undefined]; // cancel at org

            await showDaLiveAuthQuickPick(mockContext);

            // The org box is the FIRST thing shown — before the info message,
            // and before anything asks for a token.
            expect(showInputBoxCalls).toHaveLength(1);
            // Titled by WHAT it asks for, not "Step 1 of 2" — the clipboard can
            // supply the token, and a promised step 2 that never arrives is a
            // lie the flow cannot predict at this point.
            expect(showInputBoxCalls[0]).toMatchObject({
                title: 'Sign in to DA.live — namespace',
                prompt: expect.stringContaining('organization'),
            });
            expect(showInputBoxCalls[0].password).toBeFalsy();
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });
    });

    describe('Token input flow', () => {
        it('should show info message as first step once the org is settled', async () => {
            mockGetOrgName.mockReturnValue('my-org');
            showInfoMessageResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('token from DA.live'),
                expect.anything(),
                'Open DA.live',
                'I have my token'
            );
        });

        it('should show token input password-masked as step 2', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', undefined]; // org, then cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(2);
            expect(showInputBoxCalls[1]).toMatchObject({
                title: 'Sign in to DA.live — token',
                password: true,
            });
        });

        it('should open DA.live when user clicks Open DA.live button', async () => {
            // After the browser opens, a post-browser "Continue" gate is shown;
            // confirm it so the flow continues into the input box.
            mockGetOrgName.mockReturnValue('my-org');
            showInfoMessageResponses = ['Open DA.live', 'Continue'];
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.env.openExternal).toHaveBeenCalled();
        });

        it('should show a Continue gate after opening the browser', async () => {
            mockGetOrgName.mockReturnValue('my-org');
            showInfoMessageResponses = ['Open DA.live', 'Continue'];
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            // Two info messages total: initial choice + post-browser paste gate.
            const infoCalls = (vscode.window.showInformationMessage as jest.Mock).mock.calls;
            expect(infoCalls).toHaveLength(2);
            expect(infoCalls[1][0]).toEqual(expect.stringContaining('bookmarklet'));
            expect(infoCalls[1]).toContain('Continue');
        });

        it('should reach the token step only AFTER the Continue gate is clicked', async () => {
            mockGetOrgName.mockReturnValue('my-org');
            showInfoMessageResponses = ['Open DA.live', 'Continue'];
            showInputBoxResponses = [undefined]; // cancel at token

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(showInputBoxCalls[0]).toMatchObject({ password: true });
        });

        it('should cancel the flow when the Continue gate is dismissed', async () => {
            // User dismissed the post-browser gate (clicked X / pressed Escape).
            mockGetOrgName.mockReturnValue('my-org');
            showInfoMessageResponses = ['Open DA.live', undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
            // Neither the input box nor the clipboard is touched — the user
            // never confirmed they have the token.
            expect(showInputBoxCalls).toHaveLength(0);
            expect(vscode.env.clipboard.readText).not.toHaveBeenCalled();
        });

        it('should skip the Continue gate when the user already has a token', async () => {
            // User picked "I have my token" — no browser opens, no gate shown.
            mockGetOrgName.mockReturnValue('my-org');
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            const infoCalls = (vscode.window.showInformationMessage as jest.Mock).mock.calls;
            expect(infoCalls).toHaveLength(1); // only the initial choice, no gate
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Clipboard Tests — the bookmarklet has just copied the token, so the
    // paste box is a keystroke asking for something we can already read.
    // =========================================================================
    describe('clipboard token', () => {
        beforeEach(() => {
            mockGetOrgName.mockReturnValue('my-org');
        });

        it('should take the token from the clipboard without opening an input box', async () => {
            clipboardText = validToken;
            showInfoMessageResponses = ['I have my token'];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(0);
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
            expect(result.success).toBe(true);
        });

        it('should tolerate surrounding whitespace on the copied token', async () => {
            clipboardText = `\n  ${validToken}  \n`;
            showInfoMessageResponses = ['I have my token'];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(0);
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
        });

        it('should fall back to the input box when the clipboard holds something else', async () => {
            clipboardText = 'a git branch name I copied earlier';
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(showInputBoxCalls[0]).toMatchObject({ password: true });
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
        });

        it('should fall back to the input box when the clipboard token has expired', async () => {
            // Re-copying the token that just expired must not be accepted
            // silently — the clipboard is validated, not trusted.
            clipboardText = expiredToken;
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
        });

        it('should fall back to the input box when the clipboard is empty', async () => {
            clipboardText = '';
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
        });

        it('should fall back to the input box when the clipboard read throws', async () => {
            (vscode.env.clipboard.readText as jest.Mock).mockRejectedValueOnce(
                new Error('clipboard unavailable')
            );
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
        });
    });

    // =========================================================================
    // The clipboard is read without the user selecting what it holds, so it
    // must be shown to BE a DA.live credential rather than merely shaped like
    // one. Each of these is a string a real clipboard plausibly holds, and
    // each would otherwise be stored and sent as `Authorization: Bearer`.
    // =========================================================================
    describe('clipboard token identity', () => {
        beforeEach(() => {
            mockGetOrgName.mockReturnValue('my-org');
        });

        it('should reject a base64 blob that is not a JWT at all', async () => {
            // Base64 of any JSON begins "eyJ" and contains no "." — an encoded
            // .env, a k8s secret, a config payload. The format check alone
            // cannot tell this from a token.
            clipboardText = Buffer.from('{"aws_secret_access_key":"AKIA…"}').toString('base64');
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
        });

        it('should reject a JWT that does not name darkalley as its client', async () => {
            // A GitHub App JWT, an IMS token for another client, any foreign
            // service token. Absent `client_id` must not read as "fine".
            clipboardText = makeToken({
                created_at: '9999999999999',
                expires_in: '3600000',
                email: 'someone@example.com',
            });
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
        });

        it('should reject a darkalley token carrying no readable lifetime', async () => {
            // Without created_at + expires_in the flow invents `now + 24h`,
            // and that fabricated expiry outranks a real one in the
            // da-auth-helper cache — it would evict a working credential.
            clipboardText = makeToken({ client_id: 'darkalley', email: 'user@example.com' });
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(showInputBoxCalls).toHaveLength(1);
            expect(mockStoreToken).toHaveBeenCalledWith(validToken, expect.anything());
        });

        it('should never store a token the clipboard check rejected', async () => {
            const blob = Buffer.from('{"not":"a token"}').toString('base64');
            clipboardText = blob;
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = [validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockStoreToken).not.toHaveBeenCalledWith(blob, expect.anything());
        });
    });

    // Org access + write verification tests deleted in the namespace-picker
    // plan. The pre-auth verification gate (GET /list/<org>/ for existence,
    // HEAD for write access) was removed because it blocked first-time DA.live
    // users whose AEM Code Sync wasn't installed yet. Verification now happens
    // at the actual write site (Phase 3 of the create pipeline) where the
    // error is contextual and actionable. Six tests removed (verify-success,
    // 403, 404, read-only, server-error, network-failure) — all asserted on
    // behavior that no longer exists.

    // =========================================================================
    // Successful Authentication Tests
    // =========================================================================
    describe('successful authentication', () => {
        it('should store token via auth service on success', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockStoreToken).toHaveBeenCalledWith(
                validToken,
                expect.objectContaining({
                    email: 'user@example.com',
                    orgName: 'my-org',
                })
            );
        });

        it('should return success with email on valid auth', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', validToken];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({
                success: true,
                email: 'user@example.com',
            });
        });

        it('should name the signed-in identity in the confirmation', async () => {
            // The clipboard path stores a token the user never looked at, so
            // the confirmation is the only place a wrong identity can show
            // itself. A colleague's still-valid token would otherwise bind
            // silently and 403 on every later write.
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', validToken];

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                '✅ Connected to DA.live (my-org) as user@example.com',
                expect.any(Number)
            );
        });

        it('should still confirm when the token carries no email', async () => {
            const noEmail = makeToken({
                client_id: 'darkalley',
                created_at: '9999999999999',
                expires_in: '3600000',
            });
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', noEmail];

            await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                '✅ Connected to DA.live (my-org)',
                expect.any(Number)
            );
        });
    });

    // =========================================================================
    // Error Tests
    // =========================================================================
    describe('error handling', () => {
        it('should show error on invalid token format', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', 'not-a-jwt-token'];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Invalid token format')
            );
            expect(result.success).toBe(false);
        });

        it('should show error on expired token', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', expiredToken];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('expired')
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
            mockGetOrgName.mockReturnValue('my-org');
            showInfoMessageResponses = [undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should return cancelled when user cancels at token step', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should return cancelled when user cancels at org step', async () => {
            showInputBoxResponses = [undefined];

            const result = await showDaLiveAuthQuickPick(mockContext);

            expect(result).toEqual({ success: false, cancelled: true });
        });

        it('should log cancellation at info message step', async () => {
            mockGetOrgName.mockReturnValue('my-org');
            showInfoMessageResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at info message')
            );
        });

        it('should log cancellation at token step', async () => {
            showInfoMessageResponses = ['I have my token'];
            showInputBoxResponses = ['my-org', undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at token step')
            );
        });

        it('should log cancellation at org step', async () => {
            showInputBoxResponses = [undefined];

            await showDaLiveAuthQuickPick(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('cancelled at org step')
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
        const result = validateDaLiveToken(validToken);
        expect(result.valid).toBe(true);
        expect(result.email).toBe('user@example.com');
    });

    it('should reject tokens with wrong client_id', () => {
        const wrongClientToken = makeToken({
            client_id: 'wrong-client',
            created_at: '9999999999999',
            expires_in: '3600000',
        });
        const result = validateDaLiveToken(wrongClientToken);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not from DA.live');
    });

    it('should reject expired tokens', () => {
        const result = validateDaLiveToken(expiredToken);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expired');
    });
});
