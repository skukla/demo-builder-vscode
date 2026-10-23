/**
 * Catalog menu service — category pages through the product page overlay, at each
 * category's own address; the authored-pages sheet; the template; the nav switch; and the
 * undo (EDS-24, EDS-61).
 *
 * Every dependency is handed in: the category reader, the storefront pages (an in-memory
 * DA.live site) and the overlay's category pages (an in-memory Helix that records the
 * order of its calls).
 *
 * The promises under test:
 * - the sheet listing every authored page at a category address is published BEFORE any
 *   category path, because the overlay answers first on preview (measured 2026-10-22);
 * - pages the old model wrote come out FIRST, so they are not mistaken for authored ones;
 * - every other category path is published through the overlay — no DA.live page per
 *   category; the starter template is written once and never overwritten;
 * - pages of categories the store no longer has come off Helix; authored ones never do;
 * - everything it does can be undone (CLAUDE.md property 1).
 */

import { applyCatalogMenu, removeCatalogMenu } from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { CatalogMenuDeps, CatalogMenuRecord } from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPagePlan';
import { STARTER_CATEGORY_TEMPLATE } from '@/features/eds/services/catalogMenu/categoryTemplate';
import { hashOf } from '@/features/eds/services/catalogMenu/ownedPages';
import { fakeCategoryHelix, fakeStorefront, type FakeCategoryHelix, type FakeStorefront } from './catalogMenuService.testUtils';

const NAV =
    '<body><header></header><main><div><p>Brand</p></div>' +
    '<div><ul><li>Custom Signs</li></ul></div><div><p>Tools</p></div></main><footer></footer></body>';

const CATEGORIES: CatalogCategory[] = [
    { id: '41', name: 'Safety Signs', urlPath: 'safety-signs', level: 2, parentId: '2' },
    { id: '42', name: 'Exit Signs', urlPath: 'safety-signs/exit-signs', level: 3, parentId: '41' },
    { id: '43', name: 'Safety Cabinets', urlPath: 'safety_cabinets', level: 2, parentId: '2', inMenu: false },
];

const PAGES = ['/safety-signs', '/safety-signs/exit-signs', '/safety-cabinets'];
const TEMPLATE = '/categories/default';
/** A page an author built at a category's own address. */
const AUTHORED = '<body><main><div><h1>Our cabinets</h1></div></main></body>';

function deps(site: FakeStorefront, helix: FakeCategoryHelix, categories = CATEGORIES): CatalogMenuDeps {
    return { pages: site.port, readCategories: async () => categories, categoryPages: helix.host };
}

describe('applyCatalogMenu', () => {
    it('publishes every category path through the overlay, writes the template, and switches the menu on', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();

        const report = await applyCatalogMenu(deps(site, helix));

        expect(helix.published).toEqual(PAGES);
        expect(report.published).toEqual(PAGES);
        // DA.live gets the template and the nav, never a page per category.
        expect(site.written).toEqual([TEMPLATE, '/nav']);
        expect(site.pages.get(TEMPLATE)).toBe(STARTER_CATEGORY_TEMPLATE);
        expect(report.nav).toBe('added');
        expect(report.record).toEqual({
            legacyPages: [],
            links: [],
            navSwitch: true,
            templateHash: hashOf(STARTER_CATEGORY_TEMPLATE),
            categoryPaths: PAGES,
            authoredSheet: true,
        });
    });

    it('always publishes the sheet, empty when nothing is authored: it is what opts the site in', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();

        await applyCatalogMenu(deps(site, helix));

        expect(helix.sheet).toStrictEqual([]);
    });

    it('publishes the sheet BEFORE any category path, on every run', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-cabinets': AUTHORED });
        const helix = fakeCategoryHelix();
        const first = await applyCatalogMenu(deps(site, helix));
        helix.events.length = 0;

        await applyCatalogMenu(deps(site, helix), first.record);

        expect(helix.events[0]).toBe('sheet');
        expect(helix.events.filter((e) => e === 'sheet')).toHaveLength(1);
        expect(helix.events.slice(1).every((e) => e.startsWith('publish '))).toBe(true);
    });

    it("lists a hand-built page at a category's address, as JustRite's /apparel", async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signs': '<body><h1>Workplace safety</h1></body>' });
        const helix = fakeCategoryHelix();

        await applyCatalogMenu(deps(site, helix));

        expect(helix.sheet).toEqual(['/safety-signs']);
    });

    it('lists an authored page at a category address, publishes it again after the sheet, and never claims it', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-cabinets': AUTHORED });
        const helix = fakeCategoryHelix();

        const report = await applyCatalogMenu(deps(site, helix));

        expect(helix.sheet).toEqual(['/safety-cabinets']);
        expect(report.authored).toEqual(['/safety-cabinets']);
        // Published once the sheet is live, so DA.live's page is what goes out.
        expect(helix.events.indexOf('publish /safety-cabinets')).toBeGreaterThan(helix.events.indexOf('sheet'));
        expect(site.pages.get('/safety-cabinets')).toBe(AUTHORED);
        expect(report.published).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(report.record.categoryPaths).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        // The page at its own address IS the category's page: no row is needed.
        expect(report.record.links).toStrictEqual([]);
    });

    it('publishes no category path when the sheet could not be published', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-cabinets': AUTHORED });
        const helix = fakeCategoryHelix({ failSheet: true });
        const previous: CatalogMenuRecord = { legacyPages: [], links: [], navSwitch: true, categoryPaths: ['/gloves'] };

        const report = await applyCatalogMenu(deps(site, helix), previous);

        expect(helix.events).toEqual(['sheet']);
        expect(report.sheet).toEqual({ error: 'Helix 502 publishing the sheet' });
        expect(report.record.categoryPaths).toEqual(['/gloves']);
    });

    it('re-running leaves its unchanged template alone and publishes every page again', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const first = await applyCatalogMenu(deps(site, helix));
        site.written.length = 0;
        helix.published.length = 0;

        const second = await applyCatalogMenu(deps(site, helix), first.record);

        expect(site.written).toStrictEqual([]);
        expect(helix.published).toEqual(PAGES);
        expect(second.nav).toBe('already-present');
    });

    it('never overwrites a template it did not write, and stops claiming one the SC edited', async () => {
        const theirs = fakeStorefront({ '/nav': NAV, [TEMPLATE]: '<body>by hand</body>' });
        const fromTheirs = await applyCatalogMenu(deps(theirs, fakeCategoryHelix()));
        expect(theirs.pages.get(TEMPLATE)).toBe('<body>by hand</body>');
        expect(fromTheirs.record.templateHash).toBeUndefined();

        const site = fakeStorefront({ '/nav': NAV });
        const first = await applyCatalogMenu(deps(site, fakeCategoryHelix()));
        site.pages.set(TEMPLATE, '<body>edited</body>');
        const second = await applyCatalogMenu(deps(site, fakeCategoryHelix()), first.record);
        expect(site.pages.get(TEMPLATE)).toBe('<body>edited</body>');
        expect(second.record.templateHash).toBeUndefined();
    });

    it('takes down the pages it published for categories the store no longer has, never an authored one', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/tools': '<body>an author made this since</body>' });
        const helix = fakeCategoryHelix({ live: ['/gloves', '/tools', PAGES[0]] });
        const previous: CatalogMenuRecord = {
            legacyPages: [],
            links: [],
            navSwitch: true,
            categoryPaths: ['/gloves', '/tools', PAGES[0]],
        };

        const report = await applyCatalogMenu(deps(site, helix), previous);

        expect(helix.events).toContain('remove /gloves');
        expect(helix.live.has('/tools')).toBe(true);
        expect(report.pruned?.status).toBe('removed');
        expect(report.record.categoryPaths).toEqual(PAGES);
    });

    it('publishes no overlay path on a backend whose pages come on first visit, but still keeps the sheet', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-cabinets': AUTHORED });
        const helix = fakeCategoryHelix({ publishAtSetup: false });

        const report = await applyCatalogMenu(deps(site, helix));

        expect(helix.sheet).toEqual(['/safety-cabinets']);
        expect(helix.published).toEqual(['/safety-cabinets']);
        expect(report.deferred).toBe(true);
        expect(report.nav).toBe('added');
    });

    it('reports a failed publish and carries on with the rest', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix({ failPublish: [PAGES[0]] });

        const report = await applyCatalogMenu(deps(site, helix));

        expect(report.failed).toEqual([{ path: PAGES[0], error: `Helix 502 publishing ${PAGES[0]}` }]);
        expect(report.published).toEqual(PAGES.slice(1));
        expect(report.nav).toBe('added');
    });

    it('stops before changing anything when the categories or an address cannot be read', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const failing: CatalogMenuDeps = {
            ...deps(site, helix),
            readCategories: async () => {
                throw new Error('Catalog Service 401');
            },
        };
        await expect(applyCatalogMenu(failing)).rejects.toThrow('Catalog Service 401');

        const unreadable: CatalogMenuDeps = {
            ...deps(site, helix),
            pages: {
                ...site.port,
                read: async (path) => {
                    if (path === '/safety-signs') throw new Error('DA.live 503');
                    return site.pages.get(path) ?? null;
                },
            },
        };
        await expect(applyCatalogMenu(unreadable)).rejects.toThrow('DA.live 503');
        expect(site.written).toStrictEqual([]);
        expect(helix.events).toStrictEqual([]);
    });

    it('refuses a store with no menu categories rather than switching on a menu with nothing in it', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();

        await expect(
            applyCatalogMenu(deps(site, helix, [{ id: '9', name: 'Hidden', urlPath: 'hidden', inMenu: false }])),
        ).rejects.toThrow(/Include in Menu/);
        expect(helix.events).toStrictEqual([]);
    });
});

/**
 * The pages EDS-24 wrote in DA.live, one per category at its own address — the very
 * address the overlay now serves. They go at the next reset or republish (owner decision
 * D8), FIRST, so the authored list does not mistake them for an author's.
 */
describe('applyCatalogMenu — the pages the old model wrote', () => {
    const OLD_SIGNS =
        '<body><main><div><h1>Safety Signs</h1><div class="product-list-page">' +
        '<div><div>urlPath</div><div>safety-signs</div></div></div></div></main></body>';
    const record = (pages: Array<{ path: string; hash: string }>): CatalogMenuRecord => ({
        legacyPages: pages,
        links: [],
        navSwitch: true,
    });

    it('removes an old page nobody edited before the list is made, then the overlay serves its address', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signs': OLD_SIGNS });
        const helix = fakeCategoryHelix();

        const report = await applyCatalogMenu(
            deps(site, helix),
            record([{ path: '/safety-signs', hash: hashOf(OLD_SIGNS) }]),
        );

        expect(site.removed).toEqual(['/safety-signs']);
        expect(helix.sheet).toStrictEqual([]);
        expect(report.published).toContain('/safety-signs');
        expect(report.legacyRemoved).toEqual(['/safety-signs']);
        expect(report.record.legacyPages).toStrictEqual([]);
    });

    it('keeps an old page the SC edited: it lands in the sheet, and Demo Builder stops claiming it', async () => {
        const edited = OLD_SIGNS.replace('<h1>Safety Signs</h1>', '<h1>Our signs</h1>');
        const site = fakeStorefront({ '/nav': NAV, '/safety-signs': edited });
        const helix = fakeCategoryHelix();

        const report = await applyCatalogMenu(
            deps(site, helix),
            record([{ path: '/safety-signs', hash: hashOf(OLD_SIGNS) }]),
        );

        expect(site.removed).toStrictEqual([]);
        expect(helix.sheet).toEqual(['/safety-signs']);
        expect(report.skipped).toContainEqual({ path: '/safety-signs', reason: 'edited' });
        expect(report.record.legacyPages).toStrictEqual([]);
        expect(report.record.links).toStrictEqual([]);
    });

    it("keeps claiming an old page whose removal failed, and never lists it: it is Demo Builder's own", async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signs': OLD_SIGNS });
        const helix = fakeCategoryHelix();
        const failing = {
            ...site.port,
            remove: async () => {
                throw new Error('unpublish refused');
            },
        };
        const entry = { path: '/safety-signs', hash: hashOf(OLD_SIGNS) };

        const report = await applyCatalogMenu(
            { pages: failing, readCategories: async () => CATEGORIES, categoryPages: helix.host },
            record([entry]),
        );

        expect(report.legacyFailed).toEqual([{ path: '/safety-signs', error: 'unpublish refused' }]);
        expect(report.record.legacyPages).toEqual([entry]);
        expect(helix.sheet).toStrictEqual([]);
    });
});

describe('removeCatalogMenu (the undo)', () => {
    it('takes out the starter template and the nav switch, and keeps the published paths on the record', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const { record } = await applyCatalogMenu(deps(site, helix));

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(report.template).toBe('removed');
        expect(report.nav).toBe('removed');
        expect([...site.pages.keys()]).toEqual(['/nav']);
        expect(site.pages.get('/nav')).toBe(NAV);
        // The next build takes down the ones the store no longer has.
        // Without the overlay's host it cannot take the sheet out, so it keeps claiming it.
        expect(report.record).toEqual({
            legacyPages: [],
            links: [],
            navSwitch: false,
            categoryPaths: PAGES,
            authoredSheet: true,
        });
    });

    it('takes the sheet out too, after the category pages: no sheet is the overlay leaving the site alone', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const { record } = await applyCatalogMenu(deps(site, helix));

        const report = await removeCatalogMenu({ pages: site.port, categoryPages: helix.host, unpublish: true }, record);

        expect(report.sheet).toBe('removed');
        expect(helix.sheet).toBeNull();
        expect(helix.events.slice(-2)).toEqual([`remove ${PAGES.join(',')}`, 'remove sheet']);
        expect(report.record.authoredSheet).toBeUndefined();
    });

    it('takes the sheet out before a rebuild too, leaving the category pages for the rebuild', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const { record } = await applyCatalogMenu(deps(site, helix));
        helix.events.length = 0;

        const report = await removeCatalogMenu({ pages: site.port, categoryPages: helix.host }, record);

        expect(helix.events).toEqual(['remove sheet']);
        expect(report.record.categoryPaths).toEqual(PAGES);
    });

    it('keeps claiming the sheet when it could not be taken out, so the next run retries', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix({ failSheetRemoval: true });
        const { record } = await applyCatalogMenu(deps(site, helix));

        const report = await removeCatalogMenu({ pages: site.port, categoryPages: helix.host }, record);

        expect(report.sheet).toEqual({ error: 'Helix 502 removing the sheet' });
        expect(report.record.authoredSheet).toBe(true);
    });

    it('takes the published category pages down too when asked, never an authored one', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const { record } = await applyCatalogMenu(deps(site, helix));
        site.pages.set('/safety-signs', AUTHORED);

        const report = await removeCatalogMenu({ pages: site.port, categoryPages: helix.host, unpublish: true }, record);

        expect(helix.events).toContain('remove /safety-signs/exit-signs,/safety-cabinets');
        expect(report.categoryPages?.status).toBe('removed');
        expect(report.record.categoryPaths).toBeUndefined();
    });

    it('leaves a template the SC has since edited, and says so', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const { record } = await applyCatalogMenu(deps(site, fakeCategoryHelix()));
        site.pages.set(TEMPLATE, '<body>edited</body>');

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(report.template).toBe('edited');
        expect(site.pages.get(TEMPLATE)).toBe('<body>edited</body>');
    });

    it("removes the old model's unedited pages, and keeps an edited one", async () => {
        const site = fakeStorefront({ '/nav': NAV, '/a': '<body>a</body>', '/b': '<body>edited</body>' });
        const record: CatalogMenuRecord = {
            legacyPages: [
                { path: '/a', hash: hashOf('<body>a</body>') },
                { path: '/b', hash: hashOf('<body>b</body>') },
            ],
            links: [],
            navSwitch: false,
        };

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(report.removed).toEqual(['/a']);
        expect(report.skipped).toEqual([{ path: '/b', reason: 'edited' }]);
    });

    it('removes nothing from DA.live when there is no record of authorship', async () => {
        const site = fakeStorefront({ '/nav': NAV, [TEMPLATE]: '<body>x</body>' });
        const empty: CatalogMenuRecord = { legacyPages: [], links: [], navSwitch: false };

        const report = await removeCatalogMenu({ pages: site.port }, empty);

        expect(site.removed).toStrictEqual([]);
        expect(report.nav).toBe('not-recorded');
    });
});
