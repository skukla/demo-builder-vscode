/**
 * run_commerce_rest — a signed GET against the project's Commerce REST API.
 *
 * The token request is pinned ARGUMENT BY ARGUMENT against Adobe's Cloud Service
 * server-to-server guide (`POST /ims/token/v3`, client_credentials, its seven scopes)
 * and the REST call against that guide's headers (Bearer, x-api-key, x-gw-ims-org-id)
 * plus what aio-commerce-lib-api builds for SaaS (`<base>/V1/<path>`, a `Store`
 * header) — all read on 2026-09-24. A mocked fetch cannot see a malformed call, so the
 * assertions are on the calls, not on the outcome.
 *
 * The project fixture is bodea's ACCS shape, the one `commerceQueryTool.test.ts`
 * uses, plus the ERP integration's own workspace.
 */

import { resetCommerceRestTokens, restWorkspaceId, validateRestPath } from '@/features/ai/server/commerceRestClient';
import { registerCommerceRestTool } from '@/features/ai/server/commerceRestTool';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentCatalog: jest.fn(() => [
        { id: 'erp-integration', kind: 'integration', requiredApis: ['CloudIntegrationSDK', 'ACCS-REST-API'] },
        { id: 'demo-erp', kind: 'system', boundTo: 'erp-integration' },
        { id: 'commerce-integration-starter-kit', kind: 'integration', requiredApis: ['CloudIntegrationSDK'] },
    ]),
}));

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    const declarations = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
            declarations.set(name, def);
        },
        declaration: (): McpToolSchema => declarations.get('run_commerce_rest')!,
        raw: async (args?: unknown): Promise<string> => (await tools.get('run_commerce_rest')!(args)).content[0].text,
    };
}

const ACCS_PROJECT = {
    name: 'bodea',
    path: '/p/bodea',
    adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-project' },
    componentSelections: { backend: 'adobe-commerce-accs', frontend: 'eds-storefront' },
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_WEBSITE_CODE: 'bodea',
            ACCS_STORE_CODE: 'bodea_store',
            ACCS_STORE_VIEW_CODE: 'bodea_us',
            ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql',
        },
        'eds-storefront': {},
    },
    componentInstances: {},
    appBuilderComponents: {
        mesh: { kind: 'mesh', status: 'deployed', source: { owner: 'skukla', repo: 'mesh' } },
        'erp-integration': {
            kind: 'integration',
            status: 'deployed',
            source: { owner: 'skukla', repo: 'commerce-erp-integration' },
            workspace: { id: 'ws-erp', name: 'AcmeERP' },
        },
    },
} satisfies Pick<Project, 'adobe' | 'appBuilderComponents'> & Record<string, unknown>;

const PAAS_PROJECT = {
    name: 'paas-demo',
    path: '/p/paas',
    adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-project' },
    componentSelections: { backend: 'adobe-commerce-paas' },
    componentConfigs: {
        'adobe-commerce-paas': {
            ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://demo.adobedemo.com/graphql',
            ADOBE_COMMERCE_WEBSITE_CODE: 'base',
            ADOBE_COMMERCE_STORE_CODE: 'main',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
        },
    },
    componentInstances: {},
};

const CREDENTIALS = {
    clientId: 'client-abc',
    clientSecret: 'fake-test-pw-not-a-secret',
    technicalAccountId: 'ta-1',
    technicalAccountEmail: 'ta@techacct.adobe.com',
    imsOrgCode: 'ABC@AdobeOrg',
};

const getCurrentProject = jest.fn();
const isAuthenticated = jest.fn();
const getS2SDeployCredentials = jest.fn();
const stateManager = createMockStateManager({ getCurrentProject });

function ctx(withAuth = true): HandlerContext {
    const context = createMockHandlerContext({ stateManager });
    if (withAuth) {
        Object.assign(context.authManager as object, { isAuthenticated, getS2SDeployCredentials });
    } else {
        context.authManager = undefined;
    }
    return context;
}

/** Answers the IMS token call, then the REST call, in order. */
function answering(restStatus: number, restBody: string, tokenStatus = 200) {
    return jest
        .fn()
        .mockResolvedValueOnce({
            ok: tokenStatus < 300,
            status: tokenStatus,
            text: async () => JSON.stringify({ access_token: 'minted-token', expires_in: 86399 }),
        })
        .mockResolvedValueOnce({ ok: restStatus < 300, status: restStatus, text: async () => restBody });
}

let fetchMock: jest.Mock;

function serve(withAuth = true) {
    const s = fakeServer();
    registerCommerceRestTool(s, () => ctx(withAuth), fetchMock as unknown as typeof fetch);
    return s;
}

beforeEach(() => {
    jest.clearAllMocks();
    resetCommerceRestTokens();
    getCurrentProject.mockResolvedValue(ACCS_PROJECT);
    isAuthenticated.mockResolvedValue(true);
    getS2SDeployCredentials.mockResolvedValue(CREDENTIALS);
    fetchMock = answering(200, '{"items":[{"id":43,"email":"steve@test.com","website_id":2}],"total_count":1}');
});

describe('declaration', () => {
    it('is a read that needs the Adobe sign-in', () => {
        const d = serve().declaration();
        expect(d.needsAuth).toEqual(['adobe']);
        expect(d.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
    });
});

describe('the signed GET (args pinned)', () => {
    it('mints the token with the ERP workspace credential, then GETs /V1/<path> with the Store header', async () => {
        const out = await serve().raw({ path: 'customers/search?searchCriteria[pageSize]=20' });

        expect(getS2SDeployCredentials).toHaveBeenCalledWith('org-1', 'proj-1', 'ws-erp');
        const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
        expect(tokenUrl).toBe('https://ims-na1.adobelogin.com/ims/token/v3');
        expect(tokenInit.method).toBe('POST');
        expect(tokenInit.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
        expect(Object.fromEntries(new URLSearchParams(tokenInit.body))).toEqual({
            grant_type: 'client_credentials',
            client_id: 'client-abc',
            client_secret: 'fake-test-pw-not-a-secret',
            org_id: 'ABC@AdobeOrg',
            scope: 'openid,AdobeID,email,profile,additional_info.roles,additional_info.projectedProductContext,commerce.accs',
        });
        const [restUrl, restInit] = fetchMock.mock.calls[1];
        expect(restUrl).toBe(
            'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/V1/customers/search?searchCriteria[pageSize]=20',
        );
        expect(restInit.method).toBe('GET');
        expect(restInit.headers).toEqual({
            Authorization: 'Bearer minted-token',
            'x-api-key': 'client-abc',
            'x-gw-ims-org-id': 'ABC@AdobeOrg',
            Accept: 'application/json',
            Store: 'bodea_us',
        });
        expect(JSON.parse(out).total_count).toBe(1);
    });

    it('reuses a minted token for the same workspace instead of asking IMS again', async () => {
        const s = serve();
        await s.raw({ path: 'customers/43' });
        fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"id":43}' });
        await s.raw({ path: 'customers/43' });

        const imsCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('ims/token'));
        expect(imsCalls).toHaveLength(1);
    });

    it('a storeView argument replaces the Store header', async () => {
        await serve().raw({ path: 'store/websites', storeView: 'default' });
        expect(fetchMock.mock.calls[1][1].headers.Store).toBe('default');
    });

    it('a 401 says the credential is not accepted and names the API it needs', async () => {
        fetchMock = answering(401, '{"message":"Unauthorized"}');
        const out = await serve().raw({ path: 'customers/43' });
        expect(out).toContain('HTTP 401');
        expect(out).toContain('ACCS-REST-API');
    });

    it('declares the cut on a body over the ceiling', async () => {
        fetchMock = answering(200, 'x'.repeat(40_000));
        const out = await serve().raw({ path: 'products' });
        expect(out.startsWith('[truncated: 40000 chars')).toBe(true);
    });
});

describe('refusals, each before any call', () => {
    it('a PaaS backend is refused with the reason', async () => {
        getCurrentProject.mockResolvedValue(PAAS_PROJECT);
        const out = await serve().raw({ path: 'customers/43' });
        expect(out).toContain('ACCS backends only');
        expect(out).toContain('Error:');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('no sign-in hands back the sign_in step', async () => {
        isAuthenticated.mockResolvedValue(false);
        const out = await serve().raw({ path: 'customers/43' });
        expect(out).toContain('sign_in(provider:"adobe"');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a bad path never reaches the network', async () => {
        const s = serve();
        for (const path of ['', '/V1/customers', 'https://evil.example/x', 'customers/../admin', 'a"b']) {
            expect(await s.raw({ path })).toMatch(/^Error: /);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a refused IMS mint is reported, not thrown', async () => {
        fetchMock = answering(200, '{}', 400);
        const out = await serve().raw({ path: 'customers/43' });
        expect(out).toContain('IMS refused the credential (HTTP 400)');
    });
});

describe('validateRestPath', () => {
    it('accepts the search syntax Commerce uses and rejects hosts, roots and parent hops', () => {
        expect(validateRestPath('customers/search?searchCriteria[filter_groups][0][filters][0][field]=email')).toEqual({
            path: 'customers/search?searchCriteria[filter_groups][0][filters][0][field]=email',
        });
        expect(validateRestPath('/customers')).toHaveProperty('error');
        expect(validateRestPath('http://x/customers')).toHaveProperty('error');
        expect(validateRestPath('customers/../x')).toHaveProperty('error');
    });
});

describe('restWorkspaceId', () => {
    it("prefers the workspace of an integration whose entry requires ACCS-REST-API, else the project's", () => {
        expect(restWorkspaceId(ACCS_PROJECT)).toBe('ws-erp');
        const kitOnly: Pick<Project, 'adobe' | 'appBuilderComponents'> = {
            adobe: ACCS_PROJECT.adobe,
            appBuilderComponents: {
                'commerce-integration-starter-kit': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'adobe', repo: 'commerce-integration-starter-kit' },
                    workspace: { id: 'ws-kit', name: 'Kit' },
                },
            },
        };
        expect(restWorkspaceId(kitOnly)).toBe('ws-project');
    });
});
