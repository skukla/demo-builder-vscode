/**
 * storeStructureReader — the core behind the get_store_structure MCP tool.
 *
 * Two things matter here and nowhere else:
 *   1. Every input comes from the SAVED project (there is no form to read), so
 *      the request must be assembled from componentConfigs + adobe org.
 *   2. The scope report is the answer an agent cannot get any other way — a
 *      project can point at a website or store view that does not exist, and
 *      every downstream symptom looks like something unrelated.
 *
 * discoverStoreStructure itself is mocked: its own transport behaviour is
 * covered in commerceStoreDiscovery.test.ts.
 */

// jest.mock factories are hoisted above imports; references inside must be
// prefixed `mock` and declared with `var`.
/* eslint-disable no-var */
var mockDiscoveryServices: unknown;
/* eslint-enable no-var */

jest.mock(
    'vscode',
    () => {
        mockDiscoveryServices = [];
        return {
            workspace: {
                getConfiguration: jest.fn().mockReturnValue({
                    get: jest.fn((_key: string, defaultValue?: unknown) =>
                        mockDiscoveryServices === undefined ? defaultValue : mockDiscoveryServices
                    ),
                }),
            },
        };
    },
    { virtual: true }
);

const mockDiscover = jest.fn();
jest.mock('@/features/eds/services/commerceStoreDiscovery', () => ({
    discoverStoreStructure: (...args: unknown[]) => mockDiscover(...args),
}));

import { readStoreStructure } from '@/features/eds/services/storeStructureReader';
import type { Project } from '@/types/base';

const STRUCTURE = {
    websites: [
        { id: 1, code: 'base', name: 'Main Website' },
        { id: 2, code: 'citisignal', name: 'CitiSignal' },
    ],
    storeGroups: [
        { id: 1, code: 'main_website_store', name: 'Main', website_id: 1, root_category_id: 2 },
        { id: 2, code: 'citisignal_store', name: 'CS', website_id: 2, root_category_id: 3 },
    ],
    storeViews: [
        { id: 1, code: 'default', name: 'Default', store_group_id: 1, website_id: 1, is_active: 1 },
        {
            id: 2,
            code: 'citisignal_us',
            name: 'US',
            store_group_id: 2,
            website_id: 2,
            is_active: 1,
        },
    ],
};

/** A PaaS project with credentials and a scope, unless overridden. */
function paasProject(overrides: Record<string, string> = {}): Project {
    return {
        componentSelections: { backend: 'adobe-commerce-paas' },
        componentConfigs: {
            'adobe-commerce-paas': {
                ADOBE_COMMERCE_URL: 'https://shop.example.com/path',
                ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
                ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
                ...overrides,
            },
        },
    } as unknown as Project;
}

function accsProject(): Project {
    return {
        adobe: { organization: 'org-1' },
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://na1.api.commerce.adobe.com/tenant/graphql',
                ACCS_WEBSITE_CODE: 'base',
                ACCS_STORE_CODE: 'main_website_store',
                ACCS_STORE_VIEW_CODE: 'default',
            },
        },
    } as unknown as Project;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoveryServices = [];
    mockDiscover.mockResolvedValue({ success: true, data: STRUCTURE });
});

describe('readStoreStructure — PaaS', () => {
    it('builds the request from saved credentials and the URL ORIGIN', async () => {
        const result = await readStoreStructure(paasProject());

        expect(result.success).toBe(true);
        // The path is dropped: discovery only ever needs the origin, and the
        // wizard sends the same shape.
        expect(mockDiscover).toHaveBeenCalledWith({
            backendType: 'paas',
            baseUrl: 'https://shop.example.com',
            username: 'admin',
            password: 'fake-test-pw-not-a-secret',
        });
    });

    it('reports every configured code as resolved when all three exist', async () => {
        const result = await readStoreStructure(paasProject());

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.resolution).toEqual({
            websiteCode: 'ok',
            storeCode: 'ok',
            storeViewCode: 'ok',
        });
        expect(result.data.backendType).toBe('paas');
        expect(result.data.websites).toHaveLength(2);
    });

    it('flags a configured code that does NOT exist — the whole point of the tool', async () => {
        const result = await readStoreStructure(
            paasProject({ ADOBE_COMMERCE_WEBSITE_CODE: 'ghost-site' })
        );

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.resolution.websiteCode).toBe('missing');
        expect(result.data.configured.websiteCode).toBe('ghost-site');
        // The other two still resolve — a partial mismatch must stay visible.
        expect(result.data.resolution.storeViewCode).toBe('ok');
    });

    it('distinguishes "not configured" from "missing"', async () => {
        const result = await readStoreStructure(
            paasProject({ ADOBE_COMMERCE_STORE_VIEW_CODE: '' })
        );

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.resolution.storeViewCode).toBe('not-configured');
    });

    it('fails without contacting Commerce when admin credentials are absent', async () => {
        const result = await readStoreStructure(paasProject({ ADOBE_COMMERCE_ADMIN_PASSWORD: '' }));

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toMatch(/admin credentials/i);
        expect(result.authRequired).toBeUndefined();
        expect(mockDiscover).not.toHaveBeenCalled();
    });

    it('rejects a non-http(s) Commerce URL rather than forwarding it', async () => {
        const result = await readStoreStructure(
            paasProject({ ADOBE_COMMERCE_URL: 'file:///etc/passwd' })
        );

        expect(result.success).toBe(false);
        expect(mockDiscover).not.toHaveBeenCalled();
    });

    it('surfaces a discovery failure verbatim', async () => {
        mockDiscover.mockResolvedValue({ success: false, error: 'Connection timed out.' });

        const result = await readStoreStructure(paasProject());

        expect(result).toEqual({ success: false, error: 'Connection timed out.' });
    });
});

describe('readStoreStructure — ACCS', () => {
    it('signals authRequired (not a hard error) when no IMS token was supplied', async () => {
        mockDiscoveryServices = [
            { orgName: 'O', orgId: 'org-1', serviceUrl: 'https://svc.example.com' },
        ];

        const result = await readStoreStructure(accsProject());

        expect(result.success).toBe(false);
        if (result.success) return;
        // The handler keys its sign-in retry off this flag.
        expect(result.authRequired).toBe(true);
        expect(mockDiscover).not.toHaveBeenCalled();
    });

    it('routes through the org-matched discovery service with the IMS token', async () => {
        mockDiscoveryServices = [
            { orgName: 'Other', orgId: 'org-2', serviceUrl: 'https://other.example.com' },
            { orgName: 'Mine', orgId: 'org-1', serviceUrl: 'https://mine.example.com' },
        ];

        const result = await readStoreStructure(accsProject(), { imsToken: 'tok' });

        expect(result.success).toBe(true);
        expect(mockDiscover).toHaveBeenCalledWith({
            backendType: 'accs',
            baseUrl: 'https://na1.api.commerce.adobe.com',
            accsGraphqlEndpoint: 'https://na1.api.commerce.adobe.com/tenant/graphql',
            imsToken: 'tok',
            discoveryServiceUrl: 'https://mine.example.com',
        });
    });

    it('explains the gap when no discovery service is configured', async () => {
        mockDiscoveryServices = [];

        const result = await readStoreStructure(accsProject(), { imsToken: 'tok' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toMatch(/no accs discovery service/i);
        expect(mockDiscover).not.toHaveBeenCalled();
    });
});

describe('readStoreStructure — unsupported backend', () => {
    it('declines an ACO project instead of guessing a request shape', async () => {
        const project = {
            componentSelections: { backend: 'adobe-commerce-aco' },
            componentConfigs: {},
        } as unknown as Project;

        const result = await readStoreStructure(project);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toMatch(/aco/i);
        expect(mockDiscover).not.toHaveBeenCalled();
    });
});
