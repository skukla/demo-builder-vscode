/**
 * DA.live Content Operations Tests - Content & Media
 *
 * Tests for DaLiveContentOperations service: getContentPathsFromIndex,
 * copyMediaFromContent, and HTML transformation for DA.live.
 */

import { DaLiveContentOperations, type TokenProvider } from '@/features/eds/services/daLiveContentOperations';
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

    describe('getContentPathsFromIndex', () => {
        it('should fetch and return content paths from index', async () => {
            const indexData = {
                data: [
                    { path: '/about' },
                    { path: '/products' },
                    { path: '/contact' },
                ],
            };
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, indexData, 'application/json'));

            const result = await service.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            expect(result).toEqual(['/about', '/products', '/contact']);
            expect(mockFetch).toHaveBeenCalledWith('https://main--test-site--test-org.aem.live/full-index.json');
        });

        it('should return empty array when index has no data', async () => {
            const indexData = { data: [] };
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, indexData, 'application/json'));

            const result = await service.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            expect(result).toEqual([]);
        });

        it('should return empty array when data property is missing', async () => {
            const indexData = {};
            mockFetch.mockResolvedValueOnce(mockFetchResponse(200, indexData, 'application/json'));

            const result = await service.getContentPathsFromIndex({
                org: 'test-org',
                site: 'test-site',
                indexUrl: 'https://main--test-site--test-org.aem.live/full-index.json',
            });

            expect(result).toEqual([]);
        });

        it('should throw error when index fetch fails', async () => {
            mockFetch.mockResolvedValueOnce(mockFetchResponse(404));

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

        function createUrlBasedMock(config: {
            contentPages?: Record<string, string>;
            mediaResponses?: Record<string, { ok: boolean; contentType?: string }>;
            failedPages?: string[];
        }) {
            const { contentPages = {}, mediaResponses = {}, failedPages = [] } = config;

            return async (url: string, options?: RequestInit) => {
                for (const failedPage of failedPages) {
                    if (url.includes(failedPage)) {
                        return mockFetchResponse(500);
                    }
                }

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

                if (options?.method === 'HEAD' && url.includes('.json')) {
                    return mockFetchResponse(404);
                }

                for (const [mediaPath, response] of Object.entries(mediaResponses)) {
                    if (url.includes(mediaPath)) {
                        if (options?.method === 'POST') {
                            return mockFetchResponse(response.ok ? 200 : 500);
                        }
                        return mockFetchResponse(
                            response.ok ? 200 : 500,
                            undefined,
                            response.contentType || 'image/png'
                        );
                    }
                }

                return mockFetchResponse(404);
            };
        }

        it('should extract and copy media files from content pages', async () => {
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

            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(2);
            expect(result.failedFiles).toHaveLength(0);
            expect(result.totalFiles).toBe(2);
        });

        it('should return success with empty lists when no media found', async () => {
            const contentPaths = ['/about'];

            mockFetch.mockImplementation(createUrlBasedMock({
                contentPages: {
                    '/about': '<html><body><p>No images here</p></body></html>',
                },
            }));

            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(0);
            expect(result.failedFiles).toHaveLength(0);
            expect(result.totalFiles).toBe(0);
        });

        it('should deduplicate media references across pages', async () => {
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

            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(1);
            expect(result.totalFiles).toBe(1);
        });

        it('should invoke progress callback correctly', async () => {
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

            await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
                progressCallback,
            );

            expect(progressCallback).toHaveBeenCalled();

            const calls = (progressCallback as jest.Mock).mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(2);

            expect(calls[0][0]).toMatchObject({
                processed: 0,
                total: 2,
            });

            const lastCall = calls[calls.length - 1][0];
            expect(lastCall.processed).toBe(2);
            expect(lastCall.total).toBe(2);
            expect(lastCall.percentage).toBe(100);
        });

        it('should return partial success when some files fail to copy', async () => {
            const contentPaths = ['/about'];

            mockFetch.mockImplementation(createUrlBasedMock({
                contentPages: {
                    '/about': '<html><body><img src="./media_abc123.png"><img src="./media_def456.jpg"></body></html>',
                },
                mediaResponses: {
                    'media_abc123.png': { ok: true, contentType: 'image/png' },
                    'media_def456.jpg': { ok: false, contentType: 'image/jpeg' },
                },
            }));

            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            expect(result.success).toBe(false);
            expect(result.copiedFiles).toHaveLength(1);
            expect(result.failedFiles).toHaveLength(1);
            expect(result.totalFiles).toBe(2);
        });

        it('should throw DaLiveAuthError when not authenticated', async () => {
            (mockTokenProvider.getAccessToken as jest.Mock).mockResolvedValue(null);

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

            const result = await service.copyMediaFromContent(
                { org: sourceOrg, site: sourceSite },
                destOrg,
                destSite,
                contentPaths,
            );

            expect(result.success).toBe(true);
            expect(result.copiedFiles).toHaveLength(1);
        });
    });
});
