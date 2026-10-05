/**
 * The catalog menu as a storefront step (EDS-24, redesigned 2026-10-05): storefront setup,
 * reset and republish each run it; there is no button.
 *
 * Boundaries faked: the storefront's pages (an in-memory DA.live site), whether the
 * repository has the block, and the category read. The service, the record and the
 * summary are real.
 *
 * The promises under test:
 * - only a storefront whose own copy has `blocks/catalog-menu/` gets pages and the switch;
 * - a page someone else made is never touched, and is named in the summary (a clash);
 * - reset's removal then re-apply round-trips: `/nav` comes back byte-for-byte and no
 *   page Demo Builder wrote is left behind (CLAUDE.md property 1);
 * - a hand-built page for a category, at ANY address, is honored: no second page is
 *   written, the menu links to theirs, and the summary names it;
 * - the step never throws: a storefront without a catalog menu is still a storefront.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import type { StorefrontPages } from '@/features/eds/services/catalogMenu/catalogMenuService';
import {
    applyCatalogMenuStep,
    removeCatalogMenuStep,
    type CatalogMenuSite,
} from '@/features/eds/services/catalogMenu/catalogMenuStep';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';
import { fakeStorefront } from './catalogMenuService.testUtils';

const NAV =
    '<body><header></header><main><div><p>Brand</p></div>' +
    '<div><ul><li>Custom Signs</li></ul></div><div><p>Tools</p></div></main><footer></footer></body>';

const CATEGORIES: CatalogCategory[] = [
    { id: '135', name: 'Signs and Labels', urlPath: 'signs', level: 2, parentId: '119' },
    { id: '136', name: 'Danger Signs', urlPath: 'signs/danger-signs', level: 3, parentId: '135' },
    { id: '201', name: 'Apparel', urlPath: 'apparel', level: 2, parentId: '119' },
];

/** A colleague's hand-made category page, already on the site. */
const HAND_MADE_APPAREL = '<body><main><div><h1>Apparel</h1><p>Our own words</p></div></main></body>';

const fakeSite = (initial: Record<string, string> = { '/nav': NAV }) => fakeStorefront(initial);

function site(
    pages: StorefrontPages,
    overrides: Partial<CatalogMenuSite> = {},
): CatalogMenuSite & { readCategories: jest.Mock } {
    return {
        pages,
        hasBlock: async () => true,
        readCategories: jest.fn(async () => CATEGORIES),
        ...overrides,
    } as CatalogMenuSite & { readCategories: jest.Mock };
}

function storefrontProject(metadata: Record<string, unknown> = {}): Project {
    return createMockProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'skukla/kukla-justrite', ...metadata },
            },
        },
    });
}

describe('applyCatalogMenuStep', () => {
    it('writes a page per category and switches the menu on, and keeps the record on the project', async () => {
        const project = storefrontProject();
        const s = fakeSite();

        const summary = await applyCatalogMenuStep(project, site(s.port));

        expect([...s.pages.keys()].sort()).toEqual(['/apparel', '/nav', '/signs', '/signs/danger-signs']);
        expect(s.pages.get('/nav')).toContain('catalog-menu');
        const record = readCatalogMenuRecord(project);
        expect(record.navSwitch).toBe(true);
        expect(record.pages.map((p) => p.path).sort()).toEqual(['/apparel', '/signs', '/signs/danger-signs']);
        expect(summary).toContain('Wrote and published 3 category pages.');
    });

    it('does nothing at all when the storefront does not have the block', async () => {
        const project = storefrontProject();
        const s = fakeSite();
        const reader = site(s.port, { hasBlock: async () => false });

        const summary = await applyCatalogMenuStep(project, reader);

        expect(summary).toBeUndefined();
        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(s.pages.get('/nav')).toBe(NAV);
        expect(reader.readCategories).not.toHaveBeenCalled();
        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).not.toHaveProperty(
            'catalogMenu',
        );
    });

    it("leaves a colleague's hand-made category page untouched and names it in the summary", async () => {
        const project = storefrontProject();
        const s = fakeSite({ '/nav': NAV, '/apparel': HAND_MADE_APPAREL });

        const summary = await applyCatalogMenuStep(project, site(s.port));

        expect(s.pages.get('/apparel')).toBe(HAND_MADE_APPAREL);
        expect(readCatalogMenuRecord(project).pages.map((p) => p.path)).not.toContain('/apparel');
        expect(summary).toContain("Demo Builder didn't write it (Apparel (/apparel))");
    });

    it('re-applied (republish): a new category gets its page, an edited page keeps the edit', async () => {
        const project = storefrontProject();
        const s = fakeSite();
        await applyCatalogMenuStep(project, site(s.port, { readCategories: jest.fn(async () => CATEGORIES.slice(0, 2)) }));
        s.pages.set('/signs', '<body><main><div><h1>Signs, edited by the SC</h1></div></main></body>');

        const summary = await applyCatalogMenuStep(project, site(s.port));

        expect(s.pages.has('/apparel')).toBe(true);
        expect(s.pages.get('/signs')).toContain('edited by the SC');
        expect(summary).toContain('Wrote and published 2 category pages.');
        expect(summary).toContain('because you edited it (Signs and Labels (/signs))');
        expect(readCatalogMenuRecord(project).pages.map((p) => p.path)).not.toContain('/signs');
    });

    it('changes nothing and says why when the catalog has no menu categories yet', async () => {
        const project = storefrontProject();
        const s = fakeSite();

        const summary = await applyCatalogMenuStep(project, site(s.port, { readCategories: jest.fn(async () => []) }));

        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(summary).toMatch(/^Category pages were not written: .*Include in Menu.*Republish the storefront/);
    });

    it('never throws: a failed check for the block is reported, and nothing is written', async () => {
        const project = storefrontProject();
        const s = fakeSite();

        const summary = await applyCatalogMenuStep(
            project,
            site(s.port, {
                hasBlock: async () => {
                    throw new Error('GitHub 502');
                },
            }),
        );

        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(summary).toContain('GitHub 502');
    });

    it('takes its own pages and switch back out when the block has left the storefront', async () => {
        const project = storefrontProject();
        const s = fakeSite();
        await applyCatalogMenuStep(project, site(s.port));

        const summary = await applyCatalogMenuStep(project, site(s.port, { hasBlock: async () => false }));

        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(s.pages.get('/nav')).toBe(NAV);
        expect(readCatalogMenuRecord(project)).toEqual({ pages: [], links: [], navSwitch: false });
        expect(summary).toContain('no longer has the catalog menu block');
    });
});

describe('removeCatalogMenuStep', () => {
    it('round trip: setup then reset returns /nav byte-for-byte and leaves no page Demo Builder wrote', async () => {
        const project = storefrontProject();
        const s = fakeSite({ '/nav': NAV, '/apparel': HAND_MADE_APPAREL });
        await applyCatalogMenuStep(project, site(s.port));

        const summary = await removeCatalogMenuStep(project, s.port);

        expect(s.pages.get('/nav')).toBe(NAV);
        expect([...s.pages.keys()].sort()).toEqual(['/apparel', '/nav']);
        expect(s.pages.get('/apparel')).toBe(HAND_MADE_APPAREL);
        expect(readCatalogMenuRecord(project)).toEqual({ pages: [], links: [], navSwitch: false });
        expect(summary).toContain('Removed 2 category pages.');
    });

    it('then setup re-applies and the site is as it was after the first setup', async () => {
        const project = storefrontProject();
        const s = fakeSite();
        await applyCatalogMenuStep(project, site(s.port));
        const afterSetup = new Map(s.pages);

        await removeCatalogMenuStep(project, s.port);
        await applyCatalogMenuStep(project, site(s.port));

        expect(s.pages).toEqual(afterSetup);
    });

    it('says nothing and touches nothing when Demo Builder never wrote a menu here', async () => {
        const project = storefrontProject();
        const s = fakeSite({ '/nav': NAV, '/apparel': HAND_MADE_APPAREL });

        expect(await removeCatalogMenuStep(project, s.port)).toBeUndefined();
        expect(s.pages.get('/apparel')).toBe(HAND_MADE_APPAREL);
    });

    it('keeps claiming a page whose removal failed, so the next reset can retry it', async () => {
        const project = storefrontProject();
        const s = fakeSite();
        await applyCatalogMenuStep(project, site(s.port));
        const failing: StorefrontPages = {
            ...s.port,
            remove: async (path) => {
                if (path === '/signs') throw new Error('unpublish refused');
                s.pages.delete(path);
            },
        };

        const summary = await removeCatalogMenuStep(project, failing);

        expect(readCatalogMenuRecord(project).pages.map((p) => p.path)).toEqual(['/signs']);
        expect(summary).toContain("couldn't be removed; reset the storefront again to retry");
    });
});

/**
 * Owner's rule 2026-10-05: a hand-built page for a category is always honored. The page
 * below sits at `/safety-signage` and its `product-list-page` block names `signs`.
 */
describe('a category that already has a hand-built page at another address', () => {
    const SAFETY_SIGNAGE =
        '<body><header></header><main><div><h1>Safety signage</h1><div class="product-list-page">' +
        '<div><div><p>urlPath</p></div><div><p>signs</p></div></div></div></div></main><footer></footer></body>';

    it('writes no second page, links the menu to theirs, and says so by name', async () => {
        const project = storefrontProject();
        const s = fakeSite({ '/nav': NAV, '/safety-signage': SAFETY_SIGNAGE });

        const summary = await applyCatalogMenuStep(project, site(s.port));

        expect(s.written).toEqual(['/signs/danger-signs', '/apparel', '/nav']);
        expect(s.pages.has('/signs')).toBe(false);
        expect(s.pages.get('/safety-signage')).toBe(SAFETY_SIGNAGE);
        expect(s.pages.get('/nav')).toContain('<div><div>signs</div><div>/safety-signage</div></div>');
        expect(summary).toContain('Signs and Labels uses your page at /safety-signage.');
        expect(readCatalogMenuRecord(project).links).toEqual([{ urlPath: 'signs', path: '/safety-signage' }]);
    });

    it('round trip: setup then reset returns /nav byte-for-byte and never touches their page', async () => {
        const project = storefrontProject();
        const s = fakeSite({ '/nav': NAV, '/safety-signage': SAFETY_SIGNAGE });
        await applyCatalogMenuStep(project, site(s.port));

        await removeCatalogMenuStep(project, s.port);

        expect(s.pages.get('/nav')).toBe(NAV);
        expect(s.removed.sort()).toEqual(['/apparel', '/signs/danger-signs']);
        expect([...s.pages.keys()].sort()).toEqual(['/nav', '/safety-signage']);
        expect(s.pages.get('/safety-signage')).toBe(SAFETY_SIGNAGE);
        expect(readCatalogMenuRecord(project)).toEqual({ pages: [], links: [], navSwitch: false });
    });

    it('then setup re-applies and the site is as it was after the first setup', async () => {
        const project = storefrontProject();
        const s = fakeSite({ '/nav': NAV, '/safety-signage': SAFETY_SIGNAGE });
        await applyCatalogMenuStep(project, site(s.port));
        const afterSetup = new Map(s.pages);

        await removeCatalogMenuStep(project, s.port);
        await applyCatalogMenuStep(project, site(s.port));

        expect(s.pages).toEqual(afterSetup);
    });

    it('writes nothing and says why when the storefront pages cannot be listed', async () => {
        const project = storefrontProject();
        const s = fakeSite();
        const unlistable: StorefrontPages = {
            ...s.port,
            listPages: async () => {
                throw new Error('DA.live 401');
            },
        };

        const summary = await applyCatalogMenuStep(project, site(unlistable));

        expect(s.written).toStrictEqual([]);
        expect(summary).toMatch(/^Category pages were not written: DA\.live 401\./);
    });
});
