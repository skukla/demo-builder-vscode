/**
 * The container rule for the customer and B2B kinds (datapack-engine step 08; owner 2026-10-29,
 * as step 05's for categories and sets): a company, shared catalog or customer group this engine
 * made is kept while it holds anything the engine did not make or is not taking out in the same
 * removal. `decideRemovals` (`removers.ts`) asks here, so a whole-pack removal, a reinstall and the
 * preview decide one way.
 *
 * | Container | What it holds | Read | Captured live? |
 * |---|---|---|---|
 * | a company | its customers, but its own admin (`previous.superUserId`) | `GET hierarchy/{id}`, nodes with `entity_type` `customer` | yes, 2026-10-30 (`HIERARCHY_27_DB08`) |
 * | a shared catalog | companies, products, categories beyond what it held when made (`previous.held`) | `readHeld` | yes, 2026-10-30 (`CATALOG_19_…_DB08`) |
 * | a customer group | customers (deleting it would move them to another group), companies and shared catalogs that use it | `GET customers/search` (`group_id`), `GET company` (`customer_group_id`), the catalog list | catalog list only |
 *
 * **A shared catalog and its customer group are one unit** (live, 2026-10-30, scratch-1028):
 * making a catalog on a group renames the group to the catalog's name, and deleting the catalog
 * deletes the group too, moving its customers to "Default (General)". So the two go or stay
 * together: the catalog's group is read from `GET sharedCatalog/{id}`, field `customer_group_id`
 * (typed to the list item's shape, which was captured; this read itself was not), and if either
 * holds something of the SC's, both are kept, in one line. A catalog whose group is not going with
 * it is kept, since deleting it would take that group too.
 *
 * Every kept container is named as the store calls it now: `GET company/{id}` (`company_name`),
 * `GET sharedCatalog/{id}` (`name`), `GET customerGroups/{id}` (`code`), else the record's key.
 *
 * A read that fails keeps the container, rather than delete what might be the SC's.
 *
 * @module features/data-installer/services/demoBuilderEngine/b2bContainers
 */

import { CATALOG_CATEGORIES_KIND, CATALOG_COMPANIES_KIND, CATALOG_KIND, CATALOG_PRODUCTS_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND, CUSTOMER_KIND } from './b2bKeys';
import { filterBy, readCatalogs, readHeld } from './b2bReads';
import { companyMembers } from './companiesKind';
import type { CreatedObject } from './installRecord';
import { readOrNull, segment } from './kindContext';
import type { KeptContainer } from './removers';
import { andList } from '@/core/utils/andList';
import { CommerceReadError, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceCompanyRow, CommerceCustomer, CommerceGet, CommerceSharedCatalog } from '@/types/commerceWire';
import type { SharedCatalogHeld } from '@/types/storePreparation';

const NOT_FOUND = 404;

/** What the same removal is taking: whether an object is in it, and that object. */
export interface Taking {
    has(kind: string, id: string): boolean;
    find(kind: string, id: string): CreatedObject | undefined;
}

/** What a container holds of the SC's, counted ("1 customer"); empty when nothing. */
type Finding = { parts: string[] } | { unread: true };

const counted = (n: number, one: string, many: string): string[] => (n === 0 ? [] : [`${n} ${n === 1 ? one : many}`]);
const holding = (parts: string[]): string => `holds ${andList(parts)} you added`;
const holds = (finding: Finding): boolean => 'unread' in finding || finding.parts.length > 0;

/** Read what a container holds; a 404 is "nothing" (it is gone), any other failure "unread". */
async function find(read: () => Promise<string[]>): Promise<Finding> {
    try {
        return { parts: await read() };
    } catch (error) {
        if (error instanceof CommerceReadError && error.status === NOT_FOUND) return { parts: [] };
        return { unread: true };
    }
}

/** A thing's name in the store now, or the record's key when it cannot be read. */
async function nameNow(get: CommerceGet, path: string, field: string, fallback: string): Promise<string> {
    try {
        const value = (await readOrNull<Record<string, unknown>>(get, path))?.[field];
        return typeof value === 'string' && value !== '' ? value : fallback;
    } catch {
        return fallback;
    }
}

const fallbackName = (object: CreatedObject): string => object.key ?? object.id;

async function companyHolds(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<string[]> {
    const members = await companyMembers(get, object.id);
    const admin = (object.previous as { superUserId?: number } | undefined)?.superUserId;
    return counted(members.filter((id) => id !== admin && !taking.has(CUSTOMER_KIND, String(id))).length, 'customer', 'customers');
}

const EMPTY: SharedCatalogHeld = { companies: [], products: [], categories: [] };

async function catalogHolds(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<string[]> {
    const now = await readHeld(get, Number(object.id));
    const before = (object.previous as { held?: SharedCatalogHeld } | undefined)?.held ?? EMPTY;
    const beyond = <T>(list: T[], had: T[], kind: string) => list.filter((m) => !had.includes(m) && !taking.has(kind, `${object.id}/${m}`));
    return [
        ...counted(beyond(now.products, before.products, CATALOG_PRODUCTS_KIND).length, 'product', 'products'),
        ...counted(beyond(now.categories, before.categories, CATALOG_CATEGORIES_KIND).length, 'category', 'categories'),
        ...counted(beyond(now.companies, before.companies, CATALOG_COMPANIES_KIND).length, 'company', 'companies'),
    ];
}

async function groupHolds(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<string[]> {
    const id = Number(object.id);
    const customers = (await readAllPages<CommerceCustomer>(get, 'customers/search', filterBy('group_id', id))).filter((c) => !taking.has(CUSTOMER_KIND, String(c.id)));
    const companies = (await readAllPages<CommerceCompanyRow>(get, 'company', filterBy('customer_group_id', id))).filter((c) => !taking.has(COMPANY_KIND, String(c.id)));
    const catalogs = (await readCatalogs(get)).filter((c) => c.customer_group_id === id && !taking.has(CATALOG_KIND, String(c.id)));
    return [
        ...counted(customers.length, 'customer', 'customers'),
        ...counted(companies.length, 'company', 'companies'),
        ...counted(catalogs.length, 'shared catalog', 'shared catalogs'),
    ];
}

/** A company or a group on its own: its finding, its name now, and what its line says unread. */
const ALONE: Record<string, { kind: KeptContainer['kind']; holds: typeof companyHolds; name: (o: CreatedObject) => string; unread: string; field: string }> = {
    [COMPANY_KIND]: { kind: 'company', holds: companyHolds, name: (o) => `company/${segment(o.id)}`, field: 'company_name', unread: 'Demo Builder could not read who is in it' },
    [CUSTOMER_GROUP_KIND]: { kind: 'customer group', holds: groupHolds, name: (o) => `customerGroups/${segment(o.id)}`, field: 'code', unread: 'Demo Builder could not read who uses it' },
};

/** Whether a kind is one of the containers this file decides. */
export const isB2bContainer = (kind: string): boolean => kind in ALONE || kind === CATALOG_KIND;

const kept = (object: CreatedObject, kind: KeptContainer['kind'], name: string, reason: string, partner?: KeptContainer['with']): KeptContainer => ({
    object,
    kind,
    name,
    count: 0,
    holds: 'thing',
    reason,
    ...(partner ? { with: partner } : {}),
});

/** "the shared catalog holds 1 product you added", or that it could not be read. */
function said(subject: string, finding: Finding, unread: string): string[] {
    if ('unread' in finding) return [`Demo Builder could not read ${unread} the ${subject}`];
    return finding.parts.length > 0 ? [`the ${subject} ${holding(finding.parts)}`] : [];
}

/** A shared catalog and the group it uses, decided as one (see the module comment). */
async function catalogUnit(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<KeptContainer | undefined> {
    let catalog: CommerceSharedCatalog | null;
    try {
        catalog = await readOrNull<CommerceSharedCatalog>(get, `sharedCatalog/${segment(object.id)}`);
    } catch {
        return kept(object, 'shared catalog', fallbackName(object), 'Demo Builder could not read it');
    }
    if (!catalog) return undefined;
    const name = catalog.name || fallbackName(object);
    const own = await find(() => catalogHolds(get, object, taking));
    const groupId = catalog.customer_group_id;
    const alone = 'unread' in own ? 'Demo Builder could not read what is in it' : `it ${holding(own.parts)}`;
    if (!groupId) return holds(own) ? kept(object, 'shared catalog', name, alone) : undefined;
    const group = taking.find(CUSTOMER_GROUP_KIND, String(groupId));
    const groupName = await nameNow(get, `customerGroups/${segment(groupId)}`, 'code', group ? fallbackName(group) : String(groupId));
    if (!group) {
        return kept(object, 'shared catalog', name, holds(own) ? alone : `deleting it would delete the customer group ${groupName} too, which is staying`);
    }
    const theirs = await find(() => groupHolds(get, group, taking));
    if (!holds(own) && !holds(theirs)) return undefined;
    const reason = [...said('shared catalog', own, 'what is in'), ...said('customer group', theirs, 'who uses')].join(', and ');
    return kept(object, 'shared catalog', name, reason, { object: group, kind: 'customer group', name: groupName });
}

/**
 * What a company, catalog or group holds that is not being taken out with it, or undefined. A
 * catalog's answer may carry its customer group (`with`), kept with it.
 */
export async function b2bHeldByOthers(get: CommerceGet, object: CreatedObject, taking: Taking): Promise<KeptContainer | undefined> {
    if (object.kind === CATALOG_KIND) return catalogUnit(get, object, taking);
    const container = ALONE[object.kind];
    if (!container) return undefined;
    const finding = await find(() => container.holds(get, object, taking));
    if (!holds(finding)) return undefined;
    const name = await nameNow(get, container.name(object), container.field, fallbackName(object));
    return kept(object, container.kind, name, 'unread' in finding ? container.unread : `it ${holding(finding.parts)}`);
}
