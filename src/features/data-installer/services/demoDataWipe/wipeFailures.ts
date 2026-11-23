/**
 * A read that fails, in a wipe's plan (P6-Q3): collected per data type, never thrown, so that type is
 * left alone and the rest is planned. A kind whose proof another kind's read gives fails with it:
 * catalogs, groups and attributes when the cart rules that stay are unknown (`noteDecisionFailures`).
 *
 * @module features/data-installer/services/demoDataWipe/wipeFailures
 */

import { ATTRIBUTE_SET_KIND } from '../demoBuilderEngine/attributeSetsKind';
import { ATTRIBUTE_KIND } from '../demoBuilderEngine/attributesKind';
import { CATALOG_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND } from '../demoBuilderEngine/b2bKeys';
import { CART_RULE_KIND } from '../demoBuilderEngine/cartRulesKind';
import { WEBSITE_SETTINGS } from './clearCheck';
import type { AttributeDecision } from './wipeAttributes';
import type { CatalogDecision } from './wipeCatalogs';
import type { CompanyDecision } from './wipeCompanies';
import type { SettingsDecision } from './wipeSettings';

/** Each type a read failed for, with the first failure. */
export type Failures = Map<string, unknown>;

/** Read, and on failure note it against these types and answer `empty`: the type is then left alone. */
export async function attempt<T>(failures: Failures, types: readonly string[], read: () => Promise<T>, empty: T): Promise<T> {
    try {
        return await read();
    } catch (error) {
        for (const type of types) if (!failures.has(type)) failures.set(type, error);
        return empty;
    }
}

/** Note a decision's own failure against these types. */
export function noteFailed(failures: Failures, types: readonly string[], error: unknown): void {
    if (error !== undefined) for (const type of types) if (!failures.has(type)) failures.set(type, error);
}

/** The decisions that note their own failures; catalogs and attributes are emptied when the rules are unknown. */
export interface DependentDecisions {
    companies: CompanyDecision;
    catalogs: CatalogDecision;
    attributes: AttributeDecision;
    settings: SettingsDecision;
}

/** The kinds whose decisions read others' answers, with what their failures are noted against. */
export function noteDecisionFailures(decided: DependentDecisions, failures: Failures): void {
    noteFailed(failures, [COMPANY_KIND], decided.companies.failed);
    noteFailed(failures, [CATALOG_KIND, CUSTOMER_GROUP_KIND], decided.catalogs.failed);
    noteFailed(failures, [ATTRIBUTE_SET_KIND], decided.attributes.setsFailed);
    noteFailed(failures, [ATTRIBUTE_KIND], decided.attributes.attributesFailed);
    noteFailed(failures, [WEBSITE_SETTINGS], decided.settings.failed);
    // Without the rules that stay, nothing proves a group or an attribute unused.
    if (failures.has(CART_RULE_KIND)) {
        noteFailed(failures, [CATALOG_KIND, CUSTOMER_GROUP_KIND, ATTRIBUTE_KIND], failures.get(CART_RULE_KIND));
        decided.catalogs = { remove: [], kept: [...decided.catalogs.kept, ...decided.catalogs.remove.map((g) => ({ groupName: g.groupName, ...(g.catalog ? { catalog: g.catalog.name } : {}) }))] };
        decided.attributes = { ...decided.attributes, attributes: [], attributesKept: [...decided.attributes.attributesKept, ...decided.attributes.attributes.map((a) => a.code)] };
    }
}
