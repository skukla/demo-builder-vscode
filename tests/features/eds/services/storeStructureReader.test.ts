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
import { passwordShape } from '../../../helpers/credentialShapes';
import { createMockProject } from '../../../helpers/projectFake';

/** Assembled rather than written, so nothing in this file matches a secret scanner. */
const STORED_PASSWORD = passwordShape('-from-secretstorage');

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
    return createMockProject({
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
    });
}

function accsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
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
        ...overrides,
    });
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

    it('accepts a plain http Commerce URL — a local instance is not an error', async () => {
        // Both schemes are allowed on purpose; SC demo instances are not always
        // behind TLS. Rejecting http here would fail them with "no usable
        // Commerce URL" and no way to tell why.
        const result = await readStoreStructure(
            paasProject({ ADOBE_COMMERCE_URL: 'http://shop.example.com/path' })
        );

        expect(result.success).toBe(true);
        expect(mockDiscover).toHaveBeenCalledWith(
            expect.objectContaining({ baseUrl: 'http://shop.example.com' })
        );
    });

    it('rejects a URL that does not parse at all', async () => {
        const result = await readStoreStructure(paasProject({ ADOBE_COMMERCE_URL: 'not a url' }));

        expect(result.success).toBe(false);
        expect(mockDiscover).not.toHaveBeenCalled();
    });

    it('refuses to point discovery at localhost', async () => {
        // The SSRF guard is the second half of the check — an https localhost URL
        // clears the protocol test and must still be refused, because this
        // request is issued by the extension on the SC's machine.
        const result = await readStoreStructure(
            paasProject({ ADOBE_COMMERCE_URL: 'https://localhost:8080/graphql' })
        );

        expect(result.success).toBe(false);
        expect(mockDiscover).not.toHaveBeenCalled();
    });

    it('prefers a stored secret over the value sitting in componentConfigs', async () => {
        // The steady state after a save: the password lives in SecretStorage and
        // the config copy is stale. Both the reader and the project id have to
        // reach resolvePaasAdminPair or the stale copy silently wins.
        const get = jest.fn().mockImplementation((key: string) =>
            Promise.resolve(
                key.endsWith('ADOBE_COMMERCE_ADMIN_PASSWORD') ? STORED_PASSWORD : undefined
            )
        );

        const result = await readStoreStructure(paasProject(), { secrets: { get } });

        expect(result.success).toBe(true);
        expect(get).toHaveBeenCalledWith(
            'demoBuilder.componentSecret./projects/demo.adobe-commerce-paas.ADOBE_COMMERCE_ADMIN_PASSWORD'
        );
        expect(mockDiscover).toHaveBeenCalledWith(
            expect.objectContaining({ password: STORED_PASSWORD })
        );
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

    it('refuses an endpoint that is not a usable URL', async () => {
        // Only the ORIGIN is unusable here — the raw endpoint string is present,
        // so a guard that required both to be missing would forward an undefined
        // baseUrl to discovery and fail somewhere far from the cause.
        mockDiscoveryServices = [
            { orgName: 'O', orgId: 'org-1', serviceUrl: 'https://svc.example.com' },
        ];
        const project = accsProject();
        (project.componentConfigs as Record<string, Record<string, string>>)[
            'adobe-commerce-accs'
        ].ACCS_GRAPHQL_ENDPOINT = 'not a url';

        const result = await readStoreStructure(project, { imsToken: 'tok' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toMatch(/accs graphql endpoint/i);
        expect(mockDiscover).not.toHaveBeenCalled();
    });

    it('refuses when no endpoint is configured at all', async () => {
        mockDiscoveryServices = [
            { orgName: 'O', orgId: 'org-1', serviceUrl: 'https://svc.example.com' },
        ];
        const project = accsProject();
        (project.componentConfigs as Record<string, Record<string, string>>)[
            'adobe-commerce-accs'
        ].ACCS_GRAPHQL_ENDPOINT = '';

        const result = await readStoreStructure(project, { imsToken: 'tok' });

        expect(result.success).toBe(false);
        expect(mockDiscover).not.toHaveBeenCalled();
    });

    it('reads the org off a project that has no Adobe block at all', async () => {
        // An unauthenticated project has no `adobe`. Reaching through it
        // unguarded throws a TypeError out of an MCP tool instead of answering.
        mockDiscoveryServices = [
            { orgName: 'O', orgId: 'org-1', serviceUrl: 'https://svc.example.com' },
        ];
        const project = accsProject({ adobe: undefined });

        const result = await readStoreStructure(project, { imsToken: 'tok' });

        // No org to match on, so the first configured service is used.
        expect(result.success).toBe(true);
        expect(mockDiscover).toHaveBeenCalledWith(
            expect.objectContaining({ discoveryServiceUrl: 'https://svc.example.com' })
        );
    });

    it('names the URL as the problem when the configured service is not HTTPS', async () => {
        // Distinct from "none configured": the SC HAS set one, and telling them
        // none exists sends them to add a second bad entry.
        mockDiscoveryServices = [
            { orgName: 'O', orgId: 'org-1', serviceUrl: 'http://svc.example.com' },
        ];

        const result = await readStoreStructure(accsProject(), { imsToken: 'tok' });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toMatch(/not a valid HTTPS URL/i);
        expect(mockDiscover).not.toHaveBeenCalled();
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
        const project = createMockProject({
            componentSelections: { backend: 'adobe-commerce-aco' },
            componentConfigs: {},
        });

        const result = await readStoreStructure(project);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toMatch(/aco/i);
        expect(mockDiscover).not.toHaveBeenCalled();
    });
});
