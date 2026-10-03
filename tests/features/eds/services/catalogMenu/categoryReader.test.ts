/**
 * The category reader — which Commerce categories go in the menu (EDS-24).
 *
 * The query is the `catalog-menu` block's own `CATEGORIES_QUERY`
 * (`skukla/demo-builder-block-library`, `blocks/catalog-menu/catalog-menu-core.js`), so the
 * pages Demo Builder writes and the menu the block draws come from one read.
 *
 * Whether `categories` with no `ids` returns the tree is the plan's open question
 * (`.rptc/plans/category-pages/overview.md`, step 4): every example in the reference passes
 * one. So the reader answers both ways — the tree when it comes back, otherwise a walk down
 * from the store's root category with `subtree`.
 *
 * The transport is handed in; what is asserted is what it was ASKED.
 */

import {
    CATEGORIES_QUERY,
    readMenuCategories,
    rootCategoryIdFor,
} from '@/features/eds/services/catalogMenu/categoryReader';
import type { CommerceStoreStructure } from '@/types/commerceStore';

const TREE = [
    { id: '41', name: 'Safety Signs', level: 2, parentId: '2', urlPath: 'safety-signs' },
    { id: '42', name: 'Exit Signs', level: 3, parentId: '41', urlPath: 'safety-signs/exit-signs' },
];

describe('readMenuCategories', () => {
    it('asks for the menu categories with the block query and maps what comes back', async () => {
        const query = jest.fn().mockResolvedValue({ categories: TREE });

        const categories = await readMenuCategories(query, '2');

        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(CATEGORIES_QUERY, { roles: ['show_in_menu'] });
        expect(categories).toEqual([
            { id: '41', name: 'Safety Signs', urlPath: 'safety-signs', level: 2, parentId: '2' },
            { id: '42', name: 'Exit Signs', urlPath: 'safety-signs/exit-signs', level: 3, parentId: '41' },
        ]);
    });

    it('is the block query, word for word', () => {
        expect(CATEGORIES_QUERY).toBe(
            'query CatalogMenuCategories($roles: [String!]) {\n' +
                '  categories(roles: $roles) { id name level parentId position urlPath children }\n' +
                '}',
        );
    });

    it('walks down from the root category when the tree read comes back empty', async () => {
        const query = jest
            .fn()
            .mockResolvedValueOnce({ categories: [] })
            .mockResolvedValueOnce({
                categories: [
                    { id: '2', name: 'Default Category', level: 1, urlPath: null, roles: [] },
                    { ...TREE[0], roles: ['show_in_menu'] },
                    { ...TREE[1], roles: ['show_in_menu'] },
                    { id: '43', name: 'Hidden', level: 2, parentId: '2', urlPath: 'hidden', roles: [] },
                ],
            });

        const categories = await readMenuCategories(query, '2');

        const [walk, variables] = query.mock.calls[1];
        expect(walk).toContain('categories(ids: $ids, subtree: { startLevel: 2, depth: 3 })');
        expect(walk).toContain('roles');
        expect(variables).toEqual({ ids: ['2'] });
        // The root is not a menu entry, and neither is a category without "Include in Menu".
        expect(categories.map((c) => c.id)).toEqual(['41', '42']);
    });

    it('answers empty, without a second read, when the tree is empty and the root is unknown', async () => {
        const query = jest.fn().mockResolvedValue({ categories: [] });

        expect(await readMenuCategories(query, undefined)).toStrictEqual([]);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('refuses an answer that carries no category list rather than reading it as empty', async () => {
        const query = jest.fn().mockResolvedValue({ products: [] });

        await expect(readMenuCategories(query, '2')).rejects.toThrow(
            'Catalog Service answered without a category list',
        );
    });

    it('skips an entry with no id or no name instead of inventing one', async () => {
        const query = jest.fn().mockResolvedValue({
            categories: [{ name: 'No id', urlPath: 'x' }, { id: '7', urlPath: 'y' }, TREE[0]],
        });

        expect((await readMenuCategories(query, '2')).map((c) => c.id)).toEqual(['41']);
    });
});

describe('rootCategoryIdFor', () => {
    const structure: CommerceStoreStructure = {
        websites: [{ id: 1, code: 'base', name: 'Main Website' }],
        storeGroups: [
            { id: 1, code: 'main_website_store', name: 'Main Store', website_id: 1, root_category_id: 2 },
            { id: 3, code: 'justrite_store', name: 'Justrite', website_id: 1, root_category_id: 40 },
        ],
        storeViews: [],
    };

    it("is the root category of the project's store group", () => {
        expect(rootCategoryIdFor(structure, 'justrite_store')).toBe('40');
    });

    it('is unknown without a discovered structure or a matching store', () => {
        expect(rootCategoryIdFor(undefined, 'justrite_store')).toBeUndefined();
        expect(rootCategoryIdFor(structure, 'nope')).toBeUndefined();
        expect(rootCategoryIdFor(structure, undefined)).toBeUndefined();
    });
});
