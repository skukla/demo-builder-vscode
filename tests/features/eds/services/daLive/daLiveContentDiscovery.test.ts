/**
 * DaLiveContentDiscovery Tests — content-path enumeration.
 *
 * Covers the two raw enumerators extracted from DaLiveContentOperations:
 * - getContentPathsFromDaLive: recursive DA.live list-API directory walk
 * - getContentPathsFromIndex: CDN content-index (full-index.json) read
 *
 * Regression origin: nav/footer fragments missing from content copy because
 * the CDN index doesn't include them (the DA.live list walk does).
 */

import { DaLiveContentDiscovery } from '@/features/eds/services/daLive/daLiveContentDiscovery';
import type { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';
import type { DaLiveEntry } from '@/features/eds/services/types';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DaLiveContentDiscovery', () => {
    let discovery: DaLiveContentDiscovery;
    let mockListDirectory: jest.Mock<Promise<DaLiveEntry[]>>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockListDirectory = jest.fn();
        const sourceOps = { listDirectory: mockListDirectory } as unknown as DaLiveSourceOperations;
        discovery = new DaLiveContentDiscovery(sourceOps);
    });

    function mockFetchResponse(status: number, body?: unknown): Response {
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
            json: jest.fn().mockResolvedValue(body),
        } as unknown as Response;
    }

    describe('getContentPathsFromDaLive', () => {
        it('should include nav and footer fragments (regression)', async () => {
            // DA.live list API returns entries with org/site prefix
            mockListDirectory.mockResolvedValueOnce([
                // Root-level files including nav and footer fragments
                { name: 'index.html', path: '/test-org/test-site/index.html', ext: '.html' },
                { name: 'nav.html', path: '/test-org/test-site/nav.html', ext: '.html' },
                { name: 'footer.html', path: '/test-org/test-site/footer.html', ext: '.html' },
                { name: 'about.html', path: '/test-org/test-site/about.html', ext: '.html' },
                {
                    name: 'placeholders.xlsx',
                    path: '/test-org/test-site/placeholders.xlsx',
                    ext: '.xlsx',
                },
            ]);

            const paths = await discovery.getContentPathsFromDaLive('test-org', 'test-site');

            expect(paths).toContain('/nav');
            expect(paths).toContain('/footer');
            expect(paths).toContain('/index');
            expect(paths).toContain('/about');
            expect(paths).toContain('/placeholders');
        });

        it('should recursively list nested directories', async () => {
            mockListDirectory
                // Root listing
                .mockResolvedValueOnce([
                    { name: 'index.html', path: '/test-org/test-site/index.html', ext: '.html' },
                    { name: 'nav.html', path: '/test-org/test-site/nav.html', ext: '.html' },
                    // Directory entry (no ext)
                    { name: 'products', path: '/test-org/test-site/products' },
                ])
                // /products listing
                .mockResolvedValueOnce([
                    {
                        name: 'default.html',
                        path: '/test-org/test-site/products/default.html',
                        ext: '.html',
                    },
                    {
                        name: 'catalog.html',
                        path: '/test-org/test-site/products/catalog.html',
                        ext: '.html',
                    },
                ]);

            const paths = await discovery.getContentPathsFromDaLive('test-org', 'test-site');

            expect(paths).toContain('/index');
            expect(paths).toContain('/nav');
            expect(paths).toContain('/products/default');
            expect(paths).toContain('/products/catalog');
            expect(paths).toHaveLength(4);
        });

        it('should strip file extensions from content paths', async () => {
            mockListDirectory.mockResolvedValueOnce([
                { name: 'about.html', path: '/org/site/about.html', ext: '.html' },
                { name: 'metadata.xlsx', path: '/org/site/metadata.xlsx', ext: '.xlsx' },
            ]);

            const paths = await discovery.getContentPathsFromDaLive('org', 'site');

            expect(paths).toContain('/about');
            expect(paths).toContain('/metadata');
            // Should NOT contain extensions
            expect(paths).not.toContain('/about.html');
            expect(paths).not.toContain('/metadata.xlsx');
        });

        it('should include only .html and .xlsx files', async () => {
            mockListDirectory.mockResolvedValueOnce([
                { name: 'page.html', path: '/org/site/page.html', ext: '.html' },
                { name: 'data.xlsx', path: '/org/site/data.xlsx', ext: '.xlsx' },
                { name: 'config.json', path: '/org/site/config.json', ext: '.json' },
                { name: 'logo.svg', path: '/org/site/logo.svg', ext: '.svg' },
                { name: 'image.png', path: '/org/site/image.png', ext: '.png' },
            ]);

            const paths = await discovery.getContentPathsFromDaLive('org', 'site');

            expect(paths).toContain('/page');
            expect(paths).toContain('/data');
            expect(paths).toHaveLength(2);
        });

        it('should return empty array for empty site', async () => {
            mockListDirectory.mockResolvedValueOnce([]);

            const paths = await discovery.getContentPathsFromDaLive('org', 'site');

            expect(paths).toEqual([]);
        });

        it('should deeply recurse nested directories', async () => {
            mockListDirectory
                // Root
                .mockResolvedValueOnce([{ name: '.da', path: '/org/site/.da' }])
                // /.da
                .mockResolvedValueOnce([{ name: 'library', path: '/org/site/.da/library' }])
                // /.da/library
                .mockResolvedValueOnce([
                    {
                        name: 'blocks.xlsx',
                        path: '/org/site/.da/library/blocks.xlsx',
                        ext: '.xlsx',
                    },
                    { name: 'blocks', path: '/org/site/.da/library/blocks' },
                ])
                // /.da/library/blocks
                .mockResolvedValueOnce([
                    {
                        name: 'hero.html',
                        path: '/org/site/.da/library/blocks/hero.html',
                        ext: '.html',
                    },
                    {
                        name: 'cards.html',
                        path: '/org/site/.da/library/blocks/cards.html',
                        ext: '.html',
                    },
                ]);

            const paths = await discovery.getContentPathsFromDaLive('org', 'site');

            expect(paths).toContain('/.da/library/blocks');
            expect(paths).toContain('/.da/library/blocks/hero');
            expect(paths).toContain('/.da/library/blocks/cards');
            expect(paths).toHaveLength(3);
        });
    });

    describe('getContentPathsFromIndex', () => {
        it('should fetch and return content paths from index', async () => {
            const indexData = {
                data: [{ path: '/about' }, { path: '/products' }, { path: '/contact' }],
            };
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, indexData));

            const result = await discovery.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            expect(result).toEqual(['/about', '/products', '/contact']);
            expect(mockFetch).toHaveBeenCalledWith(
                'https://main--test-site--test-org.aem.live/full-index.json'
            );
        });

        it('should return empty array when index has no data', async () => {
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, { data: [] }));

            const result = await discovery.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            expect(result).toEqual([]);
        });

        it('should return empty array when data property is missing', async () => {
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, {}));

            const result = await discovery.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            expect(result).toEqual([]);
        });

        it('should throw error when index fetch fails', async () => {
            mockFetch.mockResolvedValueOnce(mockFetchResponse(404));

            await expect(
                discovery.getContentPathsFromIndex({
                    org: 'test-org',
                    site: 'test-site',
                    indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
                })
            ).rejects.toThrow('Failed to fetch content index');
        });
    });
});
