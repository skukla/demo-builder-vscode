/**
 * DaLiveConfigOperations — the config document itself.
 *
 * Both writes in this class share one read/write discipline: read the existing
 * document or fail closed, compute the `:names` sheet listing rather than
 * hardcoding it, and POST the whole document back. `:names` is the part that
 * bites — a document whose listing omits a sheet has effectively lost it, even
 * though the sheet is still in the JSON.
 *
 * Also here: the request shapes (a missing Authorization header reads as a
 * first-time-owner 401, not as a bug) and the diagnostics read, which must
 * never throw — it exists to explain a failure, not to become one.
 */

import {
    DaLiveConfigOperations,
    makeApiClient,
    mockGetImsToken,
    mockHasWriteAccess,
    resetConfigOpsMocks,
} from './daLiveConfigOperations.testUtils';
import { createMockLogger } from '../../../../helpers/loggerFake';

describe('DaLiveConfigOperations - the config document', () => {
    let fetchMock: jest.SpyInstance;

    beforeEach(() => {
        fetchMock = jest.spyOn(global, 'fetch');
        resetConfigOpsMocks();
    });
    afterEach(() => jest.restoreAllMocks());

    const ops = () => new DaLiveConfigOperations(makeApiClient(), createMockLogger());
    const entries = [{ title: 'Blocks', path: '/blocks/library' }];

    /** The config document the POST carried. */
    function postedConfig() {
        const body = (fetchMock.mock.calls[1][1] as RequestInit).body as FormData;
        return JSON.parse(body.get('config') as string) as Record<string, unknown>;
    }

    // =========================================================================
    // Reading
    // =========================================================================

    describe('reading the existing document', () => {
        it('asks the config endpoint for it, as the signed-in user', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().updateSiteConfig('demo-org', 'demo-site', entries);

            expect(fetchMock.mock.calls[0][0]).toBe(
                'https://admin.da.live/config/demo-org/demo-site'
            );
            expect(fetchMock.mock.calls[0][1]).toEqual({
                method: 'GET',
                headers: { Authorization: 'Bearer tok-123' },
            });
        });

        it('names the status it could not read past', async () => {
            // A 500 is not a 401: saying "verify DA.live ownership" for one sends
            // the SC to check a permission that was never the problem.
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Server Error',
            } as Response);

            const result = await ops().updateSiteConfig('org', 'site', entries);

            expect(result).toEqual({
                success: false,
                error: 'Failed to read existing config: 500 Server Error',
            });
            expect(mockHasWriteAccess).not.toHaveBeenCalled();
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('the fresh document written for a site that has none', () => {
        it('carries the multi-sheet markers DA.live needs to read it back', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().updateSiteConfig('org', 'site', entries);

            const posted = postedConfig();
            expect(posted[':version']).toBe(3);
            expect(posted[':type']).toBe('multi-sheet');
        });

        it('lists exactly the sheets it wrote', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().updateSiteConfig('org', 'site', entries);

            expect(postedConfig()[':names']).toEqual(['data', 'library']);
        });

        it('gives it an empty data sheet rather than none', async () => {
            // The library sheet is what this write is for, but a document with no
            // data sheet at all is one the next applySiteConfig has to invent.
            fetchMock
                .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().updateSiteConfig('org', 'site', entries);

            expect(postedConfig().data).toEqual({ total: 1, offset: 0, limit: 1, data: [{}] });
        });

        it('keeps a data sheet the site already had', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ data: { total: 1, data: [{ key: 'a', value: '1' }] } }),
                } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().updateSiteConfig('org', 'site', entries);

            expect(postedConfig().data).toEqual({ total: 1, data: [{ key: 'a', value: '1' }] });
        });
    });

    // =========================================================================
    // :names
    // =========================================================================

    describe('the sheet listing', () => {
        /** Write the library sheet over a document shaped like `existing`. */
        async function namesAfterWrite(existing: Record<string, unknown>): Promise<string[]> {
            fetchMock
                .mockResolvedValueOnce({ ok: true, json: async () => existing } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().updateSiteConfig('org', 'site', entries);

            return postedConfig()[':names'] as string[];
        }

        it('keeps a sheet this write does not touch', async () => {
            // A permissions sheet dropped from the listing is a site whose access
            // rules quietly stopped applying.
            expect(
                await namesAfterWrite({
                    ':names': ['data', 'permissions'],
                    permissions: { data: [] },
                })
            ).toEqual(['data', 'permissions', 'library']);
        });

        it('does not list a sheet twice', async () => {
            expect(await namesAfterWrite({ ':names': ['library', 'data'] })).toEqual([
                'library',
                'data',
            ]);
        });

        it('falls back to the document own sheets when the listing is missing', async () => {
            // An older document written before `:names` existed. The fallback has
            // to skip the colon-prefixed metadata, which is not a sheet.
            expect(
                await namesAfterWrite({
                    ':version': 3,
                    ':type': 'multi-sheet',
                    permissions: { data: [] },
                })
            ).toEqual(['permissions', 'data', 'library']);
        });

        it('ignores a listing that is not a list', async () => {
            expect(await namesAfterWrite({ ':names': 'data', permissions: {} })).toEqual([
                'permissions',
                'data',
                'library',
            ]);
        });
    });

    // =========================================================================
    // Writing
    // =========================================================================

    describe('writing the document back', () => {
        it('posts it as the config field of a form, as the signed-in user', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().updateSiteConfig('demo-org', 'demo-site', entries);

            const request = fetchMock.mock.calls[1][1] as RequestInit;
            expect(request.method).toBe('POST');
            expect(request.headers).toEqual({ Authorization: 'Bearer tok-123' });
            expect((request.body as FormData).get('config')).toEqual(expect.any(String));
        });

        it('reports the status and the body when DA.live refuses the write', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 403,
                    statusText: 'Forbidden',
                    text: async () => 'not a site admin',
                } as Response);

            const result = await ops().updateSiteConfig('org', 'site', entries);

            expect(result).toEqual({
                success: false,
                error: 'Failed to write config: 403 Forbidden - not a site admin',
            });
        });

        it('reports the status alone when there was no body', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Server Error',
                    text: async () => '',
                } as Response);

            const result = await ops().updateSiteConfig('org', 'site', entries);

            expect(result).toEqual({
                success: false,
                error: 'Failed to write config: 500 Server Error',
            });
        });
    });

    // =========================================================================
    // Diagnostics
    // =========================================================================

    describe('the diagnostics read', () => {
        it('answers with the document exactly as DA.live holds it', async () => {
            // Printed when the block library publishes cleanly and none of it
            // previews — the state nobody can inspect after the fact.
            const document = { ':names': ['data'], data: { data: [{ key: 'a', value: '1' }] } };
            fetchMock.mockResolvedValueOnce({ ok: true, json: async () => document } as Response);

            const result = await ops().readSiteConfigForDiagnostics('org', 'site');

            expect(result).toEqual(document);
        });

        it('answers with nothing rather than throwing when the read is refused', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
            mockHasWriteAccess.mockResolvedValue(false);

            await expect(ops().readSiteConfigForDiagnostics('org', 'site')).resolves.toBeNull();
        });

        it('answers with nothing rather than throwing when there is no token', async () => {
            // A diagnostic must never become the failure it was called to explain.
            mockGetImsToken.mockRejectedValue(new Error('not signed in to DA.live'));

            await expect(ops().readSiteConfigForDiagnostics('org', 'site')).resolves.toBeNull();
        });

        it('never writes anything', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

            await ops().readSiteConfigForDiagnostics('org', 'site');

            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });
});
