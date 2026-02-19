/**
 * Unit Tests: HelixService
 *
 * Tests for Helix Admin API operations including preview/publish.
 *
 * Note: The Helix Admin API uses GitHub-based authentication (x-auth-token header)
 * to verify the user has write access to the GitHub repository. For DA.live content
 * sources, it also requires x-content-source-authorization header with IMS token.
 *
 * Coverage:
 * - Preview page via POST /preview/{org}/{site}/main/{path}
 * - Publish page via POST /live/{org}/{site}/main/{path}
 * - Preview and publish single page
 * - Bulk preview via POST /preview/{org}/{site}/main/* with JSON body containing paths
 * - Bulk publish via POST /live/{org}/{site}/main/* with JSON body containing paths
 * - Job polling for bulk operations (GET /jobs/{topic}/{jobName})
 * - Bulk publish all site content with job completion tracking
 * - Fallback to page-by-page when bulk API fails (404, 500, etc.)
 * - HTTP 200 synchronous success for small batches
 * - DA.live token provider integration
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

// Mock timeout config - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000, // Fast checks
        NORMAL: 30000, // Standard API calls
        LONG: 180000, // Complex operations
        VERY_LONG: 300000, // Bulk operations
    },
    CACHE_TTL: {
        SHORT: 60000,
        MEDIUM: 300000,
        LONG: 3600000,
    },
}));

// Mock DA.live content operations for publishAllSiteContent tests
const mockListDirectory = jest.fn();
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        listDirectory: mockListDirectory,
    })),
}));

// Type for the service we'll import dynamically
type HelixServiceType = import('@/features/eds/services/helixService').HelixService;

// Mock GitHubTokenService type
interface MockGitHubTokenService {
    getToken: jest.Mock;
    validateToken: jest.Mock;
}

// Mock DA.live token provider type
interface MockDaLiveTokenProvider {
    getAccessToken: jest.Mock<Promise<string | null>>;
}

describe('HelixService', () => {
    let service: HelixServiceType;
    let mockGitHubTokenService: MockGitHubTokenService;
    let mockDaLiveTokenProvider: MockDaLiveTokenProvider;
    let mockFetch: jest.Mock;

    // Store original fetch
    const originalFetch = global.fetch;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockListDirectory.mockReset();

        // Mock GitHubTokenService (used for Helix Admin API authentication)
        mockGitHubTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'valid-github-token', tokenType: 'bearer', scopes: ['repo'] }),
            validateToken: jest.fn().mockResolvedValue({ valid: true }),
        };

        // Mock DA.live token provider (preferred for x-content-source-authorization)
        mockDaLiveTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('valid-dalive-ims-token'),
        };

        // Mock global fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/helixService');
        // Pass mockGitHubTokenService as second parameter for Helix Admin API auth
        // Pass mockDaLiveTokenProvider as third parameter for DA.live content source auth
        service = new module.HelixService(
            undefined, // logger (defaults to getLogger())
            mockGitHubTokenService,
            mockDaLiveTokenProvider,
        );
    });

    afterEach(() => {
        // Restore original fetch
        global.fetch = originalFetch;
    });

    // ==========================================================
    // Preview/Publish Single Page Tests
    // ==========================================================
    describe('Single Page Preview/Publish', () => {
        it('should preview a page via POST /preview/{org}/{site}/main/{path}', async () => {
            // Given: Valid authentication
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Previewing a page
            await service.previewPage('testuser', 'my-site', '/products');

            // Then: Should call POST on /preview endpoint
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/preview/testuser/my-site/main/products',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'x-auth-token': 'valid-github-token',
                    }),
                }),
            );
        });

        it('should preview homepage with normalized path', async () => {
            // Given: Valid authentication
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Previewing homepage
            await service.previewPage('testuser', 'my-site', '/');

            // Then: Should call correct URL
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/preview/testuser/my-site/main/',
                expect.any(Object),
            );
        });

        it('should publish a page via POST /live/{org}/{site}/main/{path}', async () => {
            // Given: Valid authentication
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Publishing a page
            await service.publishPage('testuser', 'my-site', '/about');

            // Then: Should call POST on /live endpoint
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/live/testuser/my-site/main/about',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'x-auth-token': 'valid-github-token',
                    }),
                }),
            );
        });

        it('should preview and publish a page in sequence', async () => {
            // Given: Valid authentication
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
            });

            // When: Preview and publish
            await service.previewAndPublishPage('testuser', 'my-site', '/contact');

            // Then: Should call both preview and live endpoints
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining('/preview/'),
                expect.any(Object),
            );
            expect(mockFetch).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('/live/'),
                expect.any(Object),
            );
        });

        it('should handle 403 access denied on preview', async () => {
            // Given: Access denied response
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            // When/Then: Should throw access denied error
            await expect(service.previewPage('testuser', 'my-site', '/')).rejects.toThrow(
                /access denied|permission/i,
            );
        });

        it('should handle 403 access denied on publish', async () => {
            // Given: Access denied response
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            // When/Then: Should throw access denied error
            await expect(service.publishPage('testuser', 'my-site', '/')).rejects.toThrow(
                /access denied|permission/i,
            );
        });
    });

    // ==========================================================
    // Bulk Preview/Publish Tests
    // ==========================================================
    describe('Bulk Preview/Publish', () => {
        it('should preview all content via POST /preview/{org}/{site}/main/* with JSON body containing paths', async () => {
            // Given: Valid authentication
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202, // Bulk operations return 202 Accepted
            });

            // When: Previewing all content
            await service.previewAllContent('testuser', 'my-site');

            // Then: Should call POST on /preview endpoint with /* suffix for bulk operation
            // The /* in URL triggers async processing (returns 202), paths in body specify what to process
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/preview/testuser/my-site/main/*',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'x-auth-token': 'valid-github-token',
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({
                        paths: ['/'],
                        forceUpdate: true,
                    }),
                }),
            );
        });

        it('should publish all content via POST /live/{org}/{site}/main/* with JSON body containing paths', async () => {
            // Given: Valid authentication
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202, // Bulk operations return 202 Accepted
            });

            // When: Publishing all content
            await service.publishAllContent('testuser', 'my-site');

            // Then: Should call POST on /live endpoint with /* suffix for bulk operation
            // The /* in URL triggers async processing (returns 202), paths in body specify what to process
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/live/testuser/my-site/main/*',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'x-auth-token': 'valid-github-token',
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify({
                        paths: ['/'],
                        forceUpdate: true,
                    }),
                }),
            );
        });

        it('should list pages from DA.live and use bulk API for preview/publish', async () => {
            // Given: Valid authentication and DA.live content
            // DA.live API: files have 'ext' field, folders don't
            // Paths include org/site prefix: /dalive-org/dalive-site/page.html
            mockListDirectory
                .mockResolvedValueOnce([
                    { name: 'index', ext: 'html', path: '/dalive-org/dalive-site/index.html' },
                    { name: 'about', ext: 'html', path: '/dalive-org/dalive-site/about.html' },
                    { name: 'nav', ext: 'html', path: '/dalive-org/dalive-site/nav.html' },
                    { name: 'metadata', ext: 'json', path: '/dalive-org/dalive-site/metadata.json' }, // Should be excluded (not html)
                    { name: 'products', path: '/dalive-org/dalive-site/products' }, // folder (no ext)
                ])
                .mockResolvedValueOnce([
                    { name: 'index', ext: 'html', path: '/dalive-org/dalive-site/products/index.html' },
                ]); // products folder contents

            // Bulk preview returns 202 with job info
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: () => Promise.resolve({ job: { name: 'preview-job-1', topic: 'preview', state: 'created' } }),
            });

            // Job polling for preview returns 'stopped' (completed)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ state: 'stopped', progress: { processed: 4, total: 4 } }),
            });

            // Bulk publish returns 202 with job info
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: () => Promise.resolve({ job: { name: 'publish-job-1', topic: 'live', state: 'created' } }),
            });

            // Job polling for publish returns 'stopped' (completed)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ state: 'stopped', progress: { processed: 4, total: 4 } }),
            });

            // When: Publishing all site content with DA.live org/site
            await service.publishAllSiteContent('github-owner/github-repo', 'main', 'dalive-org', 'dalive-site');

            // Then: Should list content from DA.live org/site
            expect(mockListDirectory).toHaveBeenCalledWith('dalive-org', 'dalive-site', '/');

            // Then: Should use bulk API (not per-page)
            // 1 bulk preview + 1 job poll + 1 bulk publish + 1 job poll = 4 calls
            expect(mockFetch).toHaveBeenCalledTimes(4);

            // Verify Helix API calls use GitHub org/site (not DA.live org/site)
            const calls = mockFetch.mock.calls;
            expect(calls.every((c: any[]) => c[0].includes('github-owner/github-repo'))).toBe(true);

            // Verify bulk preview call has correct URL (with /*) and JSON body with discovered paths
            const bulkPreviewCall = calls[0];
            expect(bulkPreviewCall[0]).toContain('/preview/github-owner/github-repo/main/*');
            // The paths should be the discovered pages from DA.live (index->/, about->/about, nav->/nav, products/index->/products)
            const previewBody = JSON.parse(bulkPreviewCall[1].body);
            expect(previewBody.forceUpdate).toBe(true);
            expect(previewBody.paths).toContain('/');
            expect(previewBody.paths).toContain('/about');
            expect(previewBody.paths).toContain('/nav');
            expect(previewBody.paths).toContain('/products');
            expect(previewBody.paths.length).toBe(4);

            // Verify bulk publish call has correct URL (with /*) and JSON body with discovered paths
            const bulkPublishCall = calls[2];
            expect(bulkPublishCall[0]).toContain('/live/github-owner/github-repo/main/*');
            const publishBody = JSON.parse(bulkPublishCall[1].body);
            expect(publishBody.forceUpdate).toBe(true);
            expect(publishBody.paths).toContain('/');
            expect(publishBody.paths).toContain('/about');
            expect(publishBody.paths).toContain('/nav');
            expect(publishBody.paths).toContain('/products');
            expect(publishBody.paths.length).toBe(4);
        });

        it('should fall back to GitHub org/site if DA.live org/site not provided', async () => {
            // Given: Valid authentication and DA.live content
            // DA.live API: files have 'ext' field
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
            ]);

            // Bulk preview returns 202 with job info
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: () => Promise.resolve({ job: { name: 'preview-job-1', topic: 'preview', state: 'created' } }),
            });

            // Job polling for preview returns 'stopped' (completed)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ state: 'stopped', progress: { processed: 1, total: 1 } }),
            });

            // Bulk publish returns 202 with job info
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: () => Promise.resolve({ job: { name: 'publish-job-1', topic: 'live', state: 'created' } }),
            });

            // Job polling for publish returns 'stopped' (completed)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ state: 'stopped', progress: { processed: 1, total: 1 } }),
            });

            // When: Publishing without explicit DA.live org/site
            await service.publishAllSiteContent('testuser/my-site');

            // Then: Should use GitHub org/site as fallback for DA.live listing
            expect(mockListDirectory).toHaveBeenCalledWith('testuser', 'my-site', '/');
        });

        it('should exclude non-HTML files from page count but use bulk API', async () => {
            // Given: Mix of HTML and non-HTML files
            // DA.live API: files have 'ext' field
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' }, // HTML content
                { name: 'logo', ext: 'png', path: '/testuser/my-site/logo.png' }, // excluded (not html)
                { name: 'data', ext: 'json', path: '/testuser/my-site/data.json' }, // excluded (not html)
                { name: 'about', ext: 'html', path: '/testuser/my-site/about.html' }, // HTML content
            ]);

            // Bulk preview returns 202 with job info
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: () => Promise.resolve({ job: { name: 'preview-job-1', topic: 'preview', state: 'created' } }),
            });

            // Job polling for preview returns 'stopped' (completed)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ state: 'stopped', progress: { processed: 2, total: 2 } }),
            });

            // Bulk publish returns 202 with job info
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: () => Promise.resolve({ job: { name: 'publish-job-1', topic: 'live', state: 'created' } }),
            });

            // Job polling for publish returns 'stopped' (completed)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ state: 'stopped', progress: { processed: 2, total: 2 } }),
            });

            // When: Publishing
            await service.publishAllSiteContent('testuser/my-site');

            // Then: Should use bulk API (not per-page)
            // 1 bulk preview + 1 job poll + 1 bulk publish + 1 job poll = 4 calls
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });

        it('should throw error when no publishable pages found', async () => {
            // Given: Empty DA.live content
            mockListDirectory.mockResolvedValueOnce([]);

            // When/Then: Should throw descriptive error
            await expect(service.publishAllSiteContent('testuser/my-site')).rejects.toThrow(
                /no publishable pages found/i,
            );
        });

        it('should handle 403 access denied on bulk preview', async () => {
            // Given: Access denied response
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            // When/Then: Should throw access denied error
            await expect(service.previewAllContent('testuser', 'my-site')).rejects.toThrow(
                /access denied|permission/i,
            );
        });

        it('should handle 403 access denied on bulk publish', async () => {
            // Given: Access denied response
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            // When/Then: Should throw access denied error
            await expect(service.publishAllContent('testuser', 'my-site')).rejects.toThrow(
                /access denied|permission/i,
            );
        });

        it('should complete successfully using bulk API (per-page errors handled by Helix)', async () => {
            // Given: Mix of pages with content (Helix backend handles errors internally for bulk)
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
                { name: 'about', ext: 'html', path: '/testuser/my-site/about.html' },
                { name: 'confirm', ext: 'html', path: '/testuser/my-site/customer/account/confirm.html' }, // may 404
            ]);

            // Bulk preview returns 202 with job info
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: () => Promise.resolve({ job: { name: 'preview-job-1', topic: 'preview', state: 'created' } }),
            });

            // Job polling for preview returns 'stopped' (completed - some pages may have failed but job succeeded)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    state: 'stopped',
                    progress: { processed: 3, total: 3 },
                }),
            });

            // Bulk publish returns 202 with job info
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: () => Promise.resolve({ job: { name: 'publish-job-1', topic: 'live', state: 'created' } }),
            });

            // Job polling for publish returns 'stopped' (completed)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    state: 'stopped',
                    progress: { processed: 3, total: 3 },
                }),
            });

            // When: Publishing all content
            await service.publishAllSiteContent('testuser/my-site');

            // Then: Should use bulk API
            // 1 bulk preview + 1 job poll + 1 bulk publish + 1 job poll = 4 calls
            expect(mockFetch).toHaveBeenCalledTimes(4);

            // Then: Should log success message for bulk operation
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Successfully published 3 pages using bulk API'),
            );
        });

        it('should fall back to page-by-page when bulk API returns 404', async () => {
            // Given: DA.live content
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
                { name: 'about', ext: 'html', path: '/testuser/my-site/about.html' },
            ]);

            // Bulk preview returns 404 (site not configured for bulk)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            // Fallback: page-by-page preview + publish for each page
            // page 1: preview + publish
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 }); // preview /
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 }); // publish /
            // page 2: preview + publish
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 }); // preview /about
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 }); // publish /about

            // When: Publishing all site content
            await service.publishAllSiteContent('testuser/my-site');

            // Then: Should fall back to page-by-page
            // 1 failed bulk + 2 pages × 2 calls = 5 total
            expect(mockFetch).toHaveBeenCalledTimes(5);

            // Then: Should log fallback message
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('falling back to page-by-page'),
            );

            // Then: Should log success with page count
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Successfully published 2/2'),
            );
        });

        it('should succeed synchronously when bulk preview returns 200 (small batch)', async () => {
            // Given: Bulk preview returns 200 (synchronous success for small path count)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Previewing all content
            await service.previewAllContent('testuser', 'my-site');

            // Then: Should succeed without error
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('completed synchronously'),
            );
        });

        it('should succeed synchronously when bulk publish returns 200 (small batch)', async () => {
            // Given: Bulk publish returns 200 (synchronous success for small path count)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Publishing all content
            await service.publishAllContent('testuser', 'my-site');

            // Then: Should succeed without error
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('completed synchronously'),
            );
        });

        it('should fall back to page-by-page on any bulk error (not just 404)', async () => {
            // Given: DA.live content
            mockListDirectory.mockResolvedValueOnce([
                { name: 'index', ext: 'html', path: '/testuser/my-site/index.html' },
            ]);

            // Bulk preview returns 500 (server error)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            // Fallback: page-by-page preview + publish
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 }); // preview /
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 }); // publish /

            // When: Publishing all site content
            await service.publishAllSiteContent('testuser/my-site');

            // Then: Should fall back to page-by-page (not throw)
            expect(mockFetch).toHaveBeenCalledTimes(3);

            // Then: Should log fallback
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('falling back to page-by-page'),
            );
        });

    });

    // ==========================================================
    // DA.live Token Provider Tests
    // ==========================================================
    describe('DA.live Token Provider', () => {
        it('should use DA.live token provider for x-content-source-authorization when provided', async () => {
            // Given: Valid authentication
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Previewing a page (which uses x-content-source-authorization)
            await service.previewPage('testuser', 'my-site', '/products');

            // Then: Should use DA.live token (not Adobe IMS token)
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-content-source-authorization': 'Bearer valid-dalive-ims-token',
                    }),
                }),
            );

            // Then: Should NOT use Adobe IMS token from auth service
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
            // Given: Service created without DA.live token provider
            const module = await import('@/features/eds/services/helixService');
            const serviceWithoutDaLiveProvider = new module.HelixService(
                undefined, // logger
                mockGitHubTokenService,
                // No DA.live token provider - this should cause operations to fail
            );

            // When: Attempting to preview a page
            // Then: Should throw clear error about missing DA.live token provider
            await expect(serviceWithoutDaLiveProvider.previewPage('testuser', 'my-site', '/products')).rejects.toThrow(
                /DA\.live token provider not configured/i,
            );
        });

        it('should throw error when DA.live token provider returns null', async () => {
            // Given: DA.live token provider returns null (expired session)
            mockDaLiveTokenProvider.getAccessToken.mockResolvedValue(null);

            // When: Attempting to preview a page
            // Then: Should throw with DA.live session expired error
            await expect(service.previewPage('testuser', 'my-site', '/')).rejects.toThrow(
                /DA\.live session expired/i,
            );
        });

        it('should use DA.live token for bulk preview operations', async () => {
            // Given: Valid authentication
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
            });

            // When: Previewing all content (bulk operation)
            await service.previewAllContent('testuser', 'my-site');

            // Then: Should use DA.live token
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
            // Given: Valid authentication
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 202,
            });

            // When: Publishing all content (bulk operation)
            await service.publishAllContent('testuser', 'my-site');

            // Then: Should use DA.live token
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

    // ==========================================================
    // Admin API Key Caching Tests
    // ==========================================================
    describe('Admin API Key Caching', () => {
        // Import HelixService class for static cache access
        let HelixServiceClass: typeof import('@/features/eds/services/helixService').HelixService;

        beforeEach(async () => {
            const module = await import('@/features/eds/services/helixService');
            HelixServiceClass = module.HelixService;
            // Clear the static cache between tests
            HelixServiceClass.clearApiKeyCache();
        });

        it('should cache API key and reuse on subsequent calls for same org/site', async () => {
            // Given: First call creates a key
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'api-key-value-1',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // When: First call creates the key
            const key1 = await service.createAdminApiKey('testorg', 'testsite');

            // Then: Should have called fetch once
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(key1).toBe('api-key-value-1');

            // When: Second call for same org/site
            const key2 = await service.createAdminApiKey('testorg', 'testsite');

            // Then: Should return cached key without additional fetch
            expect(mockFetch).toHaveBeenCalledTimes(1); // Still just 1 call
            expect(key2).toBe('api-key-value-1');
        });

        it('should create separate keys for different org/site combinations', async () => {
            // Given: Two different sites
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        id: 'key-1',
                        value: 'key-for-site-a',
                        expiration: '2027-01-01T00:00:00Z',
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        id: 'key-2',
                        value: 'key-for-site-b',
                        expiration: '2027-01-01T00:00:00Z',
                    }),
                });

            // When: Creating keys for different sites
            const keyA = await service.createAdminApiKey('org-a', 'site-a');
            const keyB = await service.createAdminApiKey('org-b', 'site-b');

            // Then: Should create separate keys
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(keyA).toBe('key-for-site-a');
            expect(keyB).toBe('key-for-site-b');
        });

        it('should not cache failed key creation (null result)', async () => {
            // Given: First call fails
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            // Second call succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'api-key-after-retry',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // When: First call returns null
            const key1 = await service.createAdminApiKey('testorg', 'testsite');
            expect(key1).toBeNull();

            // When: Second call should retry (not return cached null)
            const key2 = await service.createAdminApiKey('testorg', 'testsite');

            // Then: Should have made two fetch calls
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(key2).toBe('api-key-after-retry');
        });

        it('should create new key when cached key expires', async () => {
            // Given: A cached key with expired TTL
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        id: 'key-1',
                        value: 'old-key',
                        expiration: '2027-01-01T00:00:00Z',
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        id: 'key-2',
                        value: 'new-key',
                        expiration: '2027-01-01T00:00:00Z',
                    }),
                });

            // When: First call caches the key
            await service.createAdminApiKey('testorg', 'testsite');

            // Simulate cache expiry by advancing time
            const originalDateNow = Date.now;
            Date.now = () => originalDateNow() + 2 * 60 * 60 * 1000; // +2 hours (beyond CACHE_TTL.LONG = 1hr)

            try {
                // When: Second call after expiry
                const key2 = await service.createAdminApiKey('testorg', 'testsite');

                // Then: Should create a new key
                expect(mockFetch).toHaveBeenCalledTimes(2);
                expect(key2).toBe('new-key');
            } finally {
                Date.now = originalDateNow;
            }
        });

        it('should clear all cached keys via clearApiKeyCache', async () => {
            // Given: A cached key
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'cached-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            await service.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // When: Cache is cleared
            HelixServiceClass.clearApiKeyCache();

            // Then: Next call should create a new key
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-2',
                    value: 'fresh-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            const key = await service.createAdminApiKey('testorg', 'testsite');
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(key).toBe('fresh-key');
        });

        it('should share cache across HelixService instances', async () => {
            // Given: First instance creates a key
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'shared-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            await service.createAdminApiKey('testorg', 'testsite');

            // When: A second instance requests the same key
            const service2 = new HelixServiceClass(
                undefined,
                mockGitHubTokenService,
                mockDaLiveTokenProvider,
            );
            const key = await service2.createAdminApiKey('testorg', 'testsite');

            // Then: Should reuse cached key (no additional fetch)
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(key).toBe('shared-key');
        });
    });

    // ==========================================================
    // unpublishPages Retry-on-Auth-Failure Tests
    // ==========================================================
    describe('unpublishPages retry on auth failure', () => {
        let HelixServiceClass: typeof import('@/features/eds/services/helixService').HelixService;

        beforeEach(async () => {
            const module = await import('@/features/eds/services/helixService');
            HelixServiceClass = module.HelixService;
            HelixServiceClass.clearApiKeyCache();
        });

        it('should retry with fresh key when bulkUnpublish fails with 401', async () => {
            // Given: First key creation succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'stale-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // bulkUnpublish fails with 401 (stale key rejected)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            // Retry: new key creation succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-2',
                    value: 'fresh-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // Retry: bulkUnpublish succeeds with fresh key (202 + immediate success)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // bulkDeletePreview succeeds (202 + immediate success)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When
            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about']);

            // Then: Should succeed after retry
            expect(result).toEqual({ success: true, count: 1 });
            // 1 create key + 1 failed unpublish + 1 new key + 1 retry unpublish + 1 delete preview = 5
            expect(mockFetch).toHaveBeenCalledTimes(5);
        });

        it('should retry with fresh key when bulkUnpublish fails with 403', async () => {
            // Given: First key creation succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'stale-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // bulkUnpublish fails with 403 (key revoked)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            // Retry: new key creation succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-2',
                    value: 'fresh-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // Retry: bulkUnpublish succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // bulkDeletePreview succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When
            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/about']);

            // Then: Should succeed after retry
            expect(result).toEqual({ success: true, count: 1 });
        });

        it('should invalidate cache entry on auth failure before retrying', async () => {
            // Given: First key creation and cache
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'cached-stale-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // bulkUnpublish fails with 401
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            // Retry: createAdminApiKey must NOT return cached stale key — should fetch fresh
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-2',
                    value: 'new-key-after-invalidation',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // Retry: bulkUnpublish succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // bulkDeletePreview succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When
            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/page']);

            // Then: The retry key creation must have actually called fetch (not reused cache)
            expect(result.success).toBe(true);
            // Fetch calls: create key(1) + failed unpublish(2) + create new key(3) + retry unpublish(4) + delete preview(5)
            expect(mockFetch).toHaveBeenCalledTimes(5);
        });

        it('should return failure when retry also fails', async () => {
            // Given: First key creation succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'bad-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // bulkUnpublish fails with 401
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            // Retry: new key creation also fails
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            // When: Both attempts fail
            const result = await service.unpublishPages('testorg', 'testsite', 'main', ['/page']);

            // Then: Should return failure
            expect(result).toEqual({ success: false, count: 0 });
        });

        it('should not retry on non-auth errors (e.g., 500)', async () => {
            // Given: Key creation succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'valid-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // bulkUnpublish fails with 500 (server error, not auth)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            // When/Then: Should throw the server error, not retry
            await expect(
                service.unpublishPages('testorg', 'testsite', 'main', ['/page']),
            ).rejects.toThrow(/500/);

            // Should NOT have attempted key creation again
            expect(mockFetch).toHaveBeenCalledTimes(2); // create key + failed unpublish only
        });
    });

    // ==========================================================
    // Persistent Key Store Tests
    // ==========================================================
    describe('Persistent Key Store', () => {
        let HelixServiceClass: typeof import('@/features/eds/services/helixService').HelixService;
        let mockGlobalState: {
            get: jest.Mock;
            update: jest.Mock;
            keys: jest.Mock;
            setKeysForSync: jest.Mock;
        };
        let stateStore: Record<string, any>;

        beforeEach(async () => {
            const module = await import('@/features/eds/services/helixService');
            HelixServiceClass = module.HelixService;
            HelixServiceClass.clearApiKeyCache();
            HelixServiceClass.clearKeyStore();

            // Create a mock globalState backed by an in-memory object
            stateStore = {};
            mockGlobalState = {
                get: jest.fn(<T>(key: string, defaultValue?: T) => stateStore[key] ?? defaultValue),
                update: jest.fn((key: string, value: any) => {
                    stateStore[key] = value;
                    return Promise.resolve();
                }),
                keys: jest.fn(() => Object.keys(stateStore)),
                setKeysForSync: jest.fn(),
            };
        });

        afterEach(() => {
            HelixServiceClass.clearKeyStore();
        });

        it('should restore key from persistent store on cache miss', async () => {
            // Given: Persistent store has a valid key (simulating restart)
            stateStore['helix.apiKeys'] = {
                'testorg/testsite': {
                    value: 'persisted-key-value',
                    id: 'persisted-key-id',
                    expiresAt: Date.now() + 3600000, // 1 hour from now
                },
            };
            HelixServiceClass.initKeyStore(mockGlobalState as any);

            // When: Requesting key (in-memory cache is empty)
            const key = await service.createAdminApiKey('testorg', 'testsite');

            // Then: Should return persisted key without API call
            expect(key).toBe('persisted-key-value');
            expect(mockFetch).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Restoring persisted'),
            );
        });

        it('should skip expired persistent keys', async () => {
            // Given: Persistent store has an expired key
            stateStore['helix.apiKeys'] = {
                'testorg/testsite': {
                    value: 'expired-key',
                    id: 'expired-key-id',
                    expiresAt: Date.now() - 1000, // Expired 1 second ago
                },
            };
            HelixServiceClass.initKeyStore(mockGlobalState as any);

            // DELETE old expired key (best-effort via getAny)
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            // POST creates a new key
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'new-key-id',
                    value: 'fresh-key-value',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // When: Requesting key
            const key = await service.createAdminApiKey('testorg', 'testsite');

            // Then: Should create new key via API (expired key skipped for reuse)
            expect(key).toBe('fresh-key-value');
            // DELETE old key + POST new key = 2 fetch calls
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should persist new keys with ID and expiry', async () => {
            // Given: Persistent store is empty
            HelixServiceClass.initKeyStore(mockGlobalState as any);

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'new-key-id',
                    value: 'new-key-value',
                    expiration: '2027-06-01T00:00:00Z',
                }),
            });

            // When: Creating a key
            await service.createAdminApiKey('testorg', 'testsite');

            // Then: Key should be persisted to globalState
            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'helix.apiKeys',
                expect.objectContaining({
                    'testorg/testsite': expect.objectContaining({
                        value: 'new-key-value',
                        id: 'new-key-id',
                        expiresAt: expect.any(Number),
                    }),
                }),
            );
        });

        it('should delete old key before creating new one', async () => {
            // Given: Persistent store has an old key (but it's expired so won't be used)
            const oldExpiresAt = Date.now() - 1000;
            stateStore['helix.apiKeys'] = {
                'testorg/testsite': {
                    value: 'old-key-value',
                    id: 'old-key-id',
                    expiresAt: oldExpiresAt,
                },
            };
            HelixServiceClass.initKeyStore(mockGlobalState as any);

            // deleteOldApiKey's keyStore.get returns undefined for expired keys,
            // so no DELETE call is made. Let's test with a valid but out-of-memory key.
            // Reset store with a valid key and force cache miss by clearing in-memory cache
            stateStore['helix.apiKeys'] = {
                'testorg/testsite': {
                    value: 'old-key-value',
                    id: 'old-key-id',
                    expiresAt: Date.now() + 3600000, // Valid
                },
            };

            // First call restores from persistent store (puts in memory cache)
            const restoredKey = await service.createAdminApiKey('testorg', 'testsite');
            expect(restoredKey).toBe('old-key-value');

            // Now expire the in-memory cache
            const originalDateNow = Date.now;
            Date.now = () => originalDateNow() + 2 * 60 * 60 * 1000; // +2 hours

            // DELETE old key (best-effort)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // POST create new key
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'new-key-id',
                    value: 'new-key-value',
                    expiration: '2027-06-01T00:00:00Z',
                }),
            });

            try {
                const key = await service.createAdminApiKey('testorg', 'testsite');
                expect(key).toBe('new-key-value');

                // Verify DELETE was called for old key
                expect(mockFetch).toHaveBeenCalledWith(
                    expect.stringContaining('/apiKeys/old-key-id.json'),
                    expect.objectContaining({ method: 'DELETE' }),
                );
            } finally {
                Date.now = originalDateNow;
            }
        });

        it('should continue if old key deletion fails', async () => {
            // Given: Persistent store has an old key
            stateStore['helix.apiKeys'] = {
                'testorg/testsite': {
                    value: 'old-key-value',
                    id: 'old-key-id',
                    expiresAt: Date.now() + 3600000,
                },
            };
            HelixServiceClass.initKeyStore(mockGlobalState as any);

            // Restore key first, then expire in-memory cache
            await service.createAdminApiKey('testorg', 'testsite');
            const originalDateNow = Date.now;
            Date.now = () => originalDateNow() + 2 * 60 * 60 * 1000;

            // DELETE fails with network error
            mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

            // POST create new key still succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'new-key-id',
                    value: 'new-key-after-failed-delete',
                    expiration: '2027-06-01T00:00:00Z',
                }),
            });

            try {
                const key = await service.createAdminApiKey('testorg', 'testsite');

                // Then: New key should still be created despite failed deletion
                expect(key).toBe('new-key-after-failed-delete');
                expect(mockLogger.debug).toHaveBeenCalledWith(
                    expect.stringContaining('deletion failed'),
                );
            } finally {
                Date.now = originalDateNow;
            }
        });

        it('should clear persistent store on auth failure retry', async () => {
            // Given: Key store initialized and key created
            HelixServiceClass.initKeyStore(mockGlobalState as any);

            // First key creation
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'stale-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // bulkUnpublish fails with 401
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            // Retry: new key creation (no DELETE call since store was cleared by retry logic)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-2',
                    value: 'fresh-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // Retry: bulkUnpublish succeeds
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            // bulkDeletePreview succeeds
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

            // When
            await service.unpublishPages('testorg', 'testsite', 'main', ['/page']);

            // Then: Persistent store should have the fresh key, not the stale one
            const persisted = stateStore['helix.apiKeys']?.['testorg/testsite'];
            expect(persisted).toBeDefined();
            expect(persisted.id).toBe('key-2');
            expect(persisted.value).toBe('fresh-key');
        });

        it('should fall back to in-memory only when no store initialized', async () => {
            // Given: No initKeyStore called (clearKeyStore was already called in beforeEach)

            // API returns a key
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    id: 'key-1',
                    value: 'memory-only-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
            });

            // When: Creating a key without persistent store
            const key = await service.createAdminApiKey('testorg', 'testsite');

            // Then: Should work (in-memory cache only, no persistence)
            expect(key).toBe('memory-only-key');
            expect(mockGlobalState.update).not.toHaveBeenCalled();

            // Second call should use in-memory cache
            const key2 = await service.createAdminApiKey('testorg', 'testsite');
            expect(key2).toBe('memory-only-key');
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('should be idempotent when initKeyStore called multiple times', async () => {
            // Given: First init with a store containing a key
            stateStore['helix.apiKeys'] = {
                'testorg/testsite': {
                    value: 'persisted-key',
                    id: 'key-id',
                    expiresAt: Date.now() + 3600000,
                },
            };
            HelixServiceClass.initKeyStore(mockGlobalState as any);

            // When: Second init with a different mock (should be ignored)
            const anotherMockState = {
                get: jest.fn(() => ({})), // empty store
                update: jest.fn(() => Promise.resolve()),
                keys: jest.fn(() => []),
                setKeysForSync: jest.fn(),
            };
            HelixServiceClass.initKeyStore(anotherMockState as any);

            // Then: Should still use the first store (persisted key accessible)
            const key = await service.createAdminApiKey('testorg', 'testsite');
            expect(key).toBe('persisted-key');
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });
});
