/**
 * The project file contract (program plan step 01, PL-56a): one versioned
 * file a project travels in, and the storefront slice of it that travels with
 * a repo. Names decided 2026-09-11 (owner): one family, kind first, shared
 * suffix. No sibling suite covers these types; `demoPackages*.test.ts` cover
 * the catalog types the slice is derived from.
 */

import type { ProjectFile, SharedDemoDescription } from '@/types/projectFile';
import {
    PROJECT_FILE_SUFFIX,
    PROJECT_FILE_VERSION,
    SHARED_DEMO_FILE_NAME,
    SHARED_DEMO_FILE_VERSION,
} from '@/types/projectFile';

describe('project file names (one family, kind first)', () => {
    it('the exported project and the shared-demo file share the manifest suffix and differ by kind', () => {
        expect(PROJECT_FILE_SUFFIX).toBe('.project.demo-builder.json');
        expect(SHARED_DEMO_FILE_NAME).toBe('demo.demo-builder.json');
        // Neither may collide with the project manifest a project folder holds.
        expect(PROJECT_FILE_SUFFIX).not.toBe('.demo-builder.json');
        expect(SHARED_DEMO_FILE_NAME).not.toBe('.demo-builder.json');
    });

    it('versions start where the migration expects them', () => {
        expect(PROJECT_FILE_VERSION).toBe(2);
        expect(SHARED_DEMO_FILE_VERSION).toBe(1);
    });
});

describe('SharedDemoDescription — the storefront slice a colleague may commit', () => {
    it('carries what a shipped catalog entry may say, plus the datapack and integrations decided in D26/D29', () => {
        const demo: SharedDemoDescription = {
            kind: 'demo',
            version: 1,
            name: 'Isle5 by Jen',
            description: 'Isle5-branded B2B demo with custom blocks',
            icon: 'assets/isle5.svg',
            configDefaults: { ACCS_WEBSITE_CODE: 'isle5' },
            configFlags: { 'commerce-b2b-enabled': true },
            requiresMesh: 'optional',
            blockLibraries: ['demo-team-blocks'],
            datapack: { name: 'isle5', version: 'main' },
            integrations: {
                catalog: ['eds-accs-mesh'],
                custom: { 'jen-pricing': { owner: 'jen', repo: 'pricing-app' } },
            },
            contentSource: { org: 'jen', site: 'isle5', indexPath: '/sitemap.json' },
        };
        expect(demo.kind).toBe('demo');
        // The minimal file is the kind, the version and a name.
        const minimal: SharedDemoDescription = { kind: 'demo', version: 1, name: 'Isle5' };
        expect(minimal.name).toBe('Isle5');
    });
});

describe('ProjectFile — what a project travels in', () => {
    it('is kind-tagged, versioned, and has no field for credentials', () => {
        const file: ProjectFile = {
            kind: 'project',
            version: 2,
            exportedAt: '2026-09-11T00:00:00.000Z',
            source: { project: 'bodea', title: 'Bodea', extension: '1.0.0-beta.146' },
            title: 'Bodea',
            selectedPackage: 'bodea',
            selectedStack: 'eds-accs',
            selections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
            configs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'bodea' } },
            datapack: { name: 'bodea', version: 'main' },
        };
        expect(file.kind).toBe('project');
        // @ts-expect-error — the v1 stamp is gone with the flag it labelled (D24)
        const withStamp: ProjectFile = { ...file, includesSecrets: false };
        expect(withStamp).toBeDefined();
    });
});
