/**
 * Review Records' names: each record as the pack names it, per data type. Walk F148 (release test
 * 1.4, 2026-11-16): Frescopa's Categories said 10 in the rail and listed nothing, because a pack
 * holds categories as `{ root_category, categories: [...] }` (`categoriesKind.ts`), not a list, and
 * this reader skipped any kind that was not a list. It reads rows as the install does now.
 */
import { categoryTreeOf, recordNames } from '@/features/data-installer/services/packRecords';

describe('recordNames', () => {
    it("lists a pack's categories, its root by name, beside the products", () => {
        const names = recordNames({
            products: [{ product: { sku: 'csm5122', name: 'Cold Brew' } }],
            categories: {
                root_category: { name: 'Frescopa' },
                categories: [
                    { category: { name: 'Coffee', path: 'Frescopa' } },
                    { category: { name: 'Pods', path: 'Frescopa/Coffee' } },
                ],
            },
        });

        expect(names).toStrictEqual({ products: ['csm5122'], categories: ['Frescopa', 'Coffee', 'Coffee/Pods'] });
    });

    it('lists categories with no root of their own by their place under the store root', () => {
        const names = recordNames({ categories: { categories: [{ category: { name: 'Coffee', path: 'Default Category' } }] } });

        expect(names).toStrictEqual({ categories: ['Coffee'] });
    });

    it('leaves out a kind with no rows', () => {
        expect(recordNames({ products: [], categories: { categories: [] } })).toStrictEqual({});
    });
});

// Steve expected the category tree in Review Records (owner yes, 2026-11-16), as Clear draws it.
describe('categoryTreeOf', () => {
    it("puts each category under its parent, the pack's root at the top", () => {
        const tree = categoryTreeOf({
            categories: {
                root_category: { name: 'Frescopa' },
                categories: [
                    { category: { name: 'Coffee', path: 'Frescopa' } },
                    { category: { name: 'Pods', path: 'Frescopa/Coffee' } },
                    { category: { name: 'Tea', path: 'Frescopa' } },
                ],
            },
        });

        expect(tree).toStrictEqual([
            {
                name: 'Frescopa',
                id: 'Frescopa',
                children: [
                    { name: 'Coffee', id: 'Frescopa/Coffee', children: [{ name: 'Pods', id: 'Frescopa/Coffee/Pods' }] },
                    { name: 'Tea', id: 'Frescopa/Tea' },
                ],
            },
        ]);
    });

    it("puts a category whose parent is the store's own root at the top", () => {
        const tree = categoryTreeOf({ categories: { categories: [{ category: { name: 'Coffee', path: 'Default Category' } }] } });

        expect(tree).toStrictEqual([{ name: 'Coffee', id: 'Default Category/Coffee' }]);
    });
});

