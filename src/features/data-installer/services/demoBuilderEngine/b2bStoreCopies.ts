/**
 * The store's copy of each customer and B2B object an install record lists, in pack form
 * (datapack-engine step 08), for the same three readers as the catalog kinds: a repeat install's
 * "edited since?", the hash taken once an install ends, and capture.
 *
 * | Kind | Read | Captured live? |
 * |---|---|---|
 * | `customer_groups` | `GET customerGroups/{id}` | yes |
 * | `customers` | `GET customers/{id}` | yes |
 * | `b2b_shared_catalogs` | the catalog list (`GET sharedCatalog`), by `id` | one page, yes |
 * | `b2b_companies` | `GET company/{id}`, and its admin by `GET customers/{super_user_id}` | yes |
 * | the assignment kinds | what each catalog holds (`readHeld`), names by `GET company/{id}` and the category lookups | read live, not recorded |
 *
 * An assignment's copy is its flat pair (`b2bKeys.ts`) while the catalog still holds it.
 *
 * @module features/data-installer/services/demoBuilderEngine/b2bStoreCopies
 */

import {
    type AssignmentKind,
    CATALOG_CATEGORIES_KIND,
    CATALOG_COMPANIES_KIND,
    CATALOG_KIND,
    CATALOG_PRODUCTS_KIND,
    COMPANY_KIND,
    CUSTOMER_GROUP_KIND,
    CUSTOMER_KIND,
    type FlatAssignment,
    isAssignmentKind,
} from './b2bKeys';
import { onceCatalogs, readHeld } from './b2bReads';
import { companyPackForm } from './companiesKind';
import { customerPackForm, groupPackForm, namedGroup } from './customerKinds';
import type { CreatedObject } from './installRecord';
import { eachCopy, type KindContext, readOrNull, segment } from './kindContext';
import type { ProductLookups } from './productLookups';
import { flatAssignments, splitPair } from './sharedCatalogKinds';
import type { CommerceCompany, CommerceCustomer, CommerceCustomerGroup, CommerceSharedCatalog } from '@/types/commerceWire';
import type { SharedCatalogHeld } from '@/types/storePreparation';

type Copies = Map<string, unknown>;
type Reader = (ctx: KindContext, lk: ProductLookups, objects: readonly CreatedObject[]) => Promise<Copies>;

/** A catalog as a pack holds it: its group by code, never another store's ids. */
export async function catalogPackForm(lk: ProductLookups, raw: CommerceSharedCatalog): Promise<{ sharedCatalog: Record<string, unknown> }> {
    return {
        sharedCatalog: {
            name: raw.name,
            type: raw.type,
            store_id: 0,
            tax_class_id: raw.tax_class_id,
            ...(await namedGroup(lk, 'customer_group_id', raw.customer_group_id)),
        },
    };
}

const LISTS: Record<AssignmentKind, keyof SharedCatalogHeld> = {
    [CATALOG_COMPANIES_KIND]: 'companies',
    [CATALOG_CATEGORIES_KIND]: 'categories',
    [CATALOG_PRODUCTS_KIND]: 'products',
};

/** The name a pack gives an assigned member, from this store's id. */
async function memberName(ctx: KindContext, lk: ProductLookups, kind: AssignmentKind, ref: string): Promise<string | undefined> {
    if (kind === CATALOG_COMPANIES_KIND) return (await readOrNull<CommerceCompany>(ctx.get, `company/${segment(ref)}`))?.company_name;
    if (kind === CATALOG_CATEGORIES_KIND) return lk.categoryUrlKey(ref);
    return ref;
}

/** Each recorded pair the catalog still holds, as its flat pair. */
function assignmentReader(kind: AssignmentKind): Reader {
    return async (ctx, lk, objects) => {
        const catalogs = onceCatalogs(ctx.get);
        const heldBy = new Map<string, Promise<SharedCatalogHeld | undefined>>();
        const heldOf = (id: string) => {
            if (!heldBy.has(id)) heldBy.set(id, readHeld(ctx.get, Number(id)).catch(() => undefined));
            return heldBy.get(id) as Promise<SharedCatalogHeld | undefined>;
        };
        return eachCopy(objects, async (o) => {
            const { catalogId, ref } = splitPair(o.id);
            const held = await heldOf(catalogId);
            if (!held?.[LISTS[kind]].map(String).includes(ref)) return undefined;
            const catalog = (await catalogs()).find((c) => String(c.id) === catalogId)?.name;
            const member = await memberName(ctx, lk, kind, ref);
            return catalog && member ? ({ catalog, member } satisfies FlatAssignment) : undefined;
        });
    };
}

/** How each customer and B2B kind's recorded objects are read back. */
export const B2B_READERS: Record<string, Reader> = {
    [CUSTOMER_GROUP_KIND]: (ctx, _lk, objects) =>
        eachCopy(objects, async (o) => {
            const raw = await readOrNull<CommerceCustomerGroup>(ctx.get, `customerGroups/${segment(o.id)}`);
            return raw ? groupPackForm(raw) : undefined;
        }),
    [CUSTOMER_KIND]: (ctx, lk, objects) =>
        eachCopy(objects, async (o) => {
            const raw = await readOrNull<CommerceCustomer>(ctx.get, `customers/${segment(o.id)}`);
            return raw ? customerPackForm(lk, raw) : undefined;
        }),
    [CATALOG_KIND]: async (ctx, lk, objects) => {
        const catalogs = onceCatalogs(ctx.get);
        return eachCopy(objects, async (o) => {
            const raw = (await catalogs()).find((c) => String(c.id) === o.id);
            return raw ? catalogPackForm(lk, raw) : undefined;
        });
    },
    [COMPANY_KIND]: (ctx, _lk, objects) =>
        eachCopy(objects, async (o) => {
            const raw = await readOrNull<CommerceCompany>(ctx.get, `company/${segment(o.id)}`);
            return raw ? companyPackForm(ctx.get, raw) : undefined;
        }),
    [CATALOG_COMPANIES_KIND]: assignmentReader(CATALOG_COMPANIES_KIND),
    [CATALOG_CATEGORIES_KIND]: assignmentReader(CATALOG_CATEGORIES_KIND),
    [CATALOG_PRODUCTS_KIND]: assignmentReader(CATALOG_PRODUCTS_KIND),
};

/** A pack's rows of an assignment kind, one flat pair each; nothing for any other kind. */
export function b2bRowsOf(kind: string, records: unknown): unknown[] | undefined {
    if (!isAssignmentKind(kind)) return undefined;
    try {
        return flatAssignments(kind, records);
    } catch {
        return [];
    }
}
