/**
 * Replacing the category pages after a store change (EDS-44, EDS-61).
 *
 * The old store's category pages come off Helix, and the new store's are published:
 * reset's order, on the same two steps reset runs. What comes back is what the
 * store-change sentence needs: how many pages the new store got, and which edited pages
 * were kept.
 *
 * Boundaries faked as in `catalogMenuStep.test.ts`. Service, record and summary are real.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    applyCatalogMenuStep,
    replaceCatalogMenuStep,
    type CatalogMenuSite,
} from '@/features/eds/services/catalogMenu/catalogMenuStep';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPagePlan';
import { hashOf } from '@/features/eds/services/catalogMenu/ownedPages';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';
import {
    fakeCategoryHelix,
    fakeStorefront,
    type FakeCategoryHelix,
    type FakeStorefront,
} from './catalogMenuService.testUtils';

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

function storefrontProject(metadata: Record<string, unknown> = {}): Project {
    return createMockProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'me/shop', ...metadata },
            },
        },
    });
}

function site(
    s: FakeStorefront,
    helix: FakeCategoryHelix,
    categories: CatalogCategory[],
    over: Partial<CatalogMenuSite> = {},
): CatalogMenuSite {
    return {
        pages: s.port,
        hasBlock: async () => true,
        readCategories: async () => categories,
        menuLine: async () => 'commerce' as const,
        overlay: true,
        categoryPages: helix.host,
        ...over,
    };
}

/** A storefront set up on the old store, the way setup leaves it. */
async function setUpOnOldStore(): Promise<{ project: Project; s: FakeStorefront; helix: FakeCategoryHelix }> {
    const project = storefrontProject();
    const s = fakeStorefront({ '/nav': NAV });
    const helix = fakeCategoryHelix();
    await applyCatalogMenuStep(project, site(s, helix, OLD_STORE));
    return { project, s, helix };
}

describe('replaceCatalogMenuStep', () => {
    it("takes the old store's pages down and publishes the new store's", async () => {
        const { project, s, helix } = await setUpOnOldStore();
        helix.published.length = 0;

        const result = await replaceCatalogMenuStep(project, site(s, helix, NEW_STORE));

        expect([...helix.live].sort()).toEqual(['/apparel', '/signs', '/tools']);
        expect(helix.published).toEqual(['/signs', '/apparel', '/tools']);
        expect(s.pages.get('/nav')).toContain('catalog-menu');
        expect(result).toMatchObject({ written: 3, kept: [] });
        expect(result.problem).toBeUndefined();
        // Removal first (the sheet), then the build: the sheet again, the new pages, the old ones down.
        expect(helix.events.slice(-6)).toEqual([
            'remove sheet',
            'sheet',
            'publish /signs',
            'publish /apparel',
            'publish /tools',
            'remove /phones,/plans',
        ]);
        expect(result.summary).toMatch(/Published 3 category pages\..*Took down 2 category pages/);
    });

    it('keeps an old-model page the SC edited, and names it', async () => {
        const old = '<body><main><div><h1>Phones</h1></div></main></body>';
        const project = storefrontProject({
            catalogMenu: { pages: [{ path: '/phones', hash: hashOf(old) }], links: [], navSwitch: false },
        });
        const s = fakeStorefront({ '/nav': NAV, '/phones': '<body><main><div><h1>Phones, our way</h1></div></main></body>' });

        const result = await replaceCatalogMenuStep(project, site(s, fakeCategoryHelix(), NEW_STORE));

        expect(s.pages.get('/phones')).toContain('our way');
        expect(result.kept).toEqual(['/phones']);
        expect(result.written).toBe(3);
    });

    it('takes the old pages down and publishes none when the storefront has no catalog menu block', async () => {
        const { project, s, helix } = await setUpOnOldStore();

        const result = await replaceCatalogMenuStep(project, site(s, helix, NEW_STORE, { hasBlock: async () => false }));

        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(helix.live.size).toBe(0);
        expect(result).toMatchObject({ written: 0, kept: [] });
        expect(result.problem).toBeUndefined();
    });

    it("never throws: a category read that fails comes back as the problem, in the step's words", async () => {
        const { project, s, helix } = await setUpOnOldStore();
        const failing = site(s, helix, NEW_STORE, {
            readCategories: async () => {
                throw new Error('Catalog Service returned HTTP 503');
            },
        });

        const result = await replaceCatalogMenuStep(project, failing);

        expect(result.written).toBe(0);
        expect(result.problem).toMatch(/^Category pages were not published: Catalog Service returned HTTP 503\./);
    });

    it('a page that could not be published is the problem too', async () => {
        const { project, s } = await setUpOnOldStore();
        const helix = fakeCategoryHelix({ failPublish: ['/tools'] });

        const result = await replaceCatalogMenuStep(project, site(s, helix, NEW_STORE));

        expect(result.written).toBe(2);
        expect(result.problem).toContain("couldn't be published");
    });
});
