/**
 * Which of the storefront's existing block pages the build keeps and which it replaces (step-02).
 * DA.live's source POST always writes, so the build itself is all that protects a page someone
 * wrote: it replaces only a page Demo Builder provably generated (the old stub holding the
 * block's title, or an untouched placeholder), and lets an expired DA.live sign-in through so the
 * caller can ask again rather than treating unread pages as none.
 */

import { restoreFetch } from '../../../../helpers/siteFetchFake';
import { PARAMS, SC_PAGE, harness, oldStub } from './storefrontBlockLibrary.testUtils';
import { blockDoc } from '@/features/eds/services/blockLibrary/blockDoc';
import { buildStorefrontBlockLibrary } from '@/features/eds/services/blockLibrary/storefrontBlockLibrary';
import { DaLiveAuthError } from '@/features/eds/services/types';

/** What the real DA.live code throws on a 401 (`DaLiveApiClient.createErrorFromResponse`). */
const expired = (): DaLiveAuthError =>
    new DaLiveAuthError('Authentication expired. Please log in again.');

const CART_ROW_PATH = 'https://content.da.live/user-org/user-site/.da/library/blocks/commerce-cart';

/** `cards` and `commerce-cart` have pages; `commerce-cart`'s source is `page`. */
function withCartPage(page: string) {
    const h = harness();
    h.blockLibOps.getBlocksWithDocs.mockResolvedValue(['cards', 'commerce-cart']);
    h.blockLibOps.readBlockDocPage.mockImplementation(
        async (_org: string, _site: string, id: string) =>
            (id === 'commerce-cart' ? page : SC_PAGE),
    );
    return h;
}

describe('buildStorefrontBlockLibrary: existing pages', () => {
    afterEach(() => restoreFetch());

    describe('a page Demo Builder wrote as a stub', () => {
        it('is replaced by the real-use example, and the writer told to overwrite it', async () => {
            const h = withCartPage(oldStub('commerce-cart', '<p>Commerce Cart</p>'));

            await buildStorefrontBlockLibrary(h.deps, PARAMS);

            expect(h.exampleOf('commerce-cart')).toMatchObject({ kind: 'real-use', from: '/cart' });
            expect(h.exampleOf('cards')).toEqual({ kind: 'existing' });
            expect(h.written().replacePageIds).toEqual(new Set(['commerce-cart']));
            expect(h.blockLibOps.readBlockDocPage.mock.calls).toEqual([
                ['user-org', 'user-site', 'cards'],
                ['user-org', 'user-site', 'commerce-cart'],
            ]);
        });

        it('is replaced when its cell holds the block\'s sheet row name', async () => {
            const h = withCartPage(oldStub('commerce-cart', '<p>Shopping Cart</p>'));
            h.blockLibOps.readBlocksSheetRows.mockResolvedValue([
                { name: 'Shopping Cart', path: CART_ROW_PATH },
            ]);

            await buildStorefrontBlockLibrary(h.deps, PARAMS);

            expect(h.blockLibOps.readBlocksSheetRows).toHaveBeenCalledWith('user-org', 'user-site');
            expect(h.written().replacePageIds).toEqual(new Set(['commerce-cart']));
        });

        it('is kept once its one cell was rewritten', async () => {
            const h = withCartPage(oldStub('commerce-cart', '<p>Our cart, checked weekly</p>'));
            h.blockLibOps.readBlocksSheetRows.mockResolvedValue([
                { name: 'Commerce Cart', path: CART_ROW_PATH },
            ]);

            await buildStorefrontBlockLibrary(h.deps, PARAMS);

            expect(h.exampleOf('commerce-cart')).toEqual({ kind: 'existing' });
            expect(h.written().replacePageIds).toEqual(new Set());
        });

        it('is kept once its cell was edited', async () => {
            const h = withCartPage(oldStub('commerce-cart', '<p>Commerce Cart</p><p>Our cart</p>'));

            await buildStorefrontBlockLibrary(h.deps, PARAMS);

            expect(h.exampleOf('commerce-cart')).toEqual({ kind: 'existing' });
            expect(h.written().replacePageIds).toEqual(new Set());
        });

        it('is kept once it holds two cells', async () => {
            const h = withCartPage(oldStub('commerce-cart', '<p>Commerce Cart</p></div><div><p>B</p>'));

            await buildStorefrontBlockLibrary(h.deps, PARAMS);

            expect(h.exampleOf('commerce-cart')).toEqual({ kind: 'existing' });
        });

        it('is kept when its source cannot be read', async () => {
            const h = withCartPage('');
            h.blockLibOps.readBlockDocPage.mockRejectedValue(new Error('DA.live 503'));

            await buildStorefrontBlockLibrary(h.deps, PARAMS);

            expect(h.exampleOf('commerce-cart')).toEqual({ kind: 'existing' });
        });
    });

    describe('a placeholder page', () => {
        it('is replaced by a better example while untouched', async () => {
            const page = blockDoc('commerce-cart', { analysis: { rows: 1, columns: 2, variants: [] } });
            const h = withCartPage(page);

            await buildStorefrontBlockLibrary(h.deps, PARAMS);

            expect(h.exampleOf('commerce-cart')).toMatchObject({ kind: 'real-use', from: '/cart' });
            expect(h.written().replacePageIds).toEqual(new Set(['commerce-cart']));
            // Its current body goes to the writer, which skips a write that would not change it.
            expect(h.written().replacedPages).toEqual(new Map([['commerce-cart', page]]));
        });

        it('is kept once a cell was edited', async () => {
            const h = withCartPage(blockDoc('commerce-cart').replace('Column 1 content', 'Our cart'));

            await buildStorefrontBlockLibrary(h.deps, PARAMS);

            expect(h.exampleOf('commerce-cart')).toEqual({ kind: 'existing' });
        });
    });

    describe('an expired DA.live sign-in is let through, so the caller can ask again', () => {
        it('while checking which pages exist', async () => {
            const h = harness();
            h.blockLibOps.getBlocksWithDocs.mockRejectedValue(expired());

            await expect(buildStorefrontBlockLibrary(h.deps, PARAMS))
                .rejects.toBeInstanceOf(DaLiveAuthError);
        });

        it('while reading a page', async () => {
            const h = withCartPage('');
            h.blockLibOps.readBlockDocPage.mockRejectedValue(expired());

            await expect(buildStorefrontBlockLibrary(h.deps, PARAMS))
                .rejects.toBeInstanceOf(DaLiveAuthError);
            expect(h.blockLibOps.writeStorefrontBlockLibrary).not.toHaveBeenCalled();
        });

        it('while reading the blocks sheet for the blocks\' titles', async () => {
            const h = withCartPage(oldStub('commerce-cart', '<p>Commerce Cart</p>'));
            h.blockLibOps.readBlocksSheetRows.mockRejectedValue(expired());

            await expect(buildStorefrontBlockLibrary(h.deps, PARAMS))
                .rejects.toBeInstanceOf(DaLiveAuthError);
        });
    });
});
