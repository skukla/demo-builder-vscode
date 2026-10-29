/**
 * catalogEnumeration — the Catalog Service request and the shape it reads back.
 *
 * The prewarm and sample suites cover what each caller does with the answer;
 * this one covers what is SENT (a mock cannot see a malformed call) and the
 * payload shapes that separate "the catalog is empty" from "the response is not
 * the shape we asked for".
 */

import { enumerateAccsCatalog } from '@/features/eds/services/catalogEnumeration';
import type { ConfigGeneratorParams } from '@/features/eds/services/configGenerator';
import { extractConfigParams } from '@/features/eds/services/storefrontConfigParams';
import {
    ACCS_ENDPOINT,
    ACCS_ENUMERATION_HEADERS,
    catalogPage,
    graphqlResponse,
    makeAccsProject,
    mockLogger,
} from './catalogPrewarmService.testUtils';

/** One product, wrapped the way the Catalog Service returns it. */
const oneProduct = { productView: { sku: 'SKU1', urlKey: 'orchard' } };

/** The params the callers hand over for the fixture ACCS project. */
function accsParams(): ConfigGeneratorParams {
    return {
        githubOwner: 'acme',
        repoName: 'shop',
        daLiveOrg: 'acme',
        daLiveSite: 'shop',
        ...extractConfigParams(makeAccsProject()),
    };
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

        await enumerateAccsCatalog(accsParams(), mockLogger);

        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe(ACCS_ENDPOINT);
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual(ACCS_ENUMERATION_HEADERS);
    });

    it('asks for the first page by the agreed page size', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(catalogPage([oneProduct.productView]));

        await enumerateAccsCatalog(accsParams(), mockLogger);

        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.variables).toEqual({ pageSize: 100, currentPage: 1 });
        expect(body.query).toContain('productSearch');
    });

    it('refuses to run without an endpoint rather than POSTing to nothing', async () => {
        await expect(
            enumerateAccsCatalog({ ...accsParams(), commerceEndpoint: undefined }, mockLogger),
        ).rejects.toThrow('catalog prewarm requires a commerceEndpoint');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('catalog enumeration — reading the response', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('names the status and the endpoint when the POST is refused', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse(undefined, { ok: false, status: 503 }),
        );

        await expect(enumerateAccsCatalog(accsParams(), mockLogger)).rejects.toThrow(
            `HTTP 503 from ${ACCS_ENDPOINT}`,
        );
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

        await expect(enumerateAccsCatalog(accsParams(), mockLogger)).resolves.toStrictEqual([
            { sku: 'SKU1', urlKey: 'orchard' },
        ]);
    });

    it('joins every GraphQL error message into the reason', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse({ errors: [{ message: 'first' }, { message: 'second' }] }),
        );

        await expect(enumerateAccsCatalog(accsParams(), mockLogger)).rejects.toThrow(
            'GraphQL errors: first; second',
        );
    });

    it('states which field was missing when the payload is not the shape asked for', async () => {
        // A payload with no data at all must not surface as a TypeError about
        // reading a property of undefined — the reason reaches the user.
        (global.fetch as jest.Mock).mockResolvedValueOnce(graphqlResponse({}));

        await expect(enumerateAccsCatalog(accsParams(), mockLogger)).rejects.toThrow(
            'Catalog response missing productSearch.items',
        );
    });

    it('states the same when productSearch answers without items', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse({ data: { productSearch: { page_info: { total_pages: 1 } } } }),
        );

        await expect(enumerateAccsCatalog(accsParams(), mockLogger)).rejects.toThrow(
            'Catalog response missing productSearch.items',
        );
    });

    it('skips an item that carries no productView, or one missing sku or urlKey', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse({
                data: {
                    productSearch: {
                        items: [
                            {},
                            { productView: { sku: 'NO-KEY' } },
                            { productView: { urlKey: 'no-sku' } },
                            oneProduct,
                        ],
                        page_info: { total_pages: 1 },
                    },
                },
            }),
        );

        await expect(enumerateAccsCatalog(accsParams(), mockLogger)).resolves.toStrictEqual([
            { sku: 'SKU1', urlKey: 'orchard' },
        ]);
    });

    it('treats a response with no page_info as a single page', async () => {
        // Absent pagination is one page, not a crash — the loop bound reads it.
        (global.fetch as jest.Mock).mockResolvedValueOnce(
            graphqlResponse({ data: { productSearch: { items: [oneProduct] } } }),
        );

        await expect(enumerateAccsCatalog(accsParams(), mockLogger)).resolves.toHaveLength(1);
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });

    it('reads every page the response says exists, asking for each by number', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce(
                graphqlResponse({
                    data: { productSearch: { items: [oneProduct], page_info: { total_pages: 2 } } },
                }),
            )
            .mockResolvedValueOnce(
                graphqlResponse({
                    data: {
                        productSearch: {
                            items: [{ productView: { sku: 'SKU2', urlKey: 'grove' } }],
                            page_info: { total_pages: 2 },
                        },
                    },
                }),
            );

        await expect(enumerateAccsCatalog(accsParams(), mockLogger)).resolves.toStrictEqual([
            { sku: 'SKU1', urlKey: 'orchard' },
            { sku: 'SKU2', urlKey: 'grove' },
        ]);
        const pages = (global.fetch as jest.Mock).mock.calls.map(
            ([, init]) => JSON.parse(init.body).variables.currentPage,
        );
        expect(pages).toStrictEqual([1, 2]);
    });
});

describe("catalog enumeration — the caller's own cap", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('stops on the item that satisfies a small sample, mid-page', async () => {
        // The diagnostics sample wants ONE product. Collecting the rest of the
        // page is a wasted walk over a catalog that may hold thousands.
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

        await expect(enumerateAccsCatalog(accsParams(), mockLogger, 1)).resolves.toStrictEqual([
            { sku: 'FIRST', urlKey: 'first' },
        ]);
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

        await expect(enumerateAccsCatalog(accsParams(), mockLogger, 1)).resolves.toStrictEqual([
            { sku: 'ONLY', urlKey: 'only' },
        ]);
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });
});
