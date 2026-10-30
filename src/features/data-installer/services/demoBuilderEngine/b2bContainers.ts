/**
 * The container rule for the customer and B2B kinds (datapack-engine step 08; owner 2026-10-29,
 * as step 05's for categories and sets): a company, shared catalog or customer group this engine
 * made is kept while it holds anything the engine did not make or is not taking out in the same
 * removal. `decideRemovals` (`removers.ts`) asks here, so a whole-pack removal, a reinstall and the
 * preview decide one way.
 *
 * | Container | What it holds | Read | Captured live? |
 * |---|---|---|---|
 * | a company | its customers, but its own admin (`previous.superUserId`) | `GET hierarchy/{id}`, nodes with `entity_type` `customer` | no |
 * | a shared catalog | companies, products, categories beyond what it held when made (`previous.held`) | `readHeld` | read live, not recorded |
 * | a customer group | customers (deleting it would move them to another group), companies and shared catalogs that use it | `GET customers/search` (`group_id`), `GET company` (`customer_group_id`), the catalog list | catalog list only |
 *
 * A read that fails keeps the container, rather than delete what might be the SC's: a company
 * whose hierarchy cannot be read says so in its line.
 *
 * @module features/data-installer/services/demoBuilderEngine/b2bContainers
 */

import { CATALOG_CATEGORIES_KIND, CATALOG_COMPANIES_KIND, CATALOG_KIND, CATALOG_PRODUCTS_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND, CUSTOMER_KIND } from './b2bKeys';
import { filterBy, readCatalogs, readHeld } from './b2bReads';
import { companyMembers } from './companiesKind';
import type { CreatedObject } from './installRecord';
import type { KeptContainer } from './removers';
import { andList } from '@/core/utils/andList';
import { CommerceReadError, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceCompanyRow, CommerceCustomer, CommerceGet } from '@/types/commerceWire';
import type { SharedCatalogHeld } from '@/types/storePreparation';

const NOT_FOUND = 404;

/** Whether an object of a kind and id is being taken out in the same removal. */
type Taking = (kind: string, id: string) => boolean;

const counted = (n: number, one: string, many: string): string[] => (n === 0 ? [] : [`${n} ${n === 1 ? one : many}`]);

/** A kept container, its one reason in words. */
function keptAs(object: CreatedObject, kind: KeptContainer['kind'], reason: string): KeptContainer {
    return { object, kind, name: object.key ?? object.id, count: 0, holds: 'thing', reason };
}

const holding = (parts: string[]): string => `it holds ${andList(parts)} you added`;

async function heldByCompany(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<KeptContainer | undefined> {
    const members = await companyMembers(get, object.id);
    const admin = (object.previous as { superUserId?: number } | undefined)?.superUserId;
    const others = members.filter((id) => id !== admin && !taking(CUSTOMER_KIND, String(id)));
    return others.length === 0 ? undefined : keptAs(object, 'company', holding(counted(others.length, 'customer', 'customers')));
}

const EMPTY: SharedCatalogHeld = { companies: [], products: [], categories: [] };

async function heldByCatalog(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<KeptContainer | undefined> {
    const now = await readHeld(get, Number(object.id));
    const before = (object.previous as { held?: SharedCatalogHeld } | undefined)?.held ?? EMPTY;
    const beyond = <T>(list: T[], had: T[], kind: string) => list.filter((m) => !had.includes(m) && !taking(kind, `${object.id}/${m}`));
    const products = beyond(now.products, before.products, CATALOG_PRODUCTS_KIND);
    const categories = beyond(now.categories, before.categories, CATALOG_CATEGORIES_KIND);
    const companies = beyond(now.companies, before.companies, CATALOG_COMPANIES_KIND);
    const parts = [...counted(products.length, 'product', 'products'), ...counted(categories.length, 'category', 'categories'), ...counted(companies.length, 'company', 'companies')];
    return parts.length === 0 ? undefined : keptAs(object, 'shared catalog', holding(parts));
}

async function heldByGroup(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<KeptContainer | undefined> {
    const id = Number(object.id);
    const customers = (await readAllPages<CommerceCustomer>(get, 'customers/search', filterBy('group_id', id))).filter((c) => !taking(CUSTOMER_KIND, String(c.id)));
    const companies = (await readAllPages<CommerceCompanyRow>(get, 'company', filterBy('customer_group_id', id))).filter((c) => !taking(COMPANY_KIND, String(c.id)));
    const catalogs = (await readCatalogs(get)).filter((c) => c.customer_group_id === id && !taking(CATALOG_KIND, String(c.id)));
    const parts = [
        ...counted(customers.length, 'customer', 'customers'),
        ...counted(companies.length, 'company', 'companies'),
        ...counted(catalogs.length, 'shared catalog', 'shared catalogs'),
    ];
    return parts.length === 0 ? undefined : keptAs(object, 'customer group', holding(parts));
}

type Decide = (get: CommerceGet, object: CreatedObject, taking: Taking) => Promise<KeptContainer | undefined>;

/** Each container, how it is read, and what its line says when it cannot be. */
const CONTAINERS: Record<string, { kind: KeptContainer['kind']; decide: Decide; unread: string }> = {
    [COMPANY_KIND]: { kind: 'company', decide: heldByCompany, unread: 'Demo Builder could not read who is in it' },
    [CATALOG_KIND]: { kind: 'shared catalog', decide: heldByCatalog, unread: 'Demo Builder could not read what is in it' },
    [CUSTOMER_GROUP_KIND]: { kind: 'customer group', decide: heldByGroup, unread: 'Demo Builder could not read who uses it' },
};

/** Whether a kind is one of the containers this file decides. */
export const isB2bContainer = (kind: string): boolean => kind in CONTAINERS;

/**
 * What a company, catalog or group holds that is not being taken out with it, or undefined.
 *
 * @param taking - whether an object is in the same removal
 */
export async function b2bHeldByOthers(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<KeptContainer | undefined> {
    const container = CONTAINERS[object.kind];
    if (!container) return undefined;
    try {
        return await container.decide(get, object, taking);
    } catch (error) {
        // Already gone: nothing of anyone's left in it. Anything else: keep it, and say why.
        if (error instanceof CommerceReadError && error.status === NOT_FOUND) return undefined;
        return keptAs(object, container.kind, container.unread);
    }
}
