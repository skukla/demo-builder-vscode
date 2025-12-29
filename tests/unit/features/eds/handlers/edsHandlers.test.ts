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

const mockDaLiveOrgOps = {
    verifyOrgAccess: jest.fn(),
};

const mockDaLiveContentOps = {
    listDirectory: jest.fn(),
};

// Mock the services as used by edsHelpers
const mockGitHubServices = {
    tokenService: mockGitHubTokenService,
    repoOperations: mockGitHubRepoOps,
    fileOperations: mockGitHubFileOps,
    oauthService: mockGitHubOAuthService,
};

const mockDaLiveServices = {
    orgOperations: mockDaLiveOrgOps,
    contentOperations: mockDaLiveContentOps,
};

// Mock edsHelpers - service getters use caching pattern
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => mockGitHubServices),
    getDaLiveServices: jest.fn(() => mockDaLiveServices),
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
            const { handleCheckGitHubAuth } = await import('@/features/eds/handlers/edsHandlers');

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

            const { handleCheckGitHubAuth } = await import('@/features/eds/handlers/edsHandlers');

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

            const { handleCheckGitHubAuth } = await import('@/features/eds/handlers/edsHandlers');

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
        it('should use VS Code authentication and send auth-complete on success', async () => {
            // Given: VS Code auth session will be returned
            const vscode = await import('vscode');
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue({
                accessToken: 'new-token',
                account: { label: 'testuser' },
            });
            // validateToken returns { valid, user } structure
            mockGitHubTokenService.validateToken.mockResolvedValue({
                valid: true,
                user: {
                    login: 'newuser',
                    email: 'new@example.com',
                    avatarUrl: 'https://example.com/new-avatar',
                },
            });

            const { handleGitHubOAuth } = await import('@/features/eds/handlers/edsHandlers');

            // When: Start OAuth flow (uses VS Code auth internally)
            const result = await handleGitHubOAuth(mockContext);

            // Then: Should send auth-complete message
            expect(result.success).toBe(true);
            expect(mockGitHubTokenService.storeToken).toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-complete', expect.objectContaining({
                isAuthenticated: true,
                user: expect.objectContaining({ login: 'newuser' }),
            }));
        });

        it('should send error when VS Code auth cancelled', async () => {
            // Given: VS Code auth session is cancelled (returns null)
            const vscode = await import('vscode');
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(null);

            const { handleGitHubOAuth } = await import('@/features/eds/handlers/edsHandlers');

            // When: Start OAuth flow
            const result = await handleGitHubOAuth(mockContext);

            // Then: Should send error message
            expect(result.success).toBe(false);
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

            const { handleVerifyDaLiveOrg } = await import('@/features/eds/handlers/edsHandlers');

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
                customerGroup: 'general',
            });

            // Then: Should return validation success
            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('accs-validation-result', expect.objectContaining({
                valid: true,
            }));
        });
    });
});
