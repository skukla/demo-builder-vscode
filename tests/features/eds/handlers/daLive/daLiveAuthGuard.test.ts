/**
 * daLiveAuthGuard - the DA.live session guard
 *
 * Tests for ensureDaLiveAuth:
 * - Already authenticated (fast path)
 * - Expired token with sign-in prompt
 * - User cancellation at warning dialog
 * - Delegation to showDaLiveAuthQuickPick
 * - Inside a progress modal: straight to the form, no notification first
 *
 * The guard runs the REAL sign-in flow (daLiveAuthPrompt), so these tests mock
 * its dependencies (vscode APIs) to control the flow, and share that flow's
 * harness. The sign-in flow itself is tested in daLiveAuthPrompt-signIn.test.ts.
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

// Mock DaLiveAuthService - used by both ensureDaLiveAuth (checkSignIn)
// and showDaLiveAuthQuickPick (getOrgName, storeToken)
const NOT_SIGNED_IN = { state: 'none' };
const SIGNED_IN = { state: 'valid', token: { accessToken: 'stored', expiresAt: Date.now() + 3_600_000 } };
const mockCheckSignIn = jest.fn().mockResolvedValue(NOT_SIGNED_IN);
const mockStoreToken = jest.fn().mockResolvedValue(undefined);
// A pinned namespace, so these tests exercise the expiry path: the org step is
// skipped and the flow goes straight to the token.
const mockGetOrgName = jest.fn().mockReturnValue('my-org');
const mockDispose = jest.fn();
jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => {
    const actual = jest.requireActual('@/features/eds/services/daLive/daLiveAuthService');
    return {
        ...actual,
        DaLiveAuthService: jest.fn().mockImplementation(() => ({
            checkSignIn: mockCheckSignIn,
            storeToken: mockStoreToken,
            getOrgName: mockGetOrgName,
            dispose: mockDispose,
        })),
    };
});

// Mock remaining service imports required by daLiveAuthPrompt to load
// HelixService is NOT mocked. Its only use on this path is the STATIC `initKeyStore`,
// which returns early unless the fake Memento hands back legacy keys — so the real one
// runs harmlessly and the mock was silencing nothing. Measured 2026-08-31.
jest.mock('@/core/utils/oneTimeTip', () => ({
    showOneTimeTip: jest.fn(),
}));

// Inside a progress modal the sign-in form is pushed to the modal. Intercepted so
// the modal test can answer it; the notification path never pushes.
jest.mock('@/core/vscode/operationProgress', () => ({
    heldProgress: () => ({ id: 'op', state: 'running', stage: 'Checking requirements' }),
    pushOperationProgress: jest.fn(),
    startModalRun: jest.fn(),
}));

// =============================================================================
// Now import the module under test (after all mocks are set up)
// =============================================================================

import * as vscode from 'vscode';
import { answerOperationPrompt, withModalAsking } from '@/core/vscode/operationPrompt';
import { pushOperationProgress } from '@/core/vscode/operationProgress';
import type { OperationPrompt } from '@/types/webviewPayloads';
import {
    clearServiceCache,
    createAuthPromptContext,
    ensureDaLiveAuth,
    type DaLiveGuardResult,
} from './daLiveAuthPrompt.testUtils';

// =============================================================================
// Test Utilities
// =============================================================================


function resetMockState(): void {
    showInputBoxResponses = [];
    showInputBoxIndex = 0;
    showInfoMessageResponse = undefined;
    showWarningMessageResponse = undefined;
    mockCheckSignIn.mockReset().mockResolvedValue(NOT_SIGNED_IN);
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
        mockContext = createAuthPromptContext();
    });

    // =========================================================================
    // Already Authenticated (Fast Path)
    // =========================================================================

    it('should return authenticated true when already authenticated', async () => {
        // Given: DA.live token is valid
        mockCheckSignIn.mockResolvedValue(SIGNED_IN);

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
        mockCheckSignIn.mockResolvedValue(NOT_SIGNED_IN);
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
        mockCheckSignIn.mockResolvedValue(NOT_SIGNED_IN);
        showWarningMessageResponse = 'Sign In';

        // Token-first flow: info message → invalid token
        showInfoMessageResponse = 'I have my token';
        showInputBoxResponses = ['not-a-jwt'];

        // When: ensureDaLiveAuth is called
        const result = await ensureDaLiveAuth(mockContext);

        // Then: Should return not authenticated, carrying the REASON rather than a
        // generic one. `toBeDefined()` passed whether the real reason survived or was
        // replaced by the fallback, which is why the fallback went untested.
        expect(result.authenticated).toBe(false);
        expect(result.error).toMatch(/token format/i);
    });

    it('falls back to a generic reason when the flow gives none', async () => {
        // Cancelling produces no error text of its own, and the guard's caller still
        // needs something to show. Without the fallback the caller reports a failure
        // with an empty reason.
        mockCheckSignIn.mockResolvedValue(NOT_SIGNED_IN);
        showWarningMessageResponse = 'Sign In';
        showInfoMessageResponse = undefined; // dismissed

        const result = await ensureDaLiveAuth(mockContext);

        expect(result.authenticated).toBe(false);
        expect(result.error).toBe('DA.live authentication required');
    });

    it('should return cancelled when QuickPick is cancelled', async () => {
        // Given: Token expired, user clicks "Sign In", then dismisses info message
        mockCheckSignIn.mockResolvedValue(NOT_SIGNED_IN);
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
        mockCheckSignIn.mockResolvedValue(NOT_SIGNED_IN);
        showWarningMessageResponse = undefined;

        // When: ensureDaLiveAuth is called
        const result = await ensureDaLiveAuth(mockContext);

        // Then: Should return cancelled
        expect(result).toEqual({ authenticated: false, cancelled: true });
    });

    // =========================================================================
    // Logger Behavior
    // =========================================================================

    it('should warn once when the token is expired', async () => {
        // Given: Token expired
        mockCheckSignIn.mockResolvedValue(NOT_SIGNED_IN);
        showWarningMessageResponse = undefined;

        // When: ensureDaLiveAuth is called
        await ensureDaLiveAuth(mockContext);

        // Then: one warning is logged (its wording is not the contract)
        expect(mockContext.logger.warn).toHaveBeenCalledTimes(1);
    });

    // =========================================================================
    // DaLiveAuthService Instantiation
    // =========================================================================

    it('should check authentication via DaLiveAuthService', async () => {
        // Given: Token is valid
        mockCheckSignIn.mockResolvedValue(SIGNED_IN);

        // When: ensureDaLiveAuth is called
        await ensureDaLiveAuth(mockContext);

        // Then: the one sign-in reader answered
        expect(mockCheckSignIn).toHaveBeenCalled();
    });

    // =========================================================================
    // showDaLiveAuthQuickPick Delegation
    // =========================================================================

    it('should call showDaLiveAuthQuickPick when user clicks Sign In', async () => {
        // Given: Token expired, user clicks "Sign In"
        mockCheckSignIn.mockResolvedValue(NOT_SIGNED_IN);
        showWarningMessageResponse = 'Sign In';

        // Token-first flow: user dismisses info message (cancels)
        showInfoMessageResponse = undefined;

        // When: ensureDaLiveAuth is called
        await ensureDaLiveAuth(mockContext);

        // Then: showInformationMessage should have been called (first step of QuickPick)
        // Called twice: once for ensureDaLiveAuth warning, once for QuickPick info message
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Sign in to DA.live',
            expect.objectContaining({ modal: true, detail: expect.stringContaining('token from DA.live') }),
            'Open DA.live',
            'I have my token'
        );
    });
});

// =============================================================================
// IMS's verdict — the locally-valid-but-cancelled gap.
//
// A token can pass the local expiry check and still be cancelled: on 2026-10-28 a
// forced Adobe sign-in did that to one with 23 hours left. The reader asks IMS, so
// the guard needs no org to catch it.
// =============================================================================

describe('ensureDaLiveAuth — IMS verdict', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        clearServiceCache();
        resetMockState();
        mockContext = createAuthPromptContext();
    });

    it('prompts re-auth when IMS no longer accepts a locally-valid token', async () => {
        mockCheckSignIn.mockResolvedValue({ ...SIGNED_IN, state: 'refused' });
        showWarningMessageResponse = undefined; // user dismisses the prompt

        const result = await ensureDaLiveAuth(mockContext, '[Test]');

        expect(result).toMatchObject({ authenticated: false, cancelled: true });
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Adobe no longer accepts your DA.live sign-in. Sign in to keep going.',
            'Sign In'
        );
    });

    it('says EXPIRED, not refused, when nothing usable is stored', async () => {
        // The two causes send the SC to different places: an expiry means fetch
        // a fresh token, a refusal means the sign-in was ended elsewhere.
        // Defaulting to the refusal copy tells everyone whose token simply ran
        // out to go check the wrong thing.
        mockCheckSignIn.mockResolvedValue(NOT_SIGNED_IN);
        showWarningMessageResponse = undefined;

        await ensureDaLiveAuth(mockContext, '[Test]');

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Your DA.live session has expired. Sign in to keep going.',
            'Sign In'
        );
    });

    it('passes without any UI when IMS accepts the token', async () => {
        mockCheckSignIn.mockResolvedValue(SIGNED_IN);

        const result = await ensureDaLiveAuth(mockContext, '[Test]');

        expect(result).toEqual({ authenticated: true });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('carries on when IMS cannot answer (network trouble is not a refusal)', async () => {
        mockCheckSignIn.mockResolvedValue({ ...SIGNED_IN, state: 'unknown' });

        const result = await ensureDaLiveAuth(mockContext, '[Test]');

        expect(result).toEqual({ authenticated: true });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Inside a progress modal — the modal asks, so no notification goes first.
// =============================================================================

describe('ensureDaLiveAuth — inside a progress modal', () => {
    it('goes straight to the sign-in form, headed by why it is asking', async () => {
        // A Sign In button in front of a form the modal was going to show anyway
        // is a click that asks nothing (owner, 2026-09-20).
        jest.clearAllMocks();
        clearServiceCache();
        resetMockState();
        const asked: OperationPrompt[] = [];
        (pushOperationProgress as jest.Mock).mockImplementation(async (payload) => {
            if (!payload.prompt) return;
            asked.push(payload.prompt);
            // The SC dismisses the form.
            setImmediate(() => answerOperationPrompt(payload.id, undefined, {}));
        });

        const result = await withModalAsking('op', () =>
            ensureDaLiveAuth(createAuthPromptContext()),
        );

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(asked).toHaveLength(1);
        expect(asked[0].fields?.map((field) => field.id)).toEqual(['orgName', 'token']);
        expect(asked[0].message).toContain('Your DA.live session has expired.');
        expect(result).toEqual({
            authenticated: false,
            cancelled: true,
            error: 'DA.live authentication required',
        });
    });
});
