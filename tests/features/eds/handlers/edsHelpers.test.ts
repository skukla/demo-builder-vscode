/**
 * EDS Helpers Tests
 *
 * Tests for helper functions extracted from edsHandlers.ts.
 * Follows TDD methodology - tests written BEFORE implementation.
 *
 * Tested functions:
 * - Service cache getters (getGitHubServices, getDaLiveServices, getDaLiveAuthService)
 * - clearServiceCache
 * - validateDaLiveToken (JWT validation for DA.live tokens)
 */

import {
    getGitHubServices,
    getDaLiveServices,
    getDaLiveAuthService,
    clearServiceCache,
    validateDaLiveToken,
} from '@/features/eds/handlers/edsHelpers';
import type { HandlerContext } from '@/types/handlers';
import type { ExtensionContext } from 'vscode';

// Mock the extracted service classes
jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation((secrets) => ({
        secrets,
        mockType: 'GitHubTokenService',
    })),
}));

jest.mock('@/features/eds/services/githubRepoOperations', () => ({
    GitHubRepoOperations: jest.fn().mockImplementation((tokenService) => ({
        tokenService,
        mockType: 'GitHubRepoOperations',
    })),
}));

jest.mock('@/features/eds/services/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation((tokenService) => ({
        tokenService,
        mockType: 'GitHubFileOperations',
    })),
}));

jest.mock('@/features/eds/services/githubOAuthService', () => ({
    GitHubOAuthService: jest.fn().mockImplementation((secrets) => ({
        secrets,
        mockType: 'GitHubOAuthService',
    })),
}));

jest.mock('@/features/eds/services/daLiveOrgOperations', () => ({
    DaLiveOrgOperations: jest.fn().mockImplementation((tokenProvider) => ({
        tokenProvider,
        mockType: 'DaLiveOrgOperations',
    })),
}));

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation((tokenProvider) => ({
        tokenProvider,
        mockType: 'DaLiveContentOperations',
    })),
}));

jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation((context) => ({
        context,
        mockType: 'DaLiveAuthService',
        dispose: jest.fn(),
    })),
}));

// Mock logging
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

/**
 * Creates a mock HandlerContext for testing
 */
function createMockHandlerContext(overrides?: Partial<HandlerContext>): HandlerContext {
    const mockSecrets = {
        get: jest.fn(),
        store: jest.fn(),
        delete: jest.fn(),
        onDidChange: jest.fn(),
    };

    const mockExtensionContext = {
        secrets: mockSecrets,
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn().mockReturnValue([]),
        },
        subscriptions: [],
    } as unknown as ExtensionContext;

    return {
        context: mockExtensionContext,
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        authManager: {
            isAuthenticated: jest.fn(),
            getAccessToken: jest.fn(),
        },
        ...overrides,
    } as unknown as HandlerContext;
}

/**
 * Helper to create a valid JWT for testing
 */
function createTestJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = 'test_signature';
    return `${header}.${body}.${signature}`;
}

describe('edsHelpers', () => {
    beforeEach(() => {
        // Clear service cache before each test
        clearServiceCache();
        jest.clearAllMocks();
    });

    describe('Service Cache - getGitHubServices', () => {
        it('should create GitHub services on first call', () => {
            // Given: A fresh context with no cached services
            const context = createMockHandlerContext();

            // When: Getting the GitHub services
            const services = getGitHubServices(context);

            // Then: Should return an object with all GitHub services
            expect(services).toBeDefined();
            expect(services.tokenService).toBeDefined();
            expect(services.repoOperations).toBeDefined();
            expect(services.fileOperations).toBeDefined();
            expect(services.oauthService).toBeDefined();
        });

        it('should return cached GitHub services on subsequent calls', () => {
            // Given: A context with previously created services
            const context = createMockHandlerContext();
            const firstServices = getGitHubServices(context);

            // When: Getting the services again
            const secondServices = getGitHubServices(context);

            // Then: Should return the same cached instance
            expect(secondServices).toBe(firstServices);
        });

        it('should use context.secrets for GitHubTokenService', () => {
            // Given: A context with specific secrets
            const context = createMockHandlerContext();

            // When: Getting the GitHub services
            const services = getGitHubServices(context);

            // Then: Should pass secrets to the token service
            expect((services.tokenService as unknown as { secrets: unknown }).secrets).toBe(context.context.secrets);
        });
    });

    describe('Service Cache - getDaLiveServices', () => {
        it('should create DA.live services on first call', () => {
            // Given: A fresh context with authManager that has getTokenManager
            const mockTokenManager = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };
            const context = createMockHandlerContext({
                authManager: {
                    getTokenManager: jest.fn().mockReturnValue(mockTokenManager),
                } as unknown as HandlerContext['authManager'],
            });

            // When: Getting the DA.live services
            const services = getDaLiveServices(context);

            // Then: Should return an object with all DA.live services
            expect(services).toBeDefined();
            expect(services.orgOperations).toBeDefined();
            expect(services.contentOperations).toBeDefined();
        });

        it('should return cached DA.live services on subsequent calls', () => {
            // Given: A context with previously created services
            const mockTokenManager = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };
            const context = createMockHandlerContext({
                authManager: {
                    getTokenManager: jest.fn().mockReturnValue(mockTokenManager),
                } as unknown as HandlerContext['authManager'],
            });
            const firstServices = getDaLiveServices(context);

            // When: Getting the services again
            const secondServices = getDaLiveServices(context);

            // Then: Should return the same cached instance
            expect(secondServices).toBe(firstServices);
        });

        it('should throw error when authManager is not available', () => {
            // Given: A context without authManager
            const context = createMockHandlerContext({ authManager: undefined });

            // When/Then: Getting the services should throw
            expect(() => getDaLiveServices(context)).toThrow('Authentication service not available');
        });
    });

    describe('Service Cache - getDaLiveAuthService', () => {
        it('should create DaLiveAuthService on first call', () => {
            // Given: A fresh context
            const context = createMockHandlerContext();

            // When: Getting the DaLive auth service
            const service = getDaLiveAuthService(context);

            // Then: Should return a DaLiveAuthService instance
            expect(service).toBeDefined();
            expect((service as unknown as { mockType: string }).mockType).toBe('DaLiveAuthService');
        });

        it('should return cached DaLiveAuthService on subsequent calls', () => {
            // Given: A context with previously created service
            const context = createMockHandlerContext();
            const firstService = getDaLiveAuthService(context);

            // When: Getting the service again
            const secondService = getDaLiveAuthService(context);

            // Then: Should return the same cached instance
            expect(secondService).toBe(firstService);
        });

        it('should use extension context for DaLiveAuthService', () => {
            // Given: A context with specific extension context
            const context = createMockHandlerContext();

            // When: Getting the DaLive auth service
            const service = getDaLiveAuthService(context);

            // Then: Should pass extension context to the service
            expect((service as unknown as { context: unknown }).context).toBe(context.context);
        });
    });

    describe('clearServiceCache', () => {
        it('should clear cached GitHubServices', () => {
            // Given: Cached GitHub services
            const context = createMockHandlerContext();
            const firstServices = getGitHubServices(context);

            // When: Clearing the cache
            clearServiceCache();

            // Then: Next call should create new instances
            const secondServices = getGitHubServices(context);
            expect(secondServices).not.toBe(firstServices);
        });

        it('should clear cached DaLiveServices', () => {
            // Given: Cached DA.live services
            const mockTokenManager = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };
            const context = createMockHandlerContext({
                authManager: {
                    getTokenManager: jest.fn().mockReturnValue(mockTokenManager),
                } as unknown as HandlerContext['authManager'],
            });
            const firstServices = getDaLiveServices(context);

            // When: Clearing the cache
            clearServiceCache();

            // Then: Next call should create new instances
            const secondServices = getDaLiveServices(context);
            expect(secondServices).not.toBe(firstServices);
        });

        it('should clear cached DaLiveAuthService and call dispose', () => {
            // Given: A cached DaLiveAuthService
            const context = createMockHandlerContext();
            const firstService = getDaLiveAuthService(context);
            const disposeMock = (firstService as unknown as { dispose: jest.Mock }).dispose;

            // When: Clearing the cache
            clearServiceCache();

            // Then: dispose should have been called
            expect(disposeMock).toHaveBeenCalled();

            // And: Next call should create a new instance
            const secondService = getDaLiveAuthService(context);
            expect(secondService).not.toBe(firstService);
        });
    });

    describe('validateDaLiveToken - JWT Format', () => {
        it('should return invalid when token does not start with eyJ', () => {
            // Given: A token with invalid format
            const token = 'invalid-token-format';

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return invalid result
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid token format');
        });

        it('should return invalid for empty token', () => {
            // Given: An empty token
            const token = '';

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return invalid result
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid token format');
        });

        it('should accept valid JWT format starting with eyJ', () => {
            // Given: A valid JWT token format
            const token = createTestJwt({
                email: 'test@adobe.com',
                client_id: 'darkalley',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return valid result
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });
    });

    describe('validateDaLiveToken - Expiry Detection', () => {
        it('should return invalid when token has expired', () => {
            // Given: A token that has already expired
            const pastTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
            const token = createTestJwt({
                email: 'test@adobe.com',
                client_id: 'darkalley',
                created_at: String(pastTime),
                expires_in: String(60 * 60 * 1000), // 1 hour validity
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return invalid with expiry error
            expect(result.valid).toBe(false);
            expect(result.error).toContain('expired');
        });

        it('should return valid when token has not expired', () => {
            // Given: A token that is still valid
            const token = createTestJwt({
                email: 'test@adobe.com',
                client_id: 'darkalley',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000), // 24 hours
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return valid
            expect(result.valid).toBe(true);
        });

        it('should return expiry timestamp when valid', () => {
            // Given: A valid token with known expiry
            const createdAt = Date.now();
            const expiresIn = 24 * 60 * 60 * 1000;
            const expectedExpiry = createdAt + expiresIn;
            const token = createTestJwt({
                email: 'test@adobe.com',
                client_id: 'darkalley',
                created_at: String(createdAt),
                expires_in: String(expiresIn),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return the expiry timestamp
            expect(result.expiresAt).toBe(expectedExpiry);
        });
    });

    describe('validateDaLiveToken - Client ID Validation', () => {
        it('should return invalid when client_id is not darkalley', () => {
            // Given: A token from a different client
            const token = createTestJwt({
                email: 'test@adobe.com',
                client_id: 'wrong-client',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return invalid with client_id error
            expect(result.valid).toBe(false);
            expect(result.error).toContain('not from DA.live');
        });

        it('should accept token with darkalley client_id', () => {
            // Given: A valid token from darkalley client
            const token = createTestJwt({
                email: 'test@adobe.com',
                client_id: 'darkalley',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return valid
            expect(result.valid).toBe(true);
        });

        it('should accept token without client_id (no validation needed)', () => {
            // Given: A token without client_id (legacy token)
            const token = createTestJwt({
                email: 'test@adobe.com',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return valid (no client_id validation needed)
            expect(result.valid).toBe(true);
        });
    });

    describe('validateDaLiveToken - Email Extraction', () => {
        it('should extract email from token payload', () => {
            // Given: A token with email in payload
            const expectedEmail = 'user@adobe.com';
            const token = createTestJwt({
                email: expectedEmail,
                client_id: 'darkalley',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should extract the email
            expect(result.email).toBe(expectedEmail);
        });

        it('should extract preferred_username as email fallback', () => {
            // Given: A token with preferred_username instead of email
            const expectedEmail = 'preferred@adobe.com';
            const token = createTestJwt({
                preferred_username: expectedEmail,
                client_id: 'darkalley',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should extract preferred_username as email
            expect(result.email).toBe(expectedEmail);
        });

        it('should return undefined email when not present in payload', () => {
            // Given: A token without email fields
            const token = createTestJwt({
                client_id: 'darkalley',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return valid with undefined email
            expect(result.valid).toBe(true);
            expect(result.email).toBeUndefined();
        });
    });

    describe('validateDaLiveToken - Edge Cases', () => {
        it('should handle token with invalid base64 encoding gracefully', () => {
            // Given: A token that looks like JWT but has invalid base64
            const token = 'eyJhbGciOiJSUzI1NiJ9.!!!invalid-base64!!!.signature';

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should return valid (continues despite parsing error)
            // The original behavior continues without extracting details
            expect(result.valid).toBe(true);
            expect(result.email).toBeUndefined();
        });

        it('should handle token with only two parts', () => {
            // Given: A token with only header and payload (no signature)
            const token = 'eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6InRlc3RAYWRvYmUuY29tIn0';

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should still validate (signature not checked by this function)
            expect(result.valid).toBe(true);
        });

        it('should prioritize email over preferred_username', () => {
            // Given: A token with both email and preferred_username
            const token = createTestJwt({
                email: 'primary@adobe.com',
                preferred_username: 'fallback@adobe.com',
                client_id: 'darkalley',
                created_at: String(Date.now()),
                expires_in: String(24 * 60 * 60 * 1000),
            });

            // When: Validating the token
            const result = validateDaLiveToken(token);

            // Then: Should use email field
            expect(result.email).toBe('primary@adobe.com');
        });
    });
});
