/**
 * `check-store-view-products` — the store-view product check, answered to the
 * webview (EDS-46).
 *
 * Pattern B: the handler RETURNS its answer. It drives the real service against
 * a faked `fetch`, so what is asserted is what reaches Catalog Service, not what
 * a mocked service was handed.
 *
 * ACCS only. Every other case answers `unknown` without a request, because the
 * pickers render `unknown` as nothing — a refusal must never become a claim.
 */

import { handleCheckStoreViewProducts } from '@/features/eds/handlers/storeViewProductsHandler';
import type { CheckStoreViewProductsRequest } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { graphqlResponse } from '../services/catalogPrewarmService.testUtils';

const REQUEST: CheckStoreViewProductsRequest = {
    backendType: 'accs',
    endpoint: 'https://na1-sandbox.api.commerce.adobe.com/tenant/graphql',
    websiteCode: 'base',
    storeCode: 'main_website_store',
    storeViewCode: 'default',
};

function fetchMock(): jest.Mock {
    return global.fetch as jest.Mock;
}

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
});

describe('check-store-view-products', () => {
    it('returns the verdict for the store view it was asked about', async () => {
        fetchMock().mockResolvedValueOnce(
            graphqlResponse({ data: { productSearch: { total_count: 0 } } }),
        );

        const result = await handleCheckStoreViewProducts(createMockHandlerContext(), REQUEST);

        expect(result).toStrictEqual({ success: true, data: { verdict: 'none' } });
        expect(fetchMock().mock.calls[0][0]).toBe(REQUEST.endpoint);
        expect(fetchMock().mock.calls[0][1].headers).toMatchObject({
            'Magento-Website-Code': 'base',
            'Magento-Store-Code': 'main_website_store',
            'Magento-Store-View-Code': 'default',
        });
    });

    it('returns no-index when the scope has no search index', async () => {
        fetchMock().mockResolvedValueOnce(
            graphqlResponse({ errors: [{ message: 'No index was found for this request' }] }),
        );

        const result = await handleCheckStoreViewProducts(createMockHandlerContext(), REQUEST);

        expect(result).toStrictEqual({ success: true, data: { verdict: 'no-index' } });
    });

    it.each<[string, Partial<CheckStoreViewProductsRequest> | undefined]>([
        ['a PaaS backend', { backendType: 'paas' }],
        ['no endpoint', { endpoint: '' }],
        ['an endpoint that is not https', { endpoint: 'http://na1-sandbox.api.commerce.adobe.com/graphql' }],
        ['a missing store view code', { storeViewCode: '' }],
        ['a code that could not be a store code', { websiteCode: 'base\r\nX-Injected: 1' }],
    ])('answers unknown without asking for %s', async (_label, change) => {
        const result = await handleCheckStoreViewProducts(createMockHandlerContext(), {
            ...REQUEST,
            ...change,
        });

        expect(result).toStrictEqual({ success: true, data: { verdict: 'unknown' } });
        expect(fetchMock()).not.toHaveBeenCalled();
    });

    it('answers unknown without asking when there is no payload', async () => {
        const result = await handleCheckStoreViewProducts(createMockHandlerContext());

        expect(result).toStrictEqual({ success: true, data: { verdict: 'unknown' } });
        expect(fetchMock()).not.toHaveBeenCalled();
    });
});
