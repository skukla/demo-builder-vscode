/**
 * `aco_price_books` and `aco_prices`, the Data Installer service's mapping
 * (`acoPriceBooksExportTransform.js`, `acoPricesExportTransform.js`;
 * `.rptc/research/datapack-engine/aco-export-spec.md` §3):
 *
 * - a root book per website, named by its code and priced in its currency, and a book per
 *   customer group under it, named as Commerce names it (below);
 * - each product's price in its website's book, all-groups tier prices as that book's tiers (a
 *   quantity-1 tier becoming the price), a special price below it as a discount, and each group
 *   with tiers of its own priced in its own book.
 *
 * Two deliberate departures from the service, both measured on a real ACO sandbox (2026-11-01,
 * `.rptc/research/aco-support/customer-pricing.md`):
 *
 * - A group's book is `<website code>::<sha1(group id)>`, the id Commerce's `commerceOptimizer`
 *   query answers: a guest, a customer and a company's buyer each got exactly that id for their
 *   website and group. The service's `<website>:<group slug>` is an id no storefront ever asks for.
 * - A discount's `price` is the FINAL price, not the amount off: regular 50 with `price: 5` read
 *   back as 5. The service sends the amount off, which would show a $7 sale on $10 as $3.
 *
 * A group's book only holds a row where the group's price differs. A child book inherits the rest,
 * discounts and tiers included (measured, against ACO's docs, which say discounts are not inherited).
 *
 * @module features/data-installer/services/acoExport/acoPriceRows
 */

import * as crypto from 'crypto';
import { customAttributeMap } from './acoRowParts';
import type {
    AcoPriceBookRow,
    AcoPriceRow,
    AcoTierPrice,
    CommerceCatalogProduct,
    CommerceCustomerGroupRow,
    CommerceProductTierPrice,
} from '@/types/acoPack';
import type { CommerceStoreView, CommerceWebsite } from '@/types/commerceStore';

/** Magento's "all groups" tier group (`TierPrice::ALL_GROUPS_ID`, L14). */
const ALL_GROUPS = 32000;
const ROOT_ID_MAX = 128;

/** A website's book: its code, else `w<id>` (L14-21). */
export function rootBookId(website: CommerceWebsite): string {
    const code = (website.code ?? '').trim();
    return (code || `w${website.id}`).slice(0, ROOT_ID_MAX);
}

/** The id Commerce answers for a shopper in this website and customer group. */
export function buyerBookId(websiteCode: string, groupId: number): string {
    return `${websiteCode}::${crypto.createHash('sha1').update(String(groupId)).digest('hex')}`;
}

/** A group's book under a website's. */
export function childBookId(website: CommerceWebsite, group: CommerceCustomerGroupRow): string {
    return buyerBookId(rootBookId(website), group.id);
}

const websiteName = (w: CommerceWebsite) =>
    (w.name ?? '').trim() || (w.code ?? '').trim() || `Website ${w.id}`;
const groupName = (g: CommerceCustomerGroupRow) => (g.code ?? '').trim() || `Group ${g.id}`;

/** Every website's book and its groups' books under it (L99-131). */
export function priceBookRows(
    websites: readonly CommerceWebsite[],
    groups: readonly CommerceCustomerGroupRow[],
    currencyOf: (website: CommerceWebsite) => string,
): AcoPriceBookRow[] {
    return websites.flatMap((website): AcoPriceBookRow[] => [
        {
            priceBookId: rootBookId(website),
            name: websiteName(website),
            currency: currencyOf(website).trim().toUpperCase(),
        },
        ...groups.map((group) => ({
            priceBookId: childBookId(website, group),
            parentId: rootBookId(website),
            name: `${groupName(group)} (${websiteName(website)})`,
        })),
    ]);
}

/** A price as a number, or undefined (L22-28). */
function amount(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}

/** A tier on this website: one with no website, or website 0, is on every website (L78-87). */
function onWebsite(tier: CommerceProductTierPrice, websiteId: number): boolean {
    const id = tier.website_id ?? tier.extension_attributes?.website_id;
    return id === undefined || id === '' || Number(id) === 0 || String(id) === String(websiteId);
}

/** Tiers as ACO's, by quantity; a quantity-1 tier is the price itself (L61-106). */
function split(
    tiers: readonly CommerceProductTierPrice[],
    base: number,
): { regular: number; tierPrices: AcoTierPrice[] } {
    const mapped = tiers
        .map((t) => ({ qty: Number(t.qty), price: amount(t.value) }))
        .filter(
            (t): t is AcoTierPrice => Number.isFinite(t.qty) && t.qty > 0 && t.price !== undefined,
        )
        .sort((a, b) => a.qty - b.qty);
    if (mapped.length > 0 && mapped[0].qty <= 1)
        return { regular: mapped[0].price, tierPrices: mapped.slice(1) };
    return { regular: base, tierPrices: mapped };
}

/** A special price below the price, as ACO takes a discount: the price it comes to. */
function discountsOf(regular: number, special: string | undefined): AcoPriceRow['discounts'] {
    const price = amount(special);
    if (price === undefined || price >= regular) return undefined;
    return [{ code: 'special_price', price }];
}

/** This website's tiers, by customer group; a tier with no group is for all of them. */
function tiersByGroup(
    product: CommerceCatalogProduct,
    websiteId: number,
): Map<number, CommerceProductTierPrice[]> {
    const byGroup = new Map<number, CommerceProductTierPrice[]>();
    for (const tier of (product.tier_prices ?? []).filter((t) => onWebsite(t, websiteId))) {
        const group =
            tier.customer_group_id === undefined ? ALL_GROUPS : Number(tier.customer_group_id);
        byGroup.set(group, [...(byGroup.get(group) ?? []), tier]);
    }
    return byGroup;
}

/** A row: the price and its tiers, and the special price as a discount when it is below it. */
function priceRow(
    sku: string,
    priceBookId: string,
    { regular, tierPrices }: { regular: number; tierPrices: AcoTierPrice[] },
    special: string | undefined,
): AcoPriceRow {
    const discounts = discountsOf(regular, special);
    return {
        sku,
        priceBookId,
        regular,
        ...(discounts ? { discounts } : {}),
        ...(tierPrices.length > 0 ? { tierPrices } : {}),
    };
}

/** One product's rows on one website, or none when it has no price (L114-185). */
export function priceRows(
    product: CommerceCatalogProduct,
    website: CommerceWebsite,
    groups: ReadonlyMap<string, CommerceCustomerGroupRow>,
): AcoPriceRow[] {
    const sku = product.sku.trim();
    const map = customAttributeMap(product);
    const base = amount(product.price) ?? amount(map.price);
    if (!sku || base === undefined) return [];
    const byGroup = tiersByGroup(product, website.id);
    const special = map.special_price;
    const root = priceRow(sku, rootBookId(website), split(byGroup.get(ALL_GROUPS) ?? [], base), special);
    const rows = [root];
    for (const group of groups.values()) {
        const own = split(byGroup.get(Number(group.id)) ?? [], base);
        if (own.tierPrices.length > 0 || own.regular !== base) rows.push(priceRow(sku, childBookId(website, group), own, special));
    }
    return rows;
}

/** One row per product and book, the last one kept (L209-219). */
export function dedupePrices(rows: readonly AcoPriceRow[]): AcoPriceRow[] {
    const kept = new Map<string, AcoPriceRow>();
    for (const row of rows) kept.set(`${row.sku}\0${row.priceBookId}`, row);
    return [...kept.values()];
}

/**
 * The store view a website is read through: the first chosen one of its own, else its lowest-id
 * active view (the intent the service's docstring states, L187-203; spec §5 says why).
 */
export function storeViewFor(
    website: CommerceWebsite,
    storeViews: readonly CommerceStoreView[],
    chosen: readonly string[],
): string | undefined {
    const own = storeViews.filter(
        (view) => view.id !== 0 && Number(view.website_id) === Number(website.id),
    );
    const picked = chosen.find((code) => own.some((view) => view.code === code));
    if (picked) return picked;
    const active = own.filter((view) => Boolean(view.is_active));
    return [...(active.length > 0 ? active : own)].sort((a, b) => a.id - b.id)[0]?.code;
}
