/**
 * get_commerce_endpoints — the answer 28 hand-typed curls had to go without.
 *
 * What these tests hold, in the order they matter:
 *
 *   1. The endpoint and the HEADERS come back together. An endpoint alone does
 *      not close the gap — a Catalog Service query against the wrong store scope
 *      returns an empty result and no error, which is a whole afternoon of
 *      "why is phones empty?".
 *   2. The mesh and the direct endpoint are reported SEPARATELY, plus which one
 *      the storefront itself uses. "With and without a mesh, what does a partner
 *      need?" is a real question from the surveyed session and it needs both.
 *   3. No secret ever appears.
 *
 * FIXTURES ARE COPIED FROM A REAL PROJECT — `~/.demo-builder/projects/bodea/
 * .demo-builder.json`, read 2026-08-25. `componentConfigs` is a record keyed by
 * COMPONENT ID whose values are flat env-var maps, and the ACCS keys are
 * `ACCS_*` while PaaS uses `ADOBE_COMMERCE_*`. None of that is guessable from
 * the type names, and inventing it is the failure mode this repo has shipped
 * five times: the invented shape still typechecks and the test agrees with it.
 */

import { registerCommerceEndpointsTool } from '@/features/ai/server/commerceEndpointsTool';
import type { StateManager } from '@/core/state/stateManager';
import { expectWithinCeiling } from './responseCeilings';

function fakeServer() {
    const tools = new Map<string, () => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(
            name: string,
            _def: unknown,
            handler: () => Promise<{ content: Array<{ text: string }> }>,
        ) {
            tools.set(name, handler);
        },
        raw: async (): Promise<string> =>
            (await tools.get('get_commerce_endpoints')!()).content[0].text,
        call: async (): Promise<Record<string, never>> =>
            JSON.parse((await tools.get('get_commerce_endpoints')!()).content[0].text),
    };
}

const getCurrentProject = jest.fn();
const stateManager = { getCurrentProject } as unknown as StateManager;

function serve() {
    const s = fakeServer();
    registerCommerceEndpointsTool(s, stateManager);
    return s;
}

/** Bodea's real ACCS backend config, verbatim. */
const ACCS_CONFIG = {
    ACCS_WEBSITE_CODE: 'bodea',
    ACCS_STORE_CODE: 'bodea_store',
    ACCS_STORE_VIEW_CODE: 'bodea_us',
    ACCS_GRAPHQL_ENDPOINT:
        'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql',
};

const ACCS_PROJECT = {
    name: 'bodea',
    path: '/p/bodea',
    componentSelections: { backend: 'adobe-commerce-accs', frontend: 'eds-storefront' },
    componentConfigs: { 'adobe-commerce-accs': ACCS_CONFIG, 'eds-storefront': {} },
    componentInstances: {
        'eds-storefront': {
            id: 'eds-storefront',
            type: 'frontend',
            metadata: { githubRepo: 'skukla/kukla-bodea', daLiveOrg: 'skukla' },
        },
    },
};

/** PaaS uses a different key family AND needs the api-key header. */
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
};

describe('get_commerce_endpoints', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('answers the endpoint an agent would otherwise hand-assemble', async () => {
        getCurrentProject.mockResolvedValue(ACCS_PROJECT);

        const result = (await serve().call()) as unknown as {
            endpoints: { commerceGraphQl?: string };
        };

        expect(result.endpoints.commerceGraphQl).toBe(ACCS_CONFIG.ACCS_GRAPHQL_ENDPOINT);
    });

    it('returns the HEADERS with it, which is what makes a query actually work', async () => {
        // The measured failure this prevents: a Catalog Service call against the
        // wrong store scope returns an empty result and NO error.
        getCurrentProject.mockResolvedValue(ACCS_PROJECT);

        const result = (await serve().call()) as unknown as {
            headers: { all?: Record<string, string>; cs?: Record<string, string> };
            scope: Record<string, string>;
        };

        expect(result.headers.all).toEqual({ Store: 'bodea_us' });
        expect(result.headers.cs).toMatchObject({
            'Magento-Store-Code': 'bodea_store',
            'Magento-Store-View-Code': 'bodea_us',
            'Magento-Website-Code': 'bodea',
        });
        expect(result.scope).toMatchObject({
            websiteCode: 'bodea',
            storeCode: 'bodea_store',
            storeViewCode: 'bodea_us',
        });
    });

    it('sends the SAME headers the storefront sends', async () => {
        // Both come from `generateHeaders`, so an agent and the site it is
        // debugging cannot be querying two different stores. If these ever
        // diverge, the agent's answer stops describing the running demo.
        const { generateHeaders, buildConfigGeneratorParams } = await import(
            '@/features/eds/services/configGenerator'
        );
        getCurrentProject.mockResolvedValue(ACCS_PROJECT);

        const result = (await serve().call()) as unknown as { headers: unknown };

        expect(result.headers).toEqual(
            generateHeaders(
                buildConfigGeneratorParams(
                    ACCS_PROJECT as unknown as Parameters<typeof buildConfigGeneratorParams>[0],
                ),
            ),
        );
    });

    it('names the backend, because the headers differ by backend', async () => {
        getCurrentProject.mockResolvedValue(ACCS_PROJECT);
        expect((await serve().call()) as unknown as { backend: string }).toMatchObject({
            backend: 'accs',
        });

        getCurrentProject.mockResolvedValue(PAAS_PROJECT);
        expect((await serve().call()) as unknown as { backend: string }).toMatchObject({
            backend: 'paas',
        });
    });

    it('gives PaaS its api-key and environment headers, or the call cannot be made', async () => {
        // `ADOBE_CATALOG_API_KEY` is `type: text` in the registry — not marked
        // secret — and the same value is written into config.json and served to
        // every browser that loads the storefront. Withholding it would protect
        // nothing and break every PaaS Catalog Service query.
        getCurrentProject.mockResolvedValue(PAAS_PROJECT);

        const result = (await serve().call()) as unknown as {
            headers: { cs?: Record<string, string> };
            endpoints: { catalogService?: string };
        };

        expect(result.headers.cs).toMatchObject({
            'x-api-key': 'the-catalog-key',
            'Magento-Environment-Id': 'env-1',
        });
        expect(result.endpoints.catalogService).toBe(
            'https://catalog-service-sandbox.adobe.io/graphql',
        );
    });

    it('NEVER returns a value the registry marks secret', async () => {
        // The two keys carrying `secret: true` are ACCS_OAUTH_CLIENT_SECRET and
        // ADOBE_COMMERCE_ADMIN_PASSWORD. Neither is read by the resolvers this
        // tool calls — asserted here so a later field addition cannot quietly
        // open the path.
        getCurrentProject.mockResolvedValue({
            ...PAAS_PROJECT,
            componentConfigs: {
                'adobe-commerce-paas': {
                    ...PAAS_PROJECT.componentConfigs['adobe-commerce-paas'],
                    ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                    ACCS_OAUTH_CLIENT_SECRET: 'fake-test-pw-not-a-secret',
                },
            },
        });

        const raw = await serve().raw();

        expect(raw).not.toContain('fake-test-pw-not-a-secret');
        expect(raw).not.toContain('ADOBE_COMMERCE_ADMIN_PASSWORD');
        expect(raw).not.toContain('ACCS_OAUTH_CLIENT_SECRET');
    });

    describe('mesh and direct endpoint, reported separately', () => {
        /**
         * A deployed mesh in the keyed shape the real accessor reads.
         *
         * Checked against `getIdentifiedMeshAppBuilderComponent`
         * (`appBuilderComponentState.ts:98`) rather than assumed:
         * `appBuilderComponents` is a RECORD, an entry is selected by
         * `kind === 'mesh'`, and the endpoint is that entry's `endpoint`. This
         * fixture takes the non-canonical-key branch on purpose — the canonical
         * `mesh` key is checked first, and only the fallback proves the lookup
         * is by kind rather than by name.
         */
        const WITH_MESH = {
            ...ACCS_PROJECT,
            appBuilderComponents: {
                'eds-accs-mesh': {
                    id: 'eds-accs-mesh',
                    kind: 'mesh',
                    endpoint: 'https://edge-sandbox-graph.adobe.io/api/abc/graphql',
                },
            },
        };

        it('reports BOTH, so a partner can be told what to use with and without one', async () => {
            // Collapsing them is right for generating config.json and wrong
            // here — the surveyed session asked for exactly this distinction.
            getCurrentProject.mockResolvedValue(WITH_MESH);

            const result = (await serve().call()) as unknown as {
                endpoints: { mesh?: string; commerceGraphQl?: string };
            };

            expect(result.endpoints.mesh).toBe('https://edge-sandbox-graph.adobe.io/api/abc/graphql');
            expect(result.endpoints.commerceGraphQl).toBe(ACCS_CONFIG.ACCS_GRAPHQL_ENDPOINT);
        });

        it('says which one the STOREFRONT queries, because that is not obvious', async () => {
            getCurrentProject.mockResolvedValue(WITH_MESH);
            expect((await serve().call()) as unknown as { storefrontUses: string }).toMatchObject({
                storefrontUses: 'mesh',
            });

            getCurrentProject.mockResolvedValue(ACCS_PROJECT);
            expect((await serve().call()) as unknown as { storefrontUses: string }).toMatchObject({
                storefrontUses: 'commerceGraphQl',
            });
        });

        it('reports the same mesh endpoint get_project_status does', async () => {
            // One accessor, so the two tools cannot describe one mesh two ways.
            const { getMeshEndpoint } = await import('@/core/state/appBuilderComponentState');
            getCurrentProject.mockResolvedValue(WITH_MESH);

            const result = (await serve().call()) as unknown as { endpoints: { mesh?: string } };

            expect(result.endpoints.mesh).toBe(
                getMeshEndpoint(WITH_MESH as unknown as Parameters<typeof getMeshEndpoint>[0]),
            );
        });
    });

    it('refuses in prose when there is no current project', async () => {
        // Not every response parses — refusals are text, deliberately.
        getCurrentProject.mockResolvedValue(undefined);

        expect(await serve().raw()).toMatch(/no current project/i);
    });

    it('omits what is not configured rather than answering empty strings', async () => {
        // An empty endpoint reads as "configured, and blank". Absent reads as
        // "not set up", which is the truth and is actionable.
        getCurrentProject.mockResolvedValue({
            name: 'bare',
            path: '/p/bare',
            componentSelections: { backend: 'adobe-commerce-accs' },
            componentConfigs: {},
        });

        const result = (await serve().call()) as unknown as {
            endpoints: Record<string, string>;
            storefrontUses: string;
        };

        expect(result.endpoints).toEqual({});
        expect(result.storefrontUses).toBe('none');
    });

    it('stays within its recorded response ceiling', async () => {
        getCurrentProject.mockResolvedValue(ACCS_PROJECT);

        expectWithinCeiling('get_commerce_endpoints', await serve().raw());
    });
});
