/**
 * Configuration Service Tests
 *
 * Tests for the AEM Configuration Service API client that manages
 * site registration, folder mapping, and site deletion.
 */

// Mock timeoutConfig
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
    },
}));

import { ConfigurationService } from '@/features/eds/services/configurationService';
import type { SiteRegistrationParams } from '@/features/eds/services/configurationService';

// Test fixtures
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

const mockTokenProvider = {
    getAccessToken: jest.fn(),
};

const MOCK_IMS_TOKEN = 'eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5LWF0LTEuY2VyIn0.mock-ims-token';

describe('ConfigurationService', () => {
    let service: ConfigurationService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTokenProvider.getAccessToken.mockResolvedValue(MOCK_IMS_TOKEN);

        service = new ConfigurationService(
            mockTokenProvider as any,
            mockLogger as any,
        );

        // Mock global fetch
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(null, { status: 200 }),
        );
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    // ==========================================================
    // registerSite
    // ==========================================================

    describe('registerSite', () => {
        const params: SiteRegistrationParams = {
            org: 'test-user',
            site: 'my-site',
            codeOwner: 'test-user',
            codeRepo: 'my-site',
            contentSourceUrl: 'https://content.da.live/test-user/my-site/',
        };

        it('should register a site with correct URL and body', async () => {
            const result = await service.registerSite(params);

            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://admin.hlx.page/config/test-user/sites/my-site.json',
                expect.objectContaining({
                    method: 'PUT',
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${MOCK_IMS_TOKEN}`,
                        'content-type': 'application/json',
                    }),
                }),
            );

            // Verify request body
            const call = fetchSpy.mock.calls[0];
            const body = JSON.parse(call[1].body);
            expect(body).toEqual({
                version: 1,
                code: {
                    owner: 'test-user',
                    repo: 'my-site',
                },
                content: {
                    source: {
                        url: 'https://content.da.live/test-user/my-site/',
                        type: 'markup',
                    },
                },
            });
        });

        it('should use custom content source type when provided', async () => {
            await service.registerSite({
                ...params,
                contentSourceType: 'html',
            });

            const call = fetchSpy.mock.calls[0];
            const body = JSON.parse(call[1].body);
            expect(body.content.source.type).toBe('html');
        });

        it('should return error for 401 unauthorized', async () => {
            fetchSpy.mockResolvedValueOnce(
                new Response('Unauthorized', { status: 401 }),
            );

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('auth failed');
            expect(result.statusCode).toBe(401);
        });

        it('should return error for 403 forbidden', async () => {
            fetchSpy.mockResolvedValueOnce(
                new Response('Forbidden', { status: 403 }),
            );

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Not authorized');
            expect(result.statusCode).toBe(403);
        });

        it('should return error for 409 conflict (site exists)', async () => {
            fetchSpy.mockResolvedValueOnce(
                new Response('Conflict', { status: 409 }),
            );

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
            expect(result.statusCode).toBe(409);
        });

        it('should handle network errors', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('Network timeout'));

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Network timeout');
        });

        it('should throw when IMS token is missing', async () => {
            mockTokenProvider.getAccessToken.mockResolvedValueOnce(null);

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('DA.live authentication required');
        });
    });

    // ==========================================================
    // setFolderMapping
    // ==========================================================

    describe('setFolderMapping', () => {
        it('should set folder mapping with correct URL and body', async () => {
            const folders = { '/products/': '/products/default' };

            const result = await service.setFolderMapping('test-user', 'my-site', folders);

            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://admin.hlx.page/config/test-user/sites/my-site/folders.json',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${MOCK_IMS_TOKEN}`,
                        'content-type': 'application/json',
                    }),
                }),
            );

            // Verify request body
            const call = fetchSpy.mock.calls[0];
            const body = JSON.parse(call[1].body);
            expect(body).toEqual({ '/products/': '/products/default' });
        });

        it('should handle multiple folder mappings', async () => {
            const folders = {
                '/products/': '/products/default',
                '/categories/': '/categories/default',
            };

            const result = await service.setFolderMapping('test-user', 'my-site', folders);

            expect(result.success).toBe(true);

            const call = fetchSpy.mock.calls[0];
            const body = JSON.parse(call[1].body);
            expect(body).toEqual(folders);
        });

        it('should return error for server errors', async () => {
            fetchSpy.mockResolvedValueOnce(
                new Response('Internal Server Error', { status: 500 }),
            );

            const result = await service.setFolderMapping('test-user', 'my-site', {});

            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(500);
        });
    });

    // ==========================================================
    // deleteSiteConfig
    // ==========================================================

    describe('deleteSiteConfig', () => {
        it('should delete site config with correct URL', async () => {
            const result = await service.deleteSiteConfig('test-user', 'my-site');

            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://admin.hlx.page/config/test-user/sites/my-site.json',
                expect.objectContaining({
                    method: 'DELETE',
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${MOCK_IMS_TOKEN}`,
                    }),
                }),
            );
        });

        it('should not send content-type header for DELETE requests', async () => {
            await service.deleteSiteConfig('test-user', 'my-site');

            const call = fetchSpy.mock.calls[0];
            expect(call[1].headers['content-type']).toBeUndefined();
        });

        it('should treat 404 as success (already deleted)', async () => {
            fetchSpy.mockResolvedValueOnce(
                new Response('Not Found', { status: 404 }),
            );

            const result = await service.deleteSiteConfig('test-user', 'my-site');

            expect(result.success).toBe(true);
            expect(result.statusCode).toBe(404);
        });

        it('should return error for non-404 failures', async () => {
            fetchSpy.mockResolvedValueOnce(
                new Response('Forbidden', { status: 403 }),
            );

            const result = await service.deleteSiteConfig('test-user', 'my-site');

            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    // ==========================================================
    // Authentication
    // ==========================================================

    describe('authentication', () => {
        it('should include Authorization Bearer header in all requests', async () => {
            await service.registerSite({
                org: 'o',
                site: 's',
                codeOwner: 'o',
                codeRepo: 's',
                contentSourceUrl: 'https://content.da.live/o/s/',
            });

            const call = fetchSpy.mock.calls[0];
            expect(call[1].headers.Authorization).toBe(`Bearer ${MOCK_IMS_TOKEN}`);
        });
    });
});
