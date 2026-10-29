/**
 * Which recorded objects a removal may take out (step 05, owner 2026-10-29): a category or an
 * attribute set this engine made is kept when it still holds something the engine did not make,
 * since Commerce would take that with it (a category's children go with it; a set's products,
 * by Magento's schema, from memory and not yet checked live). Decided up front, read-only, so the
 * preview, a reinstall and a whole-pack removal all decide the same way.
 *
 * A category is `GET categories/{id}` (its `children`, comma-separated ids) and a set's products a
 * `GET products` search on `attribute_set_id`, typed to `StoreCategory` and `CommerceProduct`;
 * neither answer is captured live in the repo.
 */

import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { StoreCategory } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { containersLine, decideRemovals } from '@/features/data-installer/services/demoBuilderEngine/removers';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const inSet = (id: string) =>
    page('products', `&searchCriteria[filterGroups][0][filters][0][field]=attribute_set_id&searchCriteria[filterGroups][0][filters][0][value]=${id}`);
const inCategory = (id: string) =>
    page('products', `&searchCriteria[filterGroups][0][filters][0][field]=category_id&searchCriteria[filterGroups][0][filters][0][value]=${id}`);
const category = (id: number, name: string, children: string): StoreCategory => ({ id, name, path: `1/2/${id}`, children });

const obj = (kind: string, id: string): CreatedObject => ({ kind, id });

describe('decideRemovals', () => {
    it('takes everything out when nothing else is inside what the pack made', async () => {
        const ctx = await fakeContext({ 'categories/41': category(41, 'Racks', '42'), 'categories/42': category(42, 'Wall Racks', '') });
        const newestFirst = [obj('products', 'vrrack'), obj('categories', '42'), obj('categories', '41')];

        const decided = await decideRemovals(ctx.get, newestFirst);

        expect(decided).toEqual({ take: newestFirst, kept: [] });
    });

    it('keeps a category with a category the SC added in it, and the pack\'s category above it too', async () => {
        const ctx = await fakeContext({
            'categories/41': category(41, 'Racks', '42'),
            'categories/42': category(42, 'Wall Racks', '77'),
        });

        const decided = await decideRemovals(ctx.get, [obj('categories', '42'), obj('categories', '41')]);

        expect(decided.take).toStrictEqual([]);
        expect(decided.kept).toEqual([
            { object: obj('categories', '42'), kind: 'category', name: 'Wall Racks', count: 1, holds: 'category' },
            { object: obj('categories', '41'), kind: 'category', name: 'Racks', count: 1, holds: 'category' },
        ]);
    });

    // Live, 2026-10-29: the rule asked a category only about child categories, so removing the
    // pack deleted Bagged Coffee with the SC's own product in it, and the product was left in no
    // category at all.
    it('keeps a category with a product the SC added in it, but not for the pack\'s own products', async () => {
        const ctx = await fakeContext({
            'categories/42': category(42, 'Bagged Coffee', ''),
            [inCategory('42')]: { items: [{ sku: 'lt5-hbmr211' }, { sku: 'lt5-mine-1' }], total_count: 2 },
        });

        const decided = await decideRemovals(ctx.get, [obj('products', 'lt5-hbmr211'), obj('categories', '42')]);

        expect(decided.take).toEqual([obj('products', 'lt5-hbmr211')]);
        expect(decided.kept).toEqual([
            { object: obj('categories', '42'), kind: 'category', name: 'Bagged Coffee', count: 1, holds: 'product' },
        ]);
    });

    it('takes out a category whose products are all the pack\'s own', async () => {
        const ctx = await fakeContext({
            'categories/42': category(42, 'Bagged Coffee', ''),
            [inCategory('42')]: { items: [{ sku: 'lt5-hbmr211' }], total_count: 1 },
        });

        const decided = await decideRemovals(ctx.get, [obj('products', 'lt5-hbmr211'), obj('categories', '42')]);

        expect(decided.kept).toStrictEqual([]);
    });

    it('keeps a set with products the SC added in it, but not for the pack\'s own products', async () => {
        const ctx = await fakeContext({
            [inSet('12')]: { items: [{ sku: 'vrrack' }, { sku: 'their-a' }, { sku: 'their-b' }], total_count: 3 },
            'products/attribute-sets/12': { attribute_set_id: 12, attribute_set_name: 'Racks' },
        });

        const decided = await decideRemovals(ctx.get, [obj('products', 'vrrack'), obj('attribute_sets', '12')]);

        expect(decided.take).toEqual([obj('products', 'vrrack')]);
        expect(decided.kept).toEqual([{ object: obj('attribute_sets', '12'), kind: 'set', name: 'Racks', count: 2, holds: 'product' }]);
    });

    it('takes out a set whose products are all the pack\'s own', async () => {
        const ctx = await fakeContext({ [inSet('12')]: { items: [{ sku: 'vrrack' }], total_count: 1 } });

        const decided = await decideRemovals(ctx.get, [obj('products', 'vrrack'), obj('attribute_sets', '12')]);

        expect(decided.kept).toStrictEqual([]);
    });
});

describe('containersLine', () => {
    it('says in one line what it kept and why', () => {
        expect(containersLine([])).toBeUndefined();
        expect(containersLine([{ object: obj('attribute_sets', '12'), kind: 'set', name: 'Racks', count: 2, holds: 'product' }])).toBe(
            'Kept the set Racks: it holds 2 products you added.',
        );
        expect(containersLine([{ object: obj('categories', '41'), kind: 'category', name: 'Sale', count: 1, holds: 'category' }])).toBe(
            'Kept the category Sale: it holds 1 category you added.',
        );
        expect(
            containersLine([
                { object: obj('attribute_sets', '12'), kind: 'set', name: 'Racks', count: 2, holds: 'product' },
                { object: obj('categories', '41'), kind: 'category', name: 'Sale', count: 1, holds: 'category' },
            ]),
        ).toBe('Kept 2 things that hold what you added: the set Racks and the category Sale.');
    });
});
