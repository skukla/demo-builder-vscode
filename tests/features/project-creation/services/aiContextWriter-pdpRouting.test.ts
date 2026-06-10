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

    it('documents the four-layer routing stack (canonical BYOM + two innovations)', () => {
        // The architecture is: pre-warming (layer 1, canonical poller
        // equivalent) + content.overlay registration (layer 2, canonical
        // BYOM) + Phase 2 render-pdp template fetch (layer 3, SC's
        // authored template inherits) + smart-404 client-side recovery
        // (layer 4, our innovation anchored against issue #262).
        const result = generateAgentsMd(makeEdsProject(), STACKS);
        expect(result).toContain('Pre-warming');
        expect(result).toContain('Catalog Prewarm');
        expect(result).toContain('content.overlay');
        expect(result).toContain('Phase 2 LIVE');
        expect(result).toContain('/products/default');
        expect(result).toContain('inherit');
        expect(result).toContain('Smart-404');
        expect(result).toContain('issue #262');
        // Should NOT still reference the resolved Phase 1 limitation
        expect(result).not.toMatch(/Phase 1 limitation/);
    });

    it('warns AI against canonical-deviating suggestions (per-project prerender, Tier 3 SSR)', () => {
        // Without these explicit "do not" lines, AI agents seeing the
        // BYOM routing default to suggesting Adobe's published canonical
        // path: deploy aem-commerce-prerender per project. That breaks
        // our multi-tenant Configuration Service writes. Similarly for
        // server-side SSR (JSON-LD, Merchant Center) — deliberately not
        // built for demos.
        const result = generateAgentsMd(makeEdsProject(), STACKS);
        expect(result).toContain('aem-commerce-prerender');
        expect(result).toContain('single-tenant');
        expect(result).toContain('JSON-LD');
        expect(result).toContain('Tier 3');
    });

    it('provides a debugging checklist for 404s including pre-warming + suffix', () => {
        const result = generateAgentsMd(makeEdsProject(), STACKS);
        expect(result).toContain('byom.overlayUrl');
        expect(result).toContain('render-pdp');
        expect(result).toContain('404.html');
        expect(result).toContain('Catalog Prewarm');
        expect(result).toContain('suffix');
    });

    it('links to the architecture doc', () => {
        expect(generateAgentsMd(makeEdsProject(), STACKS)).toContain('docs/architecture/eds-byom-pdp-routing.md');
    });

    it('omits the PDP Routing section for headless projects', () => {
        expect(generateAgentsMd(makeHeadlessProject(), STACKS)).not.toContain('## PDP Routing');
    });
});
