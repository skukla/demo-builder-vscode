/**
 * A hand-built page for a category is always honored (EDS-24, owner's rule 2026-10-05).
 *
 * A category page may live at any address — the `urlPath` row of its `product-list-page`
 * block names the category, not the page's own path. When the storefront already has
 * one, the service writes no page of its own for that category, and puts a
 * "category → page" row in the nav's `catalog-menu` table so the menu links to it.
 *
 * What is asserted is what was HANDED to the page port — which paths were written and
 * removed, and which were not — plus the nav content and the record.
 */

import { createHash } from 'crypto';
import { applyCatalogMenu, removeCatalogMenu } from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { CatalogMenuDeps } from '@/features/eds/services/catalogMenu/catalogMenuService';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import { fakeStorefront, type FakeStorefront } from './catalogMenuService.testUtils';

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
    return { pages: site.port, readCategories: async () => categories };
}

describe('applyCatalogMenu — a category that already has a page somewhere else', () => {
    it('writes no page for it, and says which page it uses', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signage': handBuilt('signs') });

        const report = await applyCatalogMenu(deps(site));

        expect(site.written).toEqual(['/apparel', '/nav']);
        expect(site.pages.has('/signs')).toBe(false);
        expect(site.pages.get('/safety-signage')).toBe(handBuilt('signs'));
        expect(report.skipped).toEqual([
            { path: '/signs', reason: 'has-own-page', name: 'Signs', ownPage: '/safety-signage' },
        ]);
        expect(report.record.pages.map((p) => p.path)).toEqual(['/apparel']);
    });

    it('puts the category → page row in the nav table and records it as ours', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signage': handBuilt('signs') });

        const report = await applyCatalogMenu(deps(site));

        expect(site.pages.get('/nav')).toContain(`class="catalog-menu"><div><div></div></div>${linkRow('signs', '/safety-signage')}</div>`);
        expect(report.record.links).toEqual([{ urlPath: 'signs', path: '/safety-signage' }]);
    });

    it('removes the page it wrote earlier once the SC has built their own, when ours is unedited', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const first = await applyCatalogMenu(deps(site));
        site.pages.set('/safety-signage', handBuilt('signs'));
        site.written.length = 0;

        const second = await applyCatalogMenu(deps(site), first.record);

        expect(site.removed).toEqual(['/signs']);
        expect(site.written).toEqual(['/apparel', '/nav']);
        expect(second.replaced).toEqual(['/signs']);
        expect(second.record.pages.map((p) => p.path)).toEqual(['/apparel']);
    });

    it('leaves its earlier page alone when the SC edited it, and reports both', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const first = await applyCatalogMenu(deps(site));
        site.pages.set('/signs', '<body><main><div><h1>Edited by the SC</h1></div></main></body>');
        site.pages.set('/safety-signage', handBuilt('signs'));

        const second = await applyCatalogMenu(deps(site), first.record);

        expect(site.removed).toStrictEqual([]);
        expect(site.pages.get('/signs')).toContain('Edited by the SC');
        expect(second.skipped).toEqual([
            { path: '/signs', reason: 'has-own-page', name: 'Signs', ownPage: '/safety-signage' },
            { path: '/signs', reason: 'edited', name: 'Signs' },
        ]);
        expect(second.record.pages.map((p) => p.path)).toEqual(['/apparel']);
    });

    it('does not mistake a page the record proves it wrote for a hand-built one', async () => {
        // Our pages sit at the category's own address, so this takes a record from
        // elsewhere to reach — the guard is that the record, not the address, decides.
        const ours = handBuilt('signs');
        const site = fakeStorefront({ '/nav': NAV, '/old-signs': ours });
        const hash = createHash('sha256').update(ours.trim()).digest('hex');

        const report = await applyCatalogMenu(deps(site), {
            pages: [{ path: '/old-signs', hash }],
            links: [],
            navSwitch: false,
        });

        expect(report.skipped).toStrictEqual([]);
        expect(report.written).toEqual(['/signs', '/apparel']);
    });

    it('takes its row out again when the SC deletes their page, and writes its own page', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signage': handBuilt('signs') });
        const first = await applyCatalogMenu(deps(site));
        site.pages.delete('/safety-signage');

        const second = await applyCatalogMenu(deps(site), first.record);

        expect(second.written).toContain('/signs');
        expect(second.nav).toBe('links-updated');
        expect(second.record.links).toStrictEqual([]);
        expect(site.pages.get('/nav')).not.toContain('safety-signage');
    });

    it('honors a row the SC typed in the nav table: no page is written for that category', async () => {
        const typed = NAV.replace(
            '</main>',
            `<div><div class="catalog-menu">${linkRow('apparel', '/clothing')}</div></div></main>`,
        );
        const site = fakeStorefront({ '/nav': typed });

        const report = await applyCatalogMenu(deps(site));

        expect(site.written).toEqual(['/signs', '/nav']);
        expect(report.skipped).toEqual([
            { path: '/apparel', reason: 'has-own-page', name: 'Apparel', ownPage: '/clothing' },
        ]);
        // The row is the SC's: it is in the nav, and not in our record.
        expect(site.pages.get('/nav')).toContain(linkRow('apparel', '/clothing'));
        expect(report.record.links).toStrictEqual([]);
    });

    it('links a category whose own address cannot be served to the page built for it', async () => {
        const categories: CatalogCategory[] = [{ id: '7', name: 'Signs & Labels', urlPath: 'signs-&-labels' }];
        const site = fakeStorefront({ '/nav': NAV, '/labels': handBuilt('signs-&amp;-labels') });

        const report = await applyCatalogMenu(deps(site, categories));

        expect(report.unsafe).toStrictEqual([]);
        expect(report.skipped).toEqual([
            { path: '/signs-&-labels', reason: 'has-own-page', name: 'Signs & Labels', ownPage: '/labels' },
        ]);
        expect(site.written).toEqual(['/nav']);
    });

    it('writes nothing at all when the storefront pages cannot be listed', async () => {
        const site = fakeStorefront({ '/nav': NAV });
        const failing: CatalogMenuDeps = {
            ...deps(site),
            pages: {
                ...site.port,
                listPages: async () => {
                    throw new Error('DA.live 401');
                },
            },
        };

        await expect(applyCatalogMenu(failing)).rejects.toThrow('DA.live 401');
        expect(site.written).toStrictEqual([]);
    });
});

describe('removeCatalogMenu — with category → page rows', () => {
    it('round trip: the nav comes back byte-for-byte and the hand-built page is untouched', async () => {
        const site = fakeStorefront({ '/nav': NAV, '/safety-signage': handBuilt('signs') });
        const { record } = await applyCatalogMenu(deps(site));

        const report = await removeCatalogMenu({ pages: site.port }, record);

        expect(site.pages.get('/nav')).toBe(NAV);
        expect(site.removed).toEqual(['/apparel']);
        expect([...site.pages.keys()].sort()).toEqual(['/nav', '/safety-signage']);
        expect(report.record).toEqual({ pages: [], links: [], navSwitch: false });
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
        expect(site.pages.get('/nav')).not.toContain('Shop the catalog');
    });
});
