/**
 * Which products each ERP owns (AB-64, AB-72): the settings a rule saves on the ERP's list
 * entry, the rule read back off resolved settings, the ONE resolver every reader uses to say
 * who owns a product once there are several ERPs, the default rule, and the narrowing an
 * existing ERP is given when — and only when — the precedence needs it.
 *
 * The precedence is the integration's (commerce-erp-integration, `ownersOfLine`; owner,
 * 2026-10-09) and the extension mirrors it exactly:
 *
 * 1. product rules first — an ERP whose rule names a product attribute owns every product
 *    carrying it; two such rules can both match one product, and then both own it;
 * 2. then the ERP on everything (`mode: 'all'`), the CATCH-ALL: it owns every product no
 *    product rule claimed, and never competes with a product rule for a tagged product;
 * 3. then website rules, for what is still unowned.
 *
 * So adding an ERP by attribute changes no other rule: the ERP on everything keeps what the
 * attribute does not claim. Adding one by WEBSITE is the one case that narrows an ERP on
 * everything (`existingRulesToChange`): a catch-all comes before a website rule, so it would
 * take every product before the website ERP saw any. It is given the websites nobody's rule
 * names; when none is left it is left alone, the new ERP owns nothing, and the pass says so.
 *
 * Until 2026-10-09 the add narrowed an ERP on everything to its own attribute as well, which
 * left every untagged product with nobody (182 of 321 on Justrite) and depended on a store
 * read the Add button did not wait for.
 *
 * Pure, and imported by the dialog as well as the handler, so it imports nothing but the
 * fill's rows.
 *
 * @module features/app-builder/services/erpOwnership
 */

import { codesOf, ownershipFilter, type ErpSettings, type OwnershipFilter } from './erpFillRows';
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

/** The fill's predicate for a rule, so every reader matches products the way the fill does. */
function filterOf(rule: ErpOwnsRule): OwnershipFilter {
    return ownershipFilter(ownsSettingsOf(rule));
}

/** Whether one rule, on its own, matches the product. */
function matches(filter: OwnershipFilter, product: ErpOwnedProductRow): boolean {
    return filter.owns({ websiteCodes: product.websiteCodes, customAttributes: product.attributes });
}

/** The ERPs whose rule is in the tier and matches the product, in the order the ERPs were given. */
function claimants(
    product: ErpOwnedProductRow,
    tier: ReadonlyArray<{ erp: string; filter: OwnershipFilter }>,
): string[] {
    return tier.filter((entry) => matches(entry.filter, product)).map((entry) => entry.erp);
}

/**
 * Who owns each product, by the precedence above: the list ids of the ERPs that own it, by
 * SKU; an empty list for a product nobody's rule claims; two or more where two rules in the
 * same tier both match.
 *
 * @param products - the store's products, as the ownership predicate reads them
 * @param erps - every ERP the integration serves, with the rule each holds
 * @returns owner list ids by SKU, every SKU present
 */
export function ownersAcross(
    products: readonly ErpOwnedProductRow[],
    erps: readonly ErpOwnsEntry[],
): Map<string, string[]> {
    const withFilter = erps.map((entry) => ({ erp: entry.erp, mode: entry.owns.mode, filter: filterOf(entry.owns) }));
    const tiers = [
        withFilter.filter((entry) => entry.mode === 'attribute'),
        withFilter.filter((entry) => entry.mode === 'all'),
        withFilter.filter((entry) => entry.mode === 'websites'),
    ];
    return new Map(
        products.map((product) => {
            const owners = tiers.map((tier) => claimants(product, tier)).find((claimed) => claimed.length > 0) ?? [];
            return [product.sku, owners];
        }),
    );
}

/**
 * The SKUs one ERP owns among these products, once every ERP's rule is applied. The only
 * way to answer "what does this ERP own" with two or more ERPs: its rule alone says what it
 * MATCHES, not what it is left after a product rule or a catch-all has taken a product.
 */
export function ownedSkusAcross(
    products: readonly ErpOwnedProductRow[],
    erps: readonly ErpOwnsEntry[],
    listId: string,
): Set<string> {
    const owned = new Set<string>();
    for (const [sku, owners] of ownersAcross(products, erps)) if (owners.includes(listId)) owned.add(sku);
    return owned;
}

/** The products two or more rules both claim, grouped by the ERPs that claim them. */
export interface OwnershipOverlap {
    /** The list ids, in the order the ERPs were given. */
    erps: string[];
    count: number;
}

/**
 * Where two rules in one tier both match (two attribute rules on different attributes, or two
 * website rules for a product sold on both), the integration refuses the order line as claimed
 * by both, so every reader says it.
 *
 * @param owners - what `ownersAcross` answered
 * @returns one row per set of ERPs that share products, in first-seen order
 */
export function overlapsIn(owners: ReadonlyMap<string, readonly string[]>): OwnershipOverlap[] {
    const bySet = new Map<string, OwnershipOverlap>();
    for (const claimed of owners.values()) {
        if (claimed.length < 2) continue;
        const key = claimed.join('\u0000');
        const row = bySet.get(key) ?? { erps: [...claimed], count: 0 };
        row.count += 1;
        bySet.set(key, row);
    }
    return [...bySet.values()];
}

/** The rule in the fill's words ("products sold on justrite"). */
export function describeOwns(rule: ErpOwnsRule): string {
    return filterOf(rule).describe;
}

/**
 * The rule in words as it stands beside other ERPs: an ERP on everything owns what the others
 * do not claim, not every product.
 */
export function describeOwnsAcross(rule: ErpOwnsRule): string {
    return rule.mode === 'all' ? 'every product no other ERP claims' : describeOwns(rule);
}

/** The attribute rule for an ERP: `erp_owner=<its list id>`. */
export function ownerAttributeFor(listId: string): ErpOwnsRule {
    return { mode: 'attribute', attribute: `${OWNER_ATTRIBUTE}=${listId}` };
}

/** The website codes the ERPs' rules already name. */
function websitesOwnedBy(erps: readonly ErpOwnsEntry[]): Set<string> {
    return new Set(erps.flatMap((entry) => entry.owns.websites ?? []));
}

/** What a narrowing is derived from: the store's websites and each ERP's rule. */
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
 * The one narrowing the precedence needs: when the new ERP is split by WEBSITE, an existing
 * ERP whose rule is still "all" (or unset) is given the websites nobody's rule names, saved
 * together with the new ERP's, because a catch-all comes before a website rule and would take
 * everything first. A new ERP split by attribute changes nothing: the catch-all keeps what the
 * attribute does not claim. With no website left over, nothing changes either: the new ERP
 * then owns nothing, which the ownership pass says. An ERP with a rule of its own is never
 * touched.
 */
export function existingRulesToChange(
    input: OwnsDefaultInput,
    newRule: ErpOwnsRule,
): ErpOwnsEntry[] {
    if (newRule.mode !== 'websites') return [];
    const owned = websitesOwnedBy([...input.erps, { erp: '', owns: newRule }]);
    const remaining = input.websites.map((site) => site.code).filter((code) => !owned.has(code));
    if (remaining.length === 0) return [];
    return input.erps
        .filter((entry) => entry.owns.mode === 'all')
        .map((entry) => ({ erp: entry.erp, owns: { mode: 'websites', websites: remaining } }));
}

/**
 * Every ERP's rule once the new one is added: the existing ones, narrowed where
 * `existingRulesToChange` says, then the new one. What the dialog counts with, so what it
 * promises is what the add leaves.
 */
export function rulesAfterAdd(input: OwnsDefaultInput, added: ErpOwnsEntry): ErpOwnsEntry[] {
    const changed = new Map(existingRulesToChange(input, added.owns).map((entry) => [entry.erp, entry.owns]));
    const existing = input.erps
        .filter((entry) => entry.erp !== added.erp)
        .map((entry) => ({ erp: entry.erp, owns: changed.get(entry.erp) ?? entry.owns }));
    return [...existing, added];
}

/** How many of these products the new ERP would own under a rule, across every ERP's rule. */
export function countOwnedAfterAdd(
    products: readonly ErpOwnedProductRow[],
    input: OwnsDefaultInput,
    added: ErpOwnsEntry,
): number {
    return ownedSkusAcross(products, rulesAfterAdd(input, added), added.erp).size;
}

/** Why a rule cannot be saved yet, or undefined when it can. */
export function ownsProblem(rule: ErpOwnsRule): string | undefined {
    if (rule.mode === 'websites' && !(rule.websites ?? []).length) return 'Tick at least one website.';
    if (rule.mode === 'attribute' && !/^[^=\s]+=\S+$/u.test(rule.attribute ?? '')) {
        return 'The attribute is code=value, e.g. erp_owner=acme.';
    }
    return undefined;
}
