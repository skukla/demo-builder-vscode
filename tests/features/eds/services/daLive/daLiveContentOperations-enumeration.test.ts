/**
 * DA.live Content Operations Tests - Content Enumeration
 *
 * Tests for copyContentFromSource: DA.live list API first, CDN index fallback.
 * (The raw getContentPathsFromDaLive enumerator moved to
 * daLiveContentDiscovery.test.ts; here it is spied to drive the copy flow.)
 *
 * Regression: nav/footer fragments missing from content copy because
 * CDN index doesn't include them and the essentialConfigs whitelist
 * only covers spreadsheets.
 */

import type { DaLiveContentDiscovery } from '@/features/eds/services/daLive/daLiveContentDiscovery';
import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import type { Logger } from '@/types/logger';

// Mock the timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DaLiveContentOperations - Content Enumeration', () => {
    let service: DaLiveContentOperations;
    let discovery: DaLiveContentDiscovery;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
        };

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
        discovery = (service as unknown as { discoveryOps: DaLiveContentDiscovery }).discoveryOps;
    });

    function mockFetchResponse(status: number, body?: unknown, contentType = 'text/html'): Response {
        const headers = new Map([['content-type', contentType]]);
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
            headers: {
                get: (key: string) => headers.get(key.toLowerCase()) || null,
            } as unknown as Headers,
            json: jest.fn().mockResolvedValue(body),
            blob: jest.fn().mockResolvedValue(new Blob(['test content'])),
            text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
        } as unknown as Response;
    }

    describe('copyContentFromSource - DA.live list integration', () => {
        it('should use DA.live list API and include nav/footer without essentialConfigs (regression)', async () => {
            // Spy on both enumeration methods
            const listSpy = jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockResolvedValue(['/index', '/nav', '/footer', '/about']);
            const indexSpy = jest.spyOn(discovery, 'getContentPathsFromIndex');

            // Mock copySingleFile responses (token + per-file copy)
            mockFetch.mockResolvedValue(mockFetchResponse(200));

            const result = await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // DA.live list should be used first
            expect(listSpy).toHaveBeenCalledWith('source-org', 'source-site');
            // CDN index should NOT be called
            expect(indexSpy).not.toHaveBeenCalled();
            // All 4 files should be processed (nav + footer included)
            expect(result.totalFiles).toBe(4);
        });

        it('should fall back to CDN index when DA.live list fails', async () => {
            // DA.live list fails (auth error)
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockRejectedValue(new Error('Not authenticated'));
            // CDN index returns pages (but NOT nav/footer — this is the existing limitation)
            jest.spyOn(discovery, 'getContentPathsFromIndex')
                .mockResolvedValue(['/index', '/about']);

            // Mock essential config HEAD checks + copy responses
            mockFetch.mockResolvedValue(mockFetchResponse(200));

            const result = await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            expect(result.totalFiles).toBeGreaterThanOrEqual(2);
            // Should log the fallback
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('falling back'),
            );
        });

        it('should fall back to CDN index when DA.live list returns 0 files (inaccessible org)', async () => {
            // DA.live list succeeds but returns 0 files (user lacks access to source org)
            const listSpy = jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockResolvedValue([]);
            const indexSpy = jest.spyOn(discovery, 'getContentPathsFromIndex')
                .mockResolvedValue(['/index', '/about', '/apparel']);

            // Mock HEAD checks + copy responses
            mockFetch.mockResolvedValue(mockFetchResponse(200));

            const result = await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            expect(listSpy).toHaveBeenCalled();
            expect(indexSpy).toHaveBeenCalled();
            // 3 from index + essential configs/fragments from HEAD checks
            expect(result.totalFiles).toBeGreaterThanOrEqual(3);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('List API returned 0 files'),
            );
        });

        it('should skip essentialConfigs when DA.live list succeeds', async () => {
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockResolvedValue(['/index', '/placeholders', '/nav']);

            mockFetch.mockResolvedValue(mockFetchResponse(200));

            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // No HEAD requests for essentialConfigs paths — DA.live list already found them
            // Note: isSpreadsheetPath makes its own HEAD requests, so filter to essentialConfigs URLs only
            const essentialConfigUrls = ['/redirects.json', '/metadata.json', '/sitemap.json'];
            const essentialConfigHeadCalls = mockFetch.mock.calls.filter(
                ([url, opts]: [string, RequestInit | undefined]) =>
                    opts?.method === 'HEAD' && essentialConfigUrls.some(p => (url as string).endsWith(p)),
            );
            expect(essentialConfigHeadCalls).toHaveLength(0);
        });

        it('should still apply product overlay filter with DA.live list', async () => {
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockResolvedValue([
                    '/index',
                    '/products/default',
                    '/products/overlay-1',
                    '/products/overlay-2',
                ]);

            mockFetch.mockResolvedValue(mockFetchResponse(200));

            const result = await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // Product overlays filtered out, only /products/default kept
            expect(result.totalFiles).toBe(2); // /index + /products/default
        });

        it('should still apply library index filter with DA.live list', async () => {
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockResolvedValue([
                    '/index',
                    '/.da/library/blocks',
                    '/.da/library/blocks/hero',
                ]);

            mockFetch.mockResolvedValue(mockFetchResponse(200));

            const result = await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // /.da/library/blocks excluded (index), but hero page kept
            expect(result.totalFiles).toBe(2); // /index + /.da/library/blocks/hero
        });

        it('should add nav/footer via CDN HEAD checks in fallback path (regression)', async () => {
            // DA.live list fails
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockRejectedValue(new Error('Not authenticated'));
            // CDN index returns pages without nav/footer
            jest.spyOn(discovery, 'getContentPathsFromIndex')
                .mockResolvedValue(['/index', '/about']);

            // URL-based mock: HEAD requests return 200 for nav/footer
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (options?.method === 'HEAD') {
                    // All HEAD checks succeed (nav, footer, spreadsheets)
                    return mockFetchResponse(200);
                }
                // Copy operations succeed
                return mockFetchResponse(200);
            });

            const result = await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // 2 from index + 4 spreadsheets + 3 fragments (nav, footer,
            // /customer/sidebar-fragment) + 3 auth pages = 12
            expect(result.totalFiles).toBe(12);

            // Verify HEAD requests were made for nav and footer
            const headCalls = mockFetch.mock.calls
                .filter(([, opts]: [string, RequestInit | undefined]) => opts?.method === 'HEAD')
                .map(([url]: [string]) => url);
            expect(headCalls).toContainEqual(
                expect.stringContaining('/nav'),
            );
            expect(headCalls).toContainEqual(
                expect.stringContaining('/footer'),
            );
        });

        it('should add customer auth pages via CDN HEAD checks in fallback path (regression: auth 404s)', async () => {
            // DA.live list fails — triggers CDN index fallback
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockRejectedValue(new Error('Not authenticated'));
            // CDN index returns pages WITHOUT customer auth pages (not in sitemap)
            jest.spyOn(discovery, 'getContentPathsFromIndex')
                .mockResolvedValue(['/index', '/about']);

            // URL-based mock: customer/login exists, customer/account returns 404
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (options?.method === 'HEAD') {
                    if ((url as string).includes('/customer/login')) {
                        return mockFetchResponse(200);
                    }
                    if ((url as string).includes('/customer/account')) {
                        return mockFetchResponse(404);
                    }
                    // Spreadsheets and fragments succeed
                    return mockFetchResponse(200);
                }
                // Copy operations succeed
                return mockFetchResponse(200);
            });

            const result = await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // 2 from index + 4 spreadsheets + 3 fragments (nav, footer,
            // /customer/sidebar-fragment HEADs 200) + 2 auth (login + create-account)
            // = 11 copied + 1 stub (account returned 404) = 12 total
            expect(result.totalFiles).toBe(12);

            // Verify HEAD requests were made for customer auth pages
            const headCalls = mockFetch.mock.calls
                .filter(([, opts]: [string, RequestInit | undefined]) => opts?.method === 'HEAD')
                .map(([url]: [string]) => url);
            expect(headCalls).toContainEqual(
                expect.stringContaining('/customer/login'),
            );
            expect(headCalls).toContainEqual(
                expect.stringContaining('/customer/account'),
            );
        });

        it('should skip customer auth page probing when DA.live list succeeds', async () => {
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockResolvedValue(['/index', '/customer/login', '/customer/account', '/nav']);

            mockFetch.mockResolvedValue(mockFetchResponse(200));

            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // No HEAD requests for customer auth page probing — DA.live list already found them
            // Exclude .json URLs which come from isSpreadsheetPath checks (unrelated)
            const customerAuthProbes = mockFetch.mock.calls.filter(
                ([url, opts]: [string, RequestInit | undefined]) =>
                    opts?.method === 'HEAD' &&
                    (url as string).includes('/customer/') &&
                    !(url as string).endsWith('.json'),
            );
            expect(customerAuthProbes).toHaveLength(0);
        });

        it('should create stub with correct block markup for create-account page (not on source)', async () => {
            // DA.live list fails — triggers CDN index fallback
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockRejectedValue(new Error('Not authenticated'));
            jest.spyOn(discovery, 'getContentPathsFromIndex')
                .mockResolvedValue(['/index']);

            const postCalls: Array<{ url: string; body: FormData | null }> = [];

            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (options?.method === 'HEAD') {
                    // login and account exist on source, create-account does NOT
                    if ((url as string).includes('/customer/login') || (url as string).includes('/customer/account')) {
                        return mockFetchResponse(200);
                    }
                    if ((url as string).includes('/customer/create-account')) {
                        return mockFetchResponse(404);
                    }
                    return mockFetchResponse(200);
                }
                if (options?.method === 'POST') {
                    postCalls.push({ url: url as string, body: options.body as FormData | null });
                }
                return mockFetchResponse(200);
            });

            const result = await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // Stub should be created via POST to DA.live /source endpoint
            const stubPost = postCalls.find(p => p.url.includes('create-account'));
            expect(stubPost).toBeDefined();
            expect(stubPost!.url).toContain('/source/dest-org/dest-site/customer/create-account.html');

            // copiedFiles should include the stub
            expect(result.copiedFiles).toContainEqual('/customer/create-account');

            // Log should confirm stub creation with block class
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Created stub page for /customer/create-account'),
            );
        });

        it('should NOT create stubs for auth pages that exist on source', async () => {
            // DA.live list fails — triggers CDN index fallback
            jest.spyOn(discovery, 'getContentPathsFromDaLive')
                .mockRejectedValue(new Error('Not authenticated'));
            jest.spyOn(discovery, 'getContentPathsFromIndex')
                .mockResolvedValue(['/index']);

            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (options?.method === 'HEAD') {
                    // ALL auth pages exist on source
                    return mockFetchResponse(200);
                }
                return mockFetchResponse(200);
            });

            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // No stub creation — all auth pages were copied from source
            expect(mockLogger.info).not.toHaveBeenCalledWith(
                expect.stringContaining('Created stub'),
            );
        });
    });
});
