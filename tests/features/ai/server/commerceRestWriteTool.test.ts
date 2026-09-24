/**
 * write_commerce_rest — POST, PUT and DELETE against the project's Commerce REST
 * API, gated on confirm:true and signed by the shared client. Argument-pinned,
 * because a mocked fetch cannot see a malformed call: the method, the JSON body
 * and its Content-Type, and DELETE sending no body.
 */

import { resetCommerceRestTokens } from '@/features/ai/server/commerceRestClient';
import { registerCommerceRestWriteTool } from '@/features/ai/server/commerceRestWriteTool';
import { AGENT_ALERT_COPY } from '@/features/ai/server/agentAlertCopy';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentCatalog: jest.fn(() => [
        { id: 'erp-integration', kind: 'integration', requiredApis: ['CloudIntegrationSDK', 'ACCS-REST-API'] },
    ]),
}));

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }>; isError?: true }>>();
    const declarations = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: (args: any) => Promise<any>) {
            tools.set(name, handler);
            declarations.set(name, def);
        },
        declaration: (): McpToolSchema => declarations.get('write_commerce_rest')!,
        call: async (args?: unknown) => tools.get('write_commerce_rest')!(args),
        raw: async (args?: unknown): Promise<string> => (await tools.get('write_commerce_rest')!(args)).content[0].text,
    };
}

const ACCS_PROJECT = {
    name: 'bodea',
    path: '/p/bodea',
    adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-project' },
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_WEBSITE_CODE: 'bodea',
            ACCS_STORE_CODE: 'bodea_store',
            ACCS_STORE_VIEW_CODE: 'bodea_us',
            ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql',
        },
    },
    componentInstances: {},
    appBuilderComponents: {
        'erp-integration': {
            kind: 'integration',
            status: 'deployed',
            source: { owner: 'skukla', repo: 'commerce-erp-integration' },
            workspace: { id: 'ws-erp', name: 'AcmeERP' },
        },
    },
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
const ctx = (): HandlerContext => {
    const context = createMockHandlerContext({ stateManager });
    Object.assign(context.authManager as object, { isAuthenticated, getS2SDeployCredentials });
    return context;
};

function answering(restStatus: number, restBody: string) {
    return jest
        .fn()
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ access_token: 'minted-token', expires_in: 86399 }),
        })
        .mockResolvedValueOnce({ ok: restStatus < 300, status: restStatus, text: async () => restBody });
}

let fetchMock: jest.Mock;

function serve() {
    const s = fakeServer();
    registerCommerceRestWriteTool(s, ctx, fetchMock as unknown as typeof fetch);
    return s;
}

beforeEach(() => {
    jest.clearAllMocks();
    resetCommerceRestTokens();
    getCurrentProject.mockResolvedValue(ACCS_PROJECT);
    isAuthenticated.mockResolvedValue(true);
    getS2SDeployCredentials.mockResolvedValue(CREDENTIALS);
    fetchMock = answering(200, '{"id":12,"credit_limit":50000}');
});

describe('declaration and gate', () => {
    it('is a destructive write that needs the Adobe sign-in and raises the consent dialog on method and path', () => {
        const d = serve().declaration();
        expect(d.needsAuth).toEqual(['adobe']);
        expect(d.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
        expect(AGENT_ALERT_COPY.write_commerce_rest.target).toEqual(['method', 'path']);
    });

    it('refuses without confirm:true, before any call, with the shared wording', async () => {
        const result = await serve().call({ method: 'DELETE', path: 'customers/43' });
        expect(result.content[0].text).toBe('write_commerce_rest requires confirm:true to proceed.');
        expect(result.isError).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses GET (and anything not POST, PUT or DELETE) and points at the read tool', async () => {
        const out = await serve().raw({ method: 'GET', path: 'customers/43', confirm: true });
        expect(out).toContain('run_commerce_rest');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('the signed write (args pinned)', () => {
    it('PUTs the JSON body with Content-Type and the Store header, and answers the record', async () => {
        const out = await serve().raw({
            method: 'PUT',
            path: 'companyCredits/12',
            body: { credit: { id: 12, credit_limit: 50000 } },
            confirm: true,
        });

        const [url, init] = fetchMock.mock.calls[1];
        expect(url).toBe('https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/V1/companyCredits/12');
        expect(init.method).toBe('PUT');
        expect(init.headers).toEqual({
            Authorization: 'Bearer minted-token',
            'x-api-key': 'client-abc',
            'x-gw-ims-org-id': 'ABC@AdobeOrg',
            Accept: 'application/json',
            Store: 'bodea_us',
            'Content-Type': 'application/json',
        });
        expect(JSON.parse(init.body)).toEqual({ credit: { id: 12, credit_limit: 50000 } });
        expect(JSON.parse(out)).toEqual({ id: 12, credit_limit: 50000 });
    });

    it('DELETE sends no body and no Content-Type, and a bare `true` answer is passed through', async () => {
        fetchMock = answering(200, 'true');
        const out = await serve().raw({ method: 'DELETE', path: 'customers/43', body: { ignored: 1 }, confirm: true });

        const [, init] = fetchMock.mock.calls[1];
        expect(init.method).toBe('DELETE');
        expect(init.body).toBeUndefined();
        expect(init.headers['Content-Type']).toBeUndefined();
        expect(out).toBe('true');
    });

    it('an empty 2xx body still answers something parseable', async () => {
        fetchMock = answering(204, '');
        const out = await serve().raw({ method: 'DELETE', path: 'customers/43', confirm: true });
        expect(JSON.parse(out)).toEqual({ ok: true, status: 204 });
    });

    it('a Commerce 400 is answered with its own words, not thrown', async () => {
        fetchMock = answering(400, '{"message":"The company credit limit must be a positive number."}');
        const out = await serve().raw({ method: 'PUT', path: 'companyCredits/12', body: {}, confirm: true });
        expect(out).toContain('HTTP 400');
        expect(out).toContain('positive number');
    });
});
