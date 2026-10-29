/**
 * Configuration Service Tests
 *
 * Tests for the AEM Configuration Service API client that manages
 * site registration and site deletion.
 *
 * Since 2026-10-08 (EDS-8) the registration params and body schema are pinned in
 * `siteConfigParams.test.ts`, and the status-to-message mapping and failure
 * logging in `configServiceRequest.test.ts`. This suite pins what the client
 * sends where: the URL, the method, the body it hands over.
 */

import {
    ConfigurationService,
    MOCK_IMS_TOKEN,
    mockLogger,
    mockTokenProvider,
    spyOnFetch,
} from './configurationService.testUtils';
import type { SiteRegistrationParams } from './configurationService.testUtils';

describe('ConfigurationService', () => {
    let service: ConfigurationService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTokenProvider.getAccessToken.mockResolvedValue(MOCK_IMS_TOKEN);

        service = new ConfigurationService(mockTokenProvider, mockLogger);

        // Mock global fetch
        fetchSpy = spyOnFetch();
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
                })
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

        it('should return error for 403 forbidden', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Not authorized');
            expect(result.statusCode).toBe(403);
        });

        it('should include content.overlay block with suffix:".html" when contentOverlayUrl is provided', async () => {
            // The `suffix: '.html'` matches the canonical
            // `aem-commerce-prerender` registration shape. Without it,
            // Helix's live tier 404s for unmatched `/products/*` paths
            // even though the overlay action returns 200 with the default
            // template. See .rptc/research/eds-pdp-routing-validation/
            // findings.md for the empirical reproduction.
            await service.registerSite({
                ...params,
                contentOverlayUrl: 'https://byom.example.com',
            });

            const call = fetchSpy.mock.calls[0];
            const body = JSON.parse(call[1].body);
            expect(body.content).toEqual({
                source: {
                    url: 'https://content.da.live/test-user/my-site/',
                    type: 'markup',
                },
                overlay: {
                    url: 'https://byom.example.com',
                    type: 'markup',
                    suffix: '.html',
                },
            });
        });

        it('should omit content.overlay when contentOverlayUrl is undefined', async () => {
            await service.registerSite(params);

            const call = fetchSpy.mock.calls[0];
            const body = JSON.parse(call[1].body);
            expect(body.content).not.toHaveProperty('overlay');
            expect(body.content).toEqual({
                source: {
                    url: 'https://content.da.live/test-user/my-site/',
                    type: 'markup',
                },
            });
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
                })
            );
        });

        it('should not send content-type header for DELETE requests', async () => {
            await service.deleteSiteConfig('test-user', 'my-site');

            const call = fetchSpy.mock.calls[0];
            expect(call[1].headers['content-type']).toBeUndefined();
        });

        it('should return error for non-404 failures', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

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
