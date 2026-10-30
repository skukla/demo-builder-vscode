/**
 * A saved version's rows checked against what the install takes, before the version is stored
 * (step 14, item 13). The service checked every export against its JSON schema
 * (`ProductsExportProcessor.js:232-234`); ours checked rows only when they were installed, so a
 * bad save showed up at the next install, on another store, long after.
 *
 * The check is the install's own: each kind's parser (`parse*Rows`, `parseCategoryPack`,
 * `packSettings`, `flatAssignments`), the same functions `runPack.ts` calls before writing a kind.
 * A kind no parser here names is not checked, as the install has nothing to check it by either.
 *
 * @module features/data-installer/services/demoBuilderEngine/packShape
 */

import { parseAssignmentRows, parseAttributeSetRows } from './attributeSetsKind';
import { parseAttributeRows } from './attributesKind';
import { ASSIGNMENT_KINDS, type AssignmentKind, CATALOG_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND, CUSTOMER_KIND } from './b2bKeys';
import { CART_RULE_KIND, parseCartRuleRows } from './cartRulesKind';
import { parseCategoryPack } from './categoriesKind';
import { parseCompanyRows } from './companiesKind';
import { COUPON_KIND, parseCouponRows } from './couponsKind';
import { parseCustomerGroupRows, parseCustomerRows } from './customerKinds';
import { GIFT_CARD_KIND, parseProductRows } from './productsKind';
import { flatAssignments, parseCatalogRows } from './sharedCatalogKinds';
import { parseSourceItems } from './sourceItemsKind';
import { parseSources, parseStockSourceLinks, parseStocks } from './stockKinds';
import { STORE_CONFIG_KIND, packSettings } from './storeConfigKind';

/** One kind's parser; it throws the install's own sentence when the rows are not in its shape. */
type Parser = (records: unknown) => unknown;

/** The website code a saved setting is checked for: a saved version installs on any website. */
const ANY_WEBSITE = 'website';

const PARSERS: Record<string, Parser> = {
    attribute_sets: parseAttributeSetRows,
    product_attributes: parseAttributeRows,
    attribute_assign_to_set: parseAssignmentRows,
    categories: parseCategoryPack,
    [CUSTOMER_GROUP_KIND]: parseCustomerGroupRows,
    stocks: parseStocks,
    sources: parseSources,
    stock_source_links: parseStockSourceLinks,
    products: parseProductRows,
    [GIFT_CARD_KIND]: parseProductRows,
    source_items: parseSourceItems,
    [CUSTOMER_KIND]: parseCustomerRows,
    [CART_RULE_KIND]: parseCartRuleRows,
    [COUPON_KIND]: parseCouponRows,
    [CATALOG_KIND]: parseCatalogRows,
    [COMPANY_KIND]: parseCompanyRows,
    ...Object.fromEntries(ASSIGNMENT_KINDS.map((kind: AssignmentKind): [string, Parser] => [kind, (records) => flatAssignments(kind, records)])),
    [STORE_CONFIG_KIND]: (records) => packSettings(records, ANY_WEBSITE),
};

/** One kind of a saved version that the install would refuse, and the install's reason. */
export interface ShapeRefusal {
    kind: string;
    reason: string;
}

/**
 * Every kind of these rows the install would refuse, with its reason; none when all would install.
 *
 * @param items - the version's rows, by kind
 */
export function shapeRefusals(items: Record<string, unknown>): ShapeRefusal[] {
    const refused: ShapeRefusal[] = [];
    for (const [kind, records] of Object.entries(items)) {
        const parse = PARSERS[kind];
        if (!parse) continue;
        try {
            parse(records);
        } catch (error) {
            refused.push({ kind, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return refused;
}
