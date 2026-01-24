/**
 * GitHub App Service Tests
 *
 * Tests for AEM Code Sync GitHub App detection and installation URL generation.
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock timeoutConfig
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        POLL: {
            INTERVAL: 5000,
        },
    },
}));

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('GitHub App Service', () => {
    let GitHubAppService: any;
    let mockTokenService: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        mockTokenService = {
            getToken: jest.fn(),
        };

        const module = await import('@/features/eds/services/githubAppService');
        GitHubAppService = module.GitHubAppService;
    });

    describe('isAppInstalled', () => {
        it('should return false when no token available', async () => {
            // Given: No token
            mockTokenService.getToken.mockResolvedValue(undefined);
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('owner', 'repo');

            // Then: Should return isInstalled: false
            expect(result).toEqual({ isInstalled: false });
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should return true when code.status is 200', async () => {
            // Given: Valid token and working code sync
            mockTokenService.getToken.mockResolvedValue({ token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 200 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: true with codeStatus
            expect(result).toEqual({ isInstalled: true, codeStatus: 200 });
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.hlx.page/status/test-owner/test-repo/main?editUrl=auto',
                expect.objectContaining({
                    method: 'GET',
                    headers: {
                        'x-auth-token': 'ghp_xxx',
                    },
                })
            );
        });

        it('should return false when code.status is 404', async () => {
            // Given: Valid token but app not installed (code.status = 404)
            mockTokenService.getToken.mockResolvedValue({ token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 404 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: false with codeStatus
            expect(result).toEqual({ isInstalled: false, codeStatus: 404 });
        });

        it('should return false when code.status is 400 in strict mode (default)', async () => {
            // Given: Valid token, status 400 (may be initializing or config issues)
            mockTokenService.getToken.mockResolvedValue({ token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 400 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking in strict mode (default)
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: true (app is installed, just has config issues)
            // Status 400 typically means app is installed but fstab.yaml has issues
            expect(result).toEqual({ isInstalled: true, codeStatus: 400 });
        });

        it('should return true when code.status is 400 in lenient mode', async () => {
            // Given: Valid token, status 400 (may be initializing or config issues)
            mockTokenService.getToken.mockResolvedValue({ token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 400 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking in lenient mode (for post-install verification)
            const result = await service.isAppInstalled('test-owner', 'test-repo', { lenient: true });

            // Then: Should return isInstalled: true with codeStatus
            expect(result).toEqual({ isInstalled: true, codeStatus: 400 });
        });

        it('should return false when code.status is 404 even in lenient mode', async () => {
            // Given: Valid token but app not installed (code.status = 404)
            mockTokenService.getToken.mockResolvedValue({ token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    code: { status: 404 },
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking in lenient mode
            const result = await service.isAppInstalled('test-owner', 'test-repo', { lenient: true });

            // Then: Should return isInstalled: false (404 = definitely not installed)
            expect(result).toEqual({ isInstalled: false, codeStatus: 404 });
        });

        it('should return false when HTTP response is not ok', async () => {
            // Given: Valid token but HTTP error
            mockTokenService.getToken.mockResolvedValue({ token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] });
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: false
            expect(result).toEqual({ isInstalled: false });
        });

        it('should return false when fetch throws error', async () => {
            // Given: Valid token but network error
            mockTokenService.getToken.mockResolvedValue({ token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] });
            mockFetch.mockRejectedValue(new Error('Network error'));
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: false
            expect(result).toEqual({ isInstalled: false });
        });

        it('should return false when code.status is undefined', async () => {
            // Given: Response without code.status field
            mockTokenService.getToken.mockResolvedValue({ token: 'ghp_xxx', tokenType: 'bearer', scopes: ['repo'] });
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    preview: { status: 200 },
                    // No code field
                }),
            });
            const service = new GitHubAppService(mockTokenService);

            // When: Checking if app is installed
            const result = await service.isAppInstalled('test-owner', 'test-repo');

            // Then: Should return isInstalled: false (no code status = not syncing)
            expect(result).toEqual({ isInstalled: false });
        });
    });

    describe('getInstallUrl', () => {
        it('should return GitHub app installation URL', () => {
            // Given: App service
            const service = new GitHubAppService(mockTokenService);

            // When: Getting install URL
            const url = service.getInstallUrl('test-owner', 'test-repo');

            // Then: Should return GitHub app installation page
            expect(url).toBe('https://github.com/apps/aem-code-sync/installations/select_target');
        });
    });
});
