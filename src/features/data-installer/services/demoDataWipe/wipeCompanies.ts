/**
 * Which B2B companies a wipe removes (owner, 2026-11-02: "It shouldn't leave anything behind"). A
 * company is found through the chosen websites' customers (`company_attributes.company_id`), and goes
 * only when nothing ties it to a website not chosen:
 *
 * | Company | Done |
 * |---|---|
 * | its admin and every customer in it are on chosen websites, none listed by an install record, none with an order in a store of a website not chosen | removed, and those customers with it |
 * | an install record lists it, or a customer in it | kept, with everyone in it |
 * | a customer in it is on a website not chosen, or has an order in one | kept, with everyone in it |
 * | the company the customer names is not there (Commerce answers 404) | nothing to decide: its customers stay |
 *
 * A read that fails, or a company whose admin Commerce does not name, leaves EVERY company alone
 * (`failed`): the plan marks companies as not read, and nobody in a company goes.
 *
 * | Read | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | who is in it | `GET hierarchy/{id}`, through `companyMembers` | yes, 2026-10-30 (`HIERARCHY_27_DB08`, `HIERARCHY_28_DB08`) |
 * | its admin, group and name | `GET company/{id}`: `super_user_id`, `customer_group_id`, `company_name` | yes, 2026-10-30 (`COMPANY_27_DB08`) |
 * | where they ordered | `GET orders`, `customer_id` in: `store_id`, through `readCustomerOrderViews` | **no** |
 *
 * **Not handled:** a customer in two companies. `company_attributes` names one, and no read here finds
 * the other, so Commerce's refusal of that delete is what the SC would see.
 *
 * @module features/data-installer/services/demoDataWipe/wipeCompanies
 */

import { companyMembers } from '../demoBuilderEngine/companiesKind';
import { readOrNull, segment } from '../demoBuilderEngine/kindContext';
import { readCustomerOrderViews } from './wipeReads';
import type { WipeScope } from './wipeScope';
import type { CommerceCompany, CommerceCustomer, CommerceGet } from '@/types/commerceWire';

/** A company a wipe removes, and everyone who goes with it. */
export interface GoingCompany {
    id: string;
    name: string;
    /** Every customer in it, its admin first: Commerce refuses the admin's delete until the company is gone. */
    memberIds: string[];
    groupId?: number;
}

export interface CompanyDecision {
    remove: GoingCompany[];
    /** Names of the companies that stay. */
    kept: string[];
    /** What stopped a read: every company is then left alone. */
    failed?: unknown;
}

/** What deciding the companies is handed. */
export interface CompanyInputs {
    scope: WipeScope;
    /** The chosen websites' customers in a company, as read. */
    inCompany: readonly CommerceCustomer[];
    /** Every customer of a chosen website no install record lists. */
    wholeCustomerIds: ReadonlySet<number>;
    recorded: { companies: ReadonlySet<string>; customers: ReadonlySet<string> };
}

const companyIdOf = (customer: CommerceCustomer): number => Number(customer.extension_attributes?.company_attributes?.company_id ?? 0);

/** Whether the company stays, once who is in it is known. */
async function stays(get: CommerceGet, everyone: readonly number[], inputs: CompanyInputs): Promise<boolean> {
    if (everyone.some((id) => inputs.recorded.customers.has(String(id)) || !inputs.wholeCustomerIds.has(id))) return true;
    const orders = await readCustomerOrderViews(get, everyone);
    return orders.some((order) => !inputs.scope.viewIds.has(order.viewId));
}

async function judge(get: CommerceGet, id: number, inputs: CompanyInputs, decided: CompanyDecision): Promise<void> {
    const company = await readOrNull<CommerceCompany>(get, `company/${segment(id)}`);
    // Not there: nothing to decide, and its customers stay with the company they name.
    if (company === null) return;
    const name = company.company_name ?? `company ${id}`;
    if (inputs.recorded.companies.has(String(id))) return void decided.kept.push(name);
    const admin = company.super_user_id;
    if (admin === undefined) throw new Error(`Commerce did not name the admin of the company ${name}.`);
    const everyone = [...new Set([Number(admin), ...(await companyMembers(get, String(id)))])];
    if (await stays(get, everyone, inputs)) return void decided.kept.push(name);
    decided.remove.push({ id: String(id), name, memberIds: everyone.map(String), ...(company.customer_group_id === undefined ? {} : { groupId: Number(company.customer_group_id) }) });
}

/** Decide every company the chosen websites' customers name. Reads only; a read that fails leaves them all. */
export async function decideCompanies(get: CommerceGet, inputs: CompanyInputs): Promise<CompanyDecision> {
    const decided: CompanyDecision = { remove: [], kept: [] };
    const ids = [...new Set(inputs.inCompany.map(companyIdOf))];
    try {
        for (const id of ids) await judge(get, id, inputs, decided);
    } catch (error) {
        return { remove: [], kept: [...decided.kept, ...decided.remove.map((c) => c.name)], failed: error };
    }
    return decided;
}
