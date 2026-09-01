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

import {
    ConfigurationService,
    buildSiteConfigParams,
} from '@/features/eds/services/configService/configurationService';
import type { SiteRegistrationParams } from '@/features/eds/services/configService/configurationService';
import { createMockLogger } from '../../../../helpers/loggerFake';

// Test fixtures
const mockLogger = createMockLogger();

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

        service = new ConfigurationService(mockTokenProvider, mockLogger);

        // Mock global fetch
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockResolvedValue(new Response(null, { status: 200 }));
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

        it('should return error for 401 unauthorized', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('auth failed');
            expect(result.statusCode).toBe(401);
        });

        it('should return error for 403 forbidden', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Not authorized');
            expect(result.statusCode).toBe(403);
        });

        it('should return error for 409 conflict (site exists)', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Conflict', { status: 409 }));

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
    // buildSiteConfigParams (BYOM overlay)
    // ==========================================================

    describe('buildSiteConfigParams', () => {
        it('omits contentOverlayUrl when no overlay URL is provided', () => {
            const params = buildSiteConfigParams('owner', 'repo', 'org');
            expect(params.contentOverlayUrl).toBeUndefined();
        });

        it('includes contentOverlayUrl when an overlay URL is provided', () => {
            const params = buildSiteConfigParams(
                'owner',
                'repo',
                'org',
                'https://byom.example.com'
            );
            expect(params.contentOverlayUrl).toBe('https://byom.example.com');
        });

        // legacyLookupKey retired 2026-08-23: reset AND repair both migrate a
        // mismatched DA site name before registering, so every caller reaches
        // this function with the DA site name equal to the repo name. The
        // param is gone — this pins that it stays gone.
        it('exposes no legacyLookupKey field', () => {
            const params = buildSiteConfigParams('owner', 'repo', 'org');
            expect('legacyLookupKey' in params).toBe(false);
        });

        // Helix's preview/publish/live operations look up the site config at
        // /config/{githubOwner}/sites/{githubRepo}.json — using the GitHub
        // identifiers, not the DA.live identifiers. Registering under the
        // DA.live name (the old behavior) leaves the config invisible to those
        // operations and every preview/publish silently fails.
        describe('Config Service lookup key (Helix preview/publish contract)', () => {
            it('uses the GitHub owner/repo as the Config Service lookup key', () => {
                const params = buildSiteConfigParams('my-owner', 'my-repo', 'my-dalive-org');

                expect(params.org).toBe('my-owner');
                expect(params.site).toBe('my-repo');
            });

            it('keeps codeOwner/codeRepo identical to the lookup key (Helix code source)', () => {
                const params = buildSiteConfigParams('my-owner', 'my-repo', 'my-dalive-org');

                expect(params.codeOwner).toBe('my-owner');
                expect(params.codeRepo).toBe('my-repo');
            });

            it('points the content source URL at the DA.live org and the REPO name (the one identifier)', () => {
                const params = buildSiteConfigParams('my-owner', 'my-repo', 'my-dalive-org');

                expect(params.contentSourceUrl).toBe(
                    'https://content.da.live/my-dalive-org/my-repo/'
                );
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

        it('should treat 404 as success (already deleted)', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

            const result = await service.deleteSiteConfig('test-user', 'my-site');

            expect(result.success).toBe(true);
            expect(result.statusCode).toBe(404);
        });

        it('should return error for non-404 failures', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

            const result = await service.deleteSiteConfig('test-user', 'my-site');

            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });
    });

    // ==========================================================
    // updateSiteConfig
    // ==========================================================

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

/**
 * Config Service failure reporting.
 *
 * Field case (2026-07-28): a colleague's storefront failed four times with
 * `PUT /config/{org}/sites/{site}.json -> 403`, and the message told him to
 * install AEM Code Sync — on a run where code sync had been verified and 62
 * pages published seconds earlier. The advice was unfollowable, and the log
 * carried nothing to diagnose from: the 403 body is empty, and Adobe's stated
 * reason lives in the `x-error` header, which was discarded.
 *
 * Two requirements follow: record what Adobe actually said, and stop naming a
 * remedy the evidence contradicts.
 */
describe('ConfigurationService — failure reporting', () => {
    const logger = createMockLogger();
    const tokenProvider = { getAccessToken: jest.fn().mockResolvedValue('ims-token') };
    const params: SiteRegistrationParams = {
        org: 'acme-corp',
        site: 'storefront-demo',
        codeOwner: 'acme-corp',
        codeRepo: 'storefront-demo',
        contentSourceUrl: 'https://content.da.live/acme-corp/storefront-demo/',
    };

    let service: ConfigurationService;
    let fetchSpy: jest.SpyInstance;

    function forbidden(headers: Record<string, string> = {}) {
        return new Response('', { status: 403, headers });
    }

    function loggedText(): string {
        return ['debug', 'info', 'warn', 'error']
            .flatMap((lvl) => (logger as never as Record<string, jest.Mock>)[lvl].mock.calls)
            .map((c) => String(c[0]))
            .join('\n');
    }

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ConfigurationService(tokenProvider as never, logger as never);
    });

    afterEach(() => fetchSpy?.mockRestore());

    it("records Adobe's stated reason from x-error", async () => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockResolvedValue(forbidden({ 'x-error': '[admin] not authorized' }));

        await service.registerSite(params);

        expect(loggedText()).toContain('[admin] not authorized');
    });

    it("records Adobe's request id, which is what support needs", async () => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockResolvedValue(forbidden({ 'x-invocation-id': 'abc-123' }));

        await service.registerSite(params);

        expect(loggedText()).toContain('abc-123');
    });

    it('does not tell the user to install AEM Code Sync', async () => {
        // The failing runs had code sync verified and publishing in the same
        // session. Naming it as the remedy sends people to reinstall a working
        // app — the exact loop this project already burned days on.
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(forbidden());

        const result = await service.registerSite(params);

        expect(result.error).not.toMatch(/install AEM Code Sync/i);
        expect(result.error).not.toMatch(/aem\.live\/developer\/tutorial/i);
    });

    it('still explains a 403 and stays actionable', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(forbidden());

        const result = await service.registerSite(params);

        expect(result.error).toMatch(/not authorized|permission|access/i);
        expect(result.statusCode).toBe(403);
    });

    it('tolerates a response carrying neither header', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(forbidden());

        await service.registerSite(params);

        expect(loggedText()).not.toContain('undefined');
        expect(loggedText()).not.toContain('null');
    });
});
