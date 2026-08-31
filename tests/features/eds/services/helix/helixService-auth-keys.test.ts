/**
 * HelixService Tests - Auth & Keys
 *
 * Tests for authentication and key management:
 * - DA.live Token Provider
 * - Admin API Key Caching
 * - unpublishPages retry on auth failure
 */

import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import { createMockLogger } from '../../../../helpers/loggerFake';

// Mock vscode module

// Mock logging
const mockLogger = createMockLogger();
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
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        listDirectory: mockListDirectory,
    })),
}));

type HelixServiceType = import('@/features/eds/services/helix/helixService').HelixService;

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

        const module = await import('@/features/eds/services/helix/helixService');
        service = new module.HelixService(undefined, mockGitHubTokenService as unknown as GitHubTokenService, mockDaLiveTokenProvider);
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
            const module = await import('@/features/eds/services/helix/helixService');
            const serviceWithoutDaLiveProvider = new module.HelixService(undefined, mockGitHubTokenService as unknown as GitHubTokenService);
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
        let HelixServiceClass: typeof import('@/features/eds/services/helix/helixService').HelixService;

        beforeEach(async () => {
            const module = await import('@/features/eds/services/helix/helixService');
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

            const service2 = new HelixServiceClass(undefined, mockGitHubTokenService as unknown as GitHubTokenService, mockDaLiveTokenProvider);
            const key = await service2.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(key).toBe('shared-key');
        });
    });

    describe('unpublishPages (page-by-page)', () => {
        it('should return early for empty paths', async () => {
            const result = await service.unpublishPages('testorg', 'testsite', 'main', []);
            expect(result).toMatchObject({ success: true, count: 0 });
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should unpublish live and delete preview for each path', async () => {
            // DELETE /live/.../about → 204 (unpublished)
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            // DELETE /preview/.../about → 204 (deleted)
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about']);
            expect(result).toMatchObject({ success: true, count: 1 });
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
            expect(result).toMatchObject({ success: true, count: 2 });
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
            expect(result).toMatchObject({ success: true, count: 2 });
        });

        /**
         * `success` is `liveCount > 0 || previewCount > 0`, so ONE path out of 52
         * returns true — and the reset caller discarded the result entirely
         * (`edsPipeline.ts:273` wraps it in a try/catch that can never fire,
         * because this never throws). A run where all 52 live deletes 403'd
         * reported a successful reset while the stale pages kept serving.
         *
         * The counts make that answerable without changing `success`, whose
         * "did anything unpublish" meaning is what the DELETE path wants.
         * `liveFailed` is the one users feel: the live entry is what serves.
         */
        it('reports live and preview failure counts, not just an aggregate', async () => {
            // Live: /about ok, /products 403.  Preview: both ok.
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about', '/products']);

            expect(result).toMatchObject({ total: 2, liveFailed: 1, previewFailed: 0 });
            // The aggregate still says "true" — which is exactly why it is not enough.
            expect(result.success).toBe(true);
        });

        it('reports every path as failed when the credential is refused throughout', async () => {
            for (let i = 0; i < 4; i++) {
                mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            }

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about', '/products']);

            expect(result).toMatchObject({ total: 2, liveFailed: 2, previewFailed: 2 });
        });

        it('should return failure when all pages fail', async () => {
            // Live DELETE: both fail (403)
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            // Preview DELETE: both fail (403)
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about', '/products']);
            expect(result).toMatchObject({ success: false, count: 0 });
        });

        it('should treat 404 as successful (already deleted)', async () => {
            // Live DELETE returns 404 (already gone)
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            // Preview DELETE returns 404
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about']);
            expect(result).toMatchObject({ success: true, count: 1 });
        });
    });
});

// The DA.live session is a per-host singleton. Two construction sites once
// omitted the provider, so a Helix code publish went out with only the GitHub
// token and 401'd on any admin-locked site — silently leaving the CDN serving a
// stale config.json (2026-08-15). Registering ONE default at activation fixes
// every construction site at once, including future ones.
describe('HelixService - default DA.live token provider', () => {
    let HelixSvc: typeof import('@/features/eds/services/helix/helixService').HelixService;
    // previewPage needs BOTH credentials; only the DA.live one is under test.
    const githubTokens = {
        getToken: jest.fn().mockResolvedValue({ token: 'gh', tokenType: 'bearer', scopes: ['repo'] }),
    } as never;

    beforeEach(async () => {
        jest.clearAllMocks();
        HelixSvc = (await import('@/features/eds/services/helix/helixService')).HelixService;
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    });

    afterEach(() => HelixSvc.clearDefaultDaLiveTokenProvider());

    it('falls back to the registered default when constructed without a provider', async () => {
        const getAccessToken = jest.fn().mockResolvedValue('default-da-live-token');
        HelixSvc.setDefaultDaLiveTokenProvider({ getAccessToken });

        await new HelixSvc(undefined, githubTokens).previewPage('org', 'site', '/x');

        expect(getAccessToken).toHaveBeenCalled();
        const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
        expect(opts.headers.Authorization).toBe('Bearer default-da-live-token');
    });

    it('prefers an explicitly constructed provider over the default', async () => {
        HelixSvc.setDefaultDaLiveTokenProvider({
            getAccessToken: jest.fn().mockResolvedValue('default-token'),
        });
        const explicit = { getAccessToken: jest.fn().mockResolvedValue('explicit-token') };

        await new HelixSvc(undefined, githubTokens, explicit).previewPage('org', 'site', '/x');

        const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
        expect(opts.headers.Authorization).toBe('Bearer explicit-token');
    });
});
