/**
 * DaLiveBlockDocPages.getBlocksWithDocs — which blocks have a doc page on DA.live.
 *
 * One HEAD per block. They went one at a time until 2026-10-15, and a block library
 * rebuild asks four times over ~48 blocks: about 20 seconds of the Configure
 * Republish. Asserted: the same answer, in the blocks' own order, as before; the
 * HEADs run in batches rather than one after another; a failed or missing page is
 * simply not in the answer.
 */

import { DaLiveBlockDocPages } from '@/features/eds/services/daLive/daLiveBlockDocPages';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import type { DaLiveContentCopy } from '@/features/eds/services/daLive/daLiveContentCopy';
import type { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';
import { createMockLogger } from '../../../../helpers/loggerFake';

const blocks = (ids: string[]) => ids.map((id) => ({ id }));

/** A client whose HEAD answers 200 for the ids in `withDocs`, and tracks how many overlap. */
function client(withDocs: string[], fails: string[] = []) {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchWithRetry = jest.fn(async (url: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        const id = /blocks\/([^/]+)\.html$/.exec(url)?.[1] ?? '';
        if (fails.includes(id)) throw new Error('network');
        return { ok: withDocs.includes(id) } as Response;
    });
    const apiClient = { getImsToken: jest.fn().mockResolvedValue('t'), fetchWithRetry } as unknown as DaLiveApiClient;
    return { apiClient, fetchWithRetry, maxInFlight: () => maxInFlight };
}

function docPages(apiClient: DaLiveApiClient): DaLiveBlockDocPages {
    return new DaLiveBlockDocPages(
        apiClient,
        {} as DaLiveSourceOperations,
        {} as DaLiveContentCopy,
        createMockLogger(),
    );
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

    it('leaves out a block whose check failed, and answers the rest', async () => {
        const { apiClient } = client(['a', 'b'], ['a']);

        const found = await docPages(apiClient).getBlocksWithDocs('org', 'site', blocks(['a', 'b']));

        expect(found).toEqual(['b']);
    });
});
