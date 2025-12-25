/**
 * Unit Tests: DaLiveService
 *
 * Tests for DA.live content management operations including IMS token integration,
 * organization access verification, directory listing, content copy, and error handling.
 *
 * Coverage: 24 tests across 8 categories
 * - Service Initialization (2 tests)
 * - IMS Token Integration (3 tests)
 * - Organization Access Verification (3 tests)
 * - List Directory Contents (3 tests)
 * - Content Copy Operations (4 tests)
 * - Create Source (3 tests)
 * - CitiSignal Content Copy (3 tests)
 * - Error Handling (3 tests)
 */

// Mock vscode module (auto-resolved via jest.config.js moduleNameMapper)
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
        DA_LIVE_API: 30000,
        DA_LIVE_COPY: 120000,
    },
}));

// Import types
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { TokenManager } from '@/features/authentication/services/tokenManager';
import {
    DaLiveAuthError,
    DaLiveNetworkError,
    DaLiveError,
    type DaLiveEntry,
    type DaLiveCopyResult,
    type DaLiveProgressCallback,
} from '@/features/eds/services/types';

// Type for the service we'll import dynamically
type DaLiveServiceType = import('@/features/eds/services/daLiveService').DaLiveService;

describe('DaLiveService', () => {
    let service: DaLiveServiceType;
    let mockAuthService: jest.Mocked<Partial<AuthenticationService>>;
    let mockTokenManager: jest.Mocked<Partial<TokenManager>>;
    let mockFetch: jest.Mock;

    // Store original fetch
    const originalFetch = global.fetch;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Mock TokenManager
        mockTokenManager = {
            getAccessToken: jest.fn(),
            isTokenValid: jest.fn(),
        };

        // Mock AuthenticationService
        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue(mockTokenManager),
            isAuthenticated: jest.fn(),
        };

        // Mock global fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/daLiveService');
        service = new module.DaLiveService(mockAuthService as unknown as AuthenticationService);
    });

    afterEach(() => {
        // Restore original fetch
        global.fetch = originalFetch;
    });

    // ==========================================================
    // Service Initialization Tests (2 tests)
    // ==========================================================
    describe('Service Initialization', () => {
        it('should initialize with AuthenticationService dependency', async () => {
            // Given: AuthenticationService provided
            const module = await import('@/features/eds/services/daLiveService');

            // When: Creating service
            const newService = new module.DaLiveService(
                mockAuthService as unknown as AuthenticationService,
            );

            // Then: Service should be created successfully
            expect(newService).toBeDefined();
            expect(mockAuthService.getTokenManager).toBeDefined();
        });

        it('should throw error if AuthenticationService not provided', async () => {
            // Given: No AuthenticationService
            const module = await import('@/features/eds/services/daLiveService');

            // When: Creating service without auth service
            // Then: Should throw error
            expect(() => {
                new module.DaLiveService(null as unknown as AuthenticationService);
            }).toThrow('AuthenticationService is required');
        });
    });

    // ==========================================================
    // IMS Token Integration Tests (3 tests)
    // ==========================================================
    describe('IMS Token Integration', () => {
        it('should retrieve IMS token from AuthenticationService', async () => {
            // Given: Valid token available
            const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.valid-ims-token';
            mockTokenManager.getAccessToken.mockResolvedValue(validToken);

            // Setup mock response for an API call that uses the token
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [],
            });

            // When: Making an API call that requires token
            await service.listDirectory('test-org', 'test-site', '/');

            // Then: Token should be retrieved from TokenManager
            expect(mockAuthService.getTokenManager).toHaveBeenCalled();
            expect(mockTokenManager.getAccessToken).toHaveBeenCalled();

            // And fetch should be called with Authorization header
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${validToken}`,
                    }),
                }),
            );
        });

        it('should throw DaLiveAuthError when not authenticated', async () => {
            // Given: No valid token (not authenticated)
            mockTokenManager.getAccessToken.mockResolvedValue(undefined);

            // When: Attempting API call
            // Then: Should throw DaLiveAuthError
            await expect(service.listDirectory('test-org', 'test-site', '/')).rejects.toThrow(
                DaLiveAuthError,
            );
            await expect(service.listDirectory('test-org', 'test-site', '/')).rejects.toThrow(
                'Not authenticated',
            );
        });

        it('should handle token expiration during operation', async () => {
            // Given: Token that expires mid-operation
            mockTokenManager.getAccessToken
                .mockResolvedValueOnce('valid-token-first-call')
                .mockResolvedValueOnce(undefined); // Expired on retry

            // First call succeeds, second fails with 401
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => [{ name: 'file1.html', path: '/file1.html', type: 'file' }],
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
                });

            // When: Making multiple calls where token expires
            const firstResult = await service.listDirectory('test-org', 'test-site', '/');
            expect(firstResult).toHaveLength(1);

            // Then: Second call should fail with auth error
            await expect(service.listDirectory('test-org', 'test-site', '/subdir')).rejects.toThrow(
                DaLiveAuthError,
            );
        });
    });

    // ==========================================================
    // Organization Access Verification Tests (3 tests)
    // ==========================================================
    describe('Organization Access Verification', () => {
        beforeEach(() => {
            // Setup valid token for all access tests
            mockTokenManager.getAccessToken.mockResolvedValue('valid-ims-token');
        });

        it('should verify user has access to organization', async () => {
            // Given: User has access to organization
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [], // Empty directory is fine, just checking access
            });

            // When: Verifying access
            const result = await service.verifyOrgAccess('accessible-org');

            // Then: Should return hasAccess true
            expect(result.hasAccess).toBe(true);
            expect(result.orgName).toBe('accessible-org');
        });

        it('should return false for inaccessible organization (403)', async () => {
            // Given: User doesn't have access (403 Forbidden)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            // When: Verifying access
            const result = await service.verifyOrgAccess('restricted-org');

            // Then: Should return hasAccess false with reason
            expect(result.hasAccess).toBe(false);
            expect(result.reason?.toLowerCase()).toContain('access denied');
            expect(result.orgName).toBe('restricted-org');
        });

        it('should handle non-existent organization (404)', async () => {
            // Given: Organization doesn't exist
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            // When: Verifying access
            const result = await service.verifyOrgAccess('nonexistent-org');

            // Then: Should return hasAccess false with reason
            expect(result.hasAccess).toBe(false);
            expect(result.reason).toContain('not found');
            expect(result.orgName).toBe('nonexistent-org');
        });
    });

    // ==========================================================
    // List Directory Contents Tests (3 tests)
    // ==========================================================
    describe('List Directory Contents', () => {
        beforeEach(() => {
            mockTokenManager.getAccessToken.mockResolvedValue('valid-ims-token');
        });

        it('should list directory contents successfully', async () => {
            // Given: Directory with files and folders
            const mockEntries: DaLiveEntry[] = [
                { name: 'index.html', path: '/index.html', type: 'file', size: 1024 },
                { name: 'styles', path: '/styles', type: 'folder' },
                {
                    name: 'about.html',
                    path: '/about.html',
                    type: 'file',
                    lastModified: '2024-01-15T10:30:00Z',
                },
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockEntries,
            });

            // When: Listing directory
            const result = await service.listDirectory('my-org', 'my-site', '/');

            // Then: Should return parsed entries
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('index.html');
            expect(result[0].type).toBe('file');
            expect(result[1].type).toBe('folder');

            // Verify API call URL
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.da.live/list/my-org/my-site/',
                expect.any(Object),
            );
        });

        it('should return empty array for empty directory', async () => {
            // Given: Empty directory
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [],
            });

            // When: Listing empty directory
            const result = await service.listDirectory('my-org', 'my-site', '/empty-folder');

            // Then: Should return empty array
            expect(result).toEqual([]);
            expect(result).toHaveLength(0);
        });

        it('should handle non-existent path gracefully (return [])', async () => {
            // Given: Path doesn't exist (404)
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            // When: Listing non-existent path
            const result = await service.listDirectory('my-org', 'my-site', '/does-not-exist');

            // Then: Should return empty array (graceful handling)
            expect(result).toEqual([]);
        });
    });

    // ==========================================================
    // Content Copy Operations Tests (4 tests)
    // ==========================================================
    describe('Content Copy Operations', () => {
        beforeEach(() => {
            mockTokenManager.getAccessToken.mockResolvedValue('valid-ims-token');
        });

        it('should copy content from source to destination', async () => {
            // Given: Single file copy request
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            // When: Copying single file
            const result = await service.copyContent(
                { org: 'source-org', site: 'source-site', path: '/file.html' },
                { org: 'dest-org', site: 'dest-site', path: '/file.html' },
            );

            // Then: Should succeed
            expect(result.success).toBe(true);
            expect(result.copiedFiles).toContain('/file.html');
            expect(result.failedFiles).toHaveLength(0);
        });

        it('should copy entire directory recursively', async () => {
            // Given: Directory with multiple files
            // Note: Folder comes first so recursive listing happens before file copies
            // First call: list source directory
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [
                    { name: 'images', path: '/pages/images', type: 'folder' }, // Folder first
                    { name: 'page1.html', path: '/pages/page1.html', type: 'file' },
                    { name: 'page2.html', path: '/pages/page2.html', type: 'file' },
                ],
            });

            // Second call: list subdirectory (images folder)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [{ name: 'logo.png', path: '/pages/images/logo.png', type: 'file' }],
            });

            // Copy calls (3 files) - default mock for all copy operations
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            // When: Copying directory recursively
            const result = await service.copyContent(
                { org: 'source-org', site: 'source-site', path: '/pages' },
                { org: 'dest-org', site: 'dest-site', path: '/pages' },
                { recursive: true },
            );

            // Then: All files should be copied
            expect(result.success).toBe(true);
            expect(result.totalFiles).toBe(3);
            expect(result.copiedFiles).toHaveLength(3);
        });

        it('should handle partial copy failure with rollback info', async () => {
            // Given: Some files fail to copy
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => [
                        { name: 'file1.html', path: '/file1.html', type: 'file' },
                        { name: 'file2.html', path: '/file2.html', type: 'file' },
                    ],
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({ success: true }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                });

            // When: Copying with partial failure
            const result = await service.copyContent(
                { org: 'source-org', site: 'source-site', path: '/' },
                { org: 'dest-org', site: 'dest-site', path: '/' },
                { recursive: true },
            );

            // Then: Should report partial success
            expect(result.success).toBe(false);
            expect(result.copiedFiles).toHaveLength(1);
            expect(result.failedFiles).toHaveLength(1);
            expect(result.failedFiles[0].path).toBe('/file2.html');
            expect(result.failedFiles[0].error).toBeDefined();
        });

        it('should retry on transient 504 errors', async () => {
            // Given: First attempt fails with 504, second succeeds
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 504,
                    statusText: 'Gateway Timeout',
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({ success: true }),
                });

            // When: Copying with transient failure
            const result = await service.copyContent(
                { org: 'source-org', site: 'source-site', path: '/file.html' },
                { org: 'dest-org', site: 'dest-site', path: '/file.html' },
            );

            // Then: Should succeed after retry
            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    // ==========================================================
    // Create Source Tests (3 tests)
    // ==========================================================
    describe('Create Source', () => {
        beforeEach(() => {
            mockTokenManager.getAccessToken.mockResolvedValue('valid-ims-token');
        });

        it('should create new document at path', async () => {
            // Given: New document content
            const content = '<html><body>Hello World</body></html>';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 201,
                json: async () => ({ success: true, path: '/new-page.html' }),
            });

            // When: Creating document
            const result = await service.createSource('my-org', 'my-site', '/new-page.html', content);

            // Then: Should succeed
            expect(result.success).toBe(true);
            expect(result.path).toBe('/new-page.html');

            // Verify POST request with content
            expect(mockFetch).toHaveBeenCalledWith(
                'https://admin.da.live/source/my-org/my-site/new-page.html',
                expect.objectContaining({
                    method: 'POST',
                }),
            );
        });

        it('should overwrite existing document when overwrite=true', async () => {
            // Given: Document already exists but overwrite is requested
            const content = '<html><body>Updated content</body></html>';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true, path: '/existing-page.html' }),
            });

            // When: Overwriting document
            const result = await service.createSource(
                'my-org',
                'my-site',
                '/existing-page.html',
                content,
                { overwrite: true },
            );

            // Then: Should succeed
            expect(result.success).toBe(true);
        });

        it('should fail if document exists and overwrite=false', async () => {
            // Given: Document already exists
            const content = '<html><body>New content</body></html>';

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 409,
                statusText: 'Conflict',
            });

            // When: Creating without overwrite
            const result = await service.createSource(
                'my-org',
                'my-site',
                '/existing-page.html',
                content,
                { overwrite: false },
            );

            // Then: Should fail with error
            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });
    });

    // ==========================================================
    // CitiSignal Content Copy Tests (3 tests)
    // ==========================================================
    describe('CitiSignal Content Copy', () => {
        beforeEach(() => {
            mockTokenManager.getAccessToken.mockResolvedValue('valid-ims-token');
        });

        it('should copy citisignal variation content', async () => {
            // Given: CitiSignal source index
            const indexData = {
                data: [
                    { path: '/variations/en/homepage.html' },
                    { path: '/variations/en/about.html' },
                ],
            };

            // Mock index fetch
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => indexData,
            });

            // Mock copy operations
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            // When: Copying CitiSignal content
            const result = await service.copyCitisignalContent('dest-org', 'dest-site');

            // Then: Should copy content from CitiSignal source
            expect(result.success).toBe(true);
            expect(result.totalFiles).toBe(2);
        });

        it('should report progress during copy', async () => {
            // Given: Multiple files to copy with progress callback
            const indexData = {
                data: [
                    { path: '/page1.html' },
                    { path: '/page2.html' },
                    { path: '/page3.html' },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => indexData,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            // Track progress callbacks
            const progressUpdates: Parameters<DaLiveProgressCallback>[0][] = [];
            const progressCallback: DaLiveProgressCallback = (progress) => {
                progressUpdates.push({ ...progress });
            };

            // When: Copying with progress callback
            await service.copyCitisignalContent('dest-org', 'dest-site', progressCallback);

            // Then: Progress should be reported
            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
        });

        it('should fetch content index before copy', async () => {
            // Given: CitiSignal index endpoint
            const indexData = {
                data: [{ path: '/content.html' }],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => indexData,
            });

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            // When: Copying CitiSignal content
            await service.copyCitisignalContent('dest-org', 'dest-site');

            // Then: Should fetch index from CitiSignal source (first call)
            const firstCallUrl = mockFetch.mock.calls[0][0];
            expect(firstCallUrl).toContain('accs-citisignal');
            expect(firstCallUrl).toContain('full-index.json');
        });
    });

    // ==========================================================
    // Error Handling Tests (3 tests)
    // ==========================================================
    describe('Error Handling', () => {
        beforeEach(() => {
            mockTokenManager.getAccessToken.mockResolvedValue('valid-ims-token');
        });

        it('should handle network timeout gracefully', async () => {
            // Given: Network timeout
            mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

            // When: Making API call that times out
            // Then: Should throw DaLiveNetworkError
            await expect(service.listDirectory('my-org', 'my-site', '/')).rejects.toThrow(
                DaLiveNetworkError,
            );
        });

        it('should handle rate limiting (429) with retry-after', async () => {
            // Given: Rate limited response with Retry-After header
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                headers: new Headers({
                    'Retry-After': '60',
                }),
            });

            // When: Making rate-limited API call
            // Then: Should throw DaLiveNetworkError with retry info
            try {
                await service.listDirectory('my-org', 'my-site', '/');
                fail('Expected DaLiveNetworkError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(DaLiveNetworkError);
                expect((error as DaLiveNetworkError).retryAfter).toBe(60);
            }
        });

        it('should format errors with user-friendly messages', async () => {
            // Given: Various error scenarios
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            // When: API call fails
            // Then: Error should have user-friendly message
            try {
                await service.listDirectory('my-org', 'my-site', '/');
                fail('Expected DaLiveError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(DaLiveError);
                const daError = error as DaLiveError;
                expect(daError.message).not.toContain('500'); // Not raw status code
                expect(daError.message.toLowerCase()).toContain('server error');
            }
        });
    });

    // ==========================================================
    // Site Deletion Tests (3 tests)
    // ==========================================================
    describe('Site Deletion', () => {
        beforeEach(() => {
            mockTokenManager.getAccessToken.mockResolvedValue('valid-ims-token');
        });

        it('should delete site content via DELETE /source/{org}/{site}/', async () => {
            // Given: Site to delete
            const org = 'my-org';
            const site = 'my-site';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
            });

            // When: Deleting site
            const result = await service.deleteSite(org, site);

            // Then: Should call DELETE on source endpoint
            expect(mockFetch).toHaveBeenCalledWith(
                `https://admin.da.live/source/${org}/${site}/`,
                expect.objectContaining({
                    method: 'DELETE',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer valid-ims-token',
                    }),
                }),
            );
            expect(result.success).toBe(true);
        });

        it('should handle 404 as success (already deleted)', async () => {
            // Given: Site already deleted
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            // When: Deleting site
            const result = await service.deleteSite('my-org', 'my-site');

            // Then: Should return success (404 is acceptable)
            expect(result.success).toBe(true);
            expect(result.alreadyDeleted).toBe(true);
        });

        it('should throw error on 403 access denied', async () => {
            // Given: Access denied
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            // When: Deleting site
            // Then: Should throw access denied error
            await expect(service.deleteSite('my-org', 'my-site')).rejects.toThrow(
                /access denied|permission|forbidden/i,
            );
        });
    });
});
