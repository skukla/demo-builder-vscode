/**
 * Unit Tests: EDS Handlers
 *
 * Tests for EDS message handlers including GitHub auth, DA.live verification,
 * and ACCS credential validation.
 *
 * Coverage: 7 tests
 * - GitHub Auth (3 tests)
 * - DA.live Verification (1 test)
 * - ACCS Validation (1 test)
 * - Error Handling (2 tests)
 */

import type { HandlerContext } from '@/types/handlers';

// Mock the EDS services at module level
const mockGitHubTokenService = {
    getToken: jest.fn(),
    validateToken: jest.fn(),
    storeToken: jest.fn(),
    clearToken: jest.fn(),
};

const mockGitHubRepoOps = {
    listUserRepositories: jest.fn(),
    checkRepositoryAccess: jest.fn(),
};

const mockGitHubFileOps = {
    getFileContent: jest.fn(),
};

const mockGitHubOAuthService = {
    startOAuthFlow: jest.fn(),
};

// Mock the services as used by edsHelpers
const mockGitHubServices = {
    tokenService: mockGitHubTokenService,
    repoOperations: mockGitHubRepoOps,
    fileOperations: mockGitHubFileOps,
    oauthService: mockGitHubOAuthService,
};

// Mock edsHelpers - service getters use caching pattern
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => mockGitHubServices),
    getDaLiveAuthService: jest.fn(() => ({})),
    validateDaLiveToken: jest.fn(() => ({ valid: true })),
    clearServiceCache: jest.fn(),
}));

// Mock vscode authentication
jest.mock('vscode', () => ({
    authentication: {
        getSession: jest.fn(),
    },
}));

// Mock logging
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => mockLogger),
}));

// Create mock handler context
function createMockHandlerContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return {
        logger: mockLogger as any,
        debugLogger: mockLogger as any,
        context: {
            secrets: {} as any, // For GitHubService instantiation
            globalState: {
                get: jest.fn().mockReturnValue('test-da-live-token'), // For DA.live token storage
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as any,
        panel: undefined,
        stateManager: {} as any,
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
        },
        authManager: {} as any, // For DaLiveService instantiation
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}

describe('EDS Handlers', () => {
    let mockContext: jest.Mocked<HandlerContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        // Clear the cached services between tests
        jest.resetModules();
        mockContext = createMockHandlerContext();
    });

    describe('handleCheckGitHubAuth', () => {
        it('should check token validity and return authenticated status', async () => {
            // Given: Valid GitHub token exists
            mockGitHubTokenService.getToken.mockResolvedValue({ token: 'test-token', scopes: ['repo'] });
            mockGitHubTokenService.validateToken.mockResolvedValue({
                valid: true,
                user: { login: 'testuser', email: 'test@example.com', avatarUrl: 'https://example.com/avatar' },
                scopes: ['repo', 'user:email'],
            });

            // Import handler after mocks are set up
            const { handleCheckGitHubAuth } = await import('@/features/eds/handlers/edsGitHubHandlers');

            // When: Check GitHub auth (no service parameter - uses internal cache)
            const result = await handleCheckGitHubAuth(mockContext);

            // Then: Should return success with user info
            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-status', expect.objectContaining({
                isAuthenticated: true,
                user: expect.objectContaining({ login: 'testuser' }),
            }));
        });

        it('should handle missing token gracefully', async () => {
            // Given: No GitHub token exists
            mockGitHubTokenService.getToken.mockResolvedValue(undefined);

            const { handleCheckGitHubAuth } = await import('@/features/eds/handlers/edsGitHubHandlers');

            // When: Check GitHub auth
            const result = await handleCheckGitHubAuth(mockContext);

            // Then: Should return not authenticated
            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-status', expect.objectContaining({
                isAuthenticated: false,
            }));
        });

        it('should handle invalid token', async () => {
            // Given: Invalid/expired token
            mockGitHubTokenService.getToken.mockResolvedValue({ token: 'expired-token', scopes: [] });
            mockGitHubTokenService.validateToken.mockResolvedValue({ valid: false });

            const { handleCheckGitHubAuth } = await import('@/features/eds/handlers/edsGitHubHandlers');

            // When: Check GitHub auth
            const result = await handleCheckGitHubAuth(mockContext);

            // Then: Should return not authenticated
            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-status', expect.objectContaining({
                isAuthenticated: false,
            }));
        });
    });

    describe('handleGitHubOAuth', () => {
        it('happy path: cached/fresh session validates successfully, no re-auth', async () => {
            const vscode = await import('vscode');
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue({
                accessToken: 'new-token',
                account: { label: 'testuser' },
            });
            // Validation passes — no stale-session recovery needed.
            mockGitHubTokenService.validateToken.mockResolvedValue({
                valid: true,
                user: { login: 'testuser', email: null, name: null, avatarUrl: null },
            });

            const { handleGitHubOAuth } = await import('@/features/eds/handlers/edsGitHubHandlers');
            const result = await handleGitHubOAuth(mockContext);

            expect(result.success).toBe(true);
            // VS Code session asked for exactly once — no force-reauth path.
            expect((vscode.authentication.getSession as jest.Mock)).toHaveBeenCalledTimes(1);
            expect((vscode.authentication.getSession as jest.Mock).mock.calls[0][2]).toEqual({ createIfNone: true });
            expect(mockGitHubTokenService.storeToken).toHaveBeenCalledTimes(1);
            expect(mockGitHubTokenService.validateToken).toHaveBeenCalledTimes(1);
            // The reported login comes from session.account.label, not from
            // validateToken's user object — we trust VS Code's session as the
            // source of truth for identity.
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-complete', expect.objectContaining({
                isAuthenticated: true,
                user: expect.objectContaining({ login: 'testuser' }),
            }));
        });

        it('stale-session recovery: validateToken 401 → force fresh OAuth → fresh token stored', async () => {
            // The leahrayard scenario: VS Code returned a cached session whose
            // token has been revoked since (user cleared the OAuth app in
            // GitHub Settings, password reset, etc.). validateToken comes back
            // invalid; the handler triggers `forceNewSession` to mint a new
            // working token.
            const vscode = await import('vscode');
            const getSession = vscode.authentication.getSession as jest.Mock;
            getSession
                .mockResolvedValueOnce({ accessToken: 'stale-cached-token', account: { label: 'leahrayard' } })
                .mockResolvedValueOnce({ accessToken: 'fresh-token', account: { label: 'leahrayard' } });
            mockGitHubTokenService.validateToken.mockResolvedValue({ valid: false });

            const { handleGitHubOAuth } = await import('@/features/eds/handlers/edsGitHubHandlers');
            const result = await handleGitHubOAuth(mockContext);

            expect(result.success).toBe(true);
            // Two getSession calls: first cached, second forced.
            expect(getSession).toHaveBeenCalledTimes(2);
            expect(getSession.mock.calls[0][2]).toEqual({ createIfNone: true });
            expect(getSession.mock.calls[1][2]).toMatchObject({
                forceNewSession: { detail: expect.stringMatching(/no longer valid|Re-authorize/i) },
            });
            // Stale token cleared between attempts; fresh token stored.
            expect(mockGitHubTokenService.clearToken).toHaveBeenCalled();
            expect(mockGitHubTokenService.storeToken).toHaveBeenCalledTimes(2);
            const secondStoreCall = mockGitHubTokenService.storeToken.mock.calls[1][0];
            expect(secondStoreCall.token).toBe('fresh-token');
            // validateToken NOT called again after the forced re-auth — the
            // token was just minted, a transient 401 here would re-trigger
            // the prompt forever.
            expect(mockGitHubTokenService.validateToken).toHaveBeenCalledTimes(1);
            // UI sees the post-reauth user (still leahrayard).
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-complete', expect.objectContaining({
                isAuthenticated: true,
                user: expect.objectContaining({ login: 'leahrayard' }),
            }));
        });

        it('stale-session recovery: user cancels the forced re-auth → reports error', async () => {
            const vscode = await import('vscode');
            const getSession = vscode.authentication.getSession as jest.Mock;
            getSession
                .mockResolvedValueOnce({ accessToken: 'stale-cached-token', account: { label: 'leahrayard' } })
                .mockResolvedValueOnce(null); // user cancelled the forced re-auth prompt
            mockGitHubTokenService.validateToken.mockResolvedValue({ valid: false });

            const { handleGitHubOAuth } = await import('@/features/eds/handlers/edsGitHubHandlers');
            const result = await handleGitHubOAuth(mockContext);

            expect(result.success).toBe(false);
            expect(getSession).toHaveBeenCalledTimes(2);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-oauth-error', expect.objectContaining({
                error: expect.stringMatching(/cancelled/i),
            }));
        });

        it('sends error when initial VS Code auth is cancelled', async () => {
            const vscode = await import('vscode');
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(null);

            const { handleGitHubOAuth } = await import('@/features/eds/handlers/edsGitHubHandlers');
            const result = await handleGitHubOAuth(mockContext);

            expect(result.success).toBe(false);
            // No store attempt when user never authorized.
            expect(mockGitHubTokenService.storeToken).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-oauth-error', expect.objectContaining({
                error: expect.stringContaining('cancelled'),
            }));
        });
    });

    describe('handleVerifyDaLiveOrg', () => {
        it('should check org access and return verified status', async () => {
            // Given: User has access to DA.live org - mock fetch response (handler uses fetch directly)
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
            });
            global.fetch = mockFetch;

            const { handleVerifyDaLiveOrg } = await import('@/features/eds/handlers/edsDaLiveHandlers');

            // When: Verify DA.live org (payload contains orgName)
            const result = await handleVerifyDaLiveOrg(mockContext, { orgName: 'test-org' });

            // Then: Should return verified
            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('dalive-org-verified', expect.objectContaining({
                verified: true,
                orgName: 'test-org',
            }));
        });
    });

    describe('handleValidateAccsCredentials', () => {
        it('should test ACCS endpoint and return validation result', async () => {
            // Given: ACCS endpoint is valid
            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
            });
            global.fetch = mockFetch;

            const { handleValidateAccsCredentials } = await import('@/features/eds/handlers/edsHandlers');

            // When: Validate ACCS credentials
            const result = await handleValidateAccsCredentials(mockContext, {
                accsHost: 'https://accs.example.com',
                storeViewCode: 'default',
            });

            // Then: Should return validation success
            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('accs-validation-result', expect.objectContaining({
                valid: true,
            }));
        });

        it('should reject storeViewCode containing CRLF or special chars (header injection guard)', async () => {
            const { handleValidateAccsCredentials } = await import('@/features/eds/handlers/edsHandlers');

            const result = await handleValidateAccsCredentials(mockContext, {
                accsHost: 'https://accs.example.com',
                storeViewCode: 'default\r\nX-Injected: header',
            });

            expect(result.success).toBe(false);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('accs-validation-result', expect.objectContaining({
                valid: false,
            }));
        });
    });
});
