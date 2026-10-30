/**
 * Cart rules, coupons and gift cards (datapack-engine step 11), typed to the real interfaces so a
 * shape the engine reads cannot be invented here.
 *
 * - **Pack rows.** Read from the Data Installer on 2026-10-30 with `save_datapack_zip` (read-only):
 *   Health & Beauty `main` (5 rules, 2 coupons), Carvello `main` (3 rules) and wknd `main` (2 rules,
 *   1 coupon). Copied field for field, a few rules each. Luma and Venia `eds-compatible`, the other
 *   two packs with these kinds and Luma the only one with `giftcards`, could not be read: their
 *   `product_export` item is too big for the service's answer (400 "Response is not valid
 *   'message/http'", library-audit.md), and the zip read stops there.
 * - **Store answers, 2026-10-30**, read on scratch-1028's store (the ACCS sandbox) with
 *   `run_commerce_rest`, read-only: `GET salesRules/search` and `GET coupons/search` (both EMPTY:
 *   the store has no rule), `GET products/attributes/giftcard_amounts`, and CitiSignal's gift card
 *   `mastercard-giftcard` from `GET products` (`type_id` eq `giftcard`), its images and stock trimmed.
 * - **Built here, not captured**: every rule or coupon a fake store answers. Typed to Magento's
 *   `RuleInterface` / `CouponInterface` (`commerceSalesRule.ts`); the item shape the export rows
 *   carry is the same one.
 */

import type { CartRuleRows } from '@/features/data-installer/services/demoBuilderEngine/cartRulesKind';
import type { CouponRows } from '@/features/data-installer/services/demoBuilderEngine/couponsKind';
import type { CommerceCoupon, CommerceSalesRule, CommerceSearchPage } from '@/types/commerceSalesRule';
import type { CommerceProduct } from '@/types/commerceWire';

/** Health & Beauty `main`: a coupon rule for one group. */
export const FRIENDS_AND_FAMILY: CartRuleRows[number] = {
    rule: {
        name: 'Anaïs Clément - Friends and Family Promo',
        description: '',
        website_ids: [2],
        customer_group_ids: ['VIP'],
        is_active: true,
        uses_per_customer: 0,
        store_labels: [],
        condition: { condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Combine', aggregator_type: 'all', operator: null, value: true },
        action_condition: { condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product\\Combine', aggregator_type: 'all', operator: null, value: '1' },
        discount_amount: 20,
        discount_step: 1,
        apply_to_shipping: false,
        discount_qty: 0,
        simple_action: 'by_percent',
        stop_rules_processing: false,
        is_advanced: true,
        sort_order: 0,
        times_used: 0,
        is_rss: true,
        coupon_type: 'SPECIFIC_COUPON',
        use_auto_generation: false,
        uses_per_coupon: 0,
        simple_free_shipping: '0',
        extension_attributes: { reward_points_delta: 0 },
    },
};

/** Health & Beauty `main`: a category condition on url keys, used 2 times in the store it came from. */
export const BEAUTY_PURCHASE: CartRuleRows[number] = {
    rule: {
        ...FRIENDS_AND_FAMILY.rule,
        name: 'Anaïs Clément - Health & Beauty Purchase',
        action_condition: {
            condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product\\Combine',
            conditions: [
                { condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product', operator: '==', attribute_name: 'category_ids', value: 'skincare,beauty,hair-care' },
            ],
            aggregator_type: 'any',
            operator: null,
            value: '1',
        },
        discount_amount: 0,
        times_used: 2,
        coupon_type: 'NO_COUPON',
        extension_attributes: { reward_points_delta: 500 },
    },
};

/** Carvello `main`: an attribute-set condition inside a subselect, and a SKU, for Commerce's four groups. */
export const WIPER_FLUID: CartRuleRows[number] = {
    rule: {
        name: '50% off wiper fluid with wiper purchase',
        description: '50% off wiper fluid with wiper purchase',
        website_ids: [2],
        customer_group_ids: ['NOT LOGGED IN', 'General', 'Wholesale', 'Retailer'],
        is_active: true,
        uses_per_customer: 0,
        store_labels: [],
        condition: {
            condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Combine',
            conditions: [
                {
                    condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product\\Subselect',
                    conditions: [{ condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product', operator: '==', attribute_name: 'attribute_set_id', value: 'Wipers' }],
                    aggregator_type: 'all',
                    operator: '>=',
                    attribute_name: 'qty',
                    value: '1',
                },
            ],
            aggregator_type: 'all',
            operator: null,
            value: '1',
        },
        action_condition: {
            condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product\\Combine',
            conditions: [{ condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product', operator: '==', attribute_name: 'sku', value: '53081' }],
            aggregator_type: 'all',
            operator: null,
            value: '1',
        },
        discount_amount: 50,
        discount_step: 1,
        apply_to_shipping: false,
        simple_action: 'by_percent',
        stop_rules_processing: false,
        is_advanced: true,
        sort_order: 0,
        times_used: 1,
        is_rss: true,
        coupon_type: 'NO_COUPON',
        use_auto_generation: false,
        uses_per_coupon: 0,
        simple_free_shipping: '0',
        extension_attributes: { reward_points_delta: 0 },
    },
};

/** Carvello `main`: a customer segment condition, segment 1 of the store it came from. */
export const MILE_SERVICE: CartRuleRows[number] = {
    rule: {
        ...WIPER_FLUID.rule,
        name: '10% off 30,000 Mile Service',
        description: 'Applicable to registered accounts with appropriate mileage',
        condition: {
            condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Combine',
            conditions: [{ condition_type: 'Magento\\CustomerSegment\\Model\\Segment\\Condition\\Segment', operator: '==', attribute_name: '', value: '1' }],
            aggregator_type: 'all',
            operator: null,
            value: '1',
        },
        action_condition: {
            condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product\\Combine',
            conditions: [{ condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product', operator: '==', attribute_name: 'sku', value: 'service-30k' }],
            aggregator_type: 'all',
            operator: null,
            value: '1',
        },
        discount_amount: 10,
    },
};

/** wknd `main`: the coupon rule `coupon10` belongs to. */
export const TEN_PERCENT_COUPON: CartRuleRows[number] = {
    rule: {
        name: '10% Coupon',
        description: 'Take 10% off',
        website_ids: [2],
        customer_group_ids: ['NOT LOGGED IN', 'General', 'Wholesale', 'Retailer'],
        is_active: true,
        uses_per_customer: 0,
        store_labels: [],
        condition: { condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Combine', aggregator_type: 'all', operator: null, value: '1' },
        action_condition: { condition_type: 'Magento\\SalesRule\\Model\\Rule\\Condition\\Product\\Combine', aggregator_type: 'all', operator: null, value: '1' },
        discount_amount: 10,
        discount_step: 0,
        apply_to_shipping: false,
        simple_action: 'by_percent',
        stop_rules_processing: true,
        is_advanced: true,
        sort_order: 0,
        times_used: 0,
        is_rss: true,
        coupon_type: 'SPECIFIC_COUPON',
        use_auto_generation: false,
        uses_per_coupon: 0,
        simple_free_shipping: '0',
        extension_attributes: { reward_points_delta: 0 },
    },
};

/** Health & Beauty `main`: `FF2021` on its Friends and Family rule, by the rule's name. */
export const FF2021: CouponRows[number] = {
    coupon: { code: 'FF2021', rule_id: 'Anaïs Clément - Friends and Family Promo', usage_limit: 0, usage_per_customer: 0, times_used: 0, is_primary: true, type: 0 },
};

/** wknd `main`: `coupon10`, lower case as the pack spells it. */
export const COUPON10: CouponRows[number] = {
    coupon: { code: 'coupon10', rule_id: '10% Coupon', usage_limit: 0, usage_per_customer: 0, times_used: 0, is_primary: true, type: 0 },
};

/** `GET salesRules/search` on scratch-1028's store, 2026-10-30: captured, empty. */
export const NO_RULES_PAGE: CommerceSearchPage<CommerceSalesRule> = {
    items: [],
    search_criteria: { filter_groups: [], page_size: 5, current_page: 1 },
    total_count: 0,
};

/** `GET coupons/search` on the same store, the same day: captured, empty. */
export const NO_COUPONS_PAGE: CommerceSearchPage<CommerceCoupon> = {
    items: [],
    search_criteria: { filter_groups: [], page_size: 5, current_page: 1 },
    total_count: 0,
};

/** `GET products/attributes/giftcard_amounts` (fields as asked), captured 2026-10-30. */
export const GIFTCARD_AMOUNTS_ATTRIBUTE = { scope: 'website', attribute_id: 134, attribute_code: 'giftcard_amounts', frontend_input: 'price', is_user_defined: false };

/**
 * CitiSignal's gift card on the sandbox, from `GET products` (`type_id` eq `giftcard`), captured
 * 2026-10-30; images, stock and most text attributes trimmed. Its amounts come twice: in
 * `extension_attributes.giftcard_amounts` (`website_id` 0, `website_value` null) and among the
 * custom attributes with this store's `value_id` and `entity_id`, as strings. The store holds the
 * same $50 amount twice in both.
 */
export const GIFT_CARD_6: CommerceProduct = {
    id: 6,
    sku: 'mastercard-giftcard',
    name: 'MasterCard Gift Card',
    attribute_set_id: 12,
    type_id: 'giftcard',
    created_at: '2026-02-05 16:02:59',
    updated_at: '2026-02-05 16:03:03',
    extension_attributes: {
        website_ids: [2],
        category_links: [{ position: -1, category_id: '5' }],
        giftcard_amounts: [
            { attribute_id: 134, website_id: 0, value: 50, website_value: null },
            { attribute_id: 134, website_id: 0, value: 50, website_value: null },
        ],
    },
    custom_attributes: [
        { attribute_code: 'url_key', value: 'mastercard-gift-card' },
        { attribute_code: 'giftcard_type', value: '0' },
        {
            attribute_code: 'giftcard_amounts',
            value: [
                { value_id: '3', website_id: '0', value: '50.0000', entity_id: '6', attribute_id: '134', website_value: 50 },
                { value_id: '4', website_id: '0', value: '50.0000', entity_id: '6', attribute_id: '134', website_value: 50 },
            ],
        },
        { attribute_code: 'allow_open_amount', value: '0' },
        { attribute_code: 'open_amount_min', value: '25.000000' },
        { attribute_code: 'open_amount_max', value: '1000.000000' },
    ],
};
