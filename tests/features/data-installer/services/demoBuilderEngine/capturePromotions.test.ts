/**
 * Capture for cart rules, coupons and gift cards (datapack-engine step 11): "Save store changes"
 * reads back the rules and codes the record lists and the installed version names, every code the
 * SC typed into a captured rule, and the rule every captured code needs; gift cards are written
 * under `giftcards`, never folded into `products`.
 *
 * Store answers for rules and coupons are built here, typed to `RuleInterface` / `CouponInterface`;
 * the gift card is the one captured 2026-10-30 (`GIFT_CARD_6`).
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { capturePack } from '@/features/data-installer/services/demoBuilderEngine/capture';
import { capturePromotions } from '@/features/data-installer/services/demoBuilderEngine/capturePromotions';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import type { CommerceCoupon, CommerceSalesRule } from '@/types/commerceSalesRule';
import { COUPON10, GIFT_CARD_6, TEN_PERCENT_COUPON } from '../../../../helpers/commerceSalesRuleFixtures';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const RULE_41: CommerceSalesRule = { ...(TEN_PERCENT_COUPON.rule as CommerceSalesRule), rule_id: 41, website_ids: [5], customer_group_ids: [1], times_used: 4 };
const ZZTEN: CommerceCoupon = { coupon_id: 88, rule_id: 41, code: 'ZZTEN', times_used: 2, is_primary: true, type: 0 };
const MINE: CommerceCoupon = { coupon_id: 90, rule_id: 41, code: 'MINE', type: 0 };
const GENERATED: CommerceCoupon = { coupon_id: 91, rule_id: 41, code: 'AUTO-1X2Y', type: 1 };
const obj = (kind: string, id: string): CreatedObject => ({ kind, id });

const RULE_STORE = {
    'salesRules/41': RULE_41,
    'customerGroups/1': { id: 1, code: 'General' },
    'coupons/88': ZZTEN,
    [page('coupons/search', filterBy('rule_id', '41'))]: { items: [ZZTEN, MINE, GENERATED], total_count: 3 },
};

describe('capturePromotions', () => {
    it("reads back the recorded rule and its typed-in codes, in pack form, the SC's own code included", async () => {
        const ctx = await fakeContext(RULE_STORE);

        const rows = await capturePromotions(ctx, productLookups(ctx), [obj('cart_rules', '41'), obj('coupons', '88')], {});

        expect(rows.cart_rules).toEqual([{ rule: expect.objectContaining({ name: '10% Coupon', customer_group_ids: ['General'] }) }]);
        expect((rows.cart_rules as Array<{ rule: object }>)[0].rule).not.toHaveProperty('times_used');
        expect(rows.coupons).toEqual([
            { coupon: { code: 'ZZTEN', rule_id: '10% Coupon', is_primary: true, type: 0 } },
            { coupon: { code: 'MINE', rule_id: '10% Coupon', type: 0 } },
        ]);
    });

    it('finds the installed version’s own rule and code by name when the record does not list them', async () => {
        const ctx = await fakeContext({
            ...RULE_STORE,
            [page('salesRules/search', filterBy('name', '10% Coupon'))]: { items: [RULE_41], total_count: 1 },
            [page('coupons/search', filterBy('code', 'coupon10'))]: { items: [{ ...ZZTEN, coupon_id: 92, code: 'coupon10' }], total_count: 1 },
            'coupons/92': { ...ZZTEN, coupon_id: 92, code: 'coupon10' },
        });

        const rows = await capturePromotions(ctx, productLookups(ctx), [], { cart_rules: [TEN_PERCENT_COUPON], coupons: [COUPON10] });

        expect((rows.cart_rules as unknown[])).toHaveLength(1);
        expect((rows.coupons as Array<{ coupon: { code: string } }>).map((c) => c.coupon.code)).toEqual(['coupon10', 'ZZTEN', 'MINE']);
    });

    it('reads nothing for a pack with no rules, codes or gift cards', async () => {
        const ctx = await fakeContext({});

        expect(await capturePromotions(ctx, productLookups(ctx), [obj('products', 'x')], { products: [] })).toStrictEqual({});
    });
});

describe('capturePack with a gift card', () => {
    it('writes a recorded gift card under giftcards, not products', async () => {
        const skuIn = page('products', `&searchCriteria[filterGroups][0][filters][0][field]=sku&searchCriteria[filterGroups][0][filters][0][value]=mastercard-giftcard&searchCriteria[filterGroups][0][filters][0][conditionType]=in`);
        const ctx = await fakeContext({
            [skuIn]: { items: [GIFT_CARD_6], total_count: 1 },
            [page('inventory/source-items', `&searchCriteria[filterGroups][0][filters][0][field]=sku&searchCriteria[filterGroups][0][filters][0][value]=mastercard-giftcard&searchCriteria[filterGroups][0][filters][0][conditionType]=in`)]: { items: [], total_count: 0 },
            [page('products/attribute-sets/sets/list')]: { items: [{ attribute_set_id: 12, attribute_set_name: 'Gift Card' }], total_count: 1 },
            'products/attribute-sets/12/attributes': [],
            'categories/5': { id: 5, name: 'Gift Cards', path: '1/2/5', custom_attributes: [{ attribute_code: 'url_key', value: 'gift-cards' }] },
            'inventory/sources?searchCriteria[pageSize]=200': { items: [] },
            'inventory/stocks?searchCriteria[pageSize]=200': { items: [] },
            'inventory/stock-source-links?searchCriteria[pageSize]=200': { items: [] },
        });

        const { items, counts } = await capturePack(ctx, [obj('giftcards', 'mastercard-giftcard')]);

        expect(items.products).toBeUndefined();
        expect((items.giftcards as Array<{ product: { sku: string } }>).map((r) => r.product.sku)).toEqual(['mastercard-giftcard']);
        expect(counts.giftcards).toBe(1);
        expect(items.categories).toBeDefined();
    });
});
