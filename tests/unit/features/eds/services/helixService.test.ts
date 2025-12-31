/**
 * Unit Tests: HelixService
 *
 * Tests for Helix Admin API operations including unpublishing from live
 * and deleting from preview.
 *
 * Coverage: 5 tests
 * - Unpublish from live via DELETE /live/{org}/{site}/main/*
 * - Delete from preview via DELETE /preview/{org}/{site}/main/*
 * - Require IMS token for authentication
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
        NORMAL: 30000, // Standard API calls (replaces HELIX_API)
    },
}));

// Import types
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { TokenManager } from '@/features/authentication/services/tokenManager';

// Type for the service we'll import dynamically
type HelixServiceType = import('@/features/eds/services/helixService').HelixService;

describe('HelixService', () => {
    let service: HelixServiceType;
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

        // Setup valid token by default
        mockTokenManager.getAccessToken.mockResolvedValue('valid-ims-token');

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/helixService');
        service = new module.HelixService(mockAuthService as unknown as AuthenticationService);
    });

    afterEach(() => {
        // Restore original fetch
        global.fetch = originalFetch;
    });

    // ==========================================================
    // Helix Unpublish Tests (5 tests)
    // ==========================================================
    describe('Helix Operations', () => {
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
                        Authorization: 'Bearer valid-ims-token',
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
                        Authorization: 'Bearer valid-ims-token',
                    }),
                }),
            );
        });

        it('should require IMS token for authentication', async () => {
            // Given: No valid token
            mockTokenManager.getAccessToken.mockResolvedValue(undefined);

            // When: Attempting to unpublish
            // Then: Should throw authentication error
            await expect(service.unpublishFromLive('testuser', 'my-site')).rejects.toThrow(
                /not authenticated|authentication/i,
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
});
