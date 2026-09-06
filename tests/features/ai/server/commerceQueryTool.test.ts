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
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    // The DECLARATION is kept, not discarded: `needsAuth`, the read-only
    // annotations and the endpoint enum are contract an agent's client reads out
    // of `tools/list`, and nothing else in this repo checks them for this tool.
    const declarations = new Map<string, McpToolSchema>();
    return {
         
        registerTool(name: string, def: McpToolSchema, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
            declarations.set(name, def);
        },
        declaration: (): McpToolSchema => declarations.get('run_commerce_query')!,
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

/** A project whose storefront queries a deployed MESH, not Commerce directly. */
const MESH_PROJECT = {
    ...ACCS_PROJECT,
    name: 'mesh-demo',
    appBuilderComponents: {
        mesh: { kind: 'mesh', endpoint: 'https://graph.adobe.io/api/abc123/graphql' },
    },
};

/** A project with no Commerce connection configured at all. */
const BARE_PROJECT = {
    name: 'bare',
    path: '/p/bare',
    componentSelections: {},
    componentConfigs: {},
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

/**
 * The decisions the first pass left unconstrained — the declaration an agent's
 * client reads, the query guard's edges, endpoint selection, and the three
 * failure paths (network, oversized body, unparseable body).
 */
describe('run_commerce_query — the declaration', () => {
    it('declares itself read-only, non-destructive and needing no sign-in', async () => {
        // These three reach the client verbatim in `tools/list`, and the dry run
        // gates on `readOnlyHint`. Nothing else in this repo checks them for this
        // tool, so a flipped hint would ship silently.
        const decl = serve().declaration();

        expect(decl.needsAuth).toBe(false);
        expect(decl.annotations?.readOnlyHint).toBe(true);
        expect(decl.annotations?.destructiveHint).toBe(false);
    });

    it('takes a query, optional variables, and an endpoint drawn from the three real ones', async () => {
        const shape = serve().declaration().inputSchema as Record<
            string,
            { safeParse: (v: unknown) => { success: boolean } }
        >;

        expect(Object.keys(shape).sort()).toStrictEqual(['endpoint', 'query', 'variables']);
        for (const name of ['commerceGraphQl', 'catalogService', 'mesh']) {
            expect(shape.endpoint.safeParse(name).success).toBe(true);
        }
        expect(shape.endpoint.safeParse('somewhere-else').success).toBe(false);
        expect(shape.query.safeParse(42).success).toBe(false);
    });
});

describe('run_commerce_query — what counts as a query', () => {
    it('refuses a mutation hidden behind a comment', async () => {
        // Comments are stripped BEFORE the check for exactly this: `# ...` in
        // front of `mutation` would otherwise walk straight past a guard that
        // only looks at the start of the string.
        const s = serve();
        const text = await s.raw({ query: '# innocent\nmutation { createCart { id } }' });

        expect(text).toMatch(/read-only/i);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends a read query that merely names a field `subscription`', async () => {
        // The guard anchors at the START. A field called `subscription` inside a
        // selection set is a perfectly ordinary read, and refusing it would be a
        // false positive an agent cannot work around.
        const s = serve();
        await s.json({ query: '{subscription{id}}' });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toBe('{subscription{id}}');
    });

    it('sends a read query that quotes the word mutation as a filter value', async () => {
        const s = serve();
        await s.json({ query: '{ products(filter: { sku: { eq: "mutation" } }) { total_count } }' });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('asks for a query when called with no arguments at all', async () => {
        const s = serve();

        expect(await s.raw()).toBe('Error: `query` is required.');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks for a query when given only whitespace', async () => {
        const s = serve();

        expect(await s.raw({ query: '   \n\t ' })).toBe('Error: `query` is required.');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('run_commerce_query — which endpoint', () => {
    it('defaults to the deployed mesh when that is what the storefront queries', async () => {
        // `storefrontUses` is the answer to "what does the site do", and an agent
        // reproducing the site must hit the same endpoint. Defaulting to Commerce
        // here would answer a different question than the one asked.
        getCurrentProject.mockResolvedValue(MESH_PROJECT);
        const s = serve();
        await s.json({ query: '{ products { total_count } }' });

        expect(fetchMock.mock.calls[0][0]).toBe('https://graph.adobe.io/api/abc123/graphql');
    });

    it('names Commerce GraphQL — not `none` — when the project has no endpoints', async () => {
        // `storefrontUses` is the sentinel string 'none' for an unconfigured
        // project, and it is not an endpoint key. Passing it through would print
        // "no `none` endpoint", which tells an agent nothing it can act on.
        getCurrentProject.mockResolvedValue(BARE_PROJECT);
        const s = serve();
        const text = await s.raw({ query: '{ x }' });

        expect(text).toMatch(/no `commerceGraphQl` endpoint/);
        expect(text).toMatch(/no Commerce endpoints configured at all/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('leaves the Catalog Service headers off a Commerce Core query when the project has both', async () => {
        // PaaS has two endpoints, so "which headers" has a real answer here: the
        // `cs` set belongs to the Catalog Service one only. Sending it everywhere
        // would be the mirror of the bug that made ACCS fail.
        getCurrentProject.mockResolvedValue(PAAS_PROJECT);
        const s = serve();
        await s.json({ query: '{ products { total_count } }', endpoint: 'commerceGraphQl' });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://demo.adobedemo.com/graphql');
        expect(init.headers['x-api-key']).toBeUndefined();
        expect(init.headers['Magento-Environment-Id']).toBeUndefined();
    });

    it('passes GraphQL variables through to the backend', async () => {
        const s = serve();
        await s.json({ query: 'query P($sku: String!) { products(sku: $sku) { id } }', variables: { sku: 'ADB123' } });

        expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables).toStrictEqual({ sku: 'ADB123' });
    });

    it('omits `variables` entirely when the query takes none', async () => {
        const s = serve();
        await s.json({ query: '{ products { total_count } }' });

        expect(Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body))).toStrictEqual(['query']);
    });
});

describe('run_commerce_query — failure paths', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    /** Let the handler run up to its `await fetchImpl(...)` under fake timers. */
    async function reachTheRequest(): Promise<void> {
        for (let i = 0; i < 10; i++) await Promise.resolve();
    }

    it('reports a network failure by name instead of returning nothing', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
        const s = serve();

        expect(await s.raw({ query: '{ x }' })).toBe(
            'Error: the request to commerceGraphQl failed — ECONNREFUSED',
        );
    });

    it('reports a non-Error rejection rather than printing [object Object]', async () => {
        fetchMock.mockRejectedValue('socket hang up');
        const s = serve();

        expect(await s.raw({ query: '{ x }' })).toBe(
            'Error: the request to commerceGraphQl failed — socket hang up',
        );
    });

    it('aborts the request once the backend has had its full timeout', async () => {
        jest.useFakeTimers();
        let signal: AbortSignal | undefined;
        let answer: (v: unknown) => void = () => {};
        fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
            signal = init.signal;
            return new Promise((resolve) => {
                answer = resolve;
            });
        });
        const s = serve();
        // The outcome is HELD before anything is asserted. An assertion that
        // throws while a promise is still in flight leaves that rejection
        // unhandled, and an unhandled rejection kills the Stryker worker — which
        // scores the mutant as a crash instead of a kill.
        const settled = s.raw({ query: '{ x }' }).then(
            () => 'answered',
            () => 'threw',
        );
        await reachTheRequest();
        expect(signal?.aborted).toBe(false);

        jest.advanceTimersByTime(30_000);

        expect(signal?.aborted).toBe(true);
        answer({ ok: true, status: 200, text: async () => '{}' });
        expect(await settled).toBe('answered');
    });

    it('cancels the timeout once the backend has answered', async () => {
        // Without the `finally`, the abort still fires half a minute later. It
        // reaches nothing in this handler, but the signal is the caller's and a
        // stale abort on it is a real leak.
        jest.useFakeTimers();
        let signal: AbortSignal | undefined;
        fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
            signal = init.signal;
            return Promise.resolve({ ok: true, status: 200, text: async () => '{}' });
        });
        const s = serve();
        await s.json({ query: '{ x }' });

        jest.advanceTimersByTime(30_000);

        expect(signal?.aborted).toBe(false);
    });

    it('clips a long error body rather than pasting the whole failure page back', async () => {
        const page = 'E'.repeat(2_000);
        fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => page });
        const s = serve();
        const text = await s.raw({ query: '{ x }' });

        expect(text).toBe(`Error: commerceGraphQl returned HTTP 500. ${'E'.repeat(500)}`);
    });

    it('returns a body of exactly the ceiling whole, uncut', async () => {
        // The cut is at MORE than the ceiling. A body exactly at it is complete,
        // and announcing a truncation that did not happen would tell an agent to
        // narrow a query that was already fine.
        const body = 'x'.repeat(30_000);
        fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => body });
        const s = serve();
        const text = await s.raw({ query: '{ x }' });

        expect(text).toBe(body);
        expect(text).not.toMatch(/truncated/i);
    });

    it('hands back an unparseable body as-is instead of swallowing it', async () => {
        // A gateway that answers 200 with HTML is the case: the agent can only
        // diagnose that if it sees what came back.
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => '<html>varnish cache server</html>',
        });
        const s = serve();

        expect(await s.raw({ query: '{ x }' })).toBe('<html>varnish cache server</html>');
    });
});
