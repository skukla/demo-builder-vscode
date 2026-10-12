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

import { backfillEssentialPaths } from '@/features/eds/services/daLive/daLiveCopyPaths';
import { PLACEHOLDER_STUB_PATHS } from '@/features/eds/services/placeholderStubs';
import { createMockLogger } from '../../../../helpers/loggerFake';

const SOURCE = { org: 'colleague', site: 'their-demo' };
const BASE = 'https://main--their-demo--colleague.aem.live';

/** A source site that answers 200 for exactly these URLs. */
function sourceServing(urls: string[]): jest.Mock {
    const fetchMock = jest.fn(async (url: string) => ({ ok: urls.includes(url) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

const realFetch = global.fetch;
afterEach(() => {
    global.fetch = realFetch;
});

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
