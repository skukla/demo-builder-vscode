/**
 * DaLiveBlockLibraryOperations — the single doc-page writer and the doc-page probe.
 *
 * `upsertBlockDocPage` overwrites (the agent's promote flow refreshes its preview on
 * each run), so the `overwrite` argument is asserted. `getBlocksWithDocs` is the probe
 * the library build uses to keep a page a storefront already has.
 *
 * The document envelope is asserted whole rather than by substring: DA.live
 * treats direct children of `<main>` as sections, so the inner `<div>` is what
 * makes the block render as a block.
 */

import { findReplaceablePages } from '@/features/eds/services/blockLibrary/oldStubPages';
import {
    createBlockLibraryHarness,
    docPageProbe,
    type BlockLibraryHarness,
} from './daLiveBlockLibraryOperations.testUtils';

describe('DaLiveBlockLibraryOperations doc pages', () => {
    let h: BlockLibraryHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
    });

    const org = 'user-org';
    const site = 'user-site';

    describe('upsertBlockDocPage', () => {
        it('overwrites the page so a re-run refreshes the rendered preview', async () => {
            const status = await h.ops.upsertBlockDocPage(org, site, {
                id: 'hero',
                exampleHtml: '<div class="hero">Example</div>',
            });

            expect(h.createSource).toHaveBeenCalledWith(
                org,
                site,
                '.da/library/blocks/hero.html',
                '<body><!-- promote_block_to_library: an authored example, never replaced -->'
                    + '<header></header><main><div><div class="hero">Example</div></div></main>'
                    + '<footer></footer></body>',
                { overwrite: true }
            );
            expect(status).toBe('written');
        });

        // The old-stub rule takes a one-cell page holding the block's title as Demo Builder's
        // own and replaces it on the next Refresh Blocks. An agent may promote exactly that
        // shape (its title as the example's one cell); the page is still the agent's.
        it('writes a page the library build never takes as one it generated', async () => {
            await h.ops.upsertBlockDocPage(org, site, {
                id: 'hero',
                exampleHtml: '<div class="hero"><div><div><p>Hero</p></div></div></div>',
            });
            const written = String(h.createSource.mock.calls[0][3]);

            const replaceable = await findReplaceablePages(
                ['hero'],
                async () => written,
                () => ['Hero'],
            );

            expect(replaceable.size).toBe(0);
        });

        it('reports failure rather than throwing when DA.live rejects the write', async () => {
            h.createSource.mockResolvedValue({ success: false, error: 'forbidden' });

            const status = await h.ops.upsertBlockDocPage(org, site, {
                id: 'hero',
                exampleHtml: '<div class="hero"></div>',
            });

            expect(status).toBe('failed');
        });

        it('reports failure rather than throwing when the write throws', async () => {
            h.createSource.mockRejectedValue(new Error('socket hang up'));

            const status = await h.ops.upsertBlockDocPage(org, site, {
                id: 'hero',
                exampleHtml: '<div class="hero"></div>',
            });

            expect(status).toBe('failed');
        });
    });

    describe('the doc-page probe (getBlocksWithDocs)', () => {
        it('HEADs each block page on the destination site with the bearer token', async () => {
            h.fetchWithRetry.mockImplementation(docPageProbe(['hero']));

            const found = await h.ops.getBlocksWithDocs(org, site, [{ id: 'hero' }, { id: 'cards' }]);

            expect(found).toEqual(['hero']);
            expect(h.fetchWithRetry).toHaveBeenCalledWith(
                'https://admin.da.live/source/user-org/user-site/.da/library/blocks/hero.html',
                { method: 'HEAD', headers: { Authorization: 'Bearer mock-ims-token' } }
            );
        });

        it('counts a block whose probe throws as documented, so its page is kept', async () => {
            h.fetchWithRetry.mockRejectedValue(new Error('network down'));

            const found = await h.ops.getBlocksWithDocs(org, site, [{ id: 'hero' }]);

            expect(found).toStrictEqual(['hero']);
        });
    });
});
