/**
 * Cart price rules and their coupons as Commerce REST answers and takes them (datapack-engine step
 * 11), in the fields the engine and the demo-data wipe read and write.
 *
 * Where each shape comes from:
 * - the search pages: `GET salesRules/search` and `GET coupons/search` answered on the ACCS sandbox
 *   (scratch-1028's store, 2026-10-30), both EMPTY (`items: []`, `search_criteria`, `total_count:
 *   0`), so the page shape is captured and the item shape is not;
 * - the items: Magento's service contracts behind the routes (`SalesRule/Api/Data/RuleInterface`,
 *   `ConditionInterface`, `CouponInterface`, 2.4-develop), and the rows the Data Installer's export
 *   wrote from those same answers (Health & Beauty, Carvello and wknd `main`, read 2026-10-30,
 *   `tests/helpers/commerceSalesRuleFixtures.ts`), which carry exactly these fields.
 *
 * Imports nothing.
 *
 * @module types/commerceSalesRule
 */

/** One node of a rule's condition tree (`ConditionInterface`). */
export interface CommerceRuleCondition {
    condition_type: string;
    conditions?: CommerceRuleCondition[];
    aggregator_type?: string | null;
    operator?: string | null;
    attribute_name?: string | null;
    /** A url key list, a set name, an option label or a number in a pack; this store's ids in Commerce. */
    value?: string | number | boolean | null;
    extension_attributes?: Record<string, unknown>;
}

/** `GET salesRules/{id}` and a `salesRules/search` item; `{ rule }` of `POST salesRules` and its PUT. */
export interface CommerceSalesRule {
    rule_id?: number;
    name: string;
    description?: string | null;
    store_labels?: Array<{ store_id: number; store_label: string }>;
    website_ids?: number[];
    customer_group_ids?: number[];
    from_date?: string | null;
    to_date?: string | null;
    uses_per_customer?: number;
    is_active?: boolean;
    condition?: CommerceRuleCondition;
    action_condition?: CommerceRuleCondition;
    stop_rules_processing?: boolean;
    is_advanced?: boolean;
    sort_order?: number;
    simple_action?: string;
    discount_amount?: number;
    discount_qty?: number;
    discount_step?: number;
    apply_to_shipping?: boolean;
    /** Commerce's own counter of orders that used the rule. */
    times_used?: number;
    is_rss?: boolean;
    /** `NO_COUPON`, `SPECIFIC_COUPON` or `AUTO`. */
    coupon_type?: string;
    use_auto_generation?: boolean;
    uses_per_coupon?: number;
    simple_free_shipping?: string | null;
    extension_attributes?: Record<string, unknown>;
}

/** `GET coupons/{id}` and a `coupons/search` item; `{ coupon }` of `POST coupons` and its PUT. */
export interface CommerceCoupon {
    coupon_id?: number;
    rule_id: number;
    code: string;
    usage_limit?: number | null;
    usage_per_customer?: number | null;
    /** Commerce's own counter of orders that used the code. */
    times_used?: number;
    expiration_date?: string | null;
    is_primary?: boolean | null;
    created_at?: string;
    /** 0 a code typed in, 1 one Commerce generated. */
    type?: number;
    extension_attributes?: Record<string, unknown>;
}

/** A page of `GET salesRules/search` or `GET coupons/search` (captured, empty, 2026-10-30). */
export interface CommerceSearchPage<T> {
    items: T[];
    search_criteria?: { filter_groups: unknown[]; page_size?: number; current_page?: number };
    total_count: number;
}
