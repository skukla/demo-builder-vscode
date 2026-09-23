/**
 * The description file built from a project, and the checks a project built
 * from it needs. Every field comes from something the project holds; nothing is typed
 * again.
 */

import {
    describeProject,
    ownStorefrontOf,
    resolveOwnContentSource,
    packageChecks,
    packageDraftFor,
} from '@/features/eds/services/demoPackage/demoPackageService';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import { makeAddedDemo, makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

const OWN = { owner: 'steve', repo: 'kukla-bodea', daLiveOrg: 'skukla', daLiveSite: 'kukla-bodea' };
const CONTENT = { org: 'skukla', site: 'kukla-bodea', indexPath: '/sitemap.json' };

function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'kukla-bodea',
        selectedPackage: 'bodea',
        selectedStack: 'eds-accs',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                // Copied from a real project file (~/.demo-builder/projects/bodea): the
                // metadata names the repository and the DA.live org; the site IS the
                // repository name and is not stored.
                metadata: { githubRepo: 'steve/kukla-bodea', daLiveOrg: 'skukla' },
            },
        },
        componentConfigs: {
            'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'bodea', ACCS_STORE_CODE: 'bodea_store', ACCS_STORE_VIEW_CODE: 'bodea_us' },
        },
        ...overrides,
    });
}

const CATALOG = [
    makeDemoPackage({
        id: 'bodea',
        name: 'Bodea',
        description: 'Bodea-branded B2B demo',
        configFlags: { 'commerce-b2b-enabled': true },
        requiresMesh: false,
        storefronts: { 'eds-accs': makeStorefront({ requiresMesh: 'optional' }) },
    }),
    makeDemoPackage({ id: 'starter', name: 'Starter (B2B + B2C)', storefronts: { 'eds-accs': makeStorefront() } }),
];

describe('ownStorefrontOf', () => {
    it("reads the project's repository and content site from the EDS instance, and nothing for a headless project", () => {
        expect(ownStorefrontOf(edsProject())).toEqual(OWN);
        expect(ownStorefrontOf(createMockProject({ selectedStack: 'headless-paas' }))).toBeUndefined();
    });

    it('honours a legacy daLiveSite when an unmigrated project still carries one', () => {
        const project = edsProject();
        const instance = project.componentInstances![COMPONENT_IDS.EDS_STOREFRONT]!;
        instance.metadata = { ...instance.metadata, daLiveSite: 'kukla-bodea-content' };
        expect(ownStorefrontOf(project)?.daLiveSite).toBe('kukla-bodea-content');
    });
});

describe('packageDraftFor', () => {
    it("prefills from the brand, from the added demo's row, and from the project's own title for a Starter build", () => {
        expect(packageDraftFor(edsProject(), CATALOG)).toEqual({ name: 'Bodea', description: 'Bodea-branded B2B demo' });
        expect(packageDraftFor(edsProject({ demo: makeAddedDemo({ description: 'Jen wrote this' }) }), CATALOG)).toEqual({
            name: 'Isle5 by Jen',
            description: 'Jen wrote this',
        });
        expect(packageDraftFor(edsProject({ selectedPackage: 'starter', title: 'My Summit Demo' }), CATALOG)).toEqual({
            name: 'My Summit Demo',
            description: '',
        });
    });
});

describe('describeProject', () => {
    it('writes the codes under both key families, the flags, the mesh posture (storefront over package), the datapack, the libraries and the site', () => {
        const project = edsProject({
            datapack: { name: 'bodea', version: '2026.09' },
            selectedBlockLibraries: ['isle5', ''],
            appBuilderComponents: {
                'app-builder-shell': { kind: 'integration', status: 'deployed', source: { owner: 'adobe', repo: 'app-builder-shell' } },
                'erp-sync': { kind: 'integration', status: 'deployed', name: 'ERP Sync', source: { owner: 'jen', repo: 'erp-sync', branch: 'main' } },
                'eds-commerce-mesh': { kind: 'mesh', status: 'deployed', source: { owner: 'adobe', repo: 'mesh' } },
            },
        });

        const file = describeProject(project, { name: ' Bodea by Steve ', description: ' Data center gear ' }, CONTENT, CATALOG);

        expect(file).toEqual({
            kind: 'demo',
            version: 1,
            name: 'Bodea by Steve',
            description: 'Data center gear',
            configDefaults: {
                ADOBE_COMMERCE_WEBSITE_CODE: 'bodea',
                ACCS_WEBSITE_CODE: 'bodea',
                ADOBE_COMMERCE_STORE_CODE: 'bodea_store',
                ACCS_STORE_CODE: 'bodea_store',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'bodea_us',
                ACCS_STORE_VIEW_CODE: 'bodea_us',
            },
            configFlags: { 'commerce-b2b-enabled': true },
            requiresMesh: 'optional',
            datapack: { name: 'bodea', version: '2026.09' },
            integrations: { catalog: ['app-builder-shell'], custom: { 'erp-sync': { owner: 'jen', repo: 'erp-sync', branch: 'main', name: 'ERP Sync' } } },
            blockLibraries: ['isle5'],
            contentSource: CONTENT,
        });
    });

    it("falls back to the project's title for an empty name and leaves out what the project does not have", () => {
        const file = describeProject(edsProject({ componentConfigs: {} }), { name: '', description: '' }, CONTENT, CATALOG);
        expect(file.name).toBe('kukla-bodea');
        expect(file).not.toHaveProperty('description');
        expect(file).not.toHaveProperty('configDefaults');
        expect(file).not.toHaveProperty('datapack');
        expect(file).not.toHaveProperty('integrations');
        expect(file).not.toHaveProperty('blockLibraries');
    });
});

describe('resolveOwnContentSource', () => {
    it("names the path the site answers under, and the fallback with 'not found' when none does", async () => {
        const logger = createMockLogger();
        const sitemapOnly = jest.fn(async (url: string) => ({ ok: url.endsWith('/sitemap.json'), status: 200, json: async () => ({ data: [{}, {}] }) })) as unknown as typeof fetch;
        expect(await resolveOwnContentSource(OWN, { fetchImpl: sitemapOnly, logger })).toEqual({ contentSource: CONTENT, indexFound: true, pageCount: 2 });

        const none = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
        expect(await resolveOwnContentSource(OWN, { fetchImpl: none, logger })).toEqual({
            contentSource: { ...CONTENT, indexPath: '/full-index.json' },
            indexFound: false,
        });
    });
});

describe('packageChecks', () => {
    const logger = createMockLogger();
    const repo = (fullName: string, isPrivate: boolean, defaultBranch = 'main') => ({ fullName, isPrivate, defaultBranch, htmlUrl: '', cloneUrl: '', id: 1, name: fullName.split('/')[1] });

    it('says, as what colleagues get, that the code is open, the pages are there, and the sample data is available', async () => {
        const repoOps = { getRepository: jest.fn().mockResolvedValue(repo('steve/kukla-bodea', false)) };
        const checks = await packageChecks(edsProject({ datapack: { name: 'bodea', version: 'main' } }), OWN, { indexFound: true, pageCount: 157 }, {
            repoOps,
            datapackExists: async () => true,
            logger,
        });
        // Owner, 2026-09-14: every line says what a COLLEAGUE gets, in plain words.
        // No branch name, no page count, no "public", no "datapack service".
        expect(checks.map((c) => [c.id, c.ok, c.message])).toEqual([
            ['repository', true, "Colleagues can open this storefront's code."],
            ['index', true, 'Colleagues start with your published pages.'],
            ['datapack', true, 'Colleagues can install the same sample data (bodea).'],
        ]);
    });

    it('warns for a private repository, a site with no index (offering Republish), a missing datapack, and a private custom app', async () => {
        const repoOps = {
            getRepository: jest.fn(async (owner: string, name: string) =>
                name === 'erp-sync' ? repo('jen/erp-sync', true) : repo(`${owner}/${name}`, true, 'develop'),
            ),
        };
        const project = edsProject({
            datapack: { name: 'bodea', version: 'main' },
            appBuilderComponents: { 'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'jen', repo: 'erp-sync' } } },
        });

        const checks = await packageChecks(project, OWN, { indexFound: false }, { repoOps, datapackExists: async () => false, logger });

        expect(checks).toEqual([
            { id: 'repository', ok: false, message: "This storefront's code is private. Colleagues will need access to it, or make it public." },
            { id: 'index', ok: false, message: 'Colleagues would start with an empty site.', action: 'republish' },
            { id: 'datapack', ok: false, message: "The sample data this demo uses (bodea) isn't available to colleagues yet." },
            { id: 'custom-app', ok: false, message: "The erp-sync integration's code is private. Colleagues will need access to it.", repository: 'jen/erp-sync' },
        ]);
    });

    it("says nothing about the datapack when the service cannot be asked, and says the repository can't be read when GitHub refuses", async () => {
        const repoOps = { getRepository: jest.fn().mockRejectedValue(new Error('404')) };
        const checks = await packageChecks(edsProject({ datapack: { name: 'bodea', version: 'main' } }), OWN, { indexFound: true, pageCount: 1 }, {
            repoOps,
            datapackExists: async () => undefined,
            logger,
        });
        expect(checks.map((c) => c.id)).toEqual(['repository', 'index']);
        expect(checks[0]).toMatchObject({ ok: false, message: "This storefront's code can't be read with your GitHub sign-in." });
    });
});
