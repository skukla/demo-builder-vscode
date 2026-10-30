/**
 * Which of the chosen websites' customers a wipe removes (owner, 2026-10-30). Customer accounts are
 * website-scoped in Commerce, so on a website only partly chosen they are tied to a store by where
 * they were made:
 *
 * | Customer | Done |
 * |---|---|
 * | of a wholly chosen website | removed |
 * | of a partly chosen website, made in a chosen store's view (`store_id`, else `created_in` by the view's name) and with no order in a store not chosen | removed |
 * | made in a store not chosen, or with an order there | left: they belong to that store too |
 * | where they were made not said (`store_id` 0, "Admin") | left |
 * | in a B2B company (an admin cannot be deleted while its company stands) | left |
 *
 * Their orders are never deleted: the orders placed in the chosen stores are closed off
 * (`wipeOrders.ts`), and an order keeps the customer's name and address when the account goes.
 *
 * @module features/data-installer/services/demoDataWipe/wipeCustomers
 */

import { readCustomerOrderViews, readWebsiteCustomers } from './wipeReads';
import type { WipeScope } from './wipeScope';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { CommerceCustomer, CommerceGet } from '@/types/commerceWire';

export interface CustomerDecision {
    remove: CommerceCustomer[];
    inCompany: CommerceCustomer[];
    /** Made in a store not chosen, or ordered in one. */
    elsewhere: CommerceCustomer[];
    /** Where they were made is not said. */
    unknownStore: CommerceCustomer[];
}

const inCompany = (c: CommerceCustomer): boolean => Number(c.extension_attributes?.company_attributes?.company_id ?? 0) > 0;

/** The view a customer was made in: `store_id` when it names one of the website's views, else the one view named `created_in`. */
function viewOf(customer: CommerceCustomer, structure: CommerceStoreStructure): number | undefined {
    const views = structure.storeViews.filter((v) => Number(v.website_id) === Number(customer.website_id));
    const byId = views.find((v) => Number(v.id) === Number(customer.store_id));
    if (byId) return Number(byId.id);
    const byName = views.filter((v) => v.name === customer.created_in);
    return byName.length === 1 ? Number(byName[0].id) : undefined;
}

/** Sort a partly chosen website's customers by where they were made. */
function sortPartial(customers: readonly CommerceCustomer[], scope: WipeScope, structure: CommerceStoreStructure, decided: CustomerDecision): CommerceCustomer[] {
    const candidates: CommerceCustomer[] = [];
    for (const customer of customers) {
        const view = viewOf(customer, structure);
        if (view === undefined) decided.unknownStore.push(customer);
        else if (!scope.viewIds.has(view)) decided.elsewhere.push(customer);
        else candidates.push(customer);
    }
    return candidates;
}

/**
 * Read the chosen websites' customers and decide each.
 *
 * @param recorded - customer ids an install record lists: never touched
 */
export async function decideCustomers(get: CommerceGet, scope: WipeScope, structure: CommerceStoreStructure, recorded: Set<string>): Promise<CustomerDecision> {
    const decided: CustomerDecision = { remove: [], inCompany: [], elsewhere: [], unknownStore: [] };
    const partial: CommerceCustomer[] = [];
    for (const websiteId of [...scope.websites.whole, ...scope.websites.part]) {
        const mine = (await readWebsiteCustomers(get, websiteId)).filter((c) => c.id !== undefined && !recorded.has(String(c.id)));
        decided.inCompany.push(...mine.filter(inCompany));
        const free = mine.filter((c) => !inCompany(c));
        if (scope.websites.whole.includes(websiteId)) decided.remove.push(...free);
        else partial.push(...sortPartial(free, scope, structure, decided));
    }
    const orderedElsewhere = new Set(
        (await readCustomerOrderViews(get, partial.map((c) => Number(c.id)))).filter((o) => !scope.viewIds.has(o.viewId)).map((o) => o.customerId),
    );
    for (const customer of partial) (orderedElsewhere.has(Number(customer.id)) ? decided.elsewhere : decided.remove).push(customer);
    return decided;
}
