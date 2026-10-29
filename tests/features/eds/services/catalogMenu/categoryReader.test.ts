/**
 * The category reader — every Commerce category of the store view (EDS-24, EDS-61).
 *
 * Every category with a url path gets a page, not only the menu ones (owner decision D6),
 * so the reader asks for all of them: `categories(ids: [])`, the query the overlay's own
 * lookup sends (`accs-discovery-service/actions/lib/category-page.js`). Measured
 * 2026-10-22 against the Justrite store view with guest headers: 15 categories, two of
 * them roots with an empty `urlPath`, each with `roles` (`active`, `show_in_menu`).
 *
 * The transport is handed in; what is asserted is what it was ASKED.
 */

import { CATEGORIES_QUERY, readStoreCategories } from '@/features/eds/services/catalogMenu/categoryReader';

/** Three rows of the measured answer, plus one category hidden from the menu. */
const ANSWER = [
    { id: '119', name: 'Justrite Catalog', level: 1, parentId: '1', urlPath: '', roles: ['active', 'show_in_menu'] },
    { id: '135', name: 'Signs and Labels', level: 2, parentId: '119', urlPath: 'signs', roles: ['active', 'show_in_menu'] },
    {
        id: '136',
        name: 'Danger Signs',
        level: 3,
        parentId: '135',
        urlPath: 'signs/danger-signs',
        roles: ['active', 'show_in_menu'],
    },
    { id: '150', name: 'Clearance', level: 2, parentId: '119', urlPath: 'clearance', roles: ['active'] },
];

describe('readStoreCategories', () => {
    it('asks for every category of the store view and maps what comes back', async () => {
        const query = jest.fn().mockResolvedValue({ categories: ANSWER });

        const categories = await readStoreCategories(query);

        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(CATEGORIES_QUERY);
        expect(categories).toEqual([
            { id: '119', name: 'Justrite Catalog', urlPath: '', level: 1, parentId: '1', inMenu: true },
            { id: '135', name: 'Signs and Labels', urlPath: 'signs', level: 2, parentId: '119', inMenu: true },
            { id: '136', name: 'Danger Signs', urlPath: 'signs/danger-signs', level: 3, parentId: '135', inMenu: true },
            { id: '150', name: 'Clearance', urlPath: 'clearance', level: 2, parentId: '119', inMenu: false },
        ]);
    });

    it('is the measured query, word for word', () => {
        expect(CATEGORIES_QUERY).toBe('query CatalogCategories { categories(ids: []) { id name level parentId urlPath roles } }');
    });

    it('counts a category whose roles did not come back as in the menu, rather than hiding it', async () => {
        const query = jest.fn().mockResolvedValue({ categories: [{ id: '7', name: 'Tools', urlPath: 'tools' }] });

        expect(await readStoreCategories(query)).toEqual([{ id: '7', name: 'Tools', urlPath: 'tools', inMenu: true }]);
    });

    it('refuses an answer that carries no category list rather than reading it as empty', async () => {
        const query = jest.fn().mockResolvedValue({ products: [] });

        await expect(readStoreCategories(query)).rejects.toThrow('Catalog Service answered without a category list');
    });

    it('skips an entry with no id or no name instead of inventing one', async () => {
        const query = jest.fn().mockResolvedValue({
            categories: [{ name: 'No id', urlPath: 'x' }, { id: '7', urlPath: 'y' }, ANSWER[1]],
        });

        expect((await readStoreCategories(query)).map((c) => c.id)).toEqual(['135']);
    });
});
