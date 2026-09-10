/**
 * edsDaLiveAuthHandlers — session handlers
 *
 * The three handlers that surround token storage: reading the current DA.live
 * session, opening da.live so the user can start one, and clearing it. All three
 * answer the webview by PUSHING a payload as well as returning one, and the two
 * can disagree — so each test pins both.
 *
 * The mock preamble and fixtures live in `edsDaLiveAuthHandlers.testUtils.ts`,
 * shared with `edsDaLiveAuthHandlers-storeToken.test.ts`.
 */

import * as vscode from 'vscode';
import {
    createDaLiveAuthContext,
    getBookmarkletUrl,
    handleCheckDaLiveAuth,
    handleClearDaLiveAuth,
    handleOpenDaLiveLogin,
    mockGetOrgName,
    mockGetStoredToken,
    mockIsAuthenticated,
    mockIsSetupComplete,
    mockLogout,
    resetAuthServiceFakes,
} from './edsDaLiveAuthHandlers.testUtils';
import type { HandlerContext } from '@/types/handlers';

/** The handler computes this once at import; the payload must carry that value. */
const bookmarkletUrl = getBookmarkletUrl();

describe('handleCheckDaLiveAuth', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        resetAuthServiceFakes();
        context = createDaLiveAuthContext();
    });

    it('should report the signed-in email, setup flag and cached namespace', async () => {
        // Given: A live session with a cached namespace
        mockIsAuthenticated.mockResolvedValue(true);
        mockGetStoredToken.mockResolvedValue({ email: 'sc@example.com' });
        mockIsSetupComplete.mockReturnValue(true);
        mockGetOrgName.mockReturnValue('acme');

        // When: Checking auth status
        const result = await handleCheckDaLiveAuth(context);

        // Then: Every field the wizard reads is pushed, and the call succeeds
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-auth-status', {
            isAuthenticated: true,
            email: 'sc@example.com',
            setupComplete: true,
            orgName: 'acme',
            bookmarkletUrl,
        });
        expect(result).toEqual({ success: true });
    });

    it('should report no email when the session has no stored token to read', async () => {
        // Given: isAuthenticated says yes but the token record is gone
        mockIsAuthenticated.mockResolvedValue(true);
        mockGetStoredToken.mockResolvedValue(undefined);
        mockGetOrgName.mockReturnValue('acme');

        // When: Checking auth status
        const result = await handleCheckDaLiveAuth(context);

        // Then: Still an authenticated push, with no email — not a thrown TypeError
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-auth-status', {
            isAuthenticated: true,
            email: undefined,
            setupComplete: true,
            orgName: 'acme',
            bookmarkletUrl,
        });
        expect(result).toEqual({ success: true });
    });

    it('should drop an empty cached namespace rather than pushing an empty string', async () => {
        // Given: Not signed in, setup never completed, no namespace remembered
        mockIsAuthenticated.mockResolvedValue(false);
        mockIsSetupComplete.mockReturnValue(false);
        mockGetOrgName.mockReturnValue('');

        // When: Checking auth status
        const result = await handleCheckDaLiveAuth(context);

        // Then: orgName is absent, not '' — the picker treats '' as a chosen namespace
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-auth-status', {
            isAuthenticated: false,
            setupComplete: false,
            orgName: undefined,
            bookmarkletUrl,
        });
        expect(mockGetStoredToken).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('should keep a remembered namespace when not signed in', async () => {
        // Given: Not signed in, but a previous session pinned a namespace
        mockIsAuthenticated.mockResolvedValue(false);
        mockIsSetupComplete.mockReturnValue(true);
        mockGetOrgName.mockReturnValue('acme');

        // When: Checking auth status
        await handleCheckDaLiveAuth(context);

        // Then: The namespace survives the signed-out state
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-auth-status', {
            isAuthenticated: false,
            setupComplete: true,
            orgName: 'acme',
            bookmarkletUrl,
        });
    });

    it('should push a failed status and return the error when the check throws', async () => {
        // Given: The secret store is unreadable
        mockIsAuthenticated.mockRejectedValue(new Error('vault locked'));

        // When: Checking auth status
        const result = await handleCheckDaLiveAuth(context);

        // Then: The webview is told it is signed out, with the reason
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-auth-status', {
            isAuthenticated: false,
            error: 'vault locked',
        });
        expect(result).toEqual({ success: false, error: 'vault locked' });
    });
});

describe('handleOpenDaLiveLogin', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        resetAuthServiceFakes();
        context = createDaLiveAuthContext();
        (vscode.env.openExternal as jest.Mock).mockResolvedValue(true);
    });

    it('should open da.live and hand the webview the bookmarklet URL', async () => {
        // When: Opening the login page
        const result = await handleOpenDaLiveLogin(context);

        // Then: The URL opened is the one parsed from https://da.live
        expect(vscode.Uri.parse).toHaveBeenCalledWith('https://da.live');
        const parsed = (vscode.Uri.parse as jest.Mock).mock.results[0].value;
        expect(vscode.env.openExternal).toHaveBeenCalledWith(parsed);

        // And: The push carries the bookmarklet and nothing else
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-login-opened', {
            bookmarkletUrl,
        });
        expect(result).toEqual({ success: true });
    });

    it('should report a browser failure without pushing a login-opened message', async () => {
        // Given: No browser to open
        (vscode.env.openExternal as jest.Mock).mockRejectedValue(new Error('no browser'));

        // When: Opening the login page
        const result = await handleOpenDaLiveLogin(context);

        // Then: The caller learns why, and the webview is not told the page opened
        expect(result).toEqual({ success: false, error: 'no browser' });
        expect(context.sendMessage).not.toHaveBeenCalled();
    });
});

describe('handleClearDaLiveAuth', () => {
    let context: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        resetAuthServiceFakes();
        context = createDaLiveAuthContext();
    });

    it('should log out and push a signed-out status that keeps the setup flag', async () => {
        // Given: The bookmarklet setup was completed, and logout preserves that
        mockIsSetupComplete.mockReturnValue(true);

        // When: Clearing auth
        const result = await handleClearDaLiveAuth(context);

        // Then: The token is dropped but the user is not sent back to the tutorial
        expect(mockLogout).toHaveBeenCalledWith();
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-auth-status', {
            isAuthenticated: false,
            setupComplete: true,
        });
        expect(result).toEqual({ success: true });
    });

    it('should pass through a setup flag that was never set', async () => {
        // Given: Setup was never completed
        mockIsSetupComplete.mockReturnValue(false);

        // When: Clearing auth
        await handleClearDaLiveAuth(context);

        // Then: The service's own answer is forwarded, not a constant
        expect(context.sendMessage).toHaveBeenCalledWith('dalive-auth-status', {
            isAuthenticated: false,
            setupComplete: false,
        });
    });

    it('should report a logout failure without pushing a status', async () => {
        // Given: Logout throws
        mockLogout.mockRejectedValue(new Error('keychain busy'));

        // When: Clearing auth
        const result = await handleClearDaLiveAuth(context);

        // Then: The caller learns why, and no misleading status is pushed
        expect(result).toEqual({ success: false, error: 'keychain busy' });
        expect(context.sendMessage).not.toHaveBeenCalled();
    });
});
