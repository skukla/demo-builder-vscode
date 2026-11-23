/**
 * DaLiveBlockDocPages.getBlocksWithDocs — which blocks have a doc page on DA.live.
 *
 * One HEAD per block. They went one at a time until 2026-10-15, and a block library
 * rebuild asks four times over ~48 blocks: about 20 seconds of the Configure
 * Republish. Asserted: the same answer, in the blocks' own order, as before; the
 * HEADs run in batches rather than one after another. Only a definite 404 is "no page": a
 * check that fails any other way counts as a page, so the build keeps it rather than writing
 * over a page someone wrote (DA.live's source POST always writes). A 401 is an expired sign-in.
 */

import { DaLiveBlockDocPages } from '@/features/eds/services/daLive/daLiveBlockDocPages';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import type { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';
import { createMockLogger } from '../../../../helpers/loggerFake';

const blocks = (ids: string[]) => ids.map((id) => ({ id }));

/**
 * A client whose HEAD answers 200 for the ids in `withDocs`, `statuses[id]` for those named
 * there, 404 for the rest; ids in `fails` throw. Tracks how many requests overlap.
 */
function client(withDocs: string[], fails: string[] = [], statuses: Record<string, number> = {}) {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchWithRetry = jest.fn(async (url: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        const id = /blocks\/([^/]+)\.html$/.exec(url)?.[1] ?? '';
        if (fails.includes(id)) throw new Error('network');
        const status = statuses[id] ?? (withDocs.includes(id) ? 200 : 404);
        return { ok: status === 200, status } as Response;
    });
    const apiClient = { getImsToken: jest.fn().mockResolvedValue('t'), fetchWithRetry } as unknown as DaLiveApiClient;
    return { apiClient, fetchWithRetry, maxInFlight: () => maxInFlight };
}

function docPages(apiClient: DaLiveApiClient): DaLiveBlockDocPages {
    return new DaLiveBlockDocPages(apiClient, {} as DaLiveSourceOperations, createMockLogger());
}

describe('getBlocksWithDocs', () => {
    it("answers the blocks that have a doc page, in the blocks' own order", async () => {
        const { apiClient } = client(['e', 'b', 'g']);

        const found = await docPages(apiClient).getBlocksWithDocs('org', 'site', blocks(['a', 'b', 'c', 'd', 'e', 'f', 'g']));

        expect(found).toEqual(['b', 'e', 'g']);
    });

    it('asks once per block, with a HEAD on its doc page', async () => {
        const { apiClient, fetchWithRetry } = client(['a']);

        await docPages(apiClient).getBlocksWithDocs('org', 'site', blocks(['a', 'b']));

        expect(fetchWithRetry).toHaveBeenCalledTimes(2);
        expect(fetchWithRetry).toHaveBeenCalledWith(
            expect.stringMatching(/\/source\/org\/site\/\.da\/library\/blocks\/a\.html$/),
            { method: 'HEAD', headers: { Authorization: 'Bearer t' } },
        );
    });

    it('asks in batches, not one block after another', async () => {
        const { apiClient, maxInFlight } = client([]);

        await docPages(apiClient).getBlocksWithDocs('org', 'site', blocks(['a', 'b', 'c', 'd', 'e', 'f', 'g']));

        expect(maxInFlight()).toBeGreaterThan(1);
    });

    it('counts a block whose check failed as having a page, so it is kept', async () => {
        const { apiClient } = client(['b'], ['a'], { c: 429, d: 503, e: 403 });

        const found = await docPages(apiClient)
            .getBlocksWithDocs('org', 'site', blocks(['a', 'b', 'c', 'd', 'e', 'f']));

        expect(found).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('lets an expired sign-in through as DaLiveAuthError, so the caller can ask again', async () => {
        const { apiClient } = client([], [], { a: 401 });

        await expect(docPages(apiClient).getBlocksWithDocs('org', 'site', blocks(['a', 'b'])))
            .rejects.toBeInstanceOf(DaLiveAuthError);
    });

    it('lets a DaLiveAuthError the request throws through', async () => {
        const { apiClient, fetchWithRetry } = client([]);
        fetchWithRetry.mockRejectedValue(new DaLiveAuthError('Not authenticated.'));

        await expect(docPages(apiClient).getBlocksWithDocs('org', 'site', blocks(['a'])))
            .rejects.toBeInstanceOf(DaLiveAuthError);
    });
});

describe('readBlockDocPage', () => {
    function withSource(answer: { status: number; body: string }) {
        const readSource = jest.fn().mockResolvedValue({ ...answer, bytes: 0, truncated: false });
        const sourceOps = { readSource } as unknown as DaLiveSourceOperations;
        const pages = new DaLiveBlockDocPages(client([]).apiClient, sourceOps, createMockLogger());
        return { pages, readSource };
    }

    it("reads the block's doc page source through readSource", async () => {
        const { pages, readSource } = withSource({ status: 200, body: '<body>x</body>' });

        expect(await pages.readBlockDocPage('org', 'site', 'hero')).toBe('<body>x</body>');
        expect(readSource).toHaveBeenCalledWith('org', 'site', '.da/library/blocks/hero.html');
    });

    it('answers undefined when the page is not there', async () => {
        const { pages } = withSource({ status: 404, body: '' });

        expect(await pages.readBlockDocPage('org', 'site', 'hero')).toBeUndefined();
    });

    it('throws DaLiveAuthError on a 401, so an expired sign-in is not read as no page', async () => {
        const { pages } = withSource({ status: 401, body: '' });

        await expect(pages.readBlockDocPage('org', 'site', 'hero'))
            .rejects.toBeInstanceOf(DaLiveAuthError);
    });

    it('throws on any other failed read, rather than answering no page', async () => {
        const { pages } = withSource({ status: 503, body: '' });

        await expect(pages.readBlockDocPage('org', 'site', 'hero')).rejects.toThrow('503');
    });
});
