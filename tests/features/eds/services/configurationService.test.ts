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

import { ConfigurationService, buildSiteConfigParams } from '@/features/eds/services/configurationService';
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

        it('surfaces a missing IMS token as a 401 auth failure (so callers can re-auth + retry)', async () => {
            mockTokenProvider.getAccessToken.mockResolvedValueOnce(null);

            const result = await service.registerSite(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('DA.live authentication required');
            // A missing/expired token is an auth failure, not a generic error: tag it 401
            // so the registration retry wrapper re-authenticates instead of swallowing it.
            expect(result.statusCode).toBe(401);
        });

        it('should include content.overlay block when contentOverlayUrl is provided', async () => {
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
            const params = buildSiteConfigParams('owner', 'repo', 'org', 'site');
            expect(params.contentOverlayUrl).toBeUndefined();
        });

        it('includes contentOverlayUrl when an overlay URL is provided', () => {
            const params = buildSiteConfigParams(
                'owner', 'repo', 'org', 'site', 'https://byom.example.com',
            );
            expect(params.contentOverlayUrl).toBe('https://byom.example.com');
        });

        // Helix's preview/publish/live operations look up the site config at
        // /config/{githubOwner}/sites/{githubRepo}.json — using the GitHub
        // identifiers, not the DA.live identifiers. Registering under the
        // DA.live name (the old behavior) leaves the config invisible to those
        // operations and every preview/publish silently fails.
        describe('Config Service lookup key (Helix preview/publish contract)', () => {
            it('uses the GitHub owner/repo as the Config Service lookup key', () => {
                const params = buildSiteConfigParams(
                    'my-owner', 'my-repo', 'my-dalive-org', 'my-dalive-site',
                );

                expect(params.org).toBe('my-owner');
                expect(params.site).toBe('my-repo');
            });

            it('keeps codeOwner/codeRepo identical to the lookup key (Helix code source)', () => {
                const params = buildSiteConfigParams(
                    'my-owner', 'my-repo', 'my-dalive-org', 'my-dalive-site',
                );

                expect(params.codeOwner).toBe('my-owner');
                expect(params.codeRepo).toBe('my-repo');
            });

            it('still points the content source URL at the DA.live org/site (where content actually lives)', () => {
                const params = buildSiteConfigParams(
                    'my-owner', 'my-repo', 'my-dalive-org', 'my-dalive-site',
                );

                expect(params.contentSourceUrl).toBe(
                    'https://content.da.live/my-dalive-org/my-dalive-site/',
                );
            });

            it('handles the case where the GitHub repo name differs from the DA.live site name', () => {
                // Real-world example: GitHub repo "b2b-boilerplate", DA site "b2b-boilerplate-content"
                const params = buildSiteConfigParams(
                    'skukla', 'b2b-boilerplate', 'skukla', 'b2b-boilerplate-content',
                );

                expect(params.org).toBe('skukla');
                expect(params.site).toBe('b2b-boilerplate');
                expect(params.contentSourceUrl).toContain('b2b-boilerplate-content');
            });
        });
    });

    // ==========================================================
    // buildSiteConfigParams — ContentSource seam (Slice 2, Step 01)
    // ==========================================================

    describe('buildSiteConfigParams — ContentSource seam', () => {
        it('routes the registration source block through an injected ContentSource', () => {
            const fakeSource = {
                type: 'aem-sites' as const,
                buildRegistrationSource: jest.fn().mockReturnValue({
                    url: 'https://author-p1-e1.adobeaemcloud.com/content/demo',
                    type: 'markup',
                }),
                getContentSourceAuthorization: jest.fn(),
            };

            const params = buildSiteConfigParams(
                'owner', 'repo', 'dalive-org', 'dalive-site', undefined, fakeSource as any,
            );

            // The seam passes the DA.live (content) coords, not the GitHub repo coords.
            expect(fakeSource.buildRegistrationSource).toHaveBeenCalledWith({
                org: 'dalive-org', site: 'dalive-site',
            });
            expect(params.contentSourceUrl).toBe('https://author-p1-e1.adobeaemcloud.com/content/demo');
            expect(params.contentSourceType).toBe('markup');
        });

        it('defaults to the DA.live content source when none is injected (existing callers unaffected)', () => {
            const params = buildSiteConfigParams('owner', 'repo', 'org', 'site');

            expect(params.contentSourceUrl).toBe('https://content.da.live/org/site/');
            expect(params.contentSourceType).toBe('markup');
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
    // updateSiteConfig
    // ==========================================================

    describe('updateSiteConfig', () => {
        const params: SiteRegistrationParams = {
            org: 'test-user',
            site: 'my-site',
            codeOwner: 'test-user',
            codeRepo: 'my-site',
            contentSourceUrl: 'https://content.da.live/test-user/my-site/',
        };

        it('should delete existing config then re-register', async () => {
            // Both delete and register succeed
            fetchSpy
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response(null, { status: 200 })); // PUT

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledTimes(2);

            // First call: DELETE
            expect(fetchSpy.mock.calls[0][1].method).toBe('DELETE');
            expect(fetchSpy.mock.calls[0][0]).toBe(
                'https://admin.hlx.page/config/test-user/sites/my-site.json',
            );

            // Second call: PUT (register)
            expect(fetchSpy.mock.calls[1][1].method).toBe('PUT');
        });

        it('should proceed with register when delete returns 404', async () => {
            // Config does not exist yet (404) — register anyway
            fetchSpy
                .mockResolvedValueOnce(new Response('Not Found', { status: 404 })) // DELETE 404
                .mockResolvedValueOnce(new Response(null, { status: 200 })); // PUT

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('should return error when delete fails with non-404 status', async () => {
            // Delete fails with 403
            fetchSpy.mockResolvedValueOnce(
                new Response('Forbidden', { status: 403 }),
            );

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to clear existing config');
            // Should not attempt register
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        it('should return register error when delete succeeds but register fails', async () => {
            fetchSpy
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 })); // PUT fails

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('auth failed');
            expect(result.statusCode).toBe(401);
        });

        // Legacy-registration cleanup. Storefronts created on builds before
        // commit 164fd251 registered their Helix site config under the DA.live
        // site name; current builds register under the GitHub repo name.
        // When `legacyLookupKey` is supplied, updateSiteConfig must DELETE
        // that legacy registration before the normal DELETE+PUT, otherwise
        // Helix elects the orphan as the primary content site and 403s every
        // write against the new registration.
        describe('legacy lookup key cleanup', () => {
            const paramsWithLegacy: SiteRegistrationParams = {
                org: 'skukla',
                site: 'b2b-boilerplate',
                codeOwner: 'skukla',
                codeRepo: 'b2b-boilerplate',
                contentSourceUrl: 'https://content.da.live/skukla/b2b-boilerplate-content/',
                legacyLookupKey: { org: 'skukla', site: 'b2b-boilerplate-content' },
            };

            it('DELETEs the legacy registration before the normal DELETE+PUT when legacyLookupKey is set', async () => {
                fetchSpy
                    .mockResolvedValueOnce(new Response(null, { status: 204 })) // legacy DELETE
                    .mockResolvedValueOnce(new Response(null, { status: 200 })) // normal DELETE
                    .mockResolvedValueOnce(new Response(null, { status: 201 })); // PUT

                const result = await service.updateSiteConfig(paramsWithLegacy);

                expect(result.success).toBe(true);
                expect(fetchSpy).toHaveBeenCalledTimes(3);

                // First call: DELETE at the LEGACY key (DA site name)
                expect(fetchSpy.mock.calls[0][1].method).toBe('DELETE');
                expect(fetchSpy.mock.calls[0][0]).toBe(
                    'https://admin.hlx.page/config/skukla/sites/b2b-boilerplate-content.json',
                );
                // Second call: DELETE at the NEW key (GitHub repo name)
                expect(fetchSpy.mock.calls[1][1].method).toBe('DELETE');
                expect(fetchSpy.mock.calls[1][0]).toBe(
                    'https://admin.hlx.page/config/skukla/sites/b2b-boilerplate.json',
                );
                // Third call: PUT at the NEW key
                expect(fetchSpy.mock.calls[2][1].method).toBe('PUT');
                expect(fetchSpy.mock.calls[2][0]).toBe(
                    'https://admin.hlx.page/config/skukla/sites/b2b-boilerplate.json',
                );
            });

            it('treats a 404 on the legacy DELETE as success (no orphan to clean up)', async () => {
                fetchSpy
                    .mockResolvedValueOnce(new Response('Not Found', { status: 404 })) // legacy DELETE 404
                    .mockResolvedValueOnce(new Response(null, { status: 200 })) // normal DELETE
                    .mockResolvedValueOnce(new Response(null, { status: 201 })); // PUT

                const result = await service.updateSiteConfig(paramsWithLegacy);

                expect(result.success).toBe(true);
                expect(fetchSpy).toHaveBeenCalledTimes(3);
            });

            it('does not invoke a legacy DELETE when legacyLookupKey is absent', async () => {
                fetchSpy
                    .mockResolvedValueOnce(new Response(null, { status: 200 })) // normal DELETE
                    .mockResolvedValueOnce(new Response(null, { status: 201 })); // PUT

                const result = await service.updateSiteConfig(params);

                expect(result.success).toBe(true);
                expect(fetchSpy).toHaveBeenCalledTimes(2);
                // The first call goes to the new registration, not any legacy one.
                expect(fetchSpy.mock.calls[0][0]).toBe(
                    'https://admin.hlx.page/config/test-user/sites/my-site.json',
                );
            });

            it('does not invoke a legacy DELETE when the legacy key matches the current key', async () => {
                // Edge case: someone constructs params with legacyLookupKey === current key.
                // The pre-flight DELETE would otherwise duplicate the normal DELETE.
                const paramsSameKey: SiteRegistrationParams = {
                    ...params,
                    legacyLookupKey: { org: params.org, site: params.site },
                };
                fetchSpy
                    .mockResolvedValueOnce(new Response(null, { status: 200 })) // normal DELETE
                    .mockResolvedValueOnce(new Response(null, { status: 201 })); // PUT

                const result = await service.updateSiteConfig(paramsSameKey);

                expect(result.success).toBe(true);
                expect(fetchSpy).toHaveBeenCalledTimes(2);
            });

            it('proceeds with the normal flow even when the legacy DELETE fails with a non-404 error', async () => {
                // The legacy cleanup is best-effort. A 403 or 500 on the legacy
                // DELETE shouldn't block the user from re-registering the new
                // site — the orphan is a self-inflicted state, not a security
                // boundary. Log it and continue.
                fetchSpy
                    .mockResolvedValueOnce(new Response('Forbidden', { status: 403 })) // legacy DELETE 403
                    .mockResolvedValueOnce(new Response(null, { status: 200 })) // normal DELETE
                    .mockResolvedValueOnce(new Response(null, { status: 201 })); // PUT

                const result = await service.updateSiteConfig(paramsWithLegacy);

                expect(result.success).toBe(true);
                expect(fetchSpy).toHaveBeenCalledTimes(3);
            });
        });
    });

    // ==========================================================
    // buildSiteConfigParams legacy-key population
    // ==========================================================

    describe('buildSiteConfigParams — legacyLookupKey population', () => {
        it('sets legacyLookupKey to the DA.live org/site when it differs from the GitHub repo name', () => {
            // Real-world case: GitHub repo "b2b-boilerplate", DA site "b2b-boilerplate-content"
            const params = buildSiteConfigParams(
                'skukla', 'b2b-boilerplate', 'skukla', 'b2b-boilerplate-content',
            );

            expect(params.legacyLookupKey).toEqual({
                org: 'skukla',
                site: 'b2b-boilerplate-content',
            });
        });

        it('omits legacyLookupKey when the GitHub repo name and DA site name match', () => {
            const params = buildSiteConfigParams(
                'skukla', 'matching-name', 'skukla', 'matching-name',
            );

            expect(params.legacyLookupKey).toBeUndefined();
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
