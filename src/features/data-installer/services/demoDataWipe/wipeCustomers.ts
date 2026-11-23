/**
 * Which of the chosen websites' customers a wipe removes (owner, 2026-10-30; whole websites only
 * since datapack-simplification step 06). Customer accounts are website-scoped in Commerce, so every
 * customer of a chosen website goes, except:
 *
 * | Customer | Done |
 * |---|---|
 * | an install record lists them | kept, and listed |
 * | in a B2B company | sorted out as `inCompany`: they go only with their company (`wipeCompanies.ts`), since Commerce refuses an admin's delete while the company stands |
 *
 * Their orders are never deleted: the orders placed in the chosen websites are closed off
 * (`wipeOrders.ts`), and an order keeps the customer's name and address when the account goes.
 *
 * @module features/data-installer/services/demoDataWipe/wipeCustomers
 */

import { readWebsiteCustomers } from './wipeReads';
import type { WipeScope } from './wipeScope';
import type { CommerceCustomer, CommerceGet } from '@/types/commerceWire';

export interface CustomerDecision {
    remove: CommerceCustomer[];
    /** In a B2B company: `wipeCompanies.ts` decides these. */
    inCompany: CommerceCustomer[];
    /** An install record lists them. */
    kept: CommerceCustomer[];
}

const inCompany = (c: CommerceCustomer): boolean => Number(c.extension_attributes?.company_attributes?.company_id ?? 0) > 0;

/**
 * Read the chosen websites' customers and decide each.
 *
 * @param recorded - customer ids an install record lists: never touched
 */
export async function decideCustomers(get: CommerceGet, scope: WipeScope, recorded: ReadonlySet<string>): Promise<CustomerDecision> {
    const decided: CustomerDecision = { remove: [], inCompany: [], kept: [] };
    for (const websiteId of scope.websiteIds) {
        const theirs = (await readWebsiteCustomers(get, websiteId)).filter((c) => c.id !== undefined);
        decided.kept.push(...theirs.filter((c) => recorded.has(String(c.id))));
        const mine = theirs.filter((c) => !recorded.has(String(c.id)));
        decided.inCompany.push(...mine.filter(inCompany));
        decided.remove.push(...mine.filter((c) => !inCompany(c)));
    }
    return decided;
}
