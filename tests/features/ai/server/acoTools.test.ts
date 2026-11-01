/**
 * The ACO tools. Argument-pinned, because a mocked fetch cannot see a malformed call: which URL, which
 * headers, which scope the token asked for. Admin and tenant answers are shaped as the real ones read
 * on 2026-11-01; the tenant's is that answer reduced to what the code reads.
 */

import { registerAcoTools } from '@/features/ai/server/acoTools';
import { readAcoConnector, tenantOfEndpoint } from '@/features/data-installer/services/aco/acoConnector';
import { acoCredentialKey } from '@/features/components/services/acoCredentialStore';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const PROJECT_PATH = '/projects/demo';
const ACO_CONFIG = {
    ACO_TENANT_ID: 'TenantAbc123',
    ACO_CATALOG_VIEW_ID: 'view-1',
    ACO_LOCALE: 'en-US',
};
const SECRET = 'fake-test-pw-not-a-secret';
/** A token whose claims name an org and both scopes, as IMS's did. */
const TOKEN = `h.${Buffer.from(JSON.stringify({ org: 'ORG@AdobeOrg', scope: 'openid,commerce.aco.admin,commerce.aco.ingestion' })).toString('base64url')}.s`;

function server() {
    const tools = new Map<string, (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: true }>>();
    const defs = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: (args: any) => Promise<any>) {
            tools.set(name, handler);
            defs.set(name, def);
        },
        def: (name: string) => defs.get(name)!,
        call: async (name: string, args?: unknown) => (await tools.get(name)!(args)).content[0].text,
        result: async (name: string, args?: unknown) => tools.get(name)!(args),
    };
}

interface Sent {
    url: string;
    init: RequestInit;
}

function answers(reply: (url: string, init: RequestInit) => { status?: number; body: unknown } | undefined) {
    const sent: Sent[] = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
        sent.push({ url, init });
        if (url.includes('ims/token')) return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 86400 }), { status: 200 });
        const answer = reply(url, init) ?? { body: { data: {} } };
        return new Response(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body), { status: answer.status ?? 200 });
    }) as unknown as typeof fetch;
    return { sent, fetchMock };
}

function setup(reply: Parameters<typeof answers>[0], options: { addons?: string[]; credential?: boolean } = {}) {
    const { addons = ['adobe-commerce-aco'], credential = true } = options;
    const project = createMockProject({
        name: 'demo',
        path: PROJECT_PATH,
        selectedAddons: addons,
        componentConfigs: {
            'adobe-commerce-aco': ACO_CONFIG,
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/AccsTenant1/graphql' },
        },
        componentSelections: { backend: 'adobe-commerce-accs' },
    });
    const secrets = {
        get: jest.fn(async (key: string) =>
            credential && key === acoCredentialKey(PROJECT_PATH) ? JSON.stringify({ clientId: 'client-1', clientSecret: SECRET }) : undefined,
        ),
    };
    const ctx = createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject: jest.fn(async () => project) }),
    }) as HandlerContext;
    (ctx as unknown as { context: unknown }).context = { secrets };
    const s = server();
    const { sent, fetchMock } = answers(reply);
    registerAcoTools(s as never, () => ctx, fetchMock);
    return { s, sent };
}

const headersOf = (call: Sent) => call.init.headers as Record<string, string>;
const bodyOf = (call: Sent) => JSON.parse(String(call.init.body));
const notToken = (sent: Sent[]) => sent.filter((call) => !call.url.includes('ims/token'));

describe('run_aco_query', () => {
    it("asks the instance's storefront GraphQL as the project's view and locale, with no credential", async () => {
        const { s, sent } = setup(() => ({ body: { data: { products: [] } } }), { credential: false });

        expect(await s.call('run_aco_query', { query: '{ products(skus:["A"]) { sku } }' })).toBe('{"data":{"products":[]}}');

        expect(sent).toHaveLength(1);
        expect(sent[0].url).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/graphql');
        expect(headersOf(sent[0])).toEqual({ 'Content-Type': 'application/json', 'AC-View-ID': 'view-1', 'AC-Source-Locale': 'en-US' });
    });

    it('asks as the view, locale, price book and token it is given', async () => {
        const { s, sent } = setup(() => ({ body: { data: {} } }));
        await s.call('run_aco_query', { query: '{ x }', viewId: 'view-2', locale: 'de-CH', priceBookId: 'book', accessToken: 'jwt' });
        expect(headersOf(sent[0])).toEqual({
            'Content-Type': 'application/json',
            'AC-View-ID': 'view-2',
            'AC-Source-Locale': 'de-CH',
            'AC-Price-Book-ID': 'book',
            'AC-Catalog-View-Access-Token': 'jwt',
        });
    });

    it("hands back ACO's own words when it refuses a price book with a 403", async () => {
        const refusal = { errors: [{ message: 'Price book not in the channel allowed list!' }] };
        const { s } = setup(() => ({ status: 403, body: refusal }));
        expect(await s.call('run_aco_query', { query: '{ x }', priceBookId: 'nope' })).toBe(JSON.stringify(refusal));
    });

    it('refuses a mutation without sending it', async () => {
        const { s, sent } = setup(() => undefined);
        expect(await s.call('run_aco_query', { query: 'mutation { x }' })).toMatch(/^Error: run_aco_query only reads/u);
        expect(sent).toStrictEqual([]);
    });

    it('says so when the project does not have ACO on', async () => {
        const { s } = setup(() => undefined, { addons: [] });
        expect(await s.call('run_aco_query', { query: '{ x }' })).toMatch(/does not have the ACO add-on on/u);
    });

    it('cuts a long answer and says so', async () => {
        const { s } = setup(() => ({ body: 'x'.repeat(30_100) }));
        expect(await s.call('run_aco_query', { query: '{ x }' })).toMatch(/^\[truncated: 30100 chars/u);
    });
});

describe('run_aco_admin', () => {
    it('reads the admin GraphQL with the admin scope and the client id as the API key', async () => {
        const views = { data: { catalogViews: [{ viewId: 'v', name: 'BuildRight-Default' }] } };
        const { s, sent } = setup(() => ({ body: views }));

        expect(await s.call('run_aco_admin', { query: '{ catalogViews { viewId name } }' })).toBe(JSON.stringify(views));

        const token = sent.find((call) => call.url.includes('ims/token'))!;
        expect(new URLSearchParams(String(token.init.body)).get('scope')).toBe('openid,AdobeID,profile,email,commerce.aco.admin');
        const [call] = notToken(sent);
        expect(call.url).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/admin/graphql');
        expect(headersOf(call)).toMatchObject({ Authorization: `Bearer ${TOKEN}`, 'x-api-key': 'client-1' });
    });

    it("hands back the API's words for a wrong field: with introspection off, they are the schema", async () => {
        const wrong = { errors: [{ message: 'Cannot query field "zzz" on type "Query".' }] };
        const { s } = setup(() => ({ status: 400, body: wrong }));
        expect(await s.call('run_aco_admin', { query: '{ zzz }' })).toBe(JSON.stringify(wrong));
    });

    it('never names the secret when the API fails', async () => {
        const { s } = setup(() => ({ status: 500, body: 'boom' }));
        const answer = await s.call('run_aco_admin', { query: '{ x }' });
        expect(answer).toMatch(/^Error: ACO's admin API answered 500/u);
        expect(answer).not.toContain(SECRET);
    });

    it('refuses a mutation, and says where one goes', async () => {
        const { s } = setup(() => undefined);
        expect(await s.call('run_aco_admin', { query: 'mutation { x }' })).toMatch(/write_aco_admin/u);
    });

    it('says what to run when no credential is held', async () => {
        const { s } = setup(() => undefined, { credential: false });
        expect(await s.call('run_aco_admin', { query: '{ x }' })).toMatch(/set_up_aco_credential/u);
    });
});

describe('write_aco_admin', () => {
    it('does nothing without confirm', async () => {
        const { s, sent } = setup(() => undefined);
        expect((await s.result('write_aco_admin', { mutation: 'mutation { x }' })).isError).toBe(true);
        expect(sent).toStrictEqual([]);
    });

    it('sends the mutation and its variables', async () => {
        const { s, sent } = setup(() => ({ body: { data: { deleteCatalogView: true } } }));
        await s.call('write_aco_admin', { mutation: 'mutation($id:String!){ deleteCatalogView(viewId:$id) }', variables: { id: 'v' }, confirm: true });
        expect(bodyOf(notToken(sent)[0])).toEqual({ query: 'mutation($id:String!){ deleteCatalogView(viewId:$id) }', variables: { id: 'v' } });
    });

    it('refuses a query, and says where one goes', async () => {
        const { s, sent } = setup(() => undefined);
        expect(await s.call('write_aco_admin', { mutation: '{ catalogViews { viewId } }', confirm: true })).toMatch(/run_aco_admin/u);
        expect(sent).toStrictEqual([]);
    });
});

describe('write_aco_rows', () => {
    const BOOK = { priceBookId: 'b', name: 'B', currency: 'USD' };

    it('does nothing without confirm', async () => {
        const { s, sent } = setup(() => undefined);
        expect((await s.result('write_aco_rows', { kind: 'aco_price_books', rows: [BOOK] })).isError).toBe(true);
        expect(sent).toStrictEqual([]);
    });

    it("writes to the kind's ingestion path and reports what ACO accepted", async () => {
        const { s, sent } = setup(() => ({ body: { status: 'ACCEPTED', acceptedCount: 1 } }));
        const answer = await s.call('write_aco_rows', { kind: 'aco_price_books', rows: [BOOK], confirm: true });
        expect(JSON.parse(answer)).toEqual({ kind: 'aco_price_books', removed: false, sent: 1, accepted: 1 });
        const [call] = notToken(sent);
        expect(call.url).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/v1/catalog/price-books');
        expect(bodyOf(call)).toEqual([BOOK]);
    });

    it("deletes through the kind's delete path, taking only the key", async () => {
        const { s, sent } = setup(() => ({ body: { status: 'ACCEPTED', acceptedCount: 1 } }));
        await s.call('write_aco_rows', { kind: 'aco_price_books', rows: [{ priceBookId: 'b' }], remove: true, confirm: true });
        expect(notToken(sent)[0].url).toMatch(/\/v1\/catalog\/price-books\/delete$/u);
    });

    it('refuses a row the kind cannot take, before sending anything', async () => {
        const { s, sent } = setup(() => undefined);
        const answer = await s.call('write_aco_rows', { kind: 'aco_prices', rows: [{ sku: 'A' }], confirm: true });
        expect(answer).toMatch(/^Error: row 1 of aco_prices cannot be sent/u);
        expect(sent).toStrictEqual([]);
    });
});

describe('get_aco_status', () => {
    const tenantAnswer = (acoEnabled: boolean) => ({
        name: 'Steve Kukla ACO',
        product: 'COMMERCE_OPTIMIZER',
        type: 'SANDBOX',
        state: 'READY',
        acoEnabled,
        serviceURLs: { adminGraphQL: 'x', graphQL: 'y' },
    });
    const schema = { data: { query: { fields: [{ name: 'commerceOptimizer' }] }, company: { fields: [{ name: 'catalogViewContext' }] } } };

    function reply(acoEnabled: boolean) {
        return (url: string) => {
            if (url.includes('ccm.api.commerce.adobe.com')) return { body: tenantAnswer(acoEnabled) };
            if (url.includes('/admin/graphql')) return { body: { data: { restrictedAccessKeys: [] } } };
            return { body: schema };
        };
    }

    it("reads an ACCS backend's connector from the tenant service, not from its schema", async () => {
        const { s, sent } = setup(reply(false));
        const status = JSON.parse(await s.call('get_aco_status', {}));

        expect(status).toMatchObject({ addon: 'on', missingSettings: [], credential: { held: true, ingestion: 'ok', admin: 'ok' } });
        expect(status.tenant).toEqual({
            name: 'Steve Kukla ACO',
            product: 'COMMERCE_OPTIMIZER',
            type: 'SANDBOX',
            state: 'READY',
            acoEnabled: false,
            services: ['adminGraphQL', 'graphQL'],
        });
        // It declares the fields and the connector is off: both measured on one real tenant.
        expect(status.backend).toMatchObject({ backend: 'accs', connector: 'off', answersPriceBook: true, declaresCatalogView: true });
        expect(sent.some((call) => call.url === 'https://ccm.api.commerce.adobe.com/api/v1/tenants/AccsTenant1/owner/ORG%40AdobeOrg')).toBe(true);
    });

    it('says the connector is on when the tenant service does', async () => {
        const { s } = setup(reply(true));
        expect(JSON.parse(await s.call('get_aco_status', {})).backend.connector).toBe('on');
    });

    it('still answers with no credential, saying what it cannot know', async () => {
        const { s } = setup(reply(false), { credential: false });
        const status = JSON.parse(await s.call('get_aco_status', {}));
        expect(status.credential).toEqual({ held: false });
        expect(status.backend).toMatchObject({ connector: 'unknown', because: 'Asking the tenant service needs the ACO credential.' });
        expect(status).not.toHaveProperty('tenant');
    });

    it('reports the add-on off, with the backend still read', async () => {
        const { s } = setup(reply(false), { addons: [], credential: false });
        expect(JSON.parse(await s.call('get_aco_status', {}))).toMatchObject({ addon: 'off', missingSettings: [] });
    });
});

describe('readAcoConnector on a PaaS backend, which has no tenant to ask', () => {
    const asked = (fields: string[], companyFields: string[] = []) => {
        const body = { data: { query: { fields: fields.map((name) => ({ name })) }, company: { fields: companyFields.map((name) => ({ name })) } } };
        return (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    };
    const question = { backend: 'paas', url: 'https://paas.example.com/graphql', store: 'default', admin: undefined };

    it('reads the connector as on when the backend declares the query it brings', async () => {
        // Field for field what a public PaaS store on the base connector answered, 2026-11-01.
        await expect(readAcoConnector({ ...question, fetch: asked(['commerceOptimizer'], ['name']) })).resolves.toMatchObject({
            connector: 'on',
            answersPriceBook: true,
            declaresCatalogView: false,
        });
    });

    it('sees the B2B connector by the field it adds', async () => {
        await expect(readAcoConnector({ ...question, fetch: asked(['commerceOptimizer'], ['catalogViewContext']) })).resolves.toMatchObject({
            declaresCatalogView: true,
        });
    });

    it('reads it as off when the backend does not declare that query', async () => {
        await expect(readAcoConnector({ ...question, fetch: asked(['products']) })).resolves.toMatchObject({ connector: 'off' });
    });

    it('says unknown, and why, when the schema cannot be read', async () => {
        const failing = (async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
        await expect(readAcoConnector({ ...question, fetch: failing })).resolves.toMatchObject({ connector: 'unknown', because: expect.stringMatching(/could not be read/u) });
    });
});

describe('tenantOfEndpoint', () => {
    it('reads the tenant from an ACCS endpoint', () => {
        expect(tenantOfEndpoint('https://na1.api.commerce.adobe.com/AbC-1/graphql')).toBe('AbC-1');
    });

    it('finds none in a PaaS endpoint', () => {
        expect(tenantOfEndpoint('https://mcstaging.example.com/graphql')).toBeUndefined();
    });
});

describe('what every tool declares', () => {
    it('reads declare read-only and writes declare destructive, and none needs a sign-in', () => {
        const { s } = setup(() => undefined);
        for (const name of ['get_aco_status', 'run_aco_query', 'run_aco_admin']) {
            expect(s.def(name)).toMatchObject({ needsAuth: false, annotations: { readOnlyHint: true, destructiveHint: false } });
        }
        for (const name of ['write_aco_admin', 'write_aco_rows']) {
            expect(s.def(name)).toMatchObject({ needsAuth: false, annotations: { readOnlyHint: false, destructiveHint: true } });
        }
    });
});
