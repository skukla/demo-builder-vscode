/**
 * DaLiveConfigOperations.applySiteConfig — merging rows into a site's data sheet.
 *
 * This is a read-merge-write over a live config document, and nothing covered it
 * before PL-22 MUT-04. Three things it must get right, each with a real failure
 * behind it: it must not lose a row the SC's site already had (the block library
 * lives in the same document), it must be able to REMOVE a key — a merge cannot,
 * so removal is the only way to revert one to the da.live default — and it must
 * tell the caller what was actually removed rather than what was asked for, or
 * a caller that clears a key defensively warns on every single run.
 *
 * Assertions read the POSTed document, because that is the only place the merge
 * becomes visible.
 */

import {
    DaLiveConfigOperations,
    makeApiClient,
    mockHasWriteAccess,
    resetConfigOpsMocks,
} from './daLiveConfigOperations.testUtils';
import { createMockLogger } from '../../../../helpers/loggerFake';

type Row = { key: string; value: string };

describe('DaLiveConfigOperations.applySiteConfig', () => {
    let fetchMock: jest.SpyInstance;

    beforeEach(() => {
        fetchMock = jest.spyOn(global, 'fetch');
        resetConfigOpsMocks();
    });
    afterEach(() => jest.restoreAllMocks());

    /** A site whose config already holds `rows` in its data sheet. */
    function siteHolding(rows: Row[], extra: Record<string, unknown> = {}) {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: { total: rows.length, offset: 0, limit: rows.length, data: rows },
                    ...extra,
                }),
            } as Response)
            .mockResolvedValueOnce({ ok: true } as Response);
    }

    const ops = () => new DaLiveConfigOperations(makeApiClient(), createMockLogger());

    /** The config document the second call POSTed. */
    function postedConfig() {
        const body = (fetchMock.mock.calls[1][1] as RequestInit).body as FormData;
        return JSON.parse(body.get('config') as string) as {
            data: { total: number; offset: number; limit: number; data: Row[] };
            ':names': string[];
        };
    }

    const postedRows = () => postedConfig().data.data;

    describe('merging', () => {
        it('keeps rows the site already had', async () => {
            siteHolding([{ key: 'aem.repositoryId', value: 'author-p1-e1' }]);

            await ops().applySiteConfig('org', 'site', { 'editor.path': '/ue' });

            expect(postedRows()).toEqual([
                { key: 'aem.repositoryId', value: 'author-p1-e1' },
                { key: 'editor.path', value: '/ue' },
            ]);
        });

        it('overwrites a key the site already had', async () => {
            siteHolding([{ key: 'editor.path', value: '/old' }]);

            await ops().applySiteConfig('org', 'site', { 'editor.path': '/new' });

            expect(postedRows()).toEqual([{ key: 'editor.path', value: '/new' }]);
        });

        it('writes into a site whose config has no data sheet yet', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().applySiteConfig('org', 'site', { 'editor.path': '/ue' });

            expect(postedRows()).toEqual([{ key: 'editor.path', value: '/ue' }]);
        });

        it('skips a stored row with no key rather than writing a nameless one back', async () => {
            // DA.live sheets can carry a blank trailing row; keying a map on it
            // would write an empty-string key the site never had.
            siteHolding([
                { key: '', value: 'orphan' },
                { key: 'kept', value: 'yes' },
            ]);

            await ops().applySiteConfig('org', 'site', { added: 'row' });

            expect(postedRows()).toEqual([
                { key: 'kept', value: 'yes' },
                { key: 'added', value: 'row' },
            ]);
        });

        it('counts the rows it wrote in the sheet header', async () => {
            // DA.live reads total/limit off the sheet, not off the array.
            siteHolding([{ key: 'a', value: '1' }]);

            await ops().applySiteConfig('org', 'site', { b: '2' });

            expect(postedConfig().data).toEqual({
                total: 2,
                offset: 0,
                limit: 2,
                data: [
                    { key: 'a', value: '1' },
                    { key: 'b', value: '2' },
                ],
            });
        });
    });

    describe('removing a key', () => {
        it('drops it from the sheet', async () => {
            siteHolding([
                { key: 'editor.path', value: '/ue' },
                { key: 'aem.repositoryId', value: 'author-p1-e1' },
            ]);

            await ops().applySiteConfig('org', 'site', {}, ['editor.path']);

            expect(postedRows()).toEqual([{ key: 'aem.repositoryId', value: 'author-p1-e1' }]);
        });

        it('reports what was actually there, not what was asked for', async () => {
            // The distinction the caller needs: only the first means the SC just
            // lost something.
            siteHolding([{ key: 'editor.path', value: '/ue' }]);

            const result = await ops().applySiteConfig('org', 'site', { a: '1' }, [
                'editor.path',
                'never.set',
            ]);

            expect(result.removed).toEqual(['editor.path']);
        });

        it('removes even when the same key is also being set', async () => {
            // Removal runs after the merge, deliberately: a caller clearing a key
            // wins over one that set it earlier in the same call.
            siteHolding([{ key: 'editor.path', value: '/old' }]);

            await ops().applySiteConfig('org', 'site', { 'editor.path': '/new' }, ['editor.path']);

            expect(postedRows()).toEqual([]);
        });

        it('reports nothing removed when the write failed', async () => {
            // The row is still there; saying it went would be a lie the caller
            // then reports to the SC.
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ data: { data: [{ key: 'editor.path', value: '/ue' }] } }),
                } as Response)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Server Error',
                    text: async () => '',
                } as Response);

            const result = await ops().applySiteConfig('org', 'site', {}, ['editor.path']);

            expect(result.success).toBe(false);
            expect(result.removed).toEqual([]);
        });
    });

    describe('the no-op short-circuit', () => {
        it('writes nothing when there is nothing to change', async () => {
            // A POST here would rewrite the sheet to its current state — or worse,
            // create an empty config document where the site had none.
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { data: [{ key: 'a', value: '1' }] } }),
            } as Response);

            const result = await ops().applySiteConfig('org', 'site', {});

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ success: true, removed: [] });
        });

        it('writes nothing when the key to remove was never there', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { data: [{ key: 'a', value: '1' }] } }),
            } as Response);

            const result = await ops().applySiteConfig('org', 'site', {}, ['never.set']);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ success: true, removed: [] });
        });

        it('does write when a key really is being removed', async () => {
            siteHolding([{ key: 'editor.path', value: '/ue' }]);

            const result = await ops().applySiteConfig('org', 'site', {}, ['editor.path']);

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(result).toEqual({ success: true, removed: ['editor.path'] });
        });

        it('does write when there are updates but nothing to remove', async () => {
            siteHolding([]);

            const result = await ops().applySiteConfig('org', 'site', { a: '1' });

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(result).toEqual({ success: true, removed: [] });
        });
    });

    describe('when the config cannot be read', () => {
        it('surfaces the error and writes nothing', async () => {
            // Fail closed: a skeleton write here would drop the block library and
            // any permissions sheet the site has.
            fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

            const result = await ops().applySiteConfig('org', 'site', { a: '1' });

            expect(result).toEqual({
                success: false,
                error: 'Cannot read existing config: socket hang up',
            });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('surfaces a refused 401 without writing', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
            mockHasWriteAccess.mockResolvedValue(false);

            const result = await ops().applySiteConfig('org', 'site', { a: '1' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('verify DA.live ownership of "org"');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('the sheet listing this write produces', () => {
        it('adds the data sheet to a listing that did not name it', async () => {
            // A site whose config was written by the library path alone has a
            // data sheet in the JSON but not in `:names`. DA.live reads the
            // listing, so an unnamed sheet is one the site cannot see.
            siteHolding([], { ':names': ['library'], library: { data: [] } });

            await ops().applySiteConfig('org', 'site', { a: '1' });

            expect(postedConfig()[':names']).toEqual(['library', 'data']);
        });

        it('writes the multi-sheet markers when the site had no config at all', async () => {
            // The 404 path: nothing to preserve, so the document is created here.
            // Without the version and type markers DA.live cannot read it back.
            fetchMock
                .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
                .mockResolvedValueOnce({ ok: true } as Response);

            await ops().applySiteConfig('org', 'site', { a: '1' });

            const posted = postedConfig() as unknown as Record<string, unknown>;
            expect(posted[':version']).toBe(3);
            expect(posted[':type']).toBe('multi-sheet');
            expect(posted[':names']).toEqual(['data']);
        });
    });

    describe('other sheets', () => {
        it('are carried through the write untouched', async () => {
            // The block library lives in this same document. Writing only the
            // data sheet is what keeps it.
            siteHolding([{ key: 'a', value: '1' }], {
                library: { total: 1, data: [{ title: 'Blocks', path: '/blocks' }] },
                ':names': ['data', 'library'],
            });

            await ops().applySiteConfig('org', 'site', { b: '2' });

            const posted = postedConfig() as unknown as Record<string, unknown>;
            expect(posted.library).toEqual({
                total: 1,
                data: [{ title: 'Blocks', path: '/blocks' }],
            });
            expect(posted[':names']).toEqual(['data', 'library']);
        });
    });
});
