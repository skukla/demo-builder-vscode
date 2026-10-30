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
import { containersLine, decideRemovals, takeBack } from '@/features/data-installer/services/demoBuilderEngine/removers';
import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const inSet = (id: string) =>
    page('products', `&searchCriteria[filterGroups][0][filters][0][field]=attribute_set_id&searchCriteria[filterGroups][0][filters][0][value]=${id}`);
const inCategory = (id: string) =>
    page('products', `&searchCriteria[filterGroups][0][filters][0][field]=category_id&searchCriteria[filterGroups][0][filters][0][value]=${id}`);
const category = (id: number, name: string, children: string): StoreCategory => ({ id, name, path: `1/2/${id}`, children });

const obj = (kind: string, id: string): CreatedObject => ({ kind, id });
const couponsOf = (ruleId: string) => page('coupons/search', filterBy('rule_id', ruleId));

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

describe('decideRemovals: gift cards and cart rules (step 11)', () => {
    it("counts the pack's own gift cards in a category as going with it", async () => {
        const ctx = await fakeContext({
            'categories/42': category(42, 'Gift Cards', ''),
            [inCategory('42')]: { items: [{ sku: 'zz-giftcard' }], total_count: 1 },
        });

        const decided = await decideRemovals(ctx.get, [obj('giftcards', 'zz-giftcard'), obj('categories', '42')]);

        expect(decided.kept).toStrictEqual([]);
    });

    it("keeps a cart rule holding a coupon the SC added, as Commerce would delete it with the rule, but not for the pack's own coupons", async () => {
        const ctx = await fakeContext({
            'salesRules/41': { rule_id: 41, name: 'ZZ Ten Off (renamed)' },
            [couponsOf('41')]: { items: [{ coupon_id: 88, rule_id: 41, code: 'ZZTEN' }, { coupon_id: 89, rule_id: 41, code: 'MINE' }], total_count: 2 },
        });

        const decided = await decideRemovals(ctx.get, [obj('coupons', '88'), obj('cart_rules', '41')]);

        expect(decided.take).toEqual([obj('coupons', '88')]);
        expect(decided.kept).toEqual([
            { object: obj('cart_rules', '41'), kind: 'cart rule', name: 'ZZ Ten Off (renamed)', count: 1, holds: 'coupon' },
        ]);
        expect(containersLine(decided.kept)).toBe('Kept the cart rule ZZ Ten Off (renamed): it holds 1 coupon you added.');
    });

    it('takes out a cart rule whose coupons are all going with it', async () => {
        const ctx = await fakeContext({ [couponsOf('41')]: { items: [{ coupon_id: 88, rule_id: 41, code: 'ZZTEN' }], total_count: 1 } });

        const decided = await decideRemovals(ctx.get, [obj('coupons', '88'), obj('cart_rules', '41')]);

        expect(decided).toEqual({ take: [obj('coupons', '88'), obj('cart_rules', '41')], kept: [] });
    });

    it("keeps a cart rule whose coupons cannot be read, rather than delete what might be the SC's", async () => {
        const ctx = await fakeContext({ [couponsOf('41')]: () => Promise.reject(new Error('Commerce answered 500')) });

        const decided = await decideRemovals(ctx.get, [obj('cart_rules', '41')]);

        expect(decided.take).toStrictEqual([]);
        expect(decided.kept[0]).toMatchObject({ kind: 'cart rule', name: '41', reason: 'Demo Builder could not read its coupons' });
    });

    it('takes each new kind back by its own route', async () => {
        const ctx = await fakeContext({});

        await takeBack(ctx, obj('giftcards', 'zz-giftcard'));
        await takeBack(ctx, obj('coupons', '88'));
        await takeBack(ctx, obj('cart_rules', '41'));

        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE products/zz-giftcard', 'DELETE coupons/88', 'DELETE salesRules/41']);
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
