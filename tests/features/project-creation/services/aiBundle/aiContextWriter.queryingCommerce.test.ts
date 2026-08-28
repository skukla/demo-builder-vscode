/**
 * The bundle's "Querying Commerce" section.
 *
 * Split out of `aiContextWriter.writeAgentsMd.test.ts` when that file crossed
 * the 500-line lint ceiling — the same way this directory already splits
 * `skillsWriter` and `mcpConfigWriter` into per-concern specs.
 *
 * WHY THE SECTION EXISTS. A survey of 48 sessions run inside demo projects
 * (2026-08-25) found agents calling 20 of 104 tools, overwhelmingly the ones the
 * generated bundle NAMES, while the one long stretch of real Commerce work
 * hand-assembled 28 `curl`s. A tool nobody is told about is a tool nobody calls.
 */

import { generateAgentsMd } from '@/features/project-creation/services/aiBundle/aiContextWriter';
import type { Project, ComponentInstance } from '@/types/base';
import type { Stack } from '@/types/stacks';

// ─── Helpers (the parent suite's, copied so each spec stands alone) ──────────

function makeStack(overrides: Partial<Stack> = {}): Stack {
    return {
        id: 'eds-paas',
        name: 'Edge Delivery + PaaS',
        description: 'EDS storefront with Commerce Drop-ins and PaaS',
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-paas',
        dependencies: [],
        ...overrides,
    };
}

function makeEdsStorefrontInstance(metaOverrides: Record<string, unknown> = {}): ComponentInstance {
    return {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        status: 'ready',
        path: '/projects/test-project/components/eds-storefront',
        metadata: {
            githubRepo: 'owner/my-repo',
            liveUrl: 'https://main--my-repo--owner.aem.live',
            previewUrl: 'https://main--my-repo--owner.aem.page',
            daLiveOrg: 'my-org',
            daLiveSite: 'my-site',
            ...metaOverrides,
        },
    };
}

function makeEdsProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/test-project',
        status: 'ready',
        selectedStack: 'eds-paas',
        selectedPackage: 'isle5',
        componentInstances: {
            'eds-storefront': makeEdsStorefrontInstance(),
        },
        ...overrides,
    };
}

function makeHeadlessProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'headless-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/headless-project',
        status: 'ready',
        selectedStack: 'headless-paas',
        selectedPackage: 'citisignal',
        commerce: {
            type: 'platform-as-a-service',
            instance: {
                url: 'https://commerce.example.com',
                environmentId: 'env-123',
                storeView: 'default',
                websiteCode: 'base',
                storeCode: 'main_website_store',
            },
        },
        componentInstances: {},
        ...overrides,
    };
}

const STACKS: Stack[] = [
    makeStack({ id: 'eds-paas', name: 'Edge Delivery + PaaS' }),
    makeStack({
        id: 'headless-paas',
        name: 'Headless + PaaS',
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
    }),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('aiContextWriter — Querying Commerce', () => {
/**
 * v23. A survey of 48 sessions run inside demo projects (2026-08-25)
 * found agents calling 20 of 104 tools — overwhelmingly the ones this
 * bundle NAMES — while the one long stretch of real Commerce work
 * hand-assembled 28 `curl`s. A tool nobody is told about is a tool
 * nobody calls, so the bundle now names this one.
 */
describe('querying Commerce', () => {
    it('names the tool, so an agent stops assembling endpoints by hand', () => {
        const result = generateAgentsMd(
            makeEdsProject({ componentSelections: { backend: 'adobe-commerce-accs' } }),
            STACKS,
        );

        expect(result).toContain('## Querying Commerce');
        expect(result).toContain('get_commerce_endpoints');
        expect(result).toMatch(/do not assemble the endpoint or the headers by hand/i);
    });

    it('warns that a wrong-scope query returns EMPTY rather than failing', () => {
        // The load-bearing half. An agent that knows the tool exists but
        // not this failure mode still reads an empty response as "no
        // products" — which is the "why is phones empty?" the surveyed
        // session spent turns on, against a catalog that was not empty.
        const result = generateAgentsMd(
            makeEdsProject({ componentSelections: { backend: 'adobe-commerce-accs' } }),
            STACKS,
        );

        expect(result).toMatch(/empty result and no error|EMPTY result and no error/i);
        expect(result).toMatch(/re-check the headers/i);
    });

    it('covers the OLDER project shape too, which carries `commerce` instead', () => {
        // Both shapes are live: a current manifest has
        // `componentSelections.backend` and no `commerce`; the headless
        // fixture is the other way round. Keying on one would omit the
        // section for half the corpus.
        const result = generateAgentsMd(makeHeadlessProject(), STACKS);

        expect(result).toContain('get_commerce_endpoints');
    });

    it('states VALUES nowhere — they go stale, the tool does not', () => {
        // Deploy a mesh and the storefront's target flips; reconfigure
        // the backend and the endpoint moves. AGENTS.md is written at
        // activation and read much later, so a baked endpoint can be
        // confidently wrong — which is worse than absent.
        const result = generateAgentsMd(
            makeEdsProject({
                componentSelections: { backend: 'adobe-commerce-accs' },
                componentConfigs: {
                    'adobe-commerce-accs': {
                        ACCS_GRAPHQL_ENDPOINT: 'https://na1.example.com/tenant/graphql',
                    },
                },
            }),
            STACKS,
        );

        expect(result).toContain('## Querying Commerce');
        expect(result).not.toContain('https://na1.example.com/tenant/graphql');
    });

    it('omits the section when the project has no Commerce backend at all', () => {
        const result = generateAgentsMd(makeEdsProject(), STACKS);

        expect(result).not.toContain('## Querying Commerce');
    });
});
});
