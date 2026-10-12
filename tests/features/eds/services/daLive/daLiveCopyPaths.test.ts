/**
 * backfillEssentialPaths — what the published-only copy adds to the content index.
 *
 * An SC cannot list a colleague's DA.live org, so a copy of their demo starts from the
 * published index, which lists pages and no sheets. This function asks the source for
 * what the index leaves out. It asked for `/placeholders`, one sheet, and the label
 * sheets a storefront really reads are `/placeholders/<area>`: on 2026-10-12 a copy of
 * a colleague's demo published Demo Builder's one-row stubs where the source served 160
 * cart labels (EDS-40).
 */

import { backfillCodePaths, backfillEssentialPaths } from '@/features/eds/services/daLive/daLiveCopyPaths';
import { PLACEHOLDER_STUB_PATHS } from '@/features/eds/services/placeholderStubs';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { installSiteFetch, restoreFetch } from '../../../../helpers/siteFetchFake';

const SOURCE = { org: 'colleague', site: 'their-demo' };
const BASE = 'https://main--their-demo--colleague.aem.live';

/** A source site that answers 200 for exactly these URLs. */
function sourceServing(urls: string[]): jest.Mock {
    return installSiteFetch(urls).fetchMock;
}

afterEach(restoreFetch);

describe('the label sheets of a source that can only be read from its published site', () => {
    it('asks the source for every area a storefront reads labels for', async () => {
        const fetchMock = sourceServing([]);

        await backfillEssentialPaths(createMockLogger(), SOURCE, [], []);

        const asked = fetchMock.mock.calls.map((call) => call[0]);
        for (const sheet of PLACEHOLDER_STUB_PATHS) {
            expect(asked).toContain(`${BASE}/${sheet}.json`);
        }
    });

    it('copies the sheets the source has and none it does not', async () => {
        sourceServing([`${BASE}/placeholders/cart.json`, `${BASE}/placeholders/global.json`]);
        const contentPaths: string[] = ['/about'];

        await backfillEssentialPaths(createMockLogger(), SOURCE, contentPaths, []);

        expect(contentPaths).toContain('/placeholders/cart');
        expect(contentPaths).toContain('/placeholders/global');
        expect(contentPaths).not.toContain('/placeholders/checkout');
        expect(contentPaths).toContain('/about');
    });

    it('does not ask again for a sheet the index already listed', async () => {
        const fetchMock = sourceServing([]);

        await backfillEssentialPaths(createMockLogger(), SOURCE, ['/placeholders/cart'], []);

        expect(fetchMock.mock.calls.map((call) => call[0])).not.toContain(`${BASE}/placeholders/cart.json`);
    });
});

describe('the label sheets, when the storefront’s own code has been read', () => {
    // The list of areas describes one version of one template. A storefront whose
    // code is in hand says exactly which sheets it fetches, so the list is only
    // the fallback for when the code could not be read.
    it('does not ask for the listed areas: the code says which sheets it fetches', async () => {
        const fetchMock = sourceServing([]);

        await backfillEssentialPaths(createMockLogger(), SOURCE, [], [], undefined, ['/cart']);

        const asked = fetchMock.mock.calls.map((call) => call[0]);
        for (const sheet of PLACEHOLDER_STUB_PATHS) {
            expect(asked).not.toContain(`${BASE}/${sheet}.json`);
        }
    });
});

describe('backfillCodePaths: what the storefront’s code loads, copied when the source has it', () => {
    it('asks the source for each path, a page at the .plain.html the copy reads and a sheet at its .json', async () => {
        const site = installSiteFetch([]);

        await backfillCodePaths(createMockLogger(), SOURCE, [], [
            '/cart',
            '/customer/forgotpassword',
            '/placeholders/cart.json',
        ]);

        expect(site.asked().sort()).toEqual([
            `${BASE}/cart.plain.html`,
            `${BASE}/customer/forgotpassword.plain.html`,
            `${BASE}/placeholders/cart.json`,
        ]);
    });

    it('adds what the source answers and drops what it does not', async () => {
        installSiteFetch([`${BASE}/cart.plain.html`, `${BASE}/placeholders/cart.json`]);
        const contentPaths = ['/about'];

        await backfillCodePaths(createMockLogger(), SOURCE, contentPaths, [
            '/cart',
            '/graphql',
            '/placeholders/cart.json',
            '/placeholders/quick-order.json',
        ]);

        // A sheet goes in under the extensionless path every copied document has.
        expect([...contentPaths].sort()).toEqual(['/about', '/cart', '/placeholders/cart']);
    });

    it('does not ask for, or add twice, a path the list already holds', async () => {
        const site = installSiteFetch([]);
        const contentPaths = ['/cart', '/placeholders/cart'];

        await backfillCodePaths(createMockLogger(), SOURCE, contentPaths, ['/cart', '/placeholders/cart.json']);

        expect(site.asked()).toStrictEqual([]);
        expect(contentPaths).toEqual(['/cart', '/placeholders/cart']);
    });

    it('returns the code paths the source has: listed already, or answered', async () => {
        installSiteFetch([`${BASE}/checkout.plain.html`]);

        const onSource = await backfillCodePaths(createMockLogger(), SOURCE, ['/cart'], [
            '/cart',
            '/checkout',
            '/graphql',
        ]);

        expect(onSource).toEqual(['/cart', '/checkout']);
    });

    it('treats a source that cannot be reached as having none of them', async () => {
        installSiteFetch([], [`${BASE}/cart.plain.html`]);
        const contentPaths: string[] = [];

        const onSource = await backfillCodePaths(createMockLogger(), SOURCE, contentPaths, ['/cart']);

        expect(onSource).toStrictEqual([]);
        expect(contentPaths).toStrictEqual([]);
    });
});
