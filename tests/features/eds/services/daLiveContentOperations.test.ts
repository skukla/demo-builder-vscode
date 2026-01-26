/**
 * DA.live Content Operations Tests
 *
 * Tests for DaLiveContentOperations service, specifically the
 * copyMediaFromContent() method for copying media files by scanning content.
 */

import { DaLiveContentOperations, type TokenProvider, filterProductOverlays } from '@/features/eds/services/daLiveContentOperations';
import type { Logger } from '@/types/logger';
import type { DaLiveProgressCallback } from '@/features/eds/services/types';

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

describe('DaLiveContentOperations', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock token provider
        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
        };

        // Create mock logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    });

    /**
     * Helper to mock fetch responses
     */
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

    /**
     * Helper to mock HEAD requests for essential config checks
     * The production code checks for /placeholders.json, /redirects.json, /metadata.json, /sitemap.json
     * These mocks return 404 so the configs aren't added to the content paths
     */
    function mockEssentialConfigChecks(): void {
        // Mock 4 HEAD requests for essential configs (all return 404)
        for (let i = 0; i < 4; i++) {
            mockFetch.mockResolvedValueOnce(mockFetchResponse(404));
        }
    }

    describe('getContentPathsFromIndex', () => {
        it('should fetch and return content paths from index', async () => {
            // Given: A content index with multiple paths
            const indexData = {
                data: [
                    { path: '/about' },
                    { path: '/products' },
                    { path: '/contact' },
                ],
            };
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, indexData, 'application/json'));

            // When: getContentPathsFromIndex is called
            const result = await service.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            // Then: Returns array of paths
            expect(result).toEqual(['/about', '/products', '/contact']);
            expect(mockFetch).toHaveBeenCalledWith('https://main--test-site--test-org.aem.live/full-index.json');
        });

        it('should return empty array when index has no data', async () => {
            // Given: An empty content index
            const indexData = { data: [] };
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, indexData, 'application/json'));

            // When: getContentPathsFromIndex is called
            const result = await service.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            // Then: Returns empty array
            expect(result).toEqual([]);
        });

        it('should return empty array when data property is missing', async () => {
            // Given: An index without data property
            const indexData = {};
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, indexData, 'application/json'));

            // When: getContentPathsFromIndex is called
            const result = await service.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            // Then: Returns empty array (graceful handling)
            expect(result).toEqual([]);
        });

        it('should throw error when index fetch fails', async () => {
            // Given: Index fetch fails with 404
            mockFetch.mockResolvedValueOnce(mockFetchResponse(404));

            // When/Then: getContentPathsFromIndex throws error
            await expect(
                service.getContentPathsFromIndex({
                    org: 'test-org',
                    site: 'test-site',
                    indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
                }),
            ).rejects.toThrow('Failed to fetch content index');
        });
    });

    describe('copyMediaFromContent', () => {
        const sourceOrg = 'demo-system-stores';
        const sourceSite = 'accs-citisignal';
        const destOrg = 'user-org';
        const destSite = 'user-site';

        /**
         * Helper to create URL-based mock implementation
         * This handles parallel batch processing where mocks are consumed concurrently
         */
        function createUrlBasedMock(config: {
            contentPages?: Record<string, string>;
            mediaResponses?: Record<string, { ok: boolean; contentType?: string }>;
            failedPages?: string[];
        }) {
            const { contentPages = {}, mediaResponses = {}, failedPages = [] } = config;

            return async (url: string, options?: RequestInit) => {
                // Check for failed content pages
                for (const failedPage of failedPages) {
                    if (url.includes(failedPage)) {
                        return mockFetchResponse(500);
                    }
                }

                // Check for content page scan requests
                for (const [page, html] of Object.entries(contentPages)) {
                    if (url.includes(page) && !url.includes('media_')) {
                        return {
                            ok: true,
                            status: 200,
                            headers: { get: () => 'text/html' },
                            text: async () => html,
                        } as unknown as Response;
                    }
                }

                // Check for HEAD requests (isSpreadsheetPath check)
                if (options?.method === 'HEAD' && url.includes('.json')) {
                    return mockFetchResponse(404);
                }

                // Check for media requests
                for (const [mediaPath, response] of Object.entries(mediaResponses)) {
                    if (url.includes(mediaPath)) {
                        // POST to DA.live
                        if (options?.method === 'POST') {
                            return mockFetchResponse(response.ok ? 200 : 500);
                        }
                        // GET from source
                        return mockFetchResponse(
                            response.ok ? 200 : 500,
                            undefined,
                            response.contentType || 'image/png'
                        );
                    }
                }

                // Default response
                return mockFetchResponse(404);
            };
        }

        it('should extract and copy media files from content pages', async () => {
            // Given: Content pages with media references
            const contentPaths = ['/about', '/products'];

            mockFetch.mockImplementation(createUrlBasedMock({
                contentPages: {
                    '/about': '<html><body><img src="./media_abc123.png"></body></html>',
                    '/products': '<html><body><img src="/media_def456.jpg"></body></html>',
                },
                mediaResponses: {
                    'media_abc123.png': { ok: true, contentType: 'image/png' },
                    'media_def456.jpg': { ok: true, contentType: 'image/jpeg' },
                },
            }));

            // When: copyMediaFromContent is called
            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            // Then: Both media files are copied successfully
            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(2);
            expect(result.failedFiles).toHaveLength(0);
            expect(result.totalFiles).toBe(2);
        });

        it('should return success with empty lists when no media found', async () => {
            // Given: Content pages with no media references
            const contentPaths = ['/about'];

            mockFetch.mockImplementation(createUrlBasedMock({
                contentPages: {
                    '/about': '<html><body><p>No images here</p></body></html>',
                },
            }));

            // When: copyMediaFromContent is called
            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            // Then: Returns success with empty lists (graceful handling)
            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(0);
            expect(result.failedFiles).toHaveLength(0);
            expect(result.totalFiles).toBe(0);
        });

        it('should deduplicate media references across pages', async () => {
            // Given: Multiple pages referencing the same media file
            const contentPaths = ['/about', '/contact'];

            mockFetch.mockImplementation(createUrlBasedMock({
                contentPages: {
                    '/about': '<html><body><img src="./media_abc123.png"></body></html>',
                    '/contact': '<html><body><img src="/media_abc123.png"></body></html>',
                },
                mediaResponses: {
                    'media_abc123.png': { ok: true, contentType: 'image/png' },
                },
            }));

            // When: copyMediaFromContent is called
            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            // Then: Only one file is copied (deduplicated)
            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(1);
            expect(result.totalFiles).toBe(1);
        });

        it('should invoke progress callback correctly', async () => {
            // Given: Content with media files
            const contentPaths = ['/about'];

            mockFetch.mockImplementation(createUrlBasedMock({
                contentPages: {
                    '/about': '<html><body><img src="./media_abc123.png"><img src="./media_def456.jpg"></body></html>',
                },
                mediaResponses: {
                    'media_abc123.png': { ok: true, contentType: 'image/png' },
                    'media_def456.jpg': { ok: true, contentType: 'image/jpeg' },
                },
            }));

            const progressCallback: DaLiveProgressCallback = jest.fn();

            // When: copyMediaFromContent is called with progress callback
            await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
                progressCallback,
            );

            // Then: Progress callback is invoked with correct values
            expect(progressCallback).toHaveBeenCalled();

            // Check that progress reports include correct total and processed counts
            const calls = (progressCallback as jest.Mock).mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(2);

            // First call should be processing first batch
            expect(calls[0][0]).toMatchObject({
                processed: 0,
                total: 2,
            });

            // Final call should show completion
            const lastCall = calls[calls.length - 1][0];
            expect(lastCall.processed).toBe(2);
            expect(lastCall.total).toBe(2);
            expect(lastCall.percentage).toBe(100);
        });

        it('should return partial success when some files fail to copy', async () => {
            // Given: Content with media files but one fails to copy
            const contentPaths = ['/about'];

            mockFetch.mockImplementation(createUrlBasedMock({
                contentPages: {
                    '/about': '<html><body><img src="./media_abc123.png"><img src="./media_def456.jpg"></body></html>',
                },
                mediaResponses: {
                    'media_abc123.png': { ok: true, contentType: 'image/png' },
                    'media_def456.jpg': { ok: false, contentType: 'image/jpeg' }, // This one fails
                },
            }));

            // When: copyMediaFromContent is called
            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            // Then: Returns partial success
            expect(result.success).toBe(false); // Not all files succeeded
            expect(result.copiedFiles).toHaveLength(1);
            expect(result.failedFiles).toHaveLength(1);
            expect(result.totalFiles).toBe(2);
        });

        it('should throw DaLiveAuthError when not authenticated', async () => {
            // Given: Token provider returns null (not authenticated)
            (mockTokenProvider.getAccessToken as jest.Mock).mockResolvedValue(null);

            // When/Then: copyMediaFromContent throws auth error
            await expect(
                service.copyMediaFromContent(
                    { org: sourceOrg, site: sourceSite },
                    destOrg,
                    destSite,
                    ['/about'],
                ),
            ).rejects.toThrow('Not authenticated');
        });

        it('should handle content page fetch errors gracefully', async () => {
            // Given: One content page fails to fetch
            const contentPaths = ['/about', '/products'];

            mockFetch.mockImplementation(createUrlBasedMock({
                contentPages: {
                    '/products': '<html><body><img src="./media_def456.jpg"></body></html>',
                },
                mediaResponses: {
                    'media_def456.jpg': { ok: true, contentType: 'image/jpeg' },
                },
                failedPages: ['/about'],
            }));

            // When: copyMediaFromContent is called
            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            // Then: Media from successful page is still copied
            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(1);
        });
    });

    describe('HTML transformation for DA.live', () => {
        /**
         * These tests verify that HTML is transformed before uploading to DA.live.
         *
         * Transformations:
         * 1. Fetch .plain.html (just main content, no page wrapper)
         * 2. Convert <picture> elements to <img> elements
         * 3. Strip query parameters from media URLs (keep relative paths)
         * 4. Wrap in expected document structure: <body><header></header><main>...</main><footer></footer></body>
         *
         * Media files must be copied to destination BEFORE content upload.
         */

        it('should fetch .plain.html, wrap in document structure, and preserve images', async () => {
            // Given: Plain HTML content (what .plain.html returns - just main content)
            const plainHtml = `<div class="nav">
                <picture>
                    <source type="image/webp" srcset="./media_abc123.png?width=2000&format=webply">
                    <source type="image/png" srcset="./media_abc123.png?width=2000&format=png">
                    <img loading="lazy" alt="Logo" src="./media_abc123.png?width=750&format=png">
                </picture>
            </div>`;

            // Track what URL is fetched and what gets POSTed
            let fetchedUrl: string | null = null;
            let postedFormData: FormData | null = null;

            mockFetch
                // Content index fetch
                .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/nav' }] }, 'application/json'))
                // HEAD requests for essential configs (placeholders, redirects, metadata, sitemap)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                // HEAD request for isSpreadsheetPath check (/nav.json)
                .mockResolvedValueOnce(mockFetchResponse(404))
                // Fetch /nav.plain.html (should fetch .plain.html for HTML content)
                .mockImplementationOnce(async (url: string) => {
                    fetchedUrl = url;
                    return {
                        ok: true,
                        status: 200,
                        headers: {
                            get: (key: string) => key === 'content-type' ? 'text/html' : null,
                        },
                        text: async () => plainHtml,
                        blob: async () => new Blob([plainHtml], { type: 'text/html' }),
                    } as Response;
                })
                // POST to DA.live - capture the FormData
                .mockImplementationOnce(async (_url: string, options?: RequestInit) => {
                    postedFormData = options?.body as FormData;
                    return mockFetchResponse(200);
                });

            // When: copyContentFromSource is called
            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // Then: Should have fetched .plain.html
            expect(fetchedUrl).toBe('https://main--source-site--source-org.aem.live/nav.plain.html');

            // Then: The posted content should be wrapped in document structure
            expect(postedFormData).not.toBeNull();
            const postedBlob = postedFormData!.get('data') as Blob;
            const postedHtml = await postedBlob.text();

            // Should be wrapped in document structure
            expect(postedHtml).toMatch(/^<body><header><\/header><main>/);
            expect(postedHtml).toMatch(/<\/main><footer><\/footer><\/body>$/);

            // Images should be preserved (media must be copied BEFORE content)
            // DA.live will resolve images if media files exist
            expect(postedHtml).toContain('<picture>');
            expect(postedHtml).toContain('<img');
        });

        it('should convert relative media URLs to absolute URLs for Admin API', async () => {
            // Given: Plain HTML with relative media reference and query parameters
            const plainHtml = `<div>
                <img src="./media_abc123.png?width=750&format=png&optimize=medium">
            </div>`;

            let postedFormData: FormData | null = null;

            mockFetch
                .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/page' }] }, 'application/json'))
                // HEAD requests for essential configs (placeholders, redirects, metadata, sitemap)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                // HEAD request for isSpreadsheetPath check (/page.json)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockImplementationOnce(async () => {
                    return {
                        ok: true,
                        status: 200,
                        headers: {
                            get: (key: string) => key === 'content-type' ? 'text/html' : null,
                        },
                        text: async () => plainHtml,
                        blob: async () => new Blob([plainHtml], { type: 'text/html' }),
                    } as Response;
                })
                .mockImplementationOnce(async (_url: string, options?: RequestInit) => {
                    postedFormData = options?.body as FormData;
                    return mockFetchResponse(200);
                });

            // When: copyContentFromSource is called
            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // Then: HTML should be wrapped and relative URLs converted to absolute URLs
            expect(postedFormData).not.toBeNull();
            const postedBlob = postedFormData!.get('data') as Blob;
            const postedHtml = await postedBlob.text();

            // Relative media URLs are converted to absolute URLs pointing to source CDN
            // This allows Admin API to download images during preview
            expect(postedHtml).toContain('<img src="https://main--source-site--source-org.aem.live/media_abc123.png?width=750&format=png&optimize=medium">');
            // Should be wrapped in document structure
            expect(postedHtml).toMatch(/^<body><header><\/header><main>/);
        });

        it('should convert relative media URLs with HTML-encoded query parameters', async () => {
            // Given: Plain HTML with media URL and HTML-encoded query parameters
            const plainHtml = `<div>
                <img src="./media_abc123.png?width=750&#x26;format=png&#x26;optimize=medium">
            </div>`;

            let postedFormData: FormData | null = null;

            mockFetch
                .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/page' }] }, 'application/json'))
                // HEAD requests for essential configs (placeholders, redirects, metadata, sitemap)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                // HEAD request for isSpreadsheetPath check (/page.json)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockImplementationOnce(async () => {
                    return {
                        ok: true,
                        status: 200,
                        headers: {
                            get: (key: string) => key === 'content-type' ? 'text/html' : null,
                        },
                        text: async () => plainHtml,
                        blob: async () => new Blob([plainHtml], { type: 'text/html' }),
                    } as Response;
                })
                .mockImplementationOnce(async (_url: string, options?: RequestInit) => {
                    postedFormData = options?.body as FormData;
                    return mockFetchResponse(200);
                });

            // When: copyContentFromSource is called
            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // Then: HTML should be wrapped and relative URLs converted (with encoded params preserved)
            expect(postedFormData).not.toBeNull();
            const postedBlob = postedFormData!.get('data') as Blob;
            const postedHtml = await postedBlob.text();

            // Relative media URLs are converted to absolute URLs pointing to source CDN
            // HTML-encoded query parameters are preserved
            expect(postedHtml).toContain('<img src="https://main--source-site--source-org.aem.live/media_abc123.png?width=750&#x26;format=png&#x26;optimize=medium">');
        });

        it('should handle directory paths (ending with /) correctly', async () => {
            // Given: A path ending with / (like /citisignal-fr/)
            const plainHtml = `<div class="home">Welcome</div>`;

            let fetchedUrl: string | null = null;

            mockFetch
                // Content index fetch with directory path
                .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/citisignal-fr/' }] }, 'application/json'))
                // HEAD requests for essential configs (placeholders, redirects, metadata, sitemap)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                // Fetch /citisignal-fr/index.plain.html (NOT /citisignal-fr/.plain.html)
                .mockImplementationOnce(async (url: string) => {
                    fetchedUrl = url;
                    return {
                        ok: true,
                        status: 200,
                        headers: {
                            get: (key: string) => key === 'content-type' ? 'text/html' : null,
                        },
                        text: async () => plainHtml,
                        blob: async () => new Blob([plainHtml], { type: 'text/html' }),
                    } as Response;
                })
                .mockResolvedValueOnce(mockFetchResponse(200));

            // When: copyContentFromSource is called
            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // Then: Should have fetched index.plain.html for directory path
            expect(fetchedUrl).toBe('https://main--source-site--source-org.aem.live/citisignal-fr/index.plain.html');
        });

        it('should preserve non-media images without modification', async () => {
            // Given: Plain HTML with non-media image (no media_ prefix)
            const plainHtml = `<div>
                <img src="/images/logo.svg" alt="Logo">
            </div>`;

            let postedFormData: FormData | null = null;

            mockFetch
                .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/page' }] }, 'application/json'))
                // HEAD requests for essential configs (placeholders, redirects, metadata, sitemap)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                // HEAD request for isSpreadsheetPath check (/page.json)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockImplementationOnce(async () => {
                    return {
                        ok: true,
                        status: 200,
                        headers: {
                            get: (key: string) => key === 'content-type' ? 'text/html' : null,
                        },
                        text: async () => plainHtml,
                        blob: async () => new Blob([plainHtml], { type: 'text/html' }),
                    } as Response;
                })
                .mockImplementationOnce(async (_url: string, options?: RequestInit) => {
                    postedFormData = options?.body as FormData;
                    return mockFetchResponse(200);
                });

            // When: copyContentFromSource is called
            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // Then: Non-media images should be preserved as-is
            // Note: Only ./media URLs are rewritten to absolute; other paths are kept relative
            expect(postedFormData).not.toBeNull();
            const postedBlob = postedFormData!.get('data') as Blob;
            const postedHtml = await postedBlob.text();

            // The image src is preserved as-is (not a media_ file)
            expect(postedHtml).toContain('src="/images/logo.svg"');
        });

        it('should preserve empty structural divs with placeholder content', async () => {
            // Given: Nav-style HTML with empty third div (required by header.js for nav-tools)
            // The header block expects 3 sections: brand, sections, tools
            // The empty <div></div> is a placeholder for dynamic content (search, cart, wishlist)
            const plainHtml = `<div><p><a href="/">Logo</a></p></div>
<div><ul><li>Menu</li></ul></div>
<div></div>`;

            let postedFormData: FormData | null = null;

            mockFetch
                .mockResolvedValueOnce(mockFetchResponse(200, { data: [{ path: '/nav' }] }, 'application/json'))
                // HEAD requests for essential configs (placeholders, redirects, metadata, sitemap)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockResolvedValueOnce(mockFetchResponse(404))
                // HEAD request for isSpreadsheetPath check (/nav.json)
                .mockResolvedValueOnce(mockFetchResponse(404))
                .mockImplementationOnce(async () => {
                    return {
                        ok: true,
                        status: 200,
                        headers: {
                            get: (key: string) => key === 'content-type' ? 'text/html' : null,
                        },
                        text: async () => plainHtml,
                        blob: async () => new Blob([plainHtml], { type: 'text/html' }),
                    } as Response;
                })
                .mockImplementationOnce(async (_url: string, options?: RequestInit) => {
                    postedFormData = options?.body as FormData;
                    return mockFetchResponse(200);
                });

            // When: copyContentFromSource is called
            await service.copyContentFromSource(
                {
                    org: 'source-org',
                    site: 'source-site',
                    indexUrl: 'https://main--source-site--source-org.aem.live/full-index.json',
                },
                'dest-org',
                'dest-site',
            );

            // Then: Empty div should be preserved with placeholder content
            // This prevents DA.live/Helix from stripping the empty element
            expect(postedFormData).not.toBeNull();
            const postedBlob = postedFormData!.get('data') as Blob;
            const postedHtml = await postedBlob.text();

            // The empty div should now have <p>&nbsp;</p> which DA.live preserves during round-trip
            expect(postedHtml).toContain('<div><p>&nbsp;</p></div>');
            // Should still have all 3 divs
            expect((postedHtml.match(/<div>/g) || []).length).toBe(3);
        });
    });
});

describe('filterProductOverlays', () => {
    it('should keep /products/default', () => {
        const paths = ['/about', '/products/default', '/contact'];
        const result = filterProductOverlays(paths);
        expect(result).toContain('/products/default');
    });

    it('should keep paths under /products/default/', () => {
        const paths = ['/products/default/variant1', '/products/default/info'];
        const result = filterProductOverlays(paths);
        expect(result).toEqual(['/products/default/variant1', '/products/default/info']);
    });

    it('should filter out /products/sku-123 overlay paths', () => {
        const paths = ['/about', '/products/sku-123', '/products/abc-widget', '/contact'];
        const result = filterProductOverlays(paths);
        expect(result).toEqual(['/about', '/contact']);
        expect(result).not.toContain('/products/sku-123');
        expect(result).not.toContain('/products/abc-widget');
    });

    it('should filter /products/overlay-page paths', () => {
        const paths = ['/products/overlay-page', '/products/another-overlay'];
        const result = filterProductOverlays(paths);
        expect(result).toEqual([]);
    });

    it('should keep non-product paths unchanged', () => {
        const paths = ['/about', '/contact', '/blog/post-1', '/categories/clothing'];
        const result = filterProductOverlays(paths);
        expect(result).toEqual(['/about', '/contact', '/blog/post-1', '/categories/clothing']);
    });

    it('should handle empty paths array', () => {
        const paths: string[] = [];
        const result = filterProductOverlays(paths);
        expect(result).toEqual([]);
    });

    it('should handle mixed content with both product default and overlays', () => {
        const paths = [
            '/about',
            '/products/default',
            '/products/default/info',
            '/products/sku-apple-watch',
            '/products/sku-iphone-15',
            '/contact',
        ];
        const result = filterProductOverlays(paths);
        expect(result).toEqual([
            '/about',
            '/products/default',
            '/products/default/info',
            '/contact',
        ]);
    });
});
