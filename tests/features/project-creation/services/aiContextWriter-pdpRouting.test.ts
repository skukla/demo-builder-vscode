/**
 * AGENTS.md PDP Routing section
 *
 * Verifies the `buildPdpRouting` section that teaches AI agents about Phase 1
 * BYOM PDP routing. Split into its own file so the sibling aiContextWriter
 * test stays under the ESLint max-lines threshold.
 */

import { generateAgentsMd } from '@/features/project-creation/services/aiContextWriter';
import type { Project } from '@/types/base';
import type { Stack } from '@/types/stacks';

const STACKS: Stack[] = [
    {
        id: 'eds-paas',
        name: 'Edge Delivery + PaaS',
        description: 'EDS storefront with Commerce drop-ins and PaaS',
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-paas',
        dependencies: [],
    },
    {
        id: 'headless-paas',
        name: 'Headless + PaaS',
        description: 'Headless with PaaS backend',
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
        dependencies: [],
    },
];

function makeEdsProject(): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/test-project',
        status: 'ready',
        selectedStack: 'eds-paas',
        selectedPackage: 'isle5',
        componentInstances: {
            'eds-storefront': {
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
                },
            },
        },
    } as unknown as Project;
}

function makeHeadlessProject(): Project {
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
    } as unknown as Project;
}

describe('aiContextWriter — PDP Routing section', () => {
    it('includes the PDP Routing section for EDS projects', () => {
        expect(generateAgentsMd(makeEdsProject(), STACKS)).toContain('## PDP Routing');
    });

    it('warns against per-product DA pages and folder mapping', () => {
        const result = generateAgentsMd(makeEdsProject(), STACKS);
        expect(result).toContain('do not');
        expect(result).toContain('per-product DA pages');
        expect(result).toContain('folder mapping');
    });

    it('documents that SC customizations inherit on every PDP (Phase 2 LIVE)', () => {
        // Phase 2 shipped 2026-06-09: render-pdp fetches the storefront's
        // authored /products/default and serves it on real product URLs.
        // The AI context language used to flag this as a "Phase 1
        // limitation"; now it documents the resolved state. If a future
        // contributor re-adds limitation language, this test catches it.
        const result = generateAgentsMd(makeEdsProject(), STACKS);
        expect(result).toContain('Phase 2 LIVE');
        expect(result).toContain('/products/default');
        expect(result).toContain('inherit');
        // Should NOT still reference the resolved Phase 1 limitation
        expect(result).not.toMatch(/Phase 1 limitation/);
    });

    it('provides a debugging checklist for 404s', () => {
        const result = generateAgentsMd(makeEdsProject(), STACKS);
        expect(result).toContain('byom.enabled');
        expect(result).toContain('render-pdp');
        expect(result).toContain('404.html');
    });

    it('links to the architecture doc', () => {
        expect(generateAgentsMd(makeEdsProject(), STACKS)).toContain('docs/architecture/eds-byom-pdp-routing.md');
    });

    it('omits the PDP Routing section for headless projects', () => {
        expect(generateAgentsMd(makeHeadlessProject(), STACKS)).not.toContain('## PDP Routing');
    });
});
