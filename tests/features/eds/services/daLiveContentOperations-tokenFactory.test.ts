/**
 * Tests for createDaLiveServiceTokenProvider factory
 *
 * Verifies the factory that wraps a DaLiveAuthService (or any object
 * with getAccessToken) into a TokenProvider interface.
 */

import {
    createDaLiveServiceTokenProvider,
    type TokenProvider,
} from '@/features/eds/services/daLiveContentOperations';

// Mock the timeout config (required by daLiveContentOperations module)
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { NORMAL: 30000, QUICK: 5000 },
}));

describe('createDaLiveServiceTokenProvider', () => {
    it('should return a TokenProvider object', () => {
        // Given: An auth service with getAccessToken
        const authService = { getAccessToken: jest.fn().mockResolvedValue('test-token') };

        // When: Creating a token provider
        const provider = createDaLiveServiceTokenProvider(authService);

        // Then: Should return an object with getAccessToken
        expect(provider).toBeDefined();
        expect(typeof provider.getAccessToken).toBe('function');
    });

    it('should delegate getAccessToken to the auth service', async () => {
        // Given: An auth service that returns a specific token
        const expectedToken = 'my-dalive-token-123';
        const authService = { getAccessToken: jest.fn().mockResolvedValue(expectedToken) };
        const provider = createDaLiveServiceTokenProvider(authService);

        // When: Calling getAccessToken on the provider
        const token = await provider.getAccessToken();

        // Then: Should return the token from the auth service
        expect(token).toBe(expectedToken);
        expect(authService.getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from the auth service', async () => {
        // Given: An auth service that rejects
        const authService = {
            getAccessToken: jest.fn().mockRejectedValue(new Error('Token expired')),
        };
        const provider = createDaLiveServiceTokenProvider(authService);

        // When/Then: Should propagate the error
        await expect(provider.getAccessToken()).rejects.toThrow('Token expired');
    });

    it('should work with any object matching the interface (duck typing)', async () => {
        // Given: A plain object (not a DaLiveAuthService instance) with getAccessToken
        const plainAdapter = {
            getAccessToken: async () => 'duck-typed-token',
            someOtherMethod: () => 'ignored',
        };
        const provider = createDaLiveServiceTokenProvider(plainAdapter);

        // When: Calling getAccessToken
        const token = await provider.getAccessToken();

        // Then: Should work with duck-typed objects
        expect(token).toBe('duck-typed-token');
    });

    it('should satisfy the TokenProvider interface', () => {
        // Given: An auth service
        const authService = { getAccessToken: jest.fn().mockResolvedValue('token') };

        // When: Creating a provider
        const provider = createDaLiveServiceTokenProvider(authService);

        // Then: Should be assignable to TokenProvider
        const tokenProvider: TokenProvider = provider;
        expect(tokenProvider.getAccessToken).toBeDefined();
    });
});
