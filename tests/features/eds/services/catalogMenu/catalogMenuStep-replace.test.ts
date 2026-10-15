/**
 * Replacing the category pages after a store change (EDS-44).
 *
 * The old store's category pages come out (only the ones Demo Builder wrote and nobody
 * edited — the record's hash guard), and the new store's go in: reset's order, on the
 * same two steps reset runs. What comes back is what the store-change sentence needs:
 * how many pages the new store got, and which edited pages were kept.
 *
 * Boundaries faked as in `catalogMenuStep.test.ts`: the pages (in memory), the block
 * check and the category read. Service, record and summary are real.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import {
    applyCatalogMenuStep,
    replaceCatalogMenuStep,
    type CatalogMenuSite,
} from '@/features/eds/services/catalogMenu/catalogMenuStep';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';
import { fakeStorefront, type FakeStorefront } from './catalogMenuService.testUtils';

const NAV = '<body><header></header><main><div><p>Brand</p></div><div><ul><li>Deals</li></ul></div></main></body>';

const OLD_STORE: CatalogCategory[] = [
    { id: '10', name: 'Phones', urlPath: 'phones', level: 2, parentId: '2' },
    { id: '11', name: 'Plans', urlPath: 'plans', level: 2, parentId: '2' },
];
const NEW_STORE: CatalogCategory[] = [
    { id: '20', name: 'Signs', urlPath: 'signs', level: 2, parentId: '3' },
    { id: '21', name: 'Apparel', urlPath: 'apparel', level: 2, parentId: '3' },
    { id: '22', name: 'Tools', urlPath: 'tools', level: 2, parentId: '3' },
];

function storefrontProject(): Project {
    return createMockProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'me/shop' },
            },
        },
    });
}

function site(s: FakeStorefront, categories: CatalogCategory[], over: Partial<CatalogMenuSite> = {}): CatalogMenuSite {
    return { pages: s.port, hasBlock: async () => true, readCategories: async () => categories, ...over };
}

/** A storefront set up on the old store, the way setup leaves it. */
async function setUpOnOldStore(): Promise<{ project: Project; s: FakeStorefront }> {
    const project = storefrontProject();
    const s = fakeStorefront({ '/nav': NAV });
    await applyCatalogMenuStep(project, site(s, OLD_STORE));
    return { project, s };
}

describe('replaceCatalogMenuStep', () => {
    it("takes the old store's pages out and writes the new store's", async () => {
        const { project, s } = await setUpOnOldStore();

        const result = await replaceCatalogMenuStep(project, site(s, NEW_STORE));

        expect([...s.pages.keys()].sort()).toEqual(['/apparel', '/nav', '/signs', '/tools']);
        expect(s.pages.get('/nav')).toContain('catalog-menu');
        expect(readCatalogMenuRecord(project).pages.map((p) => p.path).sort()).toEqual([
            '/apparel',
            '/signs',
            '/tools',
        ]);
        expect(result).toMatchObject({ written: 3, kept: [] });
        expect(result.problem).toBeUndefined();
        // Removal first, then the build, as reset runs them.
        expect(s.removed).toEqual(['/phones', '/plans']);
        expect(result.summary).toMatch(/^Removed 2 category pages\..*Wrote and published 3 category pages\./);
    });

    it('keeps an old page the SC edited, and names it', async () => {
        const { project, s } = await setUpOnOldStore();
        s.pages.set('/phones', '<body><main><div><h1>Phones, our way</h1></div></main></body>');

        const result = await replaceCatalogMenuStep(project, site(s, NEW_STORE));

        expect(s.pages.get('/phones')).toContain('our way');
        expect(result.kept).toEqual(['/phones']);
        expect(result.written).toBe(3);
        // No longer claimed, so no later run removes it either.
        expect(readCatalogMenuRecord(project).pages.map((p) => p.path)).not.toContain('/phones');
    });

    it('takes the old pages out and writes none when the storefront has no catalog menu block', async () => {
        const { project, s } = await setUpOnOldStore();

        const result = await replaceCatalogMenuStep(project, site(s, NEW_STORE, { hasBlock: async () => false }));

        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(result).toMatchObject({ written: 0, kept: [] });
        expect(result.problem).toBeUndefined();
    });

    it('never throws: a category read that fails comes back as the problem, in the step\'s words', async () => {
        const { project, s } = await setUpOnOldStore();
        const failing = site(s, NEW_STORE, {
            readCategories: async () => {
                throw new Error('Catalog Service returned HTTP 503');
            },
        });

        const result = await replaceCatalogMenuStep(project, failing);

        expect(result.written).toBe(0);
        expect(result.problem).toMatch(/^Category pages were not written: Catalog Service returned HTTP 503\./);
    });

    it('a page that could not be written is the problem too', async () => {
        const { project } = await setUpOnOldStore();
        const s = fakeStorefront({ '/nav': NAV }, ['/tools']);

        const result = await replaceCatalogMenuStep(project, site(s, NEW_STORE));

        expect(result.written).toBe(2);
        expect(result.problem).toContain("couldn't be written");
    });
});
