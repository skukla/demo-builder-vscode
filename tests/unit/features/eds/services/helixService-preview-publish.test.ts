/**
 * HelixService Tests - Preview/Publish
 *
 * Tests for single page and bulk preview/publish operations:
 * - Single page preview/publish
 * - Bulk preview/publish
 * - Job polling for bulk operations
 * - Fallback to page-by-page
 * - HTTP 200 synchronous success
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

describe('HelixService - Preview/Publish', () => {
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

    describe('Single Page Preview/Publish', () => {
        it('should preview a page via POST /preview/{org}/{site}/main/{path}', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            await service.previewPage('testuser', 'my-site', '/products');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/preview/testuser/my-site/main/products',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ 'x-auth-token': 'valid-github-token' }),
                }),
            );
        });

        it('should preview homepage with normalized path', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            await service.previewPage('testuser', 'my-site', '/');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/preview/testuser/my-site/main/',
                expect.any(Object),
            );
        });

        it('should publish a page via POST /live/{org}/{site}/main/{path}', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            await service.publishPage('testuser', 'my-site', '/about');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/live/testuser/my-site/main/about',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ 'x-auth-token': 'valid-github-token' }),
                }),
            );
        });

        it('should preview and publish a page in sequence', async () => {
            mockFetch.mockResolvedValue({ ok: true, status: 200 });
            await service.previewAndPublishPage('testuser', 'my-site', '/contact');
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/preview/'), expect.any(Object));
            expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/live/'), expect.any(Object));
        });

        it('should handle 403 access denied on preview', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            await expect(service.previewPage('testuser', 'my-site', '/')).rejects.toThrow(/access denied|permission/i);
        });

        it('should handle 403 access denied on publish', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            await expect(service.publishPage('testuser', 'my-site', '/')).rejects.toThrow(/access denied|permission/i);
        });
    });

    describe('Bulk Preview/Publish', () => {
        it('should preview all content via POST /preview/{org}/{site}/main/*', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
            await service.previewAllContent('testuser', 'my-site');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/preview/testuser/my-site/main/*',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'x-auth-token': 'valid-github-token',
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({ paths: ['/'], forceUpdate: true }),
                }),
            );
        });

        it('should publish all content via POST /live/{org}/{site}/main/*', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
            await service.publishAllContent('testuser', 'my-site');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/live/testuser/my-site/main/*',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'x-auth-token': 'valid-github-token',
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({ paths: ['/'], forceUpdate: true }),
                }),
            );
        });

        it('should list pages from DA.live and use bulk API for preview/publish', async () => {
            mockListDirectory
                .mockResolvedValueOnce([
                    { name: 'index', ext: 'html', path: '/dalive-org/dalive-site/index.html' },
                    { name: 'about', ext: 'html', path: '/dalive-org/dalive-site/about.html' },
                    { name: 'nav', ext: 'html', path: '/dalive-org/dalive-site/nav.html' },
                    { name: 'metadata', ext: 'json', path: '/dalive-org/dalive-site/metadata.json' },
                    { name: 'products', path: '/dalive-org/dalive-site/products' },
                ])
                .mockResolvedValueOnce([
                    { name: 'index', ext: 'html', path: '/dalive-org/dalive-site/products/index.html' },
                ]);

            mockFetch.mockResolvedValueOnce({
                ok: true, status: 202,
                json: () => Promise.resolve({ job: { name: 'preview-job-1', topic: 'preview', state: 'created' } }),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true, status: 200,
                json: () => Promise.resolve({ state: 'stopped', progress: { processed: 4, total: 4 } }),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true, status: 202,
                json: () => Promise.resolve({ job: { name: 'publish-job-1', topic: 'live', state: 'created' } }),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true, status: 200,
                json: () => Promise.resolve({ state: 'stopped', progress: { processed: 4, total: 4 } }),
            });

            await service.publishAllSiteContent('github-owner/github-repo', 'main', 'dalive-org', 'dalive-site');

            expect(mockListDirectory).toHaveBeenCalledWith('dalive-org', 'dalive-site', '/');
            expect(mockFetch).toHaveBeenCalledTimes(4);

            const calls = mockFetch.mock.calls;
            expect(calls.every((c: unknown[]) => (c[0] as string).includes('github-owner/github-repo'))).toBe(true);

            const bulkPreviewCall = calls[0];
            expect(bulkPreviewCall[0]).toContain('/preview/github-owner/github-repo/main/*');
            const previewBody = JSON.parse((bulkPreviewCall[1] as { body: string }).body);
            expect(previewBody.forceUpdate).toBe(true);
            expect(previewBody.paths).toContain('/');
            expect(previewBody.paths).toContain('/about');
            expect(previewBody.paths).toContain('/nav');
            expect(previewBody.paths).toContain('/products');
            expect(previewBody.paths.length).toBe(4);

            const bulkPublishCall = calls[2];
            expect(bulkPublishCall[0]).toContain('/live/github-owner/github-repo/main/*');
            const publishBody = JSON.parse((bulkPublishCall[1] as { body: string }).body);
            expect(publishBody.forceUpdate).toBe(true);
            expect(publishBody.paths.length).toBe(4);
        });

        it('should fall back to GitHub org/site if DA.live org/site not provided', async () => {
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
            ]);
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ job: { name: 'preview-job-1', topic: 'preview', state: 'created' } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ state: 'stopped', progress: { processed: 1, total: 1 } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ job: { name: 'publish-job-1', topic: 'live', state: 'created' } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ state: 'stopped', progress: { processed: 1, total: 1 } }) });

            await service.publishAllSiteContent('testuser/my-site');
            expect(mockListDirectory).toHaveBeenCalledWith('testuser', 'my-site', '/');
        });

        it('should exclude non-HTML files from page count but use bulk API', async () => {
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
                { name: 'logo', ext: 'png', path: '/testuser/my-site/logo.png' },
                { name: 'data', ext: 'json', path: '/testuser/my-site/data.json' },
                { name: 'about', ext: 'html', path: '/testuser/my-site/about.html' },
            ]);
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ job: { name: 'preview-job-1', topic: 'preview', state: 'created' } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ state: 'stopped', progress: { processed: 2, total: 2 } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ job: { name: 'publish-job-1', topic: 'live', state: 'created' } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ state: 'stopped', progress: { processed: 2, total: 2 } }) });

            await service.publishAllSiteContent('testuser/my-site');
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });

        it('should throw error when no publishable pages found', async () => {
            mockListDirectory.mockResolvedValueOnce([]);
            await expect(service.publishAllSiteContent('testuser/my-site')).rejects.toThrow(/no publishable pages found/i);
        });

        it('should handle 403 access denied on bulk preview', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            await expect(service.previewAllContent('testuser', 'my-site')).rejects.toThrow(/access denied|permission/i);
        });

        it('should handle 403 access denied on bulk publish', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
            await expect(service.publishAllContent('testuser', 'my-site')).rejects.toThrow(/access denied|permission/i);
        });

        it('should complete successfully using bulk API', async () => {
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
                { name: 'about', ext: 'html', path: '/testuser/my-site/about.html' },
                { name: 'confirm', ext: 'html', path: '/testuser/my-site/customer/account/confirm.html' },
            ]);
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ job: { name: 'preview-job-1', topic: 'preview', state: 'created' } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ state: 'stopped', progress: { processed: 3, total: 3 } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ job: { name: 'publish-job-1', topic: 'live', state: 'created' } }) });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ state: 'stopped', progress: { processed: 3, total: 3 } }) });

            await service.publishAllSiteContent('testuser/my-site');
            expect(mockFetch).toHaveBeenCalledTimes(4);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully published 3 pages using bulk API'));
        });

        it('should fall back to page-by-page when bulk API returns 404', async () => {
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
                { name: 'about', ext: 'html', path: '/testuser/my-site/about.html' },
            ]);
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            await service.publishAllSiteContent('testuser/my-site');
            expect(mockFetch).toHaveBeenCalledTimes(5);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('falling back to page-by-page'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully published 2/2'));
        });

        it('should succeed synchronously when bulk preview returns 200', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            await service.previewAllContent('testuser', 'my-site');
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('completed synchronously'));
        });

        it('should succeed synchronously when bulk publish returns 200', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            await service.publishAllContent('testuser', 'my-site');
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('completed synchronously'));
        });

        it('should fall back to page-by-page on any bulk error', async () => {
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
            ]);
            mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            await service.publishAllSiteContent('testuser/my-site');
            expect(mockFetch).toHaveBeenCalledTimes(3);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('falling back to page-by-page'));
        });

        describe('Bulk job per-path failure detection', () => {
            // The Helix bulk API marks the job `finished` even when every path
            // inside it failed with 4xx/5xx. Per-path results live in
            // `data.resources[]`. Previously the polling code only checked
            // `state` and top-level `error`, silently passing over per-path
            // failures. These tests lock down the new behavior.

            it('previewAllContent throws when any resource in data.resources failed with 4xx/5xx', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 202,
                    json: () => Promise.resolve({ job: { name: 'preview-job-x', topic: 'preview', state: 'created' } }),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        state: 'finished',
                        progress: { processed: 3, total: 3 },
                        data: {
                            resources: [
                                { path: '/', status: 200 },
                                { path: '/cart', status: 500 },
                                { path: '/checkout', status: 502 },
                            ],
                        },
                    }),
                });

                await expect(
                    service.previewAllContent('testuser', 'my-site', 'main', undefined, ['/', '/cart', '/checkout']),
                ).rejects.toThrow(/2\/3 paths failed/);
            });

            it('publishAllContent throws when any resource in data.resources failed with 4xx/5xx', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 202,
                    json: () => Promise.resolve({ job: { name: 'publish-job-x', topic: 'live', state: 'created' } }),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        state: 'finished',
                        progress: { processed: 2, total: 2 },
                        data: {
                            resources: [
                                { path: '/about', status: 200 },
                                { path: '/contact', status: 404 },
                            ],
                        },
                    }),
                });

                await expect(
                    service.publishAllContent('testuser', 'my-site', 'main', undefined, ['/about', '/contact']),
                ).rejects.toThrow(/1\/2 paths failed/);
            });

            it('logs an error with the failing paths and their statuses (capped at 10)', async () => {
                const failingResources = Array.from({ length: 15 }, (_, i) => ({
                    path: `/page-${i + 1}`,
                    status: 500,
                }));
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 202,
                    json: () => Promise.resolve({ job: { name: 'preview-job-many', topic: 'preview', state: 'created' } }),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        state: 'finished',
                        data: { resources: failingResources },
                    }),
                });

                await expect(
                    service.previewAllContent('testuser', 'my-site', 'main', undefined, ['/page-1']),
                ).rejects.toThrow();

                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('15/15 paths failed'),
                );
                const loggedMessage = (mockLogger.error.mock.calls[0]?.[0] as string) ?? '';
                // First 10 paths are mentioned; 11th onward truncated
                expect(loggedMessage).toContain('/page-1 → 500');
                expect(loggedMessage).toContain('/page-10 → 500');
                expect(loggedMessage).not.toContain('/page-11');
                expect(loggedMessage).toContain('...');
            });

            it('completes successfully when every resource in data.resources is 2xx', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 202,
                    json: () => Promise.resolve({ job: { name: 'preview-job-ok', topic: 'preview', state: 'created' } }),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        state: 'finished',
                        progress: { processed: 3, total: 3 },
                        data: {
                            resources: [
                                { path: '/', status: 200 },
                                { path: '/about', status: 200 },
                                { path: '/contact', status: 204 },
                            ],
                        },
                    }),
                });

                await expect(
                    service.previewAllContent('testuser', 'my-site', 'main', undefined, ['/', '/about', '/contact']),
                ).resolves.toBeUndefined();
            });

            it('completes when data.resources is absent (backward-compatible with older API responses)', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 202,
                    json: () => Promise.resolve({ job: { name: 'preview-job-legacy', topic: 'preview', state: 'created' } }),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        state: 'finished',
                        progress: { processed: 1, total: 1 },
                        // no data field at all
                    }),
                });

                await expect(
                    service.previewAllContent('testuser', 'my-site', 'main', undefined, ['/']),
                ).resolves.toBeUndefined();
            });

            it('logs the processed-path count when resources is absent — not "0 paths" (avoids false alarms)', async () => {
                // Helix's preview/publish bulk endpoints don't always populate
                // `data.resources` on successful jobs. The poll's "completed"
                // log line must report the real work done (progress.processed),
                // not "0 paths succeeded" which historically scared SCs into
                // thinking publish had failed when it had not.
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 202,
                    json: () => Promise.resolve({ job: { name: 'preview-job-processed', topic: 'preview', state: 'created' } }),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        state: 'finished',
                        progress: { processed: 78, total: 78 },
                        // no data.resources — typical of bulk preview/publish responses
                    }),
                });

                await service.previewAllContent('testuser', 'my-site', 'main', undefined, ['/']);

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    expect.stringContaining('78 paths processed'),
                );
                // No "0 paths" false alarm anywhere in the debug stream.
                const allDebugMessages = mockLogger.debug.mock.calls.map((c: unknown[]) => String(c[0]));
                expect(allDebugMessages.every((msg: string) => !msg.includes('0 paths'))).toBe(true);
            });

            it('completes when data.resources is an empty array', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 202,
                    json: () => Promise.resolve({ job: { name: 'preview-job-empty', topic: 'preview', state: 'created' } }),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        state: 'finished',
                        progress: { processed: 0, total: 0 },
                        data: { resources: [] },
                    }),
                });

                await expect(
                    service.previewAllContent('testuser', 'my-site', 'main', undefined, ['/']),
                ).resolves.toBeUndefined();
            });

            it('still throws on top-level job error before inspecting resources', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 202,
                    json: () => Promise.resolve({ job: { name: 'preview-job-err', topic: 'preview', state: 'created' } }),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true, status: 200,
                    json: () => Promise.resolve({
                        state: 'finished',
                        error: 'auth expired mid-job',
                        data: { resources: [{ path: '/', status: 200 }] },
                    }),
                });

                await expect(
                    service.previewAllContent('testuser', 'my-site', 'main', undefined, ['/']),
                ).rejects.toThrow(/auth expired mid-job/);
            });
        });
    });
});
