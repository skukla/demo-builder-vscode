/**
 * run_commerce_query — the tool the AGENT specified.
 *
 * Asked "how many products are in the catalog?", an agent found
 * `get_commerce_endpoints`, called it correctly, and then hand-wrote two curls
 * because nothing here runs a query. It reproduced identically across both full
 * battery runs (2026-08-26), so this is a stable gap and not a one-off.
 *
 * The spec is its own second curl, verbatim:
 *
 *     curl -s -X POST '<graphql>' -H 'Content-Type: application/json' \
 *       -H 'Store: bodea_us' -H 'Magento-Store-Code: bodea_store' \
 *       -H 'Magento-Store-View-Code: bodea_us' -H 'Magento-Website-Code: bodea' \
 *       -d '{"query":"{ products(...) { total_count } }"}'
 *
 * Everything before `-d` is what `get_commerce_endpoints` already returns. This
 * tool is that call with the query as its only required argument.
 *
 * ## The header rule, settled by the live backend
 *
 * The agent's two curls did NOT settle this: the second changed the query as well
 * as the headers, and the first failed on GraphQL syntax, so two variables moved
 * at once. The first implementation therefore followed `generateHeaders`' split —
 * `cs` only when targeting the `catalogService` endpoint — and every test here
 * passed against it.
 *
 * The live backend refused it: `productSearch` on bodea returned **"Missing
 * Magento-Website-Code Header"**. The reason is a shape no fixture showed —
 * **ACCS serves Commerce Core and Catalog Service from ONE endpoint**, so there is
 * no separate `catalogService` to target and an endpoint-driven rule can never
 * send those headers at all. PaaS has two endpoints; ACCS has one.
 *
 * The rule is therefore about what an endpoint SERVES, not what it is named.
 *
 * FIXTURES ARE THE SAME REAL ONES the endpoints tests use — bodea's ACCS config,
 * read from `~/.demo-builder/projects/bodea/.demo-builder.json`.
 */

import { registerCommerceQueryTool } from '@/features/ai/server/commerceQueryTool';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
         
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        raw: async (args?: unknown): Promise<string> =>
            (await tools.get('run_commerce_query')!(args)).content[0].text,
        json: async (args?: unknown): Promise<any> =>
            JSON.parse((await tools.get('run_commerce_query')!(args)).content[0].text),
    };
}

const getCurrentProject = jest.fn();
const stateManager = createMockStateManager({ getCurrentProject });

const ACCS_PROJECT = {
    name: 'bodea',
    path: '/p/bodea',
    componentSelections: { backend: 'adobe-commerce-accs', frontend: 'eds-storefront' },
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_WEBSITE_CODE: 'bodea',
            ACCS_STORE_CODE: 'bodea_store',
            ACCS_STORE_VIEW_CODE: 'bodea_us',
            ACCS_GRAPHQL_ENDPOINT:
                'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql',
        },
        'eds-storefront': {},
    },
    componentInstances: {},
};

/** PaaS has a real Catalog Service endpoint and the api-key headers ACCS lacks. */
const PAAS_PROJECT = {
    name: 'paas-demo',
    path: '/p/paas',
    componentSelections: { backend: 'adobe-commerce-paas' },
    componentConfigs: {
        'adobe-commerce-paas': {
            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://demo.adobedemo.com/graphql',
            PAAS_CATALOG_SERVICE_ENDPOINT: 'https://catalog-service-sandbox.adobe.io/graphql',
            ADOBE_CATALOG_API_KEY: 'the-catalog-key',
            ADOBE_COMMERCE_ENVIRONMENT_ID: 'env-1',
            ADOBE_COMMERCE_WEBSITE_CODE: 'base',
            ADOBE_COMMERCE_STORE_CODE: 'main',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
        },
    },
    componentInstances: {},
};

let fetchMock: jest.Mock;

function serve() {
    const s = fakeServer();
    registerCommerceQueryTool(s, stateManager, fetchMock as unknown as typeof fetch);
    return s;
}

beforeEach(() => {
    jest.clearAllMocks();
    getCurrentProject.mockResolvedValue(ACCS_PROJECT);
    fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { products: { total_count: 30 } } }),
    });
});

describe('run_commerce_query', () => {
    it('sends the query to the storefront endpoint with the store-scope headers', async () => {
        // THE point of the tool. A query sent without these reaches the wrong
        // store scope and comes back EMPTY WITHOUT AN ERROR — the failure the
        // headers exist to prevent, and the reason returning an endpoint alone
        // did not close the gap.
        const s = serve();
        await s.json({ query: '{ products { total_count } }' });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql');
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json');
        // ACCS gets BOTH header sets, and this is the assertion that was wrong
        // first time round. `Store` comes from `headers.all`; the `Magento-*` from
        // `headers.cs` — which an endpoint-driven rule would never send here,
        // because ACCS has no separate catalogService endpoint to target. The live
        // backend settled it: "Missing Magento-Website-Code Header" (2026-08-26),
        // while every test in this file passed.
        expect(init.headers.Store).toBe('bodea_us');
        expect(init.headers['Magento-Store-Code']).toBe('bodea_store');
        expect(init.headers['Magento-Website-Code']).toBe('bodea');
        expect(JSON.parse(init.body).query).toBe('{ products { total_count } }');
    });

    it('REFUSES a mutation — this tool reads', async () => {
        // Read-only by intent, decided before the schema was written rather than
        // after. A query tool that can mutate is a different risk conversation.
        const s = serve();
        const text = await s.raw({ query: 'mutation { createCart { id } }' });

        expect(text).toMatch(/read-only|mutation/i);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a mutation however it is spelled or spaced', async () => {
        const s = serve();
        for (const q of ['  MUTATION  { x }', '\n\tmutation Foo { x }', 'mutation{x}']) {
            expect(await s.raw({ query: q })).toMatch(/read-only|mutation/i);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns GraphQL errors as data rather than throwing', async () => {
        // A GraphQL 200 carrying an `errors` array is the normal way to be wrong,
        // and the agent needs to see it to fix its query.
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ errors: [{ message: 'Cannot query field "nope"' }] }),
        });
        const s = serve();
        const out = await s.json({ query: '{ nope }' });
        expect(out.errors[0].message).toContain('Cannot query field');
    });

    it('reports an HTTP failure with its status, not as a silent empty result', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
        const s = serve();
        const text = await s.raw({ query: '{ products { total_count } }' });
        expect(text).toMatch(/401/);
    });

    it('adds the Catalog Service headers only when querying Catalog Service', async () => {
        // The split is `generateHeaders`': `all` on every request, `cs` added for
        // Catalog Service. Sending `cs` everywhere would be guessing, and sending
        // it nowhere is the empty-result-with-no-error failure. Mirroring the
        // config generator means the endpoint an agent is told about and the one
        // queried cannot disagree.
        getCurrentProject.mockResolvedValue(PAAS_PROJECT);
        const s = serve();
        await s.json({ query: '{ productSearch { total_count } }', endpoint: 'catalogService' });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://catalog-service-sandbox.adobe.io/graphql');
        expect(init.headers['x-api-key']).toBe('the-catalog-key');
        expect(init.headers['Magento-Environment-Id']).toBe('env-1');
    });

    it('routes a catalogService request to the single ACCS endpoint instead of refusing', async () => {
        // Asking for the catalog service is the OBVIOUS read of "how many products
        // are in the catalog", and on ACCS it is correct — one endpoint serves
        // both. The first version answered "this project has no catalogService
        // endpoint": true of the name, false of the capability. An agent hit that
        // on 2026-08-26 and spent a round trip recovering from a non-error.
        const s = serve();
        await s.json({ query: '{ productSearch { total_count } }', endpoint: 'catalogService' });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql');
        expect(init.headers['Magento-Website-Code']).toBe('bodea');
    });

    it('still refuses an endpoint the project genuinely does not have', async () => {
        // The fallback is specific to catalogService-on-one-endpoint. A mesh that
        // was never deployed is a real absence and must still be named.
        const s = serve();
        const text = await s.raw({ query: '{ x }', endpoint: 'mesh' });
        expect(text).toMatch(/no `mesh` endpoint/i);
        expect(text).toMatch(/commerceGraphQl/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses with no current project', async () => {
        getCurrentProject.mockResolvedValue(undefined);
        const s = serve();
        expect(await s.raw({ query: '{ x }' })).toMatch(/no current project/i);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('truncates a huge response rather than returning it whole', async () => {
        // The one place this tool can blow up: a catalog query can return
        // megabytes. Bounded here, with the cut declared in the payload.
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ data: { items: 'x'.repeat(200_000) } }),
        });
        const s = serve();
        const text = await s.raw({ query: '{ products { items { sku } } }' });
        expect(text.length).toBeLessThan(40_000);
        expect(text).toMatch(/truncated/i);
    });
});
