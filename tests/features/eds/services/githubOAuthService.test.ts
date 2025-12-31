/**
 * GitHub OAuth Service Tests
 *
 * Tests for OAuth flow methods extracted from GitHubService.
 */

import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((s: string) => s),
    },
}));

// Mock timeoutConfig - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        LONG: 5000, // Short timeout for tests (normally AUTH.OAUTH but using LONG for test speed)
        AUTH: {
            OAUTH: 5000, // OAuth flow timeout (short for tests)
        },
    },
}));

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('GitHub OAuth Service', () => {
    // Import after mocks are set up
    let GitHubOAuthService: any;
    let mockSecretStorage: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        // Note: Don't reset modules - it clears the mock setup

        // Create mock secret storage
        mockSecretStorage = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
        };

        // Dynamic import after mocks
        const module = await import('@/features/eds/services/githubOAuthService');
        GitHubOAuthService = module.GitHubOAuthService;
    });

    describe('startOAuthFlow', () => {
        it('should throw error when browser fails to open', async () => {
            // Given: Browser fails to open
            const service = new GitHubOAuthService(mockSecretStorage);
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(false);

            // When/Then: Should throw OAuth cancelled error
            await expect(
                service.startOAuthFlow('test-client-id', 'vscode://redirect')
            ).rejects.toThrow('OAuth flow cancelled');
        });

        it('should build OAuth URL with correct parameters', async () => {
            // Given: A configured OAuth service that captures the URL
            const service = new GitHubOAuthService(mockSecretStorage);
            let capturedUrl: string = '';
            (vscode.Uri.parse as jest.Mock).mockImplementation((url: string) => {
                capturedUrl = url;
                return url;
            });
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(false);

            // When: Starting OAuth flow (will fail but URL gets built)
            try {
                await service.startOAuthFlow('test-client-id', 'vscode://redirect');
            } catch {
                // Expected to throw
            }

            // Then: URL should be built correctly
            expect(capturedUrl).toContain('client_id=test-client-id');
            expect(capturedUrl).toContain('redirect_uri=');
            expect(capturedUrl).toContain('scope=');
            expect(capturedUrl).toContain('state=');
        });

        it('should include required scopes in OAuth URL', async () => {
            // Given: A configured OAuth service that captures the URL
            const service = new GitHubOAuthService(mockSecretStorage);
            let capturedUrl: string = '';
            (vscode.Uri.parse as jest.Mock).mockImplementation((url: string) => {
                capturedUrl = url;
                return url;
            });
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(false);

            // When: Starting OAuth flow
            try {
                await service.startOAuthFlow('test-client-id', 'vscode://redirect');
            } catch {
                // Expected to throw
            }

            // Then: URL should include scopes (URL-encoded as "repo%20user%3Aemail" or plain)
            expect(capturedUrl).toContain('scope=');
            // Check for either encoded or non-encoded version
            const hasRepoScope = capturedUrl.includes('repo') || capturedUrl.includes('repo%20');
            expect(hasRepoScope).toBe(true);
        });
    });

    describe('handleOAuthCallback', () => {
        it('should be no-op when no pending OAuth flow', () => {
            // Given: No pending OAuth flow
            const service = new GitHubOAuthService(mockSecretStorage);

            // When/Then: Callback should not throw
            expect(() => {
                service.handleOAuthCallback({ code: 'test', state: 'test' });
            }).not.toThrow();
        });
    });

    describe('generateState', () => {
        it('should generate 32-character hex string', () => {
            // Given: OAuth service
            const service = new GitHubOAuthService(mockSecretStorage);

            // When: Generating state
            const state = service.generateState();

            // Then: Should be valid hex string of correct length
            expect(state.length).toBe(32);
            expect(/^[0-9a-f]+$/i.test(state)).toBe(true);
        });

        it('should generate unique state strings', () => {
            // Given: OAuth service
            const service = new GitHubOAuthService(mockSecretStorage);

            // When: Generating multiple states
            const states = new Set<string>();
            for (let i = 0; i < 10; i++) {
                states.add(service.generateState());
            }

            // Then: All states should be unique
            expect(states.size).toBe(10);
        });
    });
});
