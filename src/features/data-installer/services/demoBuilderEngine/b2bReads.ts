/**
 * The reads the customer and B2B kinds share (datapack-engine step 08): find a customer, a customer
 * group, a company or a shared catalog by the name a pack gives it, and what a shared catalog holds.
 *
 * Every search is one `eq` filter on the field a pack names the thing by, as the service searches
 * (`.rptc/research/datapack-engine/customers-b2b-spec.md` §0), and the answer is matched exactly
 * here, where the service took the first item: a near name never stands in for the one asked.
 *
 * | Read | Endpoint | Field read | Captured live? |
 * |---|---|---|---|
 * | a customer by email | `GET customers/search` (`email` eq) | `items[].id`, `email`, `website_id` | no (the item is `GET customers/{id}`'s shape, which is) |
 * | a group by code | `GET customerGroups/search` (`customer_group_code` eq, the field the service and the product lookups search; a filter on `code` answers HTTP 400 "Field code can't be used in filter", live 2026-10-30, pinned in `customerKinds.test.ts`) | `items[].id`, `code` | no (the item is `GET customerGroups/{id}`'s shape, which is) |
 * | a company by name or email | `GET company` (`company_name` / `company_email` eq) | `items[].id`, `company_name`, `company_email` | no |
 * | every shared catalog | `GET sharedCatalog` | `items[].id`, `name`, `type`, `customer_group_id` | yes, one filtered page (2026-09-28); the unfiltered list read live 2026-10-29 (step 06) |
 * | what a catalog holds | `GET sharedCatalog/{id}/companies` (a JSON-encoded string of ids), `/products` (SKUs), `/categories` (ids) | the lists | yes, 2026-10-30 (`CATALOG_19_…_DB08` in `commerceB2bFixtures.ts`) |
 *
 * @module features/data-installer/services/demoBuilderEngine/b2bReads
 */

import { CommerceReadError, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import { readHeld } from '@/features/app-builder/services/storePreparation/sharedCatalogsFix';
import type { CommerceCompanyRow, CommerceCustomer, CommerceCustomerGroup, CommerceGet, CommerceSharedCatalog } from '@/types/commerceWire';

export { readHeld };

const NOT_FOUND = 404;

/** One `eq` filter, its value escaped, as `readAllPages` takes its criteria. */
export function filterBy(field: string, value: string | number): string {
    return (
        `&searchCriteria[filterGroups][0][filters][0][field]=${field}` +
        `&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(String(value))}` +
        '&searchCriteria[filterGroups][0][filters][0][conditionType]=eq'
    );
}

const sameText = (a: string | undefined, b: string): boolean => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/** Every customer with this email, on any website. Commerce compares emails without case. */
export async function customersByEmail(get: CommerceGet, email: string): Promise<CommerceCustomer[]> {
    const found = await readAllPages<CommerceCustomer>(get, 'customers/search', filterBy('email', email));
    return found.filter((c) => sameText(c.email, email));
}

/**
 * The customer with this email on a website, or, with no website named, on any.
 *
 * @param websiteId - the install target's website; a customer elsewhere is another account
 */
export async function customerByEmail(get: CommerceGet, email: string, websiteId?: number): Promise<CommerceCustomer | undefined> {
    const found = await customersByEmail(get, email);
    if (websiteId === undefined) return found[0];
    return found.find((c) => c.website_id === websiteId);
}

/** The customer group with this code, exactly. */
export async function groupByCode(get: CommerceGet, code: string): Promise<CommerceCustomerGroup | undefined> {
    const found = await readAllPages<CommerceCustomerGroup>(get, 'customerGroups/search', filterBy('customer_group_code', code));
    return found.find((g) => g.code === code);
}

/** The company with this name, or failing that this email, exactly. */
export async function companyByName(get: CommerceGet, name: string, email?: string): Promise<CommerceCompanyRow | undefined> {
    const named = (await readAllPages<CommerceCompanyRow>(get, 'company', filterBy('company_name', name))).find((c) => c.company_name === name);
    if (named || !email) return named;
    return (await readAllPages<CommerceCompanyRow>(get, 'company', filterBy('company_email', email))).find((c) => sameText(c.company_email, email));
}

/** Every shared catalog the store has; none on a store without B2B, which answers the route 404. */
export async function readCatalogs(get: CommerceGet): Promise<CommerceSharedCatalog[]> {
    try {
        return await readAllPages<CommerceSharedCatalog>(get, 'sharedCatalog');
    } catch (error) {
        if (error instanceof CommerceReadError && error.status === NOT_FOUND) return [];
        throw error;
    }
}

/** Commerce's own public catalog, which every company sits in until another takes it. */
export const PUBLIC_CATALOG_TYPE = 1;

/** Shared catalogs read once, however many rows ask. */
export function onceCatalogs(get: CommerceGet): () => Promise<CommerceSharedCatalog[]> {
    let read: Promise<CommerceSharedCatalog[]> | undefined;
    return () => (read ??= readCatalogs(get));
}
