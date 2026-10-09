/**
 * Which products an ERP owns, as "Add another ERP" asks it (AB-64): the settings a rule
 * saves on the ERP's list entry, the rule read back off resolved settings, the count each
 * option would give (by the fill's own predicate, `ownershipFilter`, so the dialog and the
 * fill never disagree), the default rule, and the rule an existing ERP is given once it stops
 * owning everything.
 *
 * Pure, and imported by the dialog as well as the handler, so it imports nothing but the
 * fill's rows.
 *
 * @module features/app-builder/services/erpOwnership
 */

import { codesOf, ownershipFilter, type ErpSettings } from './erpFillRows';
import type { ErpOwnedProductRow, ErpOwnsEntry, ErpOwnsRule } from '@/types/erpOwnership';

/** The `erp/erps` setting the websites mode reads. */
const WEBSITES_KEY = 'structure_owns_websites';

const ATTRIBUTE_KEY = 'structure_owns_attribute';
const MODE_KEY = 'structure_owns';
const OWNER_ATTRIBUTE = 'erp_owner';

/**
 * The values a rule saves (`PATCH erp/erps`): the mode and the one key the mode reads. The
 * other keys are left as they are, so switching back later finds them.
 */
export function ownsSettingsOf(rule: ErpOwnsRule): Record<string, string> {
    switch (rule.mode) {
        case 'websites':
            return { [MODE_KEY]: 'websites', [WEBSITES_KEY]: (rule.websites ?? []).join(',') };
        case 'attribute':
            return { [MODE_KEY]: 'attribute', [ATTRIBUTE_KEY]: rule.attribute ?? '' };
        default:
            return { [MODE_KEY]: 'all' };
    }
}

/** The rule an ERP holds, read off its resolved settings; an unset mode is "all". */
export function ownsRuleOf(settings: ErpSettings | undefined): ErpOwnsRule {
    const mode = settings?.[MODE_KEY];
    if (mode === 'websites') return { mode, websites: codesOf(settings?.[WEBSITES_KEY]) };
    if (mode === 'attribute') return { mode, attribute: String(settings?.[ATTRIBUTE_KEY] ?? '') };
    return { mode: 'all' };
}

/** The fill's settings for a rule, so `ownershipFilter` can read it. */
function settingsOf(rule: ErpOwnsRule): ErpSettings {
    return ownsSettingsOf(rule);
}

/** The SKUs the rule owns among these products, by the fill's own predicate. */
export function ownedSkus(products: readonly ErpOwnedProductRow[], rule: ErpOwnsRule): Set<string> {
    const filter = ownershipFilter(settingsOf(rule));
    return new Set(
        products
            .filter((product) =>
                filter.owns({ websiteCodes: product.websiteCodes, customAttributes: product.attributes }),
            )
            .map((product) => product.sku),
    );
}

/** How many of these products the rule owns, by the fill's own predicate. */
export function countOwned(products: readonly ErpOwnedProductRow[], rule: ErpOwnsRule): number {
    return ownedSkus(products, rule).size;
}

/** The rule in the fill's words ("products sold on justrite"). */
export function describeOwns(rule: ErpOwnsRule): string {
    return ownershipFilter(settingsOf(rule)).describe;
}

/** The attribute rule for an ERP: `erp_owner=<its list id>`. */
export function ownerAttributeFor(listId: string): ErpOwnsRule {
    return { mode: 'attribute', attribute: `${OWNER_ATTRIBUTE}=${listId}` };
}

/** The website codes the ERPs' rules already name. */
function websitesOwnedBy(erps: readonly ErpOwnsEntry[]): Set<string> {
    return new Set(erps.flatMap((entry) => entry.owns.websites ?? []));
}

/** What the default rule is derived from: the store's websites and each ERP's rule. */
export interface OwnsDefaultInput {
    websites: ReadonlyArray<{ code: string }>;
    erps: readonly ErpOwnsEntry[];
}

/**
 * The rule the dialog offers before the SC changes anything: "Carrying this attribute",
 * `erp_owner=<the new ERP's list id>` (owner, 2026-10-09, AB-70). Until then the default
 * was the first website nobody owned, when the store had several; the owner chose the
 * attribute, the rule that tells the "master data decides" story and the only one that asks
 * nothing of the store's structure. Per website stays a choice in the picker.
 */
export function defaultOwnsRule(input: { listId: string }): ErpOwnsRule {
    return ownerAttributeFor(input.listId);
}

/**
 * Once there are two ERPs, each owns only what its rule says: an existing ERP whose rule is
 * still "all" (or unset) is given one here, saved together with the new ERP's. When the new
 * ERP is split by website, its default is the websites nobody's rule names; otherwise (the
 * new ERP is split by attribute, or no website is left) its attribute, so the two ERPs split
 * on the same axis and no product is owned by both. An ERP with a rule of its own is left
 * alone.
 */
export function existingRulesToChange(
    input: OwnsDefaultInput,
    newRule: ErpOwnsRule,
): ErpOwnsEntry[] {
    const owned = websitesOwnedBy([...input.erps, { erp: '', owns: newRule }]);
    const remaining = input.websites.map((site) => site.code).filter((code) => !owned.has(code));
    const byWebsite = newRule.mode === 'websites' && remaining.length > 0;
    return input.erps
        .filter((entry) => entry.owns.mode === 'all')
        .map((entry) => ({
            erp: entry.erp,
            owns: byWebsite
                ? { mode: 'websites', websites: remaining }
                : ownerAttributeFor(entry.erp),
        }));
}

/** Why a rule cannot be saved yet, or undefined when it can. */
export function ownsProblem(rule: ErpOwnsRule): string | undefined {
    if (rule.mode === 'websites' && !(rule.websites ?? []).length) return 'Tick at least one website.';
    if (rule.mode === 'attribute' && !/^[^=\s]+=\S+$/u.test(rule.attribute ?? '')) {
        return 'The attribute is code=value, e.g. erp_owner=acme.';
    }
    return undefined;
}
