/**
 * EDS Helpers - DA.live Auth Guard Tests
 *
 * Tests for ensureDaLiveAuth shared utility:
 * - Already authenticated (fast path)
 * - Expired token with sign-in prompt
 * - User cancellation at warning dialog
 * - Delegation to showDaLiveAuthQuickPick
 * - Logger behavior and custom logPrefix
 *
 * Note: showDaLiveAuthQuickPick is in the same module, so we mock
 * its dependencies (vscode APIs) to control the flow. The QuickPick
 * itself is thoroughly tested in edsHelpers-quickpick.test.ts.
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

// Mock fetch for org verification (used by showDaLiveAuthQuickPick)
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Track showWarningMessage responses (used by ensureDaLiveAuth for "Sign In" prompt)
let showWarningMessageResponse: string | undefined;

// Mock vscode
jest.mock('vscode', () => ({
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

// Mock DaLiveAuthService - used by both ensureDaLiveAuth (isAuthenticated)
// and showDaLiveAuthQuickPick (storeToken)
const mockIsAuthenticated = jest.fn().mockResolvedValue(false);
const mockStoreToken = jest.fn().mockResolvedValue(undefined);
const mockDispose = jest.fn();
jest.mock('@/features/eds/services/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLiveAuthService');
    return {
        ...actual,
        DaLiveAuthService: jest.fn().mockImplementation(() => ({
            isAuthenticated: mockIsAuthenticated,
            storeToken: mockStoreToken,
            dispose: mockDispose,
        })),
    };
});

// Mock remaining service imports required by edsHelpers module
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
import { ensureDaLiveAuth, clearServiceCache, type DaLiveGuardResult } from '@/features/eds/handlers/edsHelpers';

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
    mockFetch.mockReset();
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

        // Set up QuickPick mocks for successful auth
        // (org input, info message, token input, fetch success)
        const validToken = 'eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJkYXJrYWxsZXkiLCJjcmVhdGVkX2F0IjoiOTk5OTk5OTk5OTk5OSIsImV4cGlyZXNfaW4iOiIzNjAwMDAwIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0.sig';
        showInputBoxResponses = ['my-org', validToken];
        showInfoMessageResponse = 'I have my token';
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

        // When: ensureDaLiveAuth is called
        const result = await ensureDaLiveAuth(mockContext);

        // Then: Should return authenticated
        expect(result).toEqual({ authenticated: true });
    });

    it('should return authenticated false with error when QuickPick fails', async () => {
        // Given: Token expired, user clicks "Sign In", but QuickPick auth fails (invalid token)
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = 'Sign In';

        // QuickPick: org input succeeds, token input gives invalid format
        showInputBoxResponses = ['my-org', 'not-a-jwt'];
        showInfoMessageResponse = 'I have my token';

        // When: ensureDaLiveAuth is called
        const result = await ensureDaLiveAuth(mockContext);

        // Then: Should return not authenticated with error
        expect(result.authenticated).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('should return cancelled when QuickPick is cancelled', async () => {
        // Given: Token expired, user clicks "Sign In", then cancels QuickPick at org step
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = 'Sign In';

        // QuickPick: user cancels at org input
        showInputBoxResponses = [undefined];

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
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[Auth]'),
        );
    });

    it('should use custom logPrefix in log messages', async () => {
        // Given: Token expired, custom prefix
        mockIsAuthenticated.mockResolvedValue(false);
        showWarningMessageResponse = undefined;

        // When: ensureDaLiveAuth is called with custom logPrefix
        await ensureDaLiveAuth(mockContext, '[Storefront Setup]');

        // Then: Should use custom prefix
        expect(mockContext.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[Storefront Setup]'),
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
            expect.stringContaining('DA.live token expired or missing'),
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

        // QuickPick will be entered (user cancels at first step)
        showInputBoxResponses = [undefined];

        // When: ensureDaLiveAuth is called
        await ensureDaLiveAuth(mockContext);

        // Then: showInputBox should have been called (first step of QuickPick)
        expect(vscode.window.showInputBox).toHaveBeenCalled();
    });
});
