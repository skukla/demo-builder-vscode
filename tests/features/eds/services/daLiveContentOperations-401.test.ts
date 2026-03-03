/**
 * DA.live Content Operations Tests - 401 Token Expiration Handling
 *
 * Tests for:
 * 1a. copySingleFile 401 detection (throws DaLiveAuthError)
 * 1b. Per-batch token re-fetch in copyContentFromSource
 * 1c. Per-batch token re-fetch in copyMediaFromContent
 */

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLiveContentOperations';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';

// Mock the timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
    },
}));

// Mock formatDuration (used in logging)
jest.mock('@/core/utils/timeFormatting', () => ({
    formatDuration: jest.fn().mockReturnValue('0ms'),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('DaLiveContentOperations - 401 Token Expiration', () => {
    let service: DaLiveContentOperations;
    let mockTokenProvider: TokenProvider;
    let mockLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('test-token'),
        };

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        service = new DaLiveContentOperations(mockTokenProvider, mockLogger);
    });

    /**
     * Helper to create a mock Response object.
     * Follows the existing pattern from daLiveContentOperations-content.test.ts.
     */
    function mockFetchResponse(
        status: number,
        body?: unknown,
        contentType = 'text/html',
    ): Response {
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

    // =========================================================================
    // 1a. copySingleFile 401 detection
    // =========================================================================
    // Tested through public `copyContent` method (non-recursive single file copy)

    describe('copySingleFile 401 handling (via copyContent)', () => {
        const source = { org: 'src-org', site: 'src-site', path: '/about' };
        const destination = { org: 'dest-org', site: 'dest-site', path: '/about' };

        /**
         * Sets up fetch mock for copySingleFile flow:
         * 1. HEAD to .json (isSpreadsheetPath check) -> 404
         * 2. GET to .plain.html (source fetch) -> 200 with HTML
         * 3. POST to admin.da.live (destination upload) -> configurable status
         */
        function setupCopySingleFileMock(destStatus: number): void {
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                // isSpreadsheetPath HEAD check -> not a spreadsheet
                if (options?.method === 'HEAD' && url.endsWith('.json')) {
                    return mockFetchResponse(404);
                }
                // Source content fetch
                if (url.includes('aem.live') && (!options?.method || options?.method === 'GET')) {
                    return mockFetchResponse(200, '<p>Hello</p>', 'text/html');
                }
                // DA.live destination POST
                if (url.includes('admin.da.live') && options?.method === 'POST') {
                    return mockFetchResponse(destStatus);
                }
                return mockFetchResponse(404);
            });
        }

        it('should throw DaLiveAuthError when DA.live POST returns 401', async () => {
            setupCopySingleFileMock(401);

            await expect(
                service.copyContent(source, destination),
            ).rejects.toThrow(DaLiveAuthError);
        });

        it('should include descriptive message in DaLiveAuthError on 401', async () => {
            setupCopySingleFileMock(401);

            await expect(
                service.copyContent(source, destination),
            ).rejects.toThrow('DA.live token expired during content copy');
        });

        it('should NOT retry when DA.live POST returns 401', async () => {
            setupCopySingleFileMock(401);

            try {
                await service.copyContent(source, destination);
            } catch {
                // Expected to throw
            }

            // Count POST calls to admin.da.live - should be exactly 1 (no retry)
            const postCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit?]) =>
                    call[0].includes('admin.da.live') && call[1]?.method === 'POST',
            );
            expect(postCalls).toHaveLength(1);
        });

        it('should still retry on 502 response (regression)', async () => {
            // All POST calls return 502
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (options?.method === 'HEAD' && url.endsWith('.json')) {
                    return mockFetchResponse(404);
                }
                if (url.includes('aem.live') && (!options?.method || options?.method === 'GET')) {
                    return mockFetchResponse(200, '<p>Hello</p>', 'text/html');
                }
                if (url.includes('admin.da.live') && options?.method === 'POST') {
                    return mockFetchResponse(502);
                }
                return mockFetchResponse(404);
            });

            const result = await service.copyContent(source, destination);

            // Should have retried (3 attempts = MAX_RETRY_ATTEMPTS)
            const postCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit?]) =>
                    call[0].includes('admin.da.live') && call[1]?.method === 'POST',
            );
            expect(postCalls.length).toBeGreaterThan(1);
            expect(result.success).toBe(false);
        });

        it('should still retry on 503 response (regression)', async () => {
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (options?.method === 'HEAD' && url.endsWith('.json')) {
                    return mockFetchResponse(404);
                }
                if (url.includes('aem.live') && (!options?.method || options?.method === 'GET')) {
                    return mockFetchResponse(200, '<p>Hello</p>', 'text/html');
                }
                if (url.includes('admin.da.live') && options?.method === 'POST') {
                    return mockFetchResponse(503);
                }
                return mockFetchResponse(404);
            });

            const result = await service.copyContent(source, destination);

            const postCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit?]) =>
                    call[0].includes('admin.da.live') && call[1]?.method === 'POST',
            );
            expect(postCalls.length).toBeGreaterThan(1);
            expect(result.success).toBe(false);
        });

        it('should still retry on 504 response (regression)', async () => {
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                if (options?.method === 'HEAD' && url.endsWith('.json')) {
                    return mockFetchResponse(404);
                }
                if (url.includes('aem.live') && (!options?.method || options?.method === 'GET')) {
                    return mockFetchResponse(200, '<p>Hello</p>', 'text/html');
                }
                if (url.includes('admin.da.live') && options?.method === 'POST') {
                    return mockFetchResponse(504);
                }
                return mockFetchResponse(404);
            });

            const result = await service.copyContent(source, destination);

            const postCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit?]) =>
                    call[0].includes('admin.da.live') && call[1]?.method === 'POST',
            );
            expect(postCalls.length).toBeGreaterThan(1);
            expect(result.success).toBe(false);
        });

        it('should return success on 200 response (regression)', async () => {
            setupCopySingleFileMock(200);

            const result = await service.copyContent(source, destination);

            expect(result.success).toBe(true);
            expect(result.copiedFiles).toContain('/about');
        });

        it('should return false on 400 response without retry (regression)', async () => {
            setupCopySingleFileMock(400);

            const result = await service.copyContent(source, destination);

            expect(result.success).toBe(false);
            const postCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit?]) =>
                    call[0].includes('admin.da.live') && call[1]?.method === 'POST',
            );
            expect(postCalls).toHaveLength(1);
        });

        it('should return false on 403 response without retry (regression)', async () => {
            setupCopySingleFileMock(403);

            const result = await service.copyContent(source, destination);

            expect(result.success).toBe(false);
        });

        it('should return false on 500 response without retry (regression)', async () => {
            setupCopySingleFileMock(500);

            const result = await service.copyContent(source, destination);

            expect(result.success).toBe(false);
        });
    });

    // =========================================================================
    // 1b. Per-batch token re-fetch in copyContentFromSource
    // =========================================================================

    describe('per-batch token re-fetch in copyContentFromSource', () => {
        const source = {
            org: 'src-org',
            site: 'src-site',
            indexUrl: 'https://main--src-site--src-org.aem.live/full-index.json',
        };
        const destOrg = 'dest-org';
        const destSite = 'dest-site';

        beforeEach(() => {
            // These tests focus on per-batch token behavior, not content enumeration.
            // Force fallback to CDN index so existing fetch mocks work unchanged.
            jest.spyOn(service, 'getContentPathsFromDaLive').mockRejectedValue(new Error('Skipped'));
        });

        /**
         * Create fetch mock for copyContentFromSource tests.
         * Supports configurable number of content paths and DA.live POST status.
         */
        function setupContentSourceMock(
            contentPaths: string[],
            destPostStatus = 200,
        ): void {
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                // Index fetch
                if (url.includes('full-index.json')) {
                    return mockFetchResponse(
                        200,
                        { data: contentPaths.map(p => ({ path: p })) },
                        'application/json',
                    );
                }
                // Essential config HEAD checks (return 404 - don't exist)
                if (options?.method === 'HEAD' && url.endsWith('.json')) {
                    return mockFetchResponse(404);
                }
                // Source content GET
                if (url.includes('aem.live') && (!options?.method || options?.method === 'GET')) {
                    return mockFetchResponse(200, '<p>Content</p>', 'text/html');
                }
                // DA.live destination POST
                if (url.includes('admin.da.live') && options?.method === 'POST') {
                    return mockFetchResponse(destPostStatus);
                }
                return mockFetchResponse(404);
            });
        }

        it('should call getAccessToken once per batch', async () => {
            // 7 paths = 2 batches (5 + 2) with CONTENT_COPY_BATCH_SIZE = 5
            const paths = ['/p1', '/p2', '/p3', '/p4', '/p5', '/p6', '/p7'];
            setupContentSourceMock(paths);

            await service.copyContentFromSource(source, destOrg, destSite);

            // Should be called exactly 2 times (once per batch)
            expect(mockTokenProvider.getAccessToken).toHaveBeenCalledTimes(2);
        });

        it('should use fresh token for each batch', async () => {
            // Return different tokens per call
            (mockTokenProvider.getAccessToken as jest.Mock)
                .mockResolvedValueOnce('token-batch-1')
                .mockResolvedValueOnce('token-batch-2');

            // 6 paths = 2 batches (5 + 1)
            const paths = ['/p1', '/p2', '/p3', '/p4', '/p5', '/p6'];
            setupContentSourceMock(paths);

            await service.copyContentFromSource(source, destOrg, destSite);

            // Verify batch 1 used 'token-batch-1' (first 5 POST calls)
            const postCalls = mockFetch.mock.calls.filter(
                (call: [string, RequestInit?]) =>
                    call[0].includes('admin.da.live') && call[1]?.method === 'POST',
            );

            // First 5 POST calls should use token-batch-1
            for (let i = 0; i < 5 && i < postCalls.length; i++) {
                const authHeader = (postCalls[i][1] as RequestInit)?.headers as Record<string, string>;
                expect(authHeader?.Authorization).toBe('Bearer token-batch-1');
            }

            // 6th POST call should use token-batch-2
            if (postCalls.length > 5) {
                const authHeader = (postCalls[5][1] as RequestInit)?.headers as Record<string, string>;
                expect(authHeader?.Authorization).toBe('Bearer token-batch-2');
            }
        });

        it('should propagate DaLiveAuthError from copySingleFile', async () => {
            const paths = ['/p1', '/p2'];
            setupContentSourceMock(paths, 401);

            await expect(
                service.copyContentFromSource(source, destOrg, destSite),
            ).rejects.toThrow(DaLiveAuthError);
        });

        it('should call getAccessToken for a single batch', async () => {
            // 3 paths = 1 batch
            const paths = ['/p1', '/p2', '/p3'];
            setupContentSourceMock(paths);

            await service.copyContentFromSource(source, destOrg, destSite);

            // Should be called exactly 1 time (one batch)
            expect(mockTokenProvider.getAccessToken).toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================================
    // 1c. Per-batch token re-fetch in copyMediaFromContent
    // =========================================================================

    describe('per-batch token re-fetch in copyMediaFromContent', () => {
        const sourceOrg = 'src-org';
        const sourceSite = 'src-site';
        const destOrg = 'dest-org';
        const destSite = 'dest-site';

        /**
         * Create fetch mock for copyMediaFromContent tests.
         * contentPaths are scanned for media references; mediaFiles control
         * the DA.live POST behavior.
         */
        function setupMediaMock(
            contentPages: Record<string, string>,
            destPostStatus = 200,
        ): void {
            mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
                // Content page scans (GET to aem.live for media extraction)
                for (const [pagePath, html] of Object.entries(contentPages)) {
                    if (url.includes(`aem.live${pagePath}`) && (!options?.method || options?.method === 'GET')) {
                        return {
                            ok: true,
                            status: 200,
                            headers: { get: () => 'text/html' },
                            text: async () => html,
                        } as unknown as Response;
                    }
                }

                // isSpreadsheetPath HEAD check
                if (options?.method === 'HEAD' && url.endsWith('.json')) {
                    return mockFetchResponse(404);
                }

                // Source media GET (aem.live)
                if (url.includes('aem.live') && url.includes('media_') && (!options?.method || options?.method === 'GET')) {
                    return mockFetchResponse(200, undefined, 'image/png');
                }

                // DA.live POST (destination upload)
                if (url.includes('admin.da.live') && options?.method === 'POST') {
                    return mockFetchResponse(destPostStatus);
                }

                return mockFetchResponse(404);
            });
        }

        it('should call getAccessToken once per batch for media copy', async () => {
            // Create content with 7 unique media refs = 2 batches
            const html = [
                '<img src="./media_a1.png">',
                '<img src="./media_a2.png">',
                '<img src="./media_a3.png">',
                '<img src="./media_a4.png">',
                '<img src="./media_a5.png">',
                '<img src="./media_a6.png">',
                '<img src="./media_a7.png">',
            ].join('');

            setupMediaMock({ '/page1': `<html>${html}</html>` });

            await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                ['/page1'],
            );

            // 7 media files = 2 batches (5 + 2), so 2 calls to getAccessToken
            expect(mockTokenProvider.getAccessToken).toHaveBeenCalledTimes(2);
        });

        it('should propagate DaLiveAuthError from copyMediaFromContent', async () => {
            setupMediaMock(
                { '/page1': '<html><img src="./media_a1.png"></html>' },
                401,
            );

            await expect(
                service.copyMediaFromContent(
                    { org: sourceOrg, site: sourceSite },
                    destOrg,
                    destSite,
                    ['/page1'],
                ),
            ).rejects.toThrow(DaLiveAuthError);
        });

        it('should call getAccessToken for a single media batch', async () => {
            // 3 media files = 1 batch
            const html = [
                '<img src="./media_b1.png">',
                '<img src="./media_b2.png">',
                '<img src="./media_b3.png">',
            ].join('');

            setupMediaMock({ '/page1': `<html>${html}</html>` });

            await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                ['/page1'],
            );

            expect(mockTokenProvider.getAccessToken).toHaveBeenCalledTimes(1);
        });
    });
});
