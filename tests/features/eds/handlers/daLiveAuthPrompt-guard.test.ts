/**
 * daLiveAuthPrompt - DA.live Auth Guard Tests
 *
 * Tests for ensureDaLiveAuth shared utility:
 * - Already authenticated (fast path)
 * - Expired token with sign-in prompt
 * - User cancellation at warning dialog
 * - Delegation to showDaLiveAuthQuickPick
 * - Logger behavior and custom logPrefix
 *
 * Note: showDaLiveAuthQuickPick is in the same module, so we mock
 * its dependencies (vscode APIs) to control the flow. The sign-in flow
 * itself is thoroughly tested in daLiveAuthPrompt-signIn.test.ts.
 */

import type { HandlerContext } from '@/types/handlers';

// Explicit test timeout to prevent hanging
jest.setTimeout(5000);

// =============================================================================
// Mock Setup - All mocks must be defined before imports
// =============================================================================

// Track showInputBox calls (used by showDaLiveAuthQuickPick internally)
let showInputBoxResponses: Array<string | undefined> = [];
let showInputBoxIndex = 0;

// Track showInformationMessage calls (used by showDaLiveAuthQuickPick Step 2a)
let showInfoMessageResponse: string | undefined;

// Track showWarningMessage responses (used by ensureDaLiveAuth for "Sign In" prompt)
let showWarningMessageResponse: string | undefined;

// Mock vscode
jest.mock(
    'vscode',
    () => ({
        window: {
            showInputBox: jest.fn().mockImplementation(() => {
                const response = showInputBoxResponses[showInputBoxIndex];
                showInputBoxIndex++;
                return Promise.resolve(response);
            }),
            showInformationMessage: jest.fn().mockImplementation(() => {
                return Promise.resolve(showInfoMessageResponse);
            }),
            showErrorMessage: jest.fn(),
            showWarningMessage: jest.fn().mockImplementation(() => {
                return Promise.resolve(showWarningMessageResponse);
            }),
            withProgress: jest.fn().mockImplementation((_options, callback) => {
                return callback();
            }),
            setStatusBarMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        },
        env: {
            openExternal: jest.fn(),
            // Empty clipboard: the token step falls through to the paste box,
            // which is what these tests drive.
            clipboard: { readText: jest.fn().mockResolvedValue('') },
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
        ConfigurationTarget: {
            Global: 1,
        },
    }),
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

// Mock DaLiveAuthService - used by both ensureDaLiveAuth (isAuthenticated)
// and showDaLiveAuthQuickPick (getOrgName, storeToken)
const mockIsAuthenticated = jest.fn().mockResolvedValue(false);
const mockIsServerAccepted = jest.fn().mockResolvedValue('accepted');
const mockStoreToken = jest.fn().mockResolvedValue(undefined);
// A pinned namespace, so these tests exercise the expiry path: the org step is
// skipped and the flow goes straight to the token.
const mockGetOrgName = jest.fn().mockReturnValue('my-org');
const mockDispose = jest.fn();
jest.mock('@/features/eds/services/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLiveAuthService');
    return {
        ...actual,
        DaLiveAuthService: jest.fn().mockImplementation(() => ({
            isAuthenticated: mockIsAuthenticated,
            isServerAccepted: mockIsServerAccepted,
            storeToken: mockStoreToken,
            getOrgName: mockGetOrgName,
            dispose: mockDispose,
        })),
    };
});

// Mock remaining service imports required by daLiveAuthPrompt to load
jest.mock('@/features/eds/services/githubTokenService');
jest.mock('@/features/eds/services/githubRepoOperations');
jest.mock('@/features/eds/services/githubFileOperations');
jest.mock('@/features/eds/services/githubOAuthService');
jest.mock('@/features/eds/services/daLiveOrgOperations');
jest.mock('@/features/eds/services/daLiveContentOperations');
jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: { initKeyStore: jest.fn() },
}));
jest.mock('@/core/utils/oneTimeTip', () => ({
    showOneTimeTip: jest.fn(),
}));

// =============================================================================
// Now import the module under test (after all mocks are set up)
// =============================================================================

import * as vscode from 'vscode';
import { ensureDaLiveAuth, type DaLiveGuardResult } from '@/features/eds/handlers/daLiveAuthPrompt';
import { clearServiceCache } from '@/features/eds/handlers/edsServiceCache';

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
            trace: jest.fn(),
        } as unknown as HandlerContext['logger'],
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            trace: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: {
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as unknown as HandlerContext['context'],
        sharedState: {
            isAuthenticating: false,
        },
    } as unknown as HandlerContext;
}

function resetMockState(): void {
    showInputBoxResponses = [];
    showInputBoxIndex = 0;
    showInfoMessageResponse = undefined;
    showWarningMessageResponse = undefined;
    mockIsAuthenticated.mockReset().mockResolvedValue(false);
    mockStoreToken.mockReset().mockResolvedValue(undefined);
}

// =============================================================================
// Tests - ensureDaLiveAuth
// =============================================================================

describe('ensureDaLiveAuth', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        clearServiceCache();
        resetMockState();
        mockContext = createMockContext();
    });

    // =========================================================================
    // Already Authenticated (Fast Path)
    // =========================================================================

    it('should return authenticated true when already authenticated', async () => {
        // Given: DA.live token is valid
        mockIsAuthenticated.mockResolvedValue(true);

        // When: ensureDaLiveAuth is called
        const result: DaLiveGuardResult = await ensureDaLiveAuth(mockContext);

        // Then: Should return authenticated without showing any UI
        expect(result).toEqual({ authenticated: true });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Expired Token - Sign In Flow
    // =========================================================================

    it('should return authenticated true when sign-in via QuickPick succeeds', async () => {
        // Given: Token expired, user clicks "Sign In", QuickPick succeeds
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = 'Sign In';

        // Set up flow mocks: info message → token → verify. The org step does
        // not run — mockGetOrgName pins a namespace.
        //
        // The token is assembled rather than pasted so no JWT literal lands in
        // the repo: a secret scanner flags the literal and cannot tell a
        // fixture from a live credential. Only part 2 is ever decoded.
        const encode = (value: object): string =>
            Buffer.from(JSON.stringify(value)).toString('base64');
        const validToken = `${encode({ alg: 'HS256' })}.${encode({
            client_id: 'darkalley',
            created_at: '9999999999999',
            expires_in: '3600000',
            email: 'user@example.com',
        })}.signature`;
        showInfoMessageResponse = 'I have my token';
        showInputBoxResponses = [validToken];

        // When: ensureDaLiveAuth is called
        const result = await ensureDaLiveAuth(mockContext);

        // Then: Should return authenticated
        expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated false with error when QuickPick fails', async () => {
        // Given: Token expired, user clicks "Sign In", but token is invalid
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = 'Sign In';

        // Token-first flow: info message → invalid token
        showInfoMessageResponse = 'I have my token';
        showInputBoxResponses = ['not-a-jwt'];

        // When: ensureDaLiveAuth is called
        const result = await ensureDaLiveAuth(mockContext);

        // Then: Should return not authenticated with error
        expect(result.authenticated).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('should return cancelled when QuickPick is cancelled', async () => {
        // Given: Token expired, user clicks "Sign In", then dismisses info message
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = 'Sign In';

        // Token-first flow: user dismisses the info message
        showInfoMessageResponse = undefined;

        // When: ensureDaLiveAuth is called
        const result = await ensureDaLiveAuth(mockContext);

        // Then: Should return cancelled
        expect(result.authenticated).toBe(false);
        expect(result.cancelled).toBe(true);
    });

    // =========================================================================
    // User Cancellation at Warning Dialog
    // =========================================================================

    it('should return cancelled when user dismisses the warning dialog', async () => {
        // Given: Token expired, user dismisses dialog (undefined response)
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = undefined;

        // When: ensureDaLiveAuth is called
        const result = await ensureDaLiveAuth(mockContext);

        // Then: Should return cancelled
        expect(result).toEqual({ authenticated: false, cancelled: true });
    });

    // =========================================================================
    // Custom Options
    // =========================================================================

    it('should use default logPrefix [Auth] in log messages', async () => {
        // Given: Token expired, using default prefix
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = undefined;

        // When: ensureDaLiveAuth is called without logPrefix
        await ensureDaLiveAuth(mockContext);

        // Then: Should use [Auth] prefix
        expect(mockContext.logger.warn).toHaveBeenCalledWith(expect.stringContaining('[Auth]'));
    });

    it('should use custom logPrefix in log messages', async () => {
        // Given: Token expired, custom prefix
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = undefined;

        // When: ensureDaLiveAuth is called with custom logPrefix
        await ensureDaLiveAuth(mockContext, '[Storefront Setup]');

        // Then: Should use custom prefix
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[Storefront Setup]')
        );
    });

    // =========================================================================
    // Logger Behavior
    // =========================================================================

    it('should call logger.warn when token is expired', async () => {
        // Given: Token expired
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = undefined;

        // When: ensureDaLiveAuth is called
        await ensureDaLiveAuth(mockContext);

        // Then: Should log warning about expired token
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('DA.live token expired or missing')
        );
    });

    // =========================================================================
    // DaLiveAuthService Instantiation
    // =========================================================================

    it('should check authentication via DaLiveAuthService', async () => {
        // Given: Token is valid
        mockIsAuthenticated.mockResolvedValue(true);

        // When: ensureDaLiveAuth is called
        await ensureDaLiveAuth(mockContext);

        // Then: isAuthenticated should be called on the service
        expect(mockIsAuthenticated).toHaveBeenCalled();
    });

    // =========================================================================
    // showDaLiveAuthQuickPick Delegation
    // =========================================================================

    it('should call showDaLiveAuthQuickPick when user clicks Sign In', async () => {
        // Given: Token expired, user clicks "Sign In"
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = 'Sign In';

        // Token-first flow: user dismisses info message (cancels)
        showInfoMessageResponse = undefined;

        // When: ensureDaLiveAuth is called
        await ensureDaLiveAuth(mockContext);

        // Then: showInformationMessage should have been called (first step of QuickPick)
        // Called twice: once for ensureDaLiveAuth warning, once for QuickPick info message
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('token from DA.live'),
            expect.anything(),
            'Open DA.live',
            'I have my token'
        );
    });
});

// =============================================================================
// Server probe (probeOrg) — the locally-valid-but-server-refused gap.
//
// The 2026-08-16 evidence: a token can pass the local expiry check and still be
// refused by the DA.live admin plane, and every downstream 403 then reads as a
// missing PERMISSION. With a probeOrg, the guard asks the server one cheap
// question before letting a pipeline start.
// =============================================================================

describe('ensureDaLiveAuth — server probe', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        clearServiceCache();
        resetMockState();
        mockContext = createMockContext();
        mockIsAuthenticated.mockResolvedValue(true);
    });

    it('prompts re-auth when the server refuses a locally-valid token', async () => {
        mockIsServerAccepted.mockResolvedValue('refused');
        showWarningMessageResponse = undefined; // user dismisses the prompt

        const result = await ensureDaLiveAuth(mockContext, '[Test]', 'acme');

        expect(mockIsServerAccepted).toHaveBeenCalledWith('acme');
        expect(result).toMatchObject({ authenticated: false, cancelled: true });
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('refused'),
            'Sign In'
        );
    });

    it('passes without any UI when the server accepts the token', async () => {
        mockIsServerAccepted.mockResolvedValue('accepted');

        const result = await ensureDaLiveAuth(mockContext, '[Test]', 'acme');

        expect(result).toEqual({ authenticated: true });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('fails open when the probe cannot answer (network trouble is not a refusal)', async () => {
        mockIsServerAccepted.mockResolvedValue('unknown');

        const result = await ensureDaLiveAuth(mockContext, '[Test]', 'acme');

        expect(result).toEqual({ authenticated: true });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('does not probe at all when no probeOrg is given (existing callers unchanged)', async () => {
        const result = await ensureDaLiveAuth(mockContext, '[Test]');

        expect(mockIsServerAccepted).not.toHaveBeenCalled();
        expect(result).toEqual({ authenticated: true });
    });
});
