/**
 * ConfigurationService.updateSiteConfig — the delete/re-register cycle.
 *
 * Split out of `configurationService.test.ts` when that file passed the repo's
 * 750-line ceiling (`npm run validate:test-file-sizes`). This half is where the
 * site-access safety properties live, and they are the reason the cycle is
 * dangerous at all: the DELETE takes the site's `access/admin.json` with it, so
 * an ordinary project edit can destroy every admin on the storefront.
 *
 * Both failure surfaces are pinned here — refusing to run when the current
 * admin list cannot be captured, and reporting the grants that were lost when
 * they cannot be handed back.
 */

import { ConfigurationService } from '@/features/eds/services/configurationService';
import type { SiteRegistrationParams } from '@/features/eds/services/configurationService';

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
        service = new ConfigurationService(mockTokenProvider as any, mockLogger as any);
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockResolvedValue(new Response(null, { status: 200 }));
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe('updateSiteConfig', () => {
        const params: SiteRegistrationParams = {
            org: 'test-user',
            site: 'my-site',
            codeOwner: 'test-user',
            codeRepo: 'my-site',
            contentSourceUrl: 'https://content.da.live/test-user/my-site/',
        };

        it('PRESERVES site admin grants across the delete/re-register', async () => {
            // MEASURED 2026-08-14 against the live service: deleting a site config
            // takes its access sub-resource with it. Two admins went in, the
            // config was deleted and re-registered, and access/admin.json came
            // back 404 — every grant destroyed. Since updateSiteConfig runs on
            // every edit, a team's admin list evaporated on each one.
            fetchSpy
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            role: { admin: ['a@adobe.com', 'b@adobe.com'] },
                            requireAuth: 'auto',
                        }),
                        { status: 200 }
                    )
                ) // GET access (capture)
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // PUT
                .mockResolvedValueOnce(new Response('{}', { status: 200 })); // POST restore

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(true);
            const restore = fetchSpy.mock.calls[3];
            expect(restore[0]).toBe(
                'https://admin.hlx.page/config/test-user/sites/my-site/access/admin.json'
            );
            expect(restore[1].method).toBe('POST');
            expect(JSON.parse(restore[1].body)).toEqual({
                role: { admin: ['a@adobe.com', 'b@adobe.com'] },
            });
        });

        it('REFUSES the update when the grants cannot be captured', async () => {
            // The delete destroys access/admin.json, and a failed capture is
            // indistinguishable from "no grants". Proceeding meant one flaky GET
            // permanently stranded the site: nothing in the app can grant the
            // role back, because the access endpoint requires the role that was
            // just erased.
            fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 })); // GET access

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/could not read the current site administrators/i);
            // The DELETE must never have been issued.
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(
                fetchSpy.mock.calls.some(
                    (c: unknown[]) => (c[1] as RequestInit)?.method === 'DELETE'
                )
            ).toBe(false);
        });

        it('reports lost grants when the restore fails, WITHOUT failing the update', async () => {
            // The mirror of the capture guard. The config write genuinely landed,
            // so failing it would send users to re-run something that worked — but
            // the grants are gone and nothing in the app can restore them, because
            // the access endpoint requires the role that was lost. It has to be
            // said out loud, and masked, because this reaches a dialog and the log.
            fetchSpy
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ role: { admin: ['a@x.test', 'b@x.test'] } }), {
                        status: 200,
                    })
                ) // GET access (capture)
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // PUT
                .mockResolvedValueOnce(new Response('nope', { status: 500 })) // POST restore
                .mockResolvedValueOnce(new Response('nope', { status: 500 })); // POST retry

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(true);
            expect(result.grantsRestored).toBe(false);
            expect(result.lostGrants).toEqual(['a****@x.test', 'b****@x.test']);
        });

        it('retries the restore once before declaring the grants lost', async () => {
            fetchSpy
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ role: { admin: ['a@x.test'] } }), { status: 200 })
                )
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // PUT
                .mockResolvedValueOnce(new Response('blip', { status: 500 })) // POST restore fails
                .mockResolvedValueOnce(new Response('{}', { status: 200 })); // POST retry succeeds

            const result = await service.updateSiteConfig(params);

            expect(result.grantsRestored).toBe(true);
            expect(result.lostGrants).toBeUndefined();
        });

        it('carries 403 out when the capture was REFUSED, not merely broken', async () => {
            // The capture sits behind the same [admin] gate as the write, so
            // during admin-role propagation it is refused BEFORE the delete that
            // would have produced the 403. Returning no status switched off the
            // propagation retry, the Code Sync deep link and the repair command's
            // whole recovery dialog — the refusal has to look like a refusal.
            fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403 })); // GET access

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(403);
        });

        it('carries 401 out when the SESSION died, not the role', async () => {
            // `classify` folds 401 and 403 into `not_authorized`, which is right for
            // deciding whether to retry and wrong for choosing a remedy: a 403 needs
            // a grant, a 401 needs a sign-in. Hardcoding 403 sent an expired session
            // to grant itself a role it already held.
            fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 })); // GET access

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(401);
        });

        it('does not POST a restore when there were no grants to preserve', async () => {
            // A site with no access doc captures {} — restoring an empty map
            // would write a doc that did not exist and is pure noise.
            fetchSpy
                .mockResolvedValueOnce(new Response('Not Found', { status: 404 })) // GET access
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response(null, { status: 200 })); // PUT

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledTimes(3);
        });

        it('does not fail the update when the restore itself fails', async () => {
            // The site config IS updated at that point. Reporting failure would
            // send the caller down a remediation path for a write that worked.
            fetchSpy
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ role: { admin: ['a@adobe.com'] } }), {
                        status: 200,
                    })
                )
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // PUT
                .mockResolvedValueOnce(new Response(null, { status: 500 })); // restore fails

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(true);
        });

        it('should delete existing config then re-register', async () => {
            // Both delete and register succeed
            fetchSpy
                .mockResolvedValueOnce(new Response('Not Found', { status: 404 })) // GET access (capture — no grants)
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response(null, { status: 200 })); // PUT

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledTimes(3);

            // First call: DELETE
            expect(fetchSpy.mock.calls[1][1].method).toBe('DELETE');
            expect(fetchSpy.mock.calls[1][0]).toBe(
                'https://admin.hlx.page/config/test-user/sites/my-site.json'
            );

            // Second call: PUT (register)
            expect(fetchSpy.mock.calls[2][1].method).toBe('PUT');
        });

        it('should proceed with register when delete returns 404', async () => {
            // Config does not exist yet (404) — register anyway
            fetchSpy
                .mockResolvedValueOnce(new Response('Not Found', { status: 404 })) // GET access (capture — no grants)
                .mockResolvedValueOnce(new Response('Not Found', { status: 404 })) // DELETE 404
                .mockResolvedValueOnce(new Response(null, { status: 200 })); // PUT

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(true);
            expect(fetchSpy).toHaveBeenCalledTimes(3);
        });

        it('should return error when delete fails with non-404 status', async () => {
            // Delete fails with 403
            fetchSpy
                .mockResolvedValueOnce(new Response('Not Found', { status: 404 })) // GET access (capture)
                .mockResolvedValueOnce(new Response('Forbidden', { status: 403 })); // DELETE

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to clear existing config');
            // Should not attempt register
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('should return register error when delete succeeds but register fails', async () => {
            fetchSpy
                .mockResolvedValueOnce(new Response('Not Found', { status: 404 })) // GET access (capture — no grants)
                .mockResolvedValueOnce(new Response(null, { status: 200 })) // DELETE
                .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 })); // PUT fails

            const result = await service.updateSiteConfig(params);

            expect(result.success).toBe(false);
            expect(result.error).toContain('auth failed');
            expect(result.statusCode).toBe(401);
        });

        // The 'legacy lookup key cleanup' describe lived here until 2026-08-23.
        // legacyLookupKey is retired: reset and repair both run the storefront
        // name migration before registering, and the migration's own DELETE+PUT
        // removes the legacy registration — so updateSiteConfig never again
        // sees a mismatched name to clean up after.
    });
});
