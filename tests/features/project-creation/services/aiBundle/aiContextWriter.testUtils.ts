/**
 * Shared fixtures for the `aiContextWriter` suite family (4 suites).
 *
 * UNUSUAL FOR THIS BATCH: nothing here is a mock. Three of the four suites mock
 * nothing at all — `generateAgentsMd` is a pure function of a project and a stack
 * list — so there was no dead scaffolding to find. The duplication was 74 lines of
 * FIXTURES, byte-identical in all four files: two project shapes, a component
 * instance, a stack builder and the stack list every suite passes.
 *
 * That is worth naming, because the previous five families made "shared setup is
 * usually dead" look like a rule. It is not. Setup that duplicates because four
 * suites genuinely need the same INPUT is the case extraction was invented for;
 * setup that duplicates because nobody checked whether it does anything is the
 * case that has been dominating. Telling them apart is the whole job, and the only
 * way to tell is to delete it and re-run.
 *
 * A NOTE ON THE SHAPES. These are NOT built on `tests/helpers/projectFake`, and
 * that is deliberate rather than an oversight. `generateAgentsMd` renders prose
 * FROM these fields, and tests assert on the rendered strings, so here the values
 * ARE the test data — where the canonical fixture deliberately supplies neutral
 * ones chosen to be uninteresting. Sharing the shape would make every assertion
 * depend on a default picked for other suites' convenience.
 *
 * Measured 2026-08-31, deleting one field at a time:
 *
 *   githubRepo                3 tests fail without it
 *   commerce.instance.url     1 test fails
 *   liveUrl                   nothing fails
 *   selectedPackage           nothing fails
 *
 * So the argument above holds for some fields and not others. The unasserted ones
 * stay because this fixture stands in for a real manifest and a project that has a
 * repo but no live URL is not a shape the extension ever produces — but nothing
 * here is load-bearing until a test says so, and this list is what is actually
 * known rather than what reads well.
 *
 * `writeAgentsMd` keeps its own disk helpers (`sha256`, `primeDisk`) and the
 * generated-file-writer harness it imports: it is the only suite that touches the
 * filesystem.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import type { Project, ComponentInstance } from '@/types/base';
import type { Stack } from '@/types/stacks';

export function makeStack(overrides: Partial<Stack> = {}): Stack {
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

export function makeEdsStorefrontInstance(
    metaOverrides: Record<string, unknown> = {}
): ComponentInstance {
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

export function makeEdsProject(overrides: Partial<Project> = {}): Project {
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

export function makeHeadlessProject(overrides: Partial<Project> = {}): Project {
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

/** The stack list every suite passes to `generateAgentsMd` as its second argument. */
export const STACKS: Stack[] = [
    makeStack({ id: 'eds-paas', name: 'Edge Delivery + PaaS' }),
    makeStack({
        id: 'headless-paas',
        name: 'Headless + PaaS',
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
    }),
];
