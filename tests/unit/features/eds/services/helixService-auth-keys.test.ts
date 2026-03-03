/**
 * HelixService Tests - Auth & Keys
 *
 * Tests for authentication and key management:
 * - DA.live Token Provider
 * - Admin API Key Caching
 * - unpublishPages retry on auth failure
 */

// Mock vscode module
jest.mock('vscode');

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
    Logger: jest.fn(() => mockLogger),
}));

// Mock timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
        NORMAL: 30000,
        LONG: 180000,
        VERY_LONG: 300000,
    },
    CACHE_TTL: {
        SHORT: 60000,
        MEDIUM: 300000,
        LONG: 3600000,
    },
}));

// Mock DA.live content operations
const mockListDirectory = jest.fn();
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        listDirectory: mockListDirectory,
    })),
}));

type HelixServiceType = import('@/features/eds/services/helixService').HelixService;

interface MockGitHubTokenService {
    getToken: jest.Mock;
    validateToken: jest.Mock;
}

interface MockDaLiveTokenProvider {
    getAccessToken: jest.Mock<Promise<string | null>>;
}

describe('HelixService - Auth & Keys', () => {
    let service: HelixServiceType;
    let mockGitHubTokenService: MockGitHubTokenService;
    let mockDaLiveTokenProvider: MockDaLiveTokenProvider;
    let mockFetch: jest.Mock;
    const originalFetch = global.fetch;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockListDirectory.mockReset();

        mockGitHubTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'valid-github-token', tokenType: 'bearer', scopes: ['repo'] }),
            validateToken: jest.fn().mockResolvedValue({ valid: true }),
        };

        mockDaLiveTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('valid-dalive-ims-token'),
        };

        mockFetch = jest.fn();
        global.fetch = mockFetch;

        const module = await import('@/features/eds/services/helixService');
        service = new module.HelixService(undefined, mockGitHubTokenService, mockDaLiveTokenProvider);
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('DA.live Token Provider', () => {
        it('should use DA.live token for x-content-source-authorization when provided', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            await service.previewPage('testuser', 'my-site', '/products');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-content-source-authorization': 'Bearer valid-dalive-ims-token',
                    }),
                }),
            );
            expect(mockFetch).not.toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-content-source-authorization': 'Bearer valid-adobe-ims-token',
                    }),
                }),
            );
        });

        it('should throw error when DA.live token provider not configured', async () => {
            const module = await import('@/features/eds/services/helixService');
            const serviceWithoutDaLiveProvider = new module.HelixService(undefined, mockGitHubTokenService);
            await expect(serviceWithoutDaLiveProvider.previewPage('testuser', 'my-site', '/products')).rejects.toThrow(
                /DA\.live token provider not configured/i,
            );
        });

        it('should throw error when DA.live token provider returns null', async () => {
            mockDaLiveTokenProvider.getAccessToken.mockResolvedValue(null);
            await expect(service.previewPage('testuser', 'my-site', '/')).rejects.toThrow(/DA\.live session expired/i);
        });

        it('should use DA.live token for bulk preview operations', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
            await service.previewAllContent('testuser', 'my-site');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-content-source-authorization': 'Bearer valid-dalive-ims-token',
                    }),
                }),
            );
        });

        it('should use DA.live token for bulk publish operations', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
            await service.publishAllContent('testuser', 'my-site');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-content-source-authorization': 'Bearer valid-dalive-ims-token',
                    }),
                }),
            );
        });
    });

    describe('Admin API Key Caching', () => {
        let HelixServiceClass: typeof import('@/features/eds/services/helixService').HelixService;

        beforeEach(async () => {
            const module = await import('@/features/eds/services/helixService');
            HelixServiceClass = module.HelixService;
            HelixServiceClass.clearApiKeyCache();
        });

        it('should cache API key and reuse on subsequent calls', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true, status: 200,
                json: () => Promise.resolve({ id: 'key-1', value: 'api-key-value-1', expiration: '2027-01-01T00:00:00Z' }),
            });
            const key1 = await service.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(key1).toBe('api-key-value-1');

            const key2 = await service.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(key2).toBe('api-key-value-1');
        });

        it('should create separate keys for different org/site combinations', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-1', value: 'key-for-site-a', expiration: '2027-01-01T00:00:00Z' }) })
                .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-2', value: 'key-for-site-b', expiration: '2027-01-01T00:00:00Z' }) });

            const keyA = await service.createAdminApiKey('org-a', 'site-a');
            const keyB = await service.createAdminApiKey('org-b', 'site-b');
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(keyA).toBe('key-for-site-a');
            expect(keyB).toBe('key-for-site-b');
        });

        it('should not cache failed key creation (null result)', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });
            mockFetch.mockResolvedValueOnce({
                ok: true, status: 200,
                json: () => Promise.resolve({ id: 'key-1', value: 'api-key-after-retry', expiration: '2027-01-01T00:00:00Z' }),
            });

            const key1 = await service.createAdminApiKey('testorg', 'testsite');
            expect(key1).toBeNull();
            const key2 = await service.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(key2).toBe('api-key-after-retry');
        });

        it('should create new key when cached key expires', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-1', value: 'old-key', expiration: '2027-01-01T00:00:00Z' }) })
                .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-2', value: 'new-key', expiration: '2027-01-01T00:00:00Z' }) });

            await service.createAdminApiKey('testorg', 'testsite');
            const originalDateNow = Date.now;
            Date.now = () => originalDateNow() + 2 * 60 * 60 * 1000;
            try {
                const key2 = await service.createAdminApiKey('testorg', 'testsite');
                expect(mockFetch).toHaveBeenCalledTimes(2);
                expect(key2).toBe('new-key');
            } finally {
                Date.now = originalDateNow;
            }
        });

        it('should clear all cached keys via clearApiKeyCache', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-1', value: 'cached-key', expiration: '2027-01-01T00:00:00Z' }) });
            await service.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            HelixServiceClass.clearApiKeyCache();
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-2', value: 'fresh-key', expiration: '2027-01-01T00:00:00Z' }) });
            const key = await service.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(key).toBe('fresh-key');
        });

        it('should share cache across HelixService instances', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-1', value: 'shared-key', expiration: '2027-01-01T00:00:00Z' }) });
            await service.createAdminApiKey('testorg', 'testsite');

            const service2 = new HelixServiceClass(undefined, mockGitHubTokenService, mockDaLiveTokenProvider);
            const key = await service2.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(key).toBe('shared-key');
        });
    });

    describe('unpublishPages (page-by-page)', () => {
        it('should return early for empty paths', async () => {
            const result = await service.unpublishPages('testorg', 'testsite', 'main', []);
            expect(result).toEqual({ success: true, count: 0 });
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should unpublish live and delete preview for each path', async () => {
            // DELETE /live/.../about → 204 (unpublished)
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            // DELETE /preview/.../about → 204 (deleted)
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about']);
            expect(result).toEqual({ success: true, count: 1 });
            expect(mockFetch).toHaveBeenCalledTimes(2);

            // Verify live DELETE uses DA.live Bearer token auth
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/live/testorg/testsite/main/about'),
                expect.objectContaining({
                    method: 'DELETE',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer valid-dalive-ims-token',
                    }),
                }),
            );
        });

        it('should handle multiple paths', async () => {
            // Live DELETE for /about and /products
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            // Preview DELETE for /about and /products
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about', '/products']);
            expect(result).toEqual({ success: true, count: 2 });
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });

        it('should report partial success when some pages fail', async () => {
            // Live DELETE: /about succeeds, /products fails (403)
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            // Preview DELETE: both succeed
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about', '/products']);
            expect(result).toEqual({ success: true, count: 2 });
        });

        it('should return failure when all pages fail', async () => {
            // Live DELETE: both fail (403)
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            // Preview DELETE: both fail (403)
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about', '/products']);
            expect(result).toEqual({ success: false, count: 0 });
        });

        it('should treat 404 as successful (already deleted)', async () => {
            // Live DELETE returns 404 (already gone)
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            // Preview DELETE returns 404
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about']);
            expect(result).toEqual({ success: true, count: 1 });
        });
    });
});
