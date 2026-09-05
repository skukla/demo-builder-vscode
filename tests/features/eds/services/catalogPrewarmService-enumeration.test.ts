/**
 * catalogPrewarmService — the Catalog Service request and the shape it reads back.
 *
 * `enumerateAccsCatalog` is module-private and is reached only through
 * `prewarmCatalog` and `pickSampleSku`, so every decision it makes has to be
 * driven from one of those two. The sibling suites cover the outcomes; this one
 * covers what is SENT (a mock cannot see a malformed call) and the payload
 * shapes that separate "the catalog is empty" from "the response is not the
 * shape we asked for".
 */

import { pickSampleSku, prewarmCatalog } from '@/features/eds/services/catalogPrewarmService';
import {
    ACCS_ENDPOINT,
    ACCS_ENUMERATION_HEADERS,
    catalogPage,
    graphqlResponse,
    makeAccsProject,
    makePublisher,
    mockLogger,
} from './catalogPrewarmService.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

const ACCS_OVERLAY =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=skukla&site=citisignal-b2b';
const DA_ORG = 'skukla';
const DA_SITE = 'citisignal-b2b';

/** One product, wrapped the way the Catalog Service returns it. */
const oneProduct = { productView: { sku: 'SKU1', urlKey: 'orchard' } };

function prewarm(onProgress?: jest.Mock) {
    return prewarmCatalog(
        makeAccsProject(),
        ACCS_OVERLAY,
        DA_ORG,
        DA_SITE,
        makePublisher(),
        mockLogger,
        onProgress,
    );
}

describe('catalog enumeration — the request it sends', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('POSTs to the configured endpoint with both header groups merged', async () => {
        // generateHeaders returns { all, cs } and the Catalog Service needs BOTH
        // on every request — `all` carries Store, `cs` the Magento-* scope.
        // Dropping either silently queries a different store view.
        (global.fetch as jest.Mock).mockResolvedValueOnce(catalogPage([oneProduct.productView]));

        await prewarm();

        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe(ACCS_ENDPOINT);
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual(ACCS_ENUMERATION_HEADERS);
    });

    it('asks for the first page by the agreed page size', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(catalogPage([oneProduct.productView]));

        await prewarm();

        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.variables).toEqual({ pageSize: 100, currentPage: 1 });
        expect(body.query).toContain('productSearch');
    });

    it('announces the enumeration step before it starts', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(catalogPage([oneProduct.productView]));
        const onProgress = jest.fn();

        await prewarm(onProgress);

        expect(onProgress).toHaveBeenCalledWith({
            operation: 'catalog-prewarm',
            message: 'Enumerating catalog...',
        });
    });
});

describe('catalog enumeration — reading the response', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('names the status and the endpoint when the POST is refused', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(graphqlResponse(undefined, {
            ok: false,
            status: 503,
        }));

        const result = await prewarm();

        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain(`HTTP 503 from ${ACCS_ENDPOINT}`);
    });

    it('accepts a response carrying an empty errors array', async () => {
        // `errors: []` is a successful GraphQL response. Treating the presence
        // of the key as a failure would skip prewarm on a healthy catalog.
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse({
                errors: [],
                data: { productSearch: { items: [oneProduct], page_info: { total_pages: 1 } } },
            }),
        );

        const result = await prewarm();

        expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0, skipped: false });
    });

    it('states which field was missing when the payload is not the shape asked for', async () => {
        // A payload with no data at all must not surface as a TypeError about
        // reading a property of undefined — the reason reaches the user.
        (global.fetch as jest.Mock).mockResolvedValueOnce(graphqlResponse({}));

        const result = await prewarm();

        expect(result.skipReason).toContain('Catalog response missing productSearch.items');
    });

    it('states the same when productSearch answers without items', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse({ data: { productSearch: { page_info: { total_pages: 1 } } } }),
        );

        const result = await prewarm();

        expect(result.skipReason).toContain('Catalog response missing productSearch.items');
    });

    it('skips an item that carries no productView', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse({
                data: {
                    productSearch: {
                        items: [{}, oneProduct],
                        page_info: { total_pages: 1 },
                    },
                },
            }),
        );

        const result = await prewarm();

        expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0, skipped: false });
    });

    it('treats a response with no page_info as a single page', async () => {
        // Absent pagination is one page, not a crash — the loop bound reads it.
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse({ data: { productSearch: { items: [oneProduct] } } }),
        );

        const result = await prewarm();

        expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0, skipped: false });
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });
});

describe("catalog enumeration — the caller's own cap", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('stops on the item that satisfies a small sample, mid-page', async () => {
        // pickSampleSku wants ONE product. Collecting the rest of the page is a
        // wasted walk over a catalog that may hold thousands.
        (global.fetch as jest.Mock).mockResolvedValue(
            graphqlResponse({
                data: {
                    productSearch: {
                        items: [
                            { productView: { sku: 'FIRST', urlKey: 'first' } },
                            { productView: { sku: 'SECOND', urlKey: 'second' } },
                        ],
                        page_info: { total_pages: 2 },
                    },
                },
            }),
        );

        const sample = await pickSampleSku(makeAccsProject(), mockLogger);

        expect(sample?.sku).toBe('FIRST');
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });

    it('stops on the LAST item of a page rather than fetching the next one', async () => {
        // The boundary the mid-page case cannot see: when the cap is reached by
        // the final item, a > instead of >= lets the loop walk to page two and
        // only stop on the page after that.
        (global.fetch as jest.Mock).mockResolvedValue(
            graphqlResponse({
                data: {
                    productSearch: {
                        items: [{ productView: { sku: 'ONLY', urlKey: 'only' } }],
                        page_info: { total_pages: 2 },
                    },
                },
            }),
        );

        const sample = await pickSampleSku(makeAccsProject(), mockLogger);

        expect(sample?.sku).toBe('ONLY');
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });
});

describe('prewarmCatalog — the skip reason it reports', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('names the backend it refused to prewarm', async () => {
        // The reason reaches the setup summary, so "non-ACCS backend" alone
        // leaves the reader guessing which backend they actually have.
        const paas = createMockProject({
            ...makeAccsProject(),
            componentSelections: { backend: 'adobe-commerce-paas' },
        });

        const result = await prewarmCatalog(
            paas,
            ACCS_OVERLAY,
            DA_ORG,
            DA_SITE,
            makePublisher(),
            mockLogger,
        );

        expect(result.skipReason).toBe('non-ACCS backend (paas)');
    });

});

describe('pickSampleSku — the guards before it asks', () => {
    /** An ACCS project with a storefront repo, so a served-config read is reachable. */
    function withStorefront(componentConfigs: Record<string, Record<string, string>>) {
        return makeAccsProject({
            componentConfigs,
            selectedStack: 'eds-accs',
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    status: 'ready',
                    metadata: { githubRepo: 'acme/shop' },
                },
            },
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('asks nothing for a non-ACCS backend, even one with an endpoint', async () => {
        // Enumeration is ACCS-only. A PaaS project can still carry a GraphQL
        // endpoint, so the backend check has to be what stops the request.
        const paas = createMockProject({
            ...withStorefront({
                'adobe-commerce-paas': { ADOBE_COMMERCE_GRAPHQL_ENDPOINT: ACCS_ENDPOINT },
            }),
            componentSelections: { backend: 'adobe-commerce-paas' },
        });

        await expect(pickSampleSku(paas, mockLogger)).resolves.toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('asks nothing when no Commerce endpoint is configured', async () => {
        const noEndpoint = withStorefront({
            'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'default' },
        });

        await expect(pickSampleSku(noEndpoint, mockLogger)).resolves.toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
