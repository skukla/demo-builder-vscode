/**
 * DA.live Content Operations Tests - Content Enumeration
 *
 * Tests for DA.live list API content enumeration:
 * - getContentPathsFromDaLive: recursive directory listing
 * - copyContentFromSource: DA.live list API first, CDN index fallback
 *
 * Regression: nav/footer fragments missing from content copy because
 * CDN index doesn't include them and the essentialConfigs whitelist
 * only covers spreadsheets.
 */

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLiveContentOperations';
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

    describe('getContentPathsFromDaLive', () => {
        it('should include nav and footer fragments (regression)', async () => {
            // DA.live list API returns entries with org/site prefix
            jest.spyOn(service, 'listDirectory')
                .mockResolvedValueOnce([
                    // Root-level files including nav and footer fragments
                    { name: 'index.html', path: '/test-org/test-site/index.html', ext: '.html' },
                    { name: 'nav.html', path: '/test-org/test-site/nav.html', ext: '.html' },
                    { name: 'footer.html', path: '/test-org/test-site/footer.html', ext: '.html' },
                    { name: 'about.html', path: '/test-org/test-site/about.html', ext: '.html' },
                    { name: 'placeholders.xlsx', path: '/test-org/test-site/placeholders.xlsx', ext: '.xlsx' },
                ]);

            const paths = await service.getContentPathsFromDaLive('test-org', 'test-site');

            expect(paths).toContain('/nav');
            expect(paths).toContain('/footer');
            expect(paths).toContain('/index');
            expect(paths).toContain('/about');
            expect(paths).toContain('/placeholders');
        });

        it('should recursively list nested directories', async () => {
            jest.spyOn(service, 'listDirectory')
                // Root listing
                .mockResolvedValueOnce([
                    { name: 'index.html', path: '/test-org/test-site/index.html', ext: '.html' },
                    { name: 'nav.html', path: '/test-org/test-site/nav.html', ext: '.html' },
                    // Directory entry (no ext)
                    { name: 'products', path: '/test-org/test-site/products' },
                ])
                // /products listing
                .mockResolvedValueOnce([
                    { name: 'default.html', path: '/test-org/test-site/products/default.html', ext: '.html' },
                    { name: 'catalog.html', path: '/test-org/test-site/products/catalog.html', ext: '.html' },
                ]);

            const paths = await service.getContentPathsFromDaLive('test-org', 'test-site');

            expect(paths).toContain('/index');
            expect(paths).toContain('/nav');
            expect(paths).toContain('/products/default');
            expect(paths).toContain('/products/catalog');
            expect(paths).toHaveLength(4);
        });

        it('should strip file extensions from content paths', async () => {
            jest.spyOn(service, 'listDirectory')
                .mockResolvedValueOnce([
                    { name: 'about.html', path: '/org/site/about.html', ext: '.html' },
                    { name: 'metadata.xlsx', path: '/org/site/metadata.xlsx', ext: '.xlsx' },
                ]);

            const paths = await service.getContentPathsFromDaLive('org', 'site');

            expect(paths).toContain('/about');
            expect(paths).toContain('/metadata');
            // Should NOT contain extensions
            expect(paths).not.toContain('/about.html');
            expect(paths).not.toContain('/metadata.xlsx');
        });

        it('should include only .html and .xlsx files', async () => {
            jest.spyOn(service, 'listDirectory')
                .mockResolvedValueOnce([
                    { name: 'page.html', path: '/org/site/page.html', ext: '.html' },
                    { name: 'data.xlsx', path: '/org/site/data.xlsx', ext: '.xlsx' },
                    { name: 'config.json', path: '/org/site/config.json', ext: '.json' },
                    { name: 'logo.svg', path: '/org/site/logo.svg', ext: '.svg' },
                    { name: 'image.png', path: '/org/site/image.png', ext: '.png' },
                ]);

            const paths = await service.getContentPathsFromDaLive('org', 'site');

            expect(paths).toContain('/page');
            expect(paths).toContain('/data');
            expect(paths).toHaveLength(2);
        });

        it('should return empty array for empty site', async () => {
            jest.spyOn(service, 'listDirectory')
                .mockResolvedValueOnce([]);

            const paths = await service.getContentPathsFromDaLive('org', 'site');

            expect(paths).toEqual([]);
        });

        it('should deeply recurse nested directories', async () => {
            jest.spyOn(service, 'listDirectory')
                // Root
                .mockResolvedValueOnce([
                    { name: '.da', path: '/org/site/.da' },
                ])
                // /.da
                .mockResolvedValueOnce([
                    { name: 'library', path: '/org/site/.da/library' },
                ])
                // /.da/library
                .mockResolvedValueOnce([
                    { name: 'blocks.xlsx', path: '/org/site/.da/library/blocks.xlsx', ext: '.xlsx' },
                    { name: 'blocks', path: '/org/site/.da/library/blocks' },
                ])
                // /.da/library/blocks
                .mockResolvedValueOnce([
                    { name: 'hero.html', path: '/org/site/.da/library/blocks/hero.html', ext: '.html' },
                    { name: 'cards.html', path: '/org/site/.da/library/blocks/cards.html', ext: '.html' },
                ]);

            const paths = await service.getContentPathsFromDaLive('org', 'site');

            expect(paths).toContain('/.da/library/blocks');
            expect(paths).toContain('/.da/library/blocks/hero');
            expect(paths).toContain('/.da/library/blocks/cards');
            expect(paths).toHaveLength(3);
        });
    });

    describe('copyContentFromSource - DA.live list integration', () => {
        it('should use DA.live list API and include nav/footer without essentialConfigs (regression)', async () => {
            // Spy on both enumeration methods
            const listSpy = jest.spyOn(service, 'getContentPathsFromDaLive')
                .mockResolvedValue(['/index', '/nav', '/footer', '/about']);
            const indexSpy = jest.spyOn(service, 'getContentPathsFromIndex');

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
            jest.spyOn(service, 'getContentPathsFromDaLive')
                .mockRejectedValue(new Error('Not authenticated'));
            // CDN index returns pages (but NOT nav/footer — this is the existing limitation)
            jest.spyOn(service, 'getContentPathsFromIndex')
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
            const listSpy = jest.spyOn(service, 'getContentPathsFromDaLive')
                .mockResolvedValue([]);
            const indexSpy = jest.spyOn(service, 'getContentPathsFromIndex')
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
            jest.spyOn(service, 'getContentPathsFromDaLive')
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
            jest.spyOn(service, 'getContentPathsFromDaLive')
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
            jest.spyOn(service, 'getContentPathsFromDaLive')
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
            jest.spyOn(service, 'getContentPathsFromDaLive')
                .mockRejectedValue(new Error('Not authenticated'));
            // CDN index returns pages without nav/footer
            jest.spyOn(service, 'getContentPathsFromIndex')
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

            // 2 from index + 4 spreadsheets + 2 fragments (nav + footer) = 8
            expect(result.totalFiles).toBe(8);

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
    });
});
