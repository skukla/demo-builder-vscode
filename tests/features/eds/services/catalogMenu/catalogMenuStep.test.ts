/**
 * The catalog menu as a storefront step (EDS-24, EDS-61): storefront setup, reset and
 * republish each run it; there is no button.
 *
 * Boundaries faked: the storefront's pages (an in-memory DA.live site), the overlay's
 * category pages (an in-memory Helix), whether the repository has the block, and the
 * category read. The service, the record and the summary are real.
 *
 * The promises under test:
 * - every storefront with the product page overlay keeps the authored-pages sheet, block
 *   or not, because the overlay answers at category addresses either way;
 * - only a storefront whose own copy has `blocks/catalog-menu/` gets pages and the switch;
 * - a storefront without the product page overlay gets neither, and a sentence saying why
 *   (owner decision D5);
 * - reset's removal then re-apply round-trips: `/nav` comes back byte-for-byte and the
 *   site is as setup left it (CLAUDE.md property 1);
 * - a hand-built page for a category, at ANY address, is honored;
 * - the step never throws: a storefront without a catalog menu is still a storefront.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { readCatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import {
    applyCatalogMenuStep,
    publishAuthoredListStep,
    removeCatalogMenuStep,
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

const NAV =
    '<body><header></header><main><div><p>Brand</p></div>' +
    '<div><ul><li>Custom Signs</li></ul></div><div><p>Tools</p></div></main><footer></footer></body>';

const CATEGORIES: CatalogCategory[] = [
    { id: '135', name: 'Signs and Labels', urlPath: 'signs', level: 2, parentId: '119' },
    { id: '136', name: 'Danger Signs', urlPath: 'signs/danger-signs', level: 3, parentId: '135' },
    { id: '201', name: 'Apparel', urlPath: 'apparel', level: 2, parentId: '119' },
];

const PAGES = ['/signs', '/signs/danger-signs', '/apparel'];
const EMPTY = { legacyPages: [], links: [], navSwitch: false };

function site(
    s: FakeStorefront,
    helix: FakeCategoryHelix,
    overrides: Partial<CatalogMenuSite> = {},
): CatalogMenuSite & { readCategories: jest.Mock } {
    return {
        pages: s.port,
        hasBlock: async () => true,
        readCategories: jest.fn(async () => CATEGORIES),
        menuLine: async () => 'commerce' as const,
        overlay: true,
        categoryPages: helix.host,
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
    it('publishes a page per category, writes the template, switches the menu on, and keeps the record', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();

        const step = await applyCatalogMenuStep(project, site(s, helix));
        const summary = step?.summary;

        expect(helix.published).toEqual(PAGES);
        expect([...s.pages.keys()].sort()).toEqual(['/categories/default', '/nav']);
        expect(s.pages.get('/nav')).toContain('catalog-menu');
        const record = readCatalogMenuRecord(project);
        expect(record.navSwitch).toBe(true);
        expect(record.templateHash).toBeDefined();
        expect(summary).toContain('Published 3 category pages.');
        expect(step?.ok).toBe(true);
    });

    it('does nothing at all when the storefront does not have the block: no sheet, so the overlay stays off', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV, '/apparel': '<body>ours</body>' });
        const helix = fakeCategoryHelix();
        const reader = site(s, helix, { hasBlock: async () => false });

        const step = await applyCatalogMenuStep(project, reader);
        const summary = step?.summary;

        expect(summary).toBeUndefined();
        expect(s.pages.get('/nav')).toBe(NAV);
        expect(helix.events).toStrictEqual([]);
        expect(reader.readCategories).not.toHaveBeenCalled();
    });

    it('without the product page overlay: no category pages, no menu switch, and one sentence why', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const reader = site(s, helix, { overlay: false });

        const step = await applyCatalogMenuStep(project, reader);
        const summary = step?.summary;

        expect(summary).toBe(
            'Category pages come from the product page overlay, which is off for this storefront, ' +
                'so no category pages were published and the catalog menu was not added.',
        );
        expect(s.pages.get('/nav')).toBe(NAV);
        expect(s.written).toStrictEqual([]);
        expect(helix.published).toStrictEqual([]);
        expect(reader.readCategories).not.toHaveBeenCalled();
    });

    it('takes its menu back out when the overlay has been turned off since', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        await applyCatalogMenuStep(project, site(s, helix));

        const step = await applyCatalogMenuStep(project, site(s, helix, { overlay: false }));
        const summary = step?.summary;

        expect(s.pages.get('/nav')).toBe(NAV);
        expect(readCatalogMenuRecord(project)).toEqual(EMPTY);
        expect(summary).toMatch(/^Category pages come from the product page overlay.*Took the catalog menu out/);
    });

    it('removes the pages the old model wrote, at the next republish, and publishes the overlay there', async () => {
        const old = '<body><main><div><h1>Apparel</h1></div></main></body>';
        const project = storefrontProject({
            catalogMenu: { pages: [{ path: '/apparel', hash: hashOf(old) }], links: [], navSwitch: true },
        });
        const s = fakeStorefront({ '/nav': NAV, '/apparel': old });

        const helix = fakeCategoryHelix();
        const step = await applyCatalogMenuStep(project, site(s, helix));
        const summary = step?.summary;

        expect(s.removed).toEqual(['/apparel']);
        expect(helix.sheet).toStrictEqual([]);
        expect(helix.published).toContain('/apparel');
        expect(readCatalogMenuRecord(project).legacyPages).toStrictEqual([]);
        expect(summary).toContain('Removed 1 category page Demo Builder wrote in DA.live');
    });

    it('changes nothing and says why when the catalog has no menu categories yet', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });

        const step = await applyCatalogMenuStep(
            project,
            site(s, fakeCategoryHelix(), { readCategories: jest.fn(async () => []) }),
        );
        const summary = step?.summary;

        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(summary).toMatch(/^Category pages were not published: .*Include in Menu.*Republish the storefront/);
    });

    it('never throws: a failed check for the block is reported, and nothing is written', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });

        const step = await applyCatalogMenuStep(
            project,
            site(s, fakeCategoryHelix(), {
                hasBlock: async () => {
                    throw new Error('GitHub 502');
                },
            }),
        );
        const summary = step?.summary;

        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(summary).toContain('GitHub 502');
        // A step that could not run says so to its caller, which shows it as a warning.
        expect(step?.ok).toBe(false);
    });

    it('takes its own template and switch back out when the block has left the storefront', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        await applyCatalogMenuStep(project, site(s, helix));

        const step = await applyCatalogMenuStep(project, site(s, helix, { hasBlock: async () => false }));
        const summary = step?.summary;

        expect([...s.pages.keys()]).toEqual(['/nav']);
        expect(s.pages.get('/nav')).toBe(NAV);
        expect(helix.live.size).toBe(0);
        // Without the sheet the overlay leaves every category address alone again.
        expect(helix.sheet).toBeNull();
        expect(readCatalogMenuRecord(project)).toEqual(EMPTY);
        expect(summary).toContain('no longer has the catalog menu block');
    });
});

describe('removeCatalogMenuStep', () => {
    it('round trip: setup then reset returns /nav byte-for-byte; the re-apply leaves the site as setup did', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        await applyCatalogMenuStep(project, site(s, helix));
        const afterSetup = new Map(s.pages);
        const liveAfterSetup = new Set(helix.live);

        await removeCatalogMenuStep(project, site(s, helix));
        expect(s.pages.get('/nav')).toBe(NAV);
        expect([...s.pages.keys()]).toEqual(['/nav']);
        // The published paths stay on the record, for the re-apply to keep or take down.
        expect(readCatalogMenuRecord(project).categoryPaths).toEqual(PAGES);

        await applyCatalogMenuStep(project, site(s, helix));
        expect(s.pages).toEqual(afterSetup);
        expect(helix.live).toEqual(liveAfterSetup);
    });

    it("a reset after a category left the store takes that category's page down", async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        await applyCatalogMenuStep(project, site(s, helix));

        await removeCatalogMenuStep(project, site(s, helix));
        await applyCatalogMenuStep(project, site(s, helix, { readCategories: jest.fn(async () => CATEGORIES.slice(0, 2)) }));

        expect(helix.live.has('/apparel')).toBe(false);
    });

    it('says nothing and touches nothing when Demo Builder never made a menu here', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();

        expect(await removeCatalogMenuStep(project, site(s, helix))).toBeUndefined();
        expect(helix.events).toStrictEqual([]);
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

    it('links the menu to theirs, and says so by name', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV, '/safety-signage': SAFETY_SIGNAGE });

        const step = await applyCatalogMenuStep(project, site(s, fakeCategoryHelix()));
        const summary = step?.summary;

        expect(s.pages.get('/safety-signage')).toBe(SAFETY_SIGNAGE);
        expect(s.pages.get('/nav')).toContain('<div><div>signs</div><div>/safety-signage</div></div>');
        expect(summary).toContain('Signs and Labels uses your page at /safety-signage.');
        expect(readCatalogMenuRecord(project).links).toEqual([{ urlPath: 'signs', path: '/safety-signage' }]);
    });

    it('round trip: setup then reset returns /nav byte-for-byte and never touches their page', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV, '/safety-signage': SAFETY_SIGNAGE });
        const helix = fakeCategoryHelix();
        await applyCatalogMenuStep(project, site(s, helix));

        await removeCatalogMenuStep(project, site(s, helix));

        expect(s.pages.get('/nav')).toBe(NAV);
        expect([...s.pages.keys()].sort()).toEqual(['/nav', '/safety-signage']);
        expect(s.pages.get('/safety-signage')).toBe(SAFETY_SIGNAGE);
        expect(readCatalogMenuRecord(project)).toEqual({ ...EMPTY, categoryPaths: PAGES });
        // Reset takes the sheet out before the content is published again, and setup writes it first.
        expect(helix.sheet).toBeNull();
    });

    it('changes nothing and says why when the storefront pages cannot be listed', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const unlistable = {
            ...s.port,
            listPages: async (): Promise<string[]> => {
                throw new Error('DA.live 401');
            },
        };

        const step = await applyCatalogMenuStep(project, site(s, helix, { pages: unlistable }));
        const summary = step?.summary;

        expect(s.written).toStrictEqual([]);
        expect(helix.published).toStrictEqual([]);
        expect(summary).toMatch(/^Category pages were not published: DA\.live 401\./);
    });
});

/**
 * Republish publishes every DA.live page before the step runs. An authored page at a
 * category address must already be on the published sheet then, or the overlay replaces it
 * during that bulk publish (owner, 2026-10-22). So republish publishes the sheet first, with
 * the same computation the step uses; the step later writes it again and re-publishes.
 */
describe('publishAuthoredListStep', () => {
    it('publishes the sheet of authored category addresses and records it, publishing no page', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV, '/apparel': '<body>hand-built</body>' });
        const helix = fakeCategoryHelix();

        const summary = await publishAuthoredListStep(project, site(s, helix));

        expect(summary).toBeUndefined();
        expect(helix.events).toEqual(['sheet']);
        expect(helix.sheet).toEqual(['/apparel']);
        expect(readCatalogMenuRecord(project).authoredSheet).toBe(true);
        expect(s.written).toStrictEqual([]);
    });

    it("never lists Demo Builder's own unedited old page", async () => {
        const old = '<body><main><div><h1>Signs</h1></div></main></body>';
        const project = storefrontProject({
            catalogMenu: { pages: [{ path: '/signs', hash: hashOf(old) }], links: [], navSwitch: true },
        });
        const s = fakeStorefront({ '/nav': NAV, '/signs': old });
        const helix = fakeCategoryHelix();

        await publishAuthoredListStep(project, site(s, helix));

        expect(helix.sheet).toStrictEqual([]);
    });

    it('does nothing where the step would publish nothing: no block, or no overlay', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();

        await publishAuthoredListStep(project, site(s, helix, { hasBlock: async () => false }));
        await publishAuthoredListStep(project, site(s, helix, { overlay: false }));

        expect(helix.events).toStrictEqual([]);
    });

    it('with onlyWhenPublished: refreshes a sheet the record says is live, and opts no new site in', async () => {
        const s = fakeStorefront({ '/nav': NAV, '/apparel': '<body>hand-built</body>' });
        const fresh = storefrontProject();
        const freshHelix = fakeCategoryHelix();
        await publishAuthoredListStep(fresh, site(s, freshHelix), { onlyWhenPublished: true });
        expect(freshHelix.events).toStrictEqual([]);

        const optedIn = storefrontProject({ catalogMenu: { links: [], navSwitch: true, authoredSheet: true } });
        const helix = fakeCategoryHelix();
        await publishAuthoredListStep(optedIn, site(s, helix), { onlyWhenPublished: true });
        expect(helix.sheet).toEqual(['/apparel']);
    });

    it('never throws: a sheet that could not be published comes back as a sentence', async () => {
        const project = storefrontProject();
        const s = fakeStorefront({ '/nav': NAV });

        const summary = await publishAuthoredListStep(project, site(s, fakeCategoryHelix({ failSheet: true })));

        expect(summary).toBe(
            "Couldn't publish the list of pages you wrote at category addresses before publishing the content " +
                '(Helix 502 publishing the sheet); the catalog menu step tries again after it.',
        );
    });
});
