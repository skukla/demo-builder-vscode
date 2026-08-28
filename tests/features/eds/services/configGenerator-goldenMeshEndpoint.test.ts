/**
 * GOLDEN TEST — the MESH_ENDPOINT → config.json edge (ADR-011 D3 Step 06).
 *
 * The storefront `config.json` is generated from the deployed mesh endpoint and
 * served to every live demo storefront via the CDN. Step 06 moves mesh state
 * reads onto the keyed `appBuilderComponents` model; this test proves the
 * generated `config.json` is BYTE-IDENTICAL across the three project shapes:
 *
 *   1. Legacy: endpoint only in `meshState` (today's persisted reality) — the
 *      baseline is GENERATED inside the test, never hand-written.
 *   2. Transition: keyed mesh entry + `meshState` both present (Steps 02–06).
 *   3. Keyed-only: no `meshState` at all (the post-Step-07 world) — under both
 *      the migrated 'mesh' key and a component-instance key ('commerce-mesh'),
 *      because `recordDeployOutcome` keys never-migrated projects by instance id.
 *
 * Assertions use `toBe` on the exact string (byte-identity), not `toEqual` on
 * parsed JSON. If any case diverges, DO NOT adjust this test — fix the read.
 */

import {
    generateConfigJson,
    buildConfigGeneratorParams,
} from '@/features/eds/services/configGenerator';
import {
    PAAS_GRAPHQL_ENDPOINT,
    PAAS_CATALOG_SERVICE_ENDPOINT,
    PAAS_ENVIRONMENT_ID,
    PAAS_STORE_VIEW_CODE,
    PAAS_STORE_CODE,
    PAAS_WEBSITE_CODE,
    PAAS_CUSTOMER_GROUP,
    CATALOG_API_KEY,
} from '@/features/components/config/envVarKeys';
import type { Project, AppBuilderComponentState } from '@/types/base';
import type { Logger } from '@/types/logger';

const MESH_URL = 'https://edge-sandbox-graph.adobe.io/api/abc-123-def/graphql';
const LAST_DEPLOYED = '2026-07-10T12:00:00.000Z';

function makeLogger(): Logger {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;
}

/** The same mesh expressed as a keyed appBuilderComponents entry. */
function keyedMeshEntry(): AppBuilderComponentState {
    return {
        kind: 'mesh',
        status: 'deployed',
        source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
        endpoint: MESH_URL,
        sourceHash: 'abc123',
        lastDeployed: LAST_DEPLOYED,
    };
}

/**
 * A realistic PaaS EDS project: storefront instance metadata (repo + DA.live
 * coordinates), backend selection, and the Commerce config values the
 * generator consumes. Mesh state shape is supplied per-case.
 */
function makeProject(overrides: Partial<Project>): Project {
    return {
        name: 'golden-demo',
        path: '/projects/golden-demo',
        status: 'ready',
        created: new Date('2026-07-01T00:00:00Z'),
        lastModified: new Date('2026-07-01T00:00:00Z'),
        componentSelections: { backend: 'adobe-commerce-paas', frontend: 'eds-storefront' },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'acme/citisignal-demo',
                    daLiveOrg: 'acme',
                    daLiveSite: 'citisignal-demo',
                },
            },
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                type: 'dependency',
                subType: 'mesh',
                status: 'deployed',
            },
        },
        componentConfigs: {
            'adobe-commerce-paas': {
                [PAAS_GRAPHQL_ENDPOINT]: 'https://commerce.example.com/graphql',
                [PAAS_CATALOG_SERVICE_ENDPOINT]: 'https://catalog-service.adobe.io/graphql',
                [CATALOG_API_KEY]: 'fake-test-key-not-a-secret',
                [PAAS_ENVIRONMENT_ID]: 'env-abc-123',
                [PAAS_STORE_VIEW_CODE]: 'default',
                [PAAS_STORE_CODE]: 'main_website_store',
                [PAAS_WEBSITE_CODE]: 'base',
                [PAAS_CUSTOMER_GROUP]: '356a192b7913b04c54574d18c28d46e6395428ab',
            },
        },
        ...overrides,
    } as unknown as Project;
}

/** Run the REAL generator end-to-end and return the exact config.json string. */
function generate(project: Project): string {
    const result = generateConfigJson(buildConfigGeneratorParams(project), makeLogger());
    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    return result.content as string;
}

describe('GOLDEN: config.json byte-identity across keyed mesh keys (D3 Step 06)', () => {
    // PL-1 phase 2 removed the legacy singular meshState from Project, so the
    // original legacy-vs-keyed identity arms are unrepresentable. What SURVIVES
    // to guard is the key-shape identity: recordDeployOutcome keys
    // never-migrated projects by the mesh component-instance id, so the
    // endpoint read must find the entry by KIND, not only under 'mesh'.

    it('baseline sanity: the keyed-mesh config.json embeds the deployed mesh endpoint', () => {
        const baseline = generate(
            makeProject({ appBuilderComponents: { mesh: keyedMeshEntry() } }),
        );

        // Guard against vacuous byte-equality of two endpoint-less outputs.
        expect(baseline).toContain(MESH_URL);
        expect(JSON.parse(baseline).public?.default?.['commerce-endpoint']).toBe(MESH_URL);
    });

    it('keyed entry under a component-instance key ("commerce-mesh") → byte-identical', () => {
        const baseline = generate(
            makeProject({ appBuilderComponents: { mesh: keyedMeshEntry() } }),
        );

        const instanceKeyed = generate(
            makeProject({ appBuilderComponents: { 'commerce-mesh': keyedMeshEntry() } }),
        );

        expect(instanceKeyed).toBe(baseline);
    });
});
