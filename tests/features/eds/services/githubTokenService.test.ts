/**
 * GitHub Token Service Tests
 *
 * Tests for token management methods extracted from GitHubService.
 */

// Mock vscode
jest.mock('vscode', () => ({
    SecretStorage: jest.fn(),
}));

// Mock Octokit
jest.mock('@octokit/core', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        request: jest.fn(),
    })),
}));

jest.mock('@octokit/plugin-retry', () => ({
    retry: jest.fn(() => ({})),
}));

// Mock timeoutConfig - includes custom TTL for tokens
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        TOKEN_VALIDATION_TTL: 1000, // Custom TTL for token validation
        QUICK: 5000, // Fast operations
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

describe('GitHub Token Service', () => {
    let GitHubTokenService: any;
    let mockSecretStorage: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        mockSecretStorage = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
        };

        const module = await import('@/features/eds/services/githubTokenService');
        GitHubTokenService = module.GitHubTokenService;
    });

    describe('storeToken', () => {
        it('should store token as JSON string', async () => {
            // Given: Token service
            const service = new GitHubTokenService(mockSecretStorage);
            const token = { token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] };

            // When: Storing token
            await service.storeToken(token);

            // Then: Token should be stored as JSON
            expect(mockSecretStorage.store).toHaveBeenCalledWith(
                'github-token',
                JSON.stringify(token)
            );
        });
    });

    describe('getToken', () => {
        it('should return parsed token when stored', async () => {
            // Given: Stored token
            const service = new GitHubTokenService(mockSecretStorage);
            const storedToken = { token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // When: Getting token
            const result = await service.getToken();

            // Then: Token should be parsed
            expect(result).toEqual(storedToken);
        });

        it('should return undefined when no token stored', async () => {
            // Given: No stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Getting token
            const result = await service.getToken();

            // Then: Should return undefined
            expect(result).toBeUndefined();
        });

        it('should return undefined for invalid JSON', async () => {
            // Given: Invalid JSON in storage
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue('not-valid-json');

            // When: Getting token
            const result = await service.getToken();

            // Then: Should return undefined (not throw)
            expect(result).toBeUndefined();
        });
    });

    describe('clearToken', () => {
        it('should delete token from storage', async () => {
            // Given: Token service
            const service = new GitHubTokenService(mockSecretStorage);

            // When: Clearing token
            await service.clearToken();

            // Then: Token should be deleted
            expect(mockSecretStorage.delete).toHaveBeenCalledWith('github-token');
        });

        it('should invalidate validation cache', async () => {
            // Given: Token service with cached validation
            const service = new GitHubTokenService(mockSecretStorage);
            // Store a token first
            const token = { token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(token));

            // When: Clearing token
            await service.clearToken();

            // Then: Cache should be invalidated (next validation should hit API)
            expect(mockSecretStorage.delete).toHaveBeenCalled();
        });
    });

    describe('validateToken', () => {
        it('should return valid=false when no token stored', async () => {
            // Given: No stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Validating
            const result = await service.validateToken();

            // Then: Should be invalid
            expect(result.valid).toBe(false);
        });
    });

    describe('hasToken', () => {
        it('should return true when token exists', async () => {
            // Given: Stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(JSON.stringify({ token: 'xxx' }));

            // When: Checking token existence
            const result = await service.hasToken();

            // Then: Should return true
            expect(result).toBe(true);
        });

        it('should return false when no token', async () => {
            // Given: No stored token
            const service = new GitHubTokenService(mockSecretStorage);
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Checking token existence
            const result = await service.hasToken();

            // Then: Should return false
            expect(result).toBe(false);
        });
    });
});
