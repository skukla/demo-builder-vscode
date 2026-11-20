/**
 * `aco_price_books` and `aco_prices`, the Data Installer service's mapping
 * (`acoPriceBooksExportTransform.js`, `acoPricesExportTransform.js`;
 * `.rptc/research/datapack-engine/aco-export-spec.md` §3):
 *
 * - a root book per website, named by its code and priced in its currency, and a book per
 *   customer group under it, `<website code>:<group slug>`, at most 64 characters;
 * - each product's price in its website's book, all-groups tier prices as that book's tiers (a
 *   quantity-1 tier becoming the price), a special price below it as a discount, and each group
 *   with tiers of its own priced in its own book.
 *
 * @module features/data-installer/services/acoExport/acoPriceRows
 */

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
const CHILD_ID_MAX = 64;

/** A website's book: its code, else `w<id>` (L14-21). */
export function rootBookId(website: CommerceWebsite): string {
    const code = (website.code ?? '').trim();
    return (code || `w${website.id}`).slice(0, ROOT_ID_MAX);
}

/** A group's code as a book id part, `group-<id>` when nothing is left of it (L28-51). */
function groupSlug(group: CommerceCustomerGroupRow): string {
    const tidy = (raw: string) =>
        raw
            .toLowerCase()
            .replace(/[^a-z0-9-]/gu, '')
            .replace(/-+/gu, '-')
            .replace(/^-+|-+$/gu, '');
    const slug = tidy((group.code ?? '').trim().replace(/\s+/gu, '-'));
    return slug || tidy(`group-${group.id}`) || 'group';
}

/** A group's book under a website's, cut to 64 characters (L59-74). */
export function childBookId(website: CommerceWebsite, group: CommerceCustomerGroupRow): string {
    const root = rootBookId(website);
    const full = `${root}:${groupSlug(group)}`;
    if (full.length <= CHILD_ID_MAX) return full;
    const room = CHILD_ID_MAX - root.length - 1;
    return room <= 0 ? full.slice(0, CHILD_ID_MAX) : `${root}:${groupSlug(group).slice(0, room)}`;
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

/** A special price below the price, as the amount off, to the cent (L45-55). */
function discountsOf(regular: number, special: string | undefined): AcoPriceRow['discounts'] {
    const price = amount(special);
    if (price === undefined || price >= regular) return undefined;
    const off = Math.round((regular - price) * 100) / 100;
    return off > 0 ? [{ code: 'special_price', price: off }] : undefined;
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
    const root = split(byGroup.get(ALL_GROUPS) ?? [], base);
    const discounts = discountsOf(root.regular, map.special_price);
    const rows: AcoPriceRow[] = [
        {
            sku,
            priceBookId: rootBookId(website),
            regular: root.regular,
            ...(discounts ? { discounts } : {}),
            ...(root.tierPrices.length > 0 ? { tierPrices: root.tierPrices } : {}),
        },
    ];
    for (const [id, tiers] of byGroup) {
        const group = groups.get(String(id));
        if (id === ALL_GROUPS || !group) continue;
        const own = split(tiers, base);
        if (own.tierPrices.length === 0 && own.regular === base) continue;
        rows.push({
            sku,
            priceBookId: childBookId(website, group),
            regular: own.regular,
            ...(own.tierPrices.length > 0 ? { tierPrices: own.tierPrices } : {}),
        });
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
