/**
 * What this demo uses in its store (owner, 2026-11-09, walk F85): a save from a pack takes all of
 * it, with nothing to tick, and Add Items offers the rest of four kinds.
 *
 * Products, gift cards, customers and cart rules are the demo's website's, categories sit under its
 * root, and companies are its customers' (`storeItems.ts`), so every one of them is the demo's. The
 * other four kinds Commerce keeps for the whole instance, with no website and no creator, so on a
 * shared instance (Scratch 1028) they are several demos'. Each counts as this demo's when something
 * of it uses the item:
 *
 * | Kind | Used when | Read |
 * |---|---|---|
 * | customer groups | a customer, cart rule or company of this demo is in the group | the customers' `group_id`, the rules' `customer_group_ids`, the companies' `customer_group_id` |
 * | shared catalogs | the catalog is for one of those groups | the catalog's `customer_group_id` |
 * | attribute sets | one of this demo's products has the set | a count of the website's products by `attribute_set_id` |
 * | product attributes | one of this demo's products has a value for it | a count of the website's products with the attribute `notnull` |
 *
 * Read live on Scratch 1028 (website 6), 2026-11-09: Luma's 8 sets hold all 2,048 of its products
 * and the other 13 none; `color` has a value on 1,856, and `cs_format`, `brand` and `erp_owner`,
 * which sit in Luma's sets, on none. An attribute counted by its sets would have taken those three.
 *
 * Anything else of those four kinds is unused: another demo's, or something the SC made to use
 * during the demo, which Commerce cannot tell apart, so Add Items lists them and the SC chooses.
 *
 * Reads only.
 *
 * @module features/data-installer/services/demoBuilderEngine/demoUses
 */

import { type PickableKind, type StoreItem, UNUSED_KINDS } from '../../pickableKinds';
import { readWebsiteCustomers } from '../demoDataWipe/wipeReads';
import { CATALOG_KIND, CUSTOMER_GROUP_KIND } from './b2bKeys';
import { readCatalogs } from './b2bReads';
import type { KindContext } from './kindContext';
import { GIFT_CARD_KIND } from './productKinds';
import { type CountFilter, countMatching, listStoreItems, productKindItems, websiteFilter, websiteOf } from './storeItems';
import { runInBatches } from '@/core/utils/promiseUtils';
import { absentAsEmpty, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceCompanyRow, CommerceProduct } from '@/types/commerceWire';

/** Whether Commerce keeps a kind for the whole instance, so only some of it is this demo's. */
const isInstanceKind = (kind: PickableKind): boolean => UNUSED_KINDS.includes(kind);

/** How many counts of what the demo's products use go to Commerce at once. */
const COUNTS_AT_ONCE = 6;

/** One kind's items, as this demo uses them. */
export interface KindUse {
    used: StoreItem[];
    unused: StoreItem[];
}

const idsOf = (ids: Array<number | undefined>): Set<string> =>
    new Set(ids.filter((id): id is number => id !== undefined).map(String));

/** The groups this demo's customers, cart rules and companies are in. */
async function usedGroupIds(ctx: KindContext): Promise<Set<string>> {
    const website = websiteOf(ctx);
    const [customers, rules] = await Promise.all([
        readWebsiteCustomers(ctx.get, website),
        readAllPages<CommerceSalesRule>(ctx.get, 'salesRules/search'),
    ]);
    const companyIds = idsOf(
        customers
            .map((c) => c.extension_attributes?.company_attributes?.company_id)
            .filter((id) => id !== 0),
    );
    const companies =
        companyIds.size === 0
            ? []
            : await absentAsEmpty(() => readAllPages<CommerceCompanyRow>(ctx.get, 'company'));
    return idsOf([
        ...customers.map((c) => c.group_id),
        ...rules
            .filter((r) => (r.website_ids ?? []).map(Number).includes(website))
            .flatMap((r) => r.customer_group_ids ?? []),
        ...companies.filter((c) => companyIds.has(String(c.id))).map((c) => c.customer_group_id),
    ]);
}

/** The items at least one of this demo's products has, each counted by `filterOf`. */
async function usedByProducts(
    ctx: KindContext,
    items: StoreItem[],
    filterOf: (id: string) => CountFilter,
): Promise<Set<string>> {
    const counted = await runInBatches(items, COUNTS_AT_ONCE, async (item) => ({
        id: item.id,
        count: await countMatching(ctx, 'products', [websiteFilter(ctx), filterOf(item.id)]),
    }));
    return new Set(counted.filter((c) => c.count > 0).map((c) => c.id));
}

/**
 * What this demo uses, read once per save or list: each kind's items, split by the rules above.
 * The groups are read once, since the catalogs follow them.
 */
/**
 * @param websiteProducts - the website's products, read whole once by a save (walk F90); products
 *   and gift cards are listed from them, rather than read again
 */
export function demoUses(ctx: KindContext, websiteProducts?: Promise<CommerceProduct[]>): { of: (kind: PickableKind) => Promise<KindUse> } {
    let groups: Promise<Set<string>> | undefined;
    const groupIds = (): Promise<Set<string>> => (groups ??= usedGroupIds(ctx));

    async function itemsOf(kind: PickableKind): Promise<StoreItem[]> {
        if (websiteProducts && (kind === 'products' || kind === GIFT_CARD_KIND)) return productKindItems(await websiteProducts, kind);
        return (await listStoreItems(ctx, kind)).items;
    }

    async function usedIds(kind: PickableKind, items: StoreItem[]): Promise<Set<string>> {
        if (kind === CUSTOMER_GROUP_KIND) return groupIds();
        if (kind === CATALOG_KIND) {
            const [used, catalogs] = await Promise.all([groupIds(), readCatalogs(ctx.get)]);
            return idsOf(
                catalogs
                    .filter(
                        (c) =>
                            c.customer_group_id !== undefined &&
                            used.has(String(c.customer_group_id)),
                    )
                    .map((c) => c.id),
            );
        }
        if (kind === 'attribute_sets')
            return usedByProducts(ctx, items, (id) => ['attribute_set_id', 'eq', id]);
        return usedByProducts(ctx, items, (code) => [code, 'notnull', '']);
    }

    return {
        async of(kind) {
            const items = await itemsOf(kind);
            if (!isInstanceKind(kind)) return { used: items, unused: [] };
            const used = await usedIds(kind, items);
            return {
                used: items.filter((i) => used.has(i.id)),
                unused: items.filter((i) => !used.has(i.id)),
            };
        },
    };
}
