/**
 * A hand-built page for a category is always honored (EDS-24, owner's rule 2026-10-05).
 *
 * A category page may live at any address — the `urlPath` row of its `product-list-page`
 * block names the category, not the page's own path. The menu block links every category
 * to its own address (EDS-61); a hand-built page there is its page (and goes on the
 * authored-pages sheet), and one elsewhere is honored by a "category → page" row in the
 * nav's `catalog-menu` table, which the summary names.
 *
 * What is asserted is what was HANDED to the page port and the overlay, plus the nav
 * content and the record.
 */

import { applyCatalogMenu, removeCatalogMenu } from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { CatalogMenuDeps } from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPagePlan';
import { fakeCategoryHelix, fakeStorefront, type FakeStorefront } from './catalogMenuService.testUtils';

const NAV =
    '<body><header></header><main><div><p>Brand</p></div>' +
    '<div><ul><li>Custom Signs</li></ul></div><div><p>Tools</p></div></main><footer></footer></body>';

const CATEGORIES: CatalogCategory[] = [
    { id: '135', name: 'Signs', urlPath: 'signs' },
    { id: '201', name: 'Apparel', urlPath: 'apparel' },
];

/** A category page somebody built by hand, bound to `urlPath`. */
const handBuilt = (urlPath: string): string =>
    '<body><header></header><main><div><h1>Our own page</h1><div class="product-list-page">' +
    `<div><div>urlPath</div><div>${urlPath}</div></div></div></div></main><footer></footer></body>`;

const linkRow = (urlPath: string, path: string): string => `<div><div>${urlPath}</div><div>${path}</div></div>`;

function deps(site: FakeStorefront, categories = CATEGORIES): CatalogMenuDeps {
    return { pages: site.port, readCategories: async () => categories, menuLine: async () => 'commerce' as const, categoryPages: fakeCategoryHelix().host };
}

describe('applyCatalogMenu — a category that already has a page of its own', () => {
    it('links the menu to it with a row, and says which page it uses', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signage': handBuilt('signs') });

        const report = await applyCatalogMenu(deps(site));

        expect(site.pages.get('/safety-signage')).toBe(handBuilt('signs'));
        expect(report.skipped).toEqual([
            { path: '/signs', reason: 'has-own-page', name: 'Signs', ownPage: '/safety-signage' },
        ]);
        expect(site.pages.get('/nav')).toContain(
            `class="catalog-menu"><div><div></div></div>${linkRow('signs', '/safety-signage')}</div>`,
        );
        expect(report.record.links).toEqual([{ urlPath: 'signs', path: '/safety-signage' }]);
    });

    it("needs no row for a page at the category's own address: the sheet keeps it, the menu links there", async () => {
        const site = fakeStorefront({ '/nav': NAV, '/apparel': handBuilt('apparel') });
        const helix = fakeCategoryHelix();

        const report = await applyCatalogMenu({ ...deps(site), categoryPages: helix.host });

        expect(report.record.links).toStrictEqual([]);
        expect(helix.sheet).toEqual(['/apparel']);
        expect(site.pages.get('/apparel')).toBe(handBuilt('apparel'));
    });

    it('takes its row out again when the SC deletes their page', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signage': handBuilt('signs') });
        const first = await applyCatalogMenu(deps(site));
        site.pages.delete('/safety-signage');

        const second = await applyCatalogMenu(deps(site), first.record);

        expect(second.nav).toBe('links-updated');
        expect(second.record.links).toStrictEqual([]);
        expect(site.pages.get('/nav')).not.toContain('safety-signage');
    });

    it('honors a row the SC typed in the nav table, and leaves it theirs', async () => {
        const typed = NAV.replace(
            '</main>',
            `<div><div class="catalog-menu">${linkRow('apparel', '/clothing')}</div></div></main>`,
        );
        const site = fakeStorefront({ '/nav': typed });

        const report = await applyCatalogMenu(deps(site));

        expect(report.skipped).toEqual([
            { path: '/apparel', reason: 'has-own-page', name: 'Apparel', ownPage: '/clothing' },
        ]);
        expect(site.pages.get('/nav')).toContain(linkRow('apparel', '/clothing'));
        expect(report.record.links).toStrictEqual([]);
    });

    it('links a category with no servable address to the page built for it', async () => {
        const categories: CatalogCategory[] = [{ id: '7', name: 'Sale', urlPath: '%%' }];
        const site = fakeStorefront({ '/nav': NAV, '/sale': handBuilt('%%') });

        const report = await applyCatalogMenu(deps(site, categories));

        expect(report.unsafe).toStrictEqual([]);
        expect(report.skipped).toEqual([
            { path: '/%%', reason: 'has-own-page', name: 'Sale', ownPage: '/sale' },
        ]);
    });

    it('changes nothing at all when the storefront pages cannot be listed', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const helix = fakeCategoryHelix();
        const failing: CatalogMenuDeps = {
            readCategories: async () => CATEGORIES,
            menuLine: async () => 'commerce' as const,
            categoryPages: helix.host,
            pages: {
                ...site.port,
                listPages: async () => {
                    throw new Error('DA.live 401');
                },
            },
        };

        await expect(applyCatalogMenu(failing)).rejects.toThrow('DA.live 401');
        expect(site.written).toStrictEqual([]);
        expect(helix.published).toStrictEqual([]);
    });
});

describe('removeCatalogMenu — with category → page rows', () => {
    it('round trip: the nav comes back byte-for-byte and the hand-built page is untouched', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signage': handBuilt('signs') });
        const { record } = await applyCatalogMenu(deps(site));

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(site.pages.get('/nav')).toBe(NAV);
        expect([...site.pages.keys()].sort()).toEqual(['/nav', '/safety-signage']);
        expect(report.record).toEqual({ legacyPages: [], links: [], navSwitch: false, categoryPaths: ['/signs', '/apparel'], authoredSheet: true });
    });

    it('keeps a row the SC typed, and the table that holds it', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signage': handBuilt('signs') });
        const { record } = await applyCatalogMenu(deps(site));
        const withTyped = (site.pages.get('/nav') ?? '').replace(
            linkRow('signs', '/safety-signage'),
            linkRow('signs', '/safety-signage') + linkRow('apparel', '/clothing'),
        );
        site.pages.set('/nav', withTyped);

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(report.nav).toBe('removed-kept-links');
        expect(site.pages.get('/nav')).toContain(linkRow('apparel', '/clothing'));
        expect(site.pages.get('/nav')).not.toContain('safety-signage');
        expect(site.pages.get('/nav')).not.toContain('Commerce: All');
    });
});
