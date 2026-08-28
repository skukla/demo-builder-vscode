/**
 * The bundle's "Your MCP Servers" section.
 *
 * WHY IT EXISTS. Measured 2026-08-26 across five battery runs on three different
 * measurement rigs: the agent used `demo-builder` and `playwright` fluently and
 * opened `dropins` **zero times** — while doing, by hand, work `dropins` has
 * tools for.
 *
 * The reason is in how it searches. Every lookup was
 * `select:mcp__<server>__<exact-tool-name>` — searching BY NAME for tools it
 * already knows exist. It finds `playwright` because "browser" is a universal
 * idea and the tool name is guessable. `dropins` is not guessable: you have to
 * already know the package exists. A server nobody names is a server nobody uses,
 * however capable the agent is.
 *
 * The generated AGENTS.md named `demo-builder` four times and the other three
 * servers not once.
 *
 * The section is generated FROM `ai-defaults.json`, which already carries a
 * description and a `requires` gate per server, so it cannot drift from what is
 * actually installed.
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

describe('Your MCP Servers — the agent is told what it has', () => {
    it('names every server an EDS project actually gets', async () => {
        const md = await generateAgentsMd(makeEdsProject(), STACKS);

        expect(md).toContain('## Your MCP Servers');
        // The three the agent was never told about.
        expect(md).toContain('dropins');
        expect(md).toContain('playwright');
        expect(md).toContain('commerce-extensibility');
    });

    it("carries dropins' projectDir trap, which an agent gets wrong by default", async () => {
        // `ai-defaults.json` says it plainly: "Project-touching tools take a
        // required projectDir argument — pass the EDS storefront component path,
        // not the project root." Naming the server without that just moves the
        // failure one step later.
        const md = await generateAgentsMd(makeEdsProject(), STACKS);
        expect(md).toContain('projectDir');
    });

    it('does NOT name servers a headless project never receives', async () => {
        // `playwright` and `dropins` are gated on `eds-storefront`. Telling a
        // headless project about tools it does not have is worse than silence —
        // it sends the agent looking for something that is not there.
        const md = await generateAgentsMd(makeHeadlessProject(), STACKS);
        expect(md).not.toContain('mcp__dropins__');
        expect(md).not.toContain('@dropins/mcp');
    });
});
