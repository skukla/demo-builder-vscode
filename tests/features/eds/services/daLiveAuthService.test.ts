/**
 * DA.live Auth Service Tests
 *
 * Tests for the DaLiveAuthService token storage functionality.
 * After cleanup, this service is a simple token storage wrapper
 * (PKCE OAuth flow has been removed as it was never functional).
 */

// Mock vscode before imports
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn().mockResolvedValue(true),
    },
    Uri: {
        parse: jest.fn((s: string) => s),
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

import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import type { ExtensionContext } from 'vscode';

describe('DaLiveAuthService', () => {
    let service: DaLiveAuthService;
    let mockContext: ExtensionContext;
    let globalStateStore: Map<string, unknown>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock global state store
        globalStateStore = new Map();

        // Create mock extension context
        mockContext = {
            globalState: {
                get: jest.fn((key: string) => globalStateStore.get(key)),
                update: jest.fn((key: string, value: unknown) => {
                    if (value === undefined) {
                        globalStateStore.delete(key);
                    } else {
                        globalStateStore.set(key, value);
                    }
                    return Promise.resolve();
                }),
            },
        } as unknown as ExtensionContext;

        service = new DaLiveAuthService(mockContext);
    });

    afterEach(() => {
        service.dispose();
    });

    // Helper to create test JWT tokens
    const createTestToken = (payload: object): string => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64');
        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        const signature = 'test-signature';
        return `${header}.${payloadBase64}.${signature}`;
    };

    describe('isAuthenticated', () => {
        it('should return false when no token stored', async () => {
            // Given: Empty globalState (no token)

            // When: isAuthenticated() called
            const result = await service.isAuthenticated();

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false when token is expired', async () => {
            // Given: Token stored with expiration in the past
            const expiredTime = Date.now() - 60 * 60 * 1000; // 1 hour ago
            globalStateStore.set('daLive.accessToken', 'expired-token');
            globalStateStore.set('daLive.tokenExpiration', expiredTime);

            // When: isAuthenticated() called
            const result = await service.isAuthenticated();

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false when token expires within 5 minutes', async () => {
            // Given: Token with expiration in 3 minutes (within 5-min buffer)
            const almostExpired = Date.now() + 3 * 60 * 1000;
            globalStateStore.set('daLive.accessToken', 'almost-expired-token');
            globalStateStore.set('daLive.tokenExpiration', almostExpired);

            // When: isAuthenticated() called
            const result = await service.isAuthenticated();

            // Then: Returns false (considered expired due to 5-min buffer)
            expect(result).toBe(false);
        });

        it('should return true when valid token exists', async () => {
            // Given: Token stored with future expiration (more than 5 min)
            const validExpiration = Date.now() + 60 * 60 * 1000; // 1 hour from now
            globalStateStore.set('daLive.accessToken', 'valid-token');
            globalStateStore.set('daLive.tokenExpiration', validExpiration);

            // When: isAuthenticated() called
            const result = await service.isAuthenticated();

            // Then: Returns true
            expect(result).toBe(true);
        });
    });

    describe('getStoredToken', () => {
        it('should return null when no token stored', async () => {
            // Given: Empty globalState

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null when token is missing expiration', async () => {
            // Given: Token stored without expiration
            globalStateStore.set('daLive.accessToken', 'token-without-expiry');

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null when token is expired', async () => {
            // Given: Token stored with past expiration
            const expiredTime = Date.now() - 60 * 1000; // 1 minute ago
            globalStateStore.set('daLive.accessToken', 'expired-token');
            globalStateStore.set('daLive.tokenExpiration', expiredTime);

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return token info when valid token exists', async () => {
            // Given: Token and expiration in globalState
            const validExpiration = Date.now() + 60 * 60 * 1000; // 1 hour from now
            const email = 'user@example.com';
            globalStateStore.set('daLive.accessToken', 'valid-token');
            globalStateStore.set('daLive.tokenExpiration', validExpiration);
            globalStateStore.set('daLive.userEmail', email);

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns DaLiveTokenInfo object
            expect(result).not.toBeNull();
            expect(result?.accessToken).toBe('valid-token');
            expect(result?.expiresAt).toBe(validExpiration);
            expect(result?.email).toBe(email);
        });

        it('should return token info without email if not stored', async () => {
            // Given: Token without email
            const validExpiration = Date.now() + 60 * 60 * 1000;
            globalStateStore.set('daLive.accessToken', 'valid-token');
            globalStateStore.set('daLive.tokenExpiration', validExpiration);

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns token info without email
            expect(result).not.toBeNull();
            expect(result?.accessToken).toBe('valid-token');
            expect(result?.email).toBeUndefined();
        });
    });

    describe('getAccessToken', () => {
        it('should return null when no token stored', async () => {
            // Given: Empty globalState

            // When: getAccessToken() called
            const result = await service.getAccessToken();

            // Then: Returns null (no auth flow triggered)
            expect(result).toBeNull();
        });

        it('should return null when token is expired', async () => {
            // Given: Expired token in storage
            const expiredTime = Date.now() - 60 * 1000;
            globalStateStore.set('daLive.accessToken', 'expired-token');
            globalStateStore.set('daLive.tokenExpiration', expiredTime);

            // When: getAccessToken() called
            const result = await service.getAccessToken();

            // Then: Returns null (expired tokens not returned)
            expect(result).toBeNull();
        });

        it('should return stored token when valid', async () => {
            // Given: Valid token in storage
            const validExpiration = Date.now() + 60 * 60 * 1000;
            globalStateStore.set('daLive.accessToken', 'valid-access-token');
            globalStateStore.set('daLive.tokenExpiration', validExpiration);

            // When: getAccessToken() called
            const result = await service.getAccessToken();

            // Then: Returns the stored token
            expect(result).toBe('valid-access-token');
        });
    });

    describe('storeToken', () => {
        it('should persist token to globalState', async () => {
            // Given: Valid JWT token string
            const token = createTestToken({
                sub: 'user123',
                created_at: String(Date.now()),
                expires_in: String(3600000), // 1 hour
                email: 'test@example.com',
            });

            // When: storeToken(token) called
            await service.storeToken(token);

            // Then: globalState contains token
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.accessToken',
                token,
            );
        });

        it('should extract and store expiration from JWT payload', async () => {
            // Given: Token with created_at and expires_in
            const createdAt = Date.now();
            const expiresIn = 3600000;
            const token = createTestToken({
                created_at: String(createdAt),
                expires_in: String(expiresIn),
            });

            // When: storeToken called
            await service.storeToken(token);

            // Then: Expiration is calculated and stored
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.tokenExpiration',
                createdAt + expiresIn,
            );
        });

        it('should extract and store email from JWT payload', async () => {
            // Given: Token with email claim
            const token = createTestToken({
                email: 'jwt-user@example.com',
            });

            // When: storeToken called
            await service.storeToken(token);

            // Then: Email is stored
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.userEmail',
                'jwt-user@example.com',
            );
        });
    });

    describe('logout', () => {
        it('should clear all stored token data', async () => {
            // Given: Token stored in globalState
            globalStateStore.set('daLive.accessToken', 'token-to-clear');
            globalStateStore.set('daLive.tokenExpiration', Date.now() + 60000);
            globalStateStore.set('daLive.userEmail', 'user@example.com');

            // When: logout() called
            await service.logout();

            // Then: All token data cleared
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.accessToken',
                undefined,
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.tokenExpiration',
                undefined,
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.userEmail',
                undefined,
            );
        });

        it('should not throw when no token stored', async () => {
            // Given: Empty globalState

            // When/Then: logout() completes without error
            await expect(service.logout()).resolves.not.toThrow();
        });
    });

    describe('dispose', () => {
        it('should complete without error', () => {
            // Given: Service instance exists

            // When/Then: dispose() completes without error
            expect(() => service.dispose()).not.toThrow();
        });

        it('should be callable multiple times', () => {
            // Given: Service instance

            // When/Then: Multiple dispose calls don't throw
            expect(() => {
                service.dispose();
                service.dispose();
            }).not.toThrow();
        });
    });
});
