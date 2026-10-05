/**
 * Finding the category pages a person built, at any address (EDS-24, owner's rule
 * 2026-10-05: a hand-built page for a category is always honored).
 *
 * Adobe lets a category page live anywhere: what binds it to a category is the `urlPath`
 * row of its `product-list-page` block (older storefronts: a `category` row holding the
 * category id), not the page's own address. So the finder reads the storefront's pages
 * and matches rows, not addresses.
 *
 * The page HTML below is the DA.live source shape the extension writes itself
 * (`categoryPages.ts`); the `<p>`-wrapped cells are how DA.live stores a typed table.
 */

import {
    categoryKeysOf,
    findOwnCategoryPages,
} from '@/features/eds/services/catalogMenu/existingCategoryPages';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';
import { fakeStorefront } from './catalogMenuService.testUtils';

const CATEGORIES: CatalogCategory[] = [
    { id: '135', name: 'Signs', urlPath: 'signs' },
    { id: '136', name: 'Danger Signs', urlPath: 'signs/danger-signs' },
    { id: '201', name: 'Apparel', urlPath: 'apparel' },
];

const plp = (rows: string, blockClass = 'product-list-page'): string =>
    `<body><header></header><main><div><h1>Hand built</h1><div class="${blockClass}">${rows}</div></div></main><footer></footer></body>`;
const row = (key: string, value: string): string => `<div><div><p>${key}</p></div><div><p>${value}</p></div></div>`;

const nobodyOurs = (): boolean => false;

describe('categoryKeysOf', () => {
    it('reads the urlPath row of a product-list-page block', () => {
        expect(categoryKeysOf(plp(row('urlPath', 'signs')))).toEqual({ urlPaths: ['signs'], ids: [] });
    });

    it('matches loosely: any case, spaces and slashes around the value', () => {
        expect(categoryKeysOf(plp(row('URLPATH', ' /Signs/Danger-Signs/ '))).urlPaths).toEqual(['signs/danger-signs']);
    });

    it('reads the category id row older storefronts use', () => {
        expect(categoryKeysOf(plp(row('category', '135')))).toEqual({ urlPaths: [], ids: ['135'] });
    });

    it('reads a block variant (a class that starts with product-list-page)', () => {
        expect(categoryKeysOf(plp(row('urlPath', 'signs'), 'product-list-page-custom')).urlPaths).toEqual(['signs']);
        expect(categoryKeysOf(plp(row('urlPath', 'signs'), 'product-list-page wide')).urlPaths).toEqual(['signs']);
    });

    it('finds nothing on a page without the block, or with a block that names no category', () => {
        expect(categoryKeysOf('<body><main><div><p>urlPath signs</p></div></main></body>')).toEqual({
            urlPaths: [],
            ids: [],
        });
        expect(categoryKeysOf(plp(row('pageSize', '12')))).toEqual({ urlPaths: [], ids: [] });
    });
});

describe('findOwnCategoryPages', () => {
    it('finds a hand-built page for a category at an address that is not the category path', async () => {
        const site = fakeStorefront({ '/safety-signage': plp(row('urlPath', 'signs')), '/about': '<body>About</body>' });

        const found = await findOwnCategoryPages(site.port, CATEGORIES, nobodyOurs);

        expect([...found]).toEqual([['signs', '/safety-signage']]);
    });

    it('matches a category by its id when the page binds by a category row', async () => {
        const site = fakeStorefront({ '/clothing': plp(row('category', '201')) });

        const found = await findOwnCategoryPages(site.port, CATEGORIES, nobodyOurs);

        expect([...found]).toEqual([['apparel', '/clothing']]);
    });

    it('does not count the page at the category path itself: that case is decided by address', async () => {
        const site = fakeStorefront({ '/signs': plp(row('urlPath', 'signs')) });

        expect((await findOwnCategoryPages(site.port, CATEGORIES, nobodyOurs)).size).toBe(0);
    });

    it('never counts a page Demo Builder wrote and nobody has edited', async () => {
        const html = plp(row('urlPath', 'signs'));
        const site = fakeStorefront({ '/old-signs': html });
        const isOurs = jest.fn((path: string, content: string) => path === '/old-signs' && content === html);

        const found = await findOwnCategoryPages(site.port, CATEGORIES, isOurs);

        expect(found.size).toBe(0);
        expect(isOurs).toHaveBeenCalledWith('/old-signs', html);
    });

    it('reads every listed page once, and nothing else', async () => {
        const site = fakeStorefront({
            '/nav': '<body>nav</body>',
            '/a': '<body>a</body>',
            '/b/c': plp(row('urlPath', 'apparel')),
        });

        await findOwnCategoryPages(site.port, CATEGORIES, nobodyOurs);

        expect([...site.read].sort()).toEqual(['/a', '/b/c']);
    });

    it('picks the first address in order when two pages name the same category', async () => {
        const site = fakeStorefront({
            '/z-signs': plp(row('urlPath', 'signs')),
            '/a-signs': plp(row('urlPath', 'signs')),
        });

        const found = await findOwnCategoryPages(site.port, CATEGORIES, nobodyOurs);

        expect(found.get('signs')).toBe('/a-signs');
    });

    it('ignores a page for a category that is not in the menu', async () => {
        const site = fakeStorefront({ '/clearance': plp(row('urlPath', 'clearance')) });

        expect((await findOwnCategoryPages(site.port, CATEGORIES, nobodyOurs)).size).toBe(0);
    });

    it('fails rather than guessing when the pages cannot be listed', async () => {
        const site = fakeStorefront({});
        const port = {
            ...site.port,
            listPages: async (): Promise<string[]> => {
                throw new Error('DA.live 401');
            },
        };

        await expect(findOwnCategoryPages(port, CATEGORIES, nobodyOurs)).rejects.toThrow('DA.live 401');
    });
});
