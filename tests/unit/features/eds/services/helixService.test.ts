/**
 * Unit Tests: HelixService
 *
 * Tests for Helix Admin API operations including preview/publish
 * and unpublish operations.
 *
 * Note: The Helix Admin API uses GitHub-based authentication (x-auth-token header)
 * to verify the user has write access to the GitHub repository. For DA.live content
 * sources, it also requires x-content-source-authorization header with IMS token.
 *
 * Coverage: 25 tests
 * - Preview page via POST /preview/{org}/{site}/main/{path}
 * - Publish page via POST /live/{org}/{site}/main/{path}
 * - Preview and publish single page
 * - Bulk preview via POST /preview/{org}/{site}/main/* with JSON body containing paths
 * - Bulk publish via POST /live/{org}/{site}/main/* with JSON body containing paths
 * - Job polling for bulk operations (GET /jobs/{topic}/{jobName})
 * - Bulk publish all site content with job completion tracking
 * - Fallback to page-by-page when bulk API returns 404
 * - Unpublish from live via DELETE /live/{org}/{site}/main/*
 * - Delete from preview via DELETE /preview/{org}/{site}/main/*
 * - Require GitHub token for authentication
 * - Handle 404 as success (never published)
 * - Parse repo fullName to extract org and site
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
}));

// Mock DA.live content operations for publishAllSiteContent tests
const mockListDirectory = jest.fn();
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        listDirectory: mockListDirectory,
    })),
}));

// Import types
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { TokenManager } from '@/features/authentication/services/tokenManager';

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
    let mockAuthService: jest.Mocked<Partial<AuthenticationService>>;
    let mockTokenManager: jest.Mocked<Partial<TokenManager>>;
    let mockGitHubTokenService: MockGitHubTokenService;
    let mockDaLiveTokenProvider: MockDaLiveTokenProvider;
    let mockFetch: jest.Mock;

    // Store original fetch
    const originalFetch = global.fetch;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockListDirectory.mockReset();

        // Mock TokenManager
        mockTokenManager = {
            getAccessToken: jest.fn(),
            isTokenValid: jest.fn(),
        };

        // Mock AuthenticationService (used for DA.live operations - legacy fallback)
        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue(mockTokenManager),
            isAuthenticated: jest.fn(),
        };

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

        // Setup valid IMS token by default (for legacy fallback)
        mockTokenManager.getAccessToken.mockResolvedValue('valid-adobe-ims-token');

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/helixService');
        // Pass mockGitHubTokenService as third parameter for Helix Admin API auth
        // Pass mockDaLiveTokenProvider as fourth parameter for DA.live content source auth
        service = new module.HelixService(
            mockAuthService as unknown as AuthenticationService,
            undefined,
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

            // Readiness check succeeds
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

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
            // 1 readiness check + 1 bulk preview + 1 job poll + 1 bulk publish + 1 job poll = 5 calls
            expect(mockFetch).toHaveBeenCalledTimes(5);

            // Verify GitHub org/site used for Helix API calls (not DA.live org/site)
            const calls = mockFetch.mock.calls;
            expect(calls.every((c: any[]) => c[0].includes('github-owner/github-repo'))).toBe(true);

            // Verify bulk preview call has correct URL (with /*) and JSON body with discovered paths
            const bulkPreviewCall = calls[1];
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
            const bulkPublishCall = calls[3];
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

            // Readiness check succeeds
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

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

            // Readiness check succeeds
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

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
            // 1 readiness check + 1 bulk preview + 1 job poll + 1 bulk publish + 1 job poll = 5 calls
            // Note: Non-HTML files are filtered during listing, bulk API publishes all discovered HTML
            expect(mockFetch).toHaveBeenCalledTimes(5);
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

            // Readiness check succeeds
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

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
                    // Helix may include per-resource errors in data.resources
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
            // 1 readiness check + 1 bulk preview + 1 job poll + 1 bulk publish + 1 job poll = 5 calls
            expect(mockFetch).toHaveBeenCalledTimes(5);

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

            // Readiness check succeeds
            mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

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
            // 1 readiness + 1 failed bulk + 2 pages × 2 calls = 6 total
            expect(mockFetch).toHaveBeenCalledTimes(6);

            // Then: Should log fallback message
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Bulk API not available, falling back to page-by-page'),
            );

            // Then: Should log success with page count
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Successfully published 2/2'),
            );
        });
    });

    // ==========================================================
    // Helix Unpublish Tests (5 tests)
    // ==========================================================
    describe('Helix Unpublish Operations', () => {
        it('should unpublish from live via DELETE /live/{org}/{site}/main/*', async () => {
            // Given: Published site
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Unpublishing from live
            await service.unpublishFromLive('testuser', 'my-site');

            // Then: Should call DELETE on /live endpoint
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/live/testuser/my-site/main/*',
                expect.objectContaining({
                    method: 'DELETE',
                    headers: expect.objectContaining({
                        'x-auth-token': 'valid-github-token',
                    }),
                }),
            );
        });

        it('should delete from preview via DELETE /preview/{org}/{site}/main/*', async () => {
            // Given: Site with preview content
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Deleting from preview
            await service.deleteFromPreview('testuser', 'my-site');

            // Then: Should call DELETE on /preview endpoint
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/preview/testuser/my-site/main/*',
                expect.objectContaining({
                    method: 'DELETE',
                    headers: expect.objectContaining({
                        'x-auth-token': 'valid-github-token',
                    }),
                }),
            );
        });

        it('should require GitHub token for authentication', async () => {
            // Given: No valid GitHub token
            mockGitHubTokenService.getToken.mockResolvedValue(undefined);

            // When: Attempting to unpublish
            // Then: Should throw authentication error
            await expect(service.unpublishFromLive('testuser', 'my-site')).rejects.toThrow(
                /not found|authentication|github/i,
            );
        });

        it('should handle 404 as success (never published)', async () => {
            // Given: Site was never published (404)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            // When: Unpublishing from live
            // Then: Should NOT throw (404 is acceptable)
            await expect(service.unpublishFromLive('testuser', 'my-site')).resolves.not.toThrow();
        });

        it('should parse repo fullName to extract org and site', async () => {
            // Given: Full repository name
            const fullName = 'testuser/my-awesome-site';
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
            });

            // When: Unpublishing using full repo name
            await service.unpublishSite(fullName);

            // Then: Should correctly parse org and site
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/testuser/my-awesome-site/'),
                expect.any(Object),
            );
        });
    });

    // ==========================================================
    // Full Unpublish Site Tests
    // ==========================================================
    describe('Full Site Unpublish', () => {
        it('should unpublish from both live and preview', async () => {
            // Given: Published site
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
            });

            // When: Fully unpublishing site
            await service.unpublishSite('testuser/my-site');

            // Then: Should call both live and preview DELETE
            const calls = mockFetch.mock.calls;
            const liveCall = calls.find((c: any[]) => c[0].includes('/live/'));
            const previewCall = calls.find((c: any[]) => c[0].includes('/preview/'));

            expect(liveCall).toBeDefined();
            expect(previewCall).toBeDefined();
        });

        it('should continue with preview deletion even if live unpublish fails', async () => {
            // Given: Live unpublish fails but preview should continue
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                });

            // When: Unpublishing site
            const result = await service.unpublishSite('testuser/my-site');

            // Then: Should attempt both operations
            expect(mockFetch).toHaveBeenCalledTimes(2);
            // Result should indicate partial failure
            expect(result.liveUnpublished).toBe(false);
            expect(result.previewDeleted).toBe(true);
        });
    });

    // ==========================================================
    // Error Handling Tests
    // ==========================================================
    describe('Error Handling', () => {
        it('should handle network errors gracefully', async () => {
            // Given: Network error
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            // When: Attempting to unpublish
            // Then: Should throw with descriptive message
            await expect(service.unpublishFromLive('testuser', 'my-site')).rejects.toThrow(
                /network|error/i,
            );
        });

        it('should handle 403 access denied', async () => {
            // Given: Access denied response
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            // When: Attempting to unpublish
            // Then: Should throw access denied error
            await expect(service.unpublishFromLive('testuser', 'my-site')).rejects.toThrow(
                /access denied|permission|forbidden/i,
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
                mockAuthService as unknown as AuthenticationService,
                undefined,
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
});
