/**
 * storeViewProducts — does a guest see any products in this store view? (EDS-46)
 *
 * One anonymous Catalog Service search, scoped by the same headers the storefront
 * sends. The four answers and what separates them are the contract; the request
 * itself is asserted too, because a mocked fetch cannot see a malformed call.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { probeStoreViewProducts } from '@/features/eds/services/storeViewProducts';
import type { StoreViewCodes } from '@/types/commerceStore';
import { createMockLogger } from '../../../helpers/loggerFake';
import { graphqlResponse } from './catalogPrewarmService.testUtils';

const ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/tenant/graphql';
const SCOPE: StoreViewCodes = {
    websiteCode: 'justrite',
    storeCode: 'justrite_store',
    storeViewCode: 'justrite_us',
};
const logger = createMockLogger();

/** A productSearch answer carrying only the count the probe reads. */
function counted(totalCount: number) {
    return graphqlResponse({ data: { productSearch: { total_count: totalCount, items: [] } } });
}

function fetchMock(): jest.Mock {
    return global.fetch as jest.Mock;
}

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
});

describe('probeStoreViewProducts — the answer', () => {
    it("answers 'found' when the search counts at least one product", async () => {
        fetchMock().mockResolvedValueOnce(counted(42));

        await expect(probeStoreViewProducts(ENDPOINT, SCOPE, logger)).resolves.toBe('found');
    });

    it("answers 'none' when the search runs and counts nothing", async () => {
        fetchMock().mockResolvedValueOnce(counted(0));

        await expect(probeStoreViewProducts(ENDPOINT, SCOPE, logger)).resolves.toBe('none');
    });

    it("answers 'no-index' when Catalog Service says the scope has no search index", async () => {
        fetchMock().mockResolvedValueOnce(
            graphqlResponse({ errors: [{ message: 'No index was found for this request' }] }),
        );

        await expect(probeStoreViewProducts(ENDPOINT, SCOPE, logger)).resolves.toBe('no-index');
    });

    it.each([
        ['an HTTP error', () => fetchMock().mockResolvedValueOnce(graphqlResponse({}, { ok: false, status: 503 }))],
        ['a network failure', () => fetchMock().mockRejectedValueOnce(new TypeError('fetch failed'))],
        [
            'a timeout',
            () =>
                fetchMock().mockRejectedValueOnce(
                    Object.assign(new Error('The operation was aborted due to timeout'), {
                        name: 'TimeoutError',
                    }),
                ),
        ],
        ['any other GraphQL error', () => fetchMock().mockResolvedValueOnce(graphqlResponse({ errors: [{ message: 'boom' }] }))],
        ['a payload with no count', () => fetchMock().mockResolvedValueOnce(graphqlResponse({ data: { productSearch: {} } }))],
    ])("answers 'unknown' on %s — never a claim", async (_label, arrange) => {
        arrange();

        await expect(probeStoreViewProducts(ENDPOINT, SCOPE, logger)).resolves.toBe('unknown');
    });

    it("answers 'unknown' without asking when there is no endpoint", async () => {
        await expect(probeStoreViewProducts('', SCOPE, logger)).resolves.toBe('unknown');
        expect(fetchMock()).not.toHaveBeenCalled();
    });
});

describe('probeStoreViewProducts — the request', () => {
    it('POSTs to the endpoint with the scope as the storefront sends it, as a guest', async () => {
        fetchMock().mockResolvedValueOnce(counted(1));

        await probeStoreViewProducts(ENDPOINT, SCOPE, logger);

        const [url, init] = fetchMock().mock.calls[0];
        expect(url).toBe(ENDPOINT);
        expect(init.method).toBe('POST');
        expect(init.headers).toStrictEqual({
            Store: 'justrite_us',
            'Magento-Customer-Group': '',
            'Magento-Store-Code': 'justrite_store',
            'Magento-Store-View-Code': 'justrite_us',
            'Magento-Website-Code': 'justrite',
            'Content-Type': 'application/json',
        });
    });

    it('asks for one product and the total count, not a page of them', async () => {
        fetchMock().mockResolvedValueOnce(counted(1));

        await probeStoreViewProducts(ENDPOINT, SCOPE, logger);

        const body = JSON.parse(fetchMock().mock.calls[0][1].body);
        expect(body.query).toContain('productSearch');
        expect(body.query).toContain('total_count');
        expect(body.variables).toStrictEqual({ pageSize: 1 });
    });

    it('bounds the wait with the quick timeout', async () => {
        const timeout = jest.spyOn(AbortSignal, 'timeout');
        fetchMock().mockResolvedValueOnce(counted(1));

        await probeStoreViewProducts(ENDPOINT, SCOPE, logger);

        expect(timeout).toHaveBeenCalledWith(TIMEOUTS.QUICK);
        expect(fetchMock().mock.calls[0][1].signal).toBe(timeout.mock.results[0].value);
        timeout.mockRestore();
    });
});
