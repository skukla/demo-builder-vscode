/**
 * Which B2B companies a wipe removes (owner, 2026-11-02: "It shouldn't leave anything behind"). A
 * company is found through the chosen websites' customers (`company_attributes.company_id`), and goes
 * only when nothing ties it to a store not chosen:
 *
 * | Company | Done |
 * |---|---|
 * | its admin and every customer in it are on wholly chosen websites, none listed by an install record, none with an order in a store not chosen | removed, and those customers with it |
 * | an install record lists it, or a customer in it | stays: the pack's removal takes that |
 * | a customer in it is on a website not chosen, or only partly chosen | stays, and so does every customer in it |
 * | a customer in it has an order in a store not chosen | stays, and so does every customer in it |
 * | who is in it could not be read | stays |
 *
 * | Read | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | who is in it | `GET hierarchy/{id}`, through `companyMembers`, which keeps a company it cannot read | yes, 2026-10-30 (`HIERARCHY_27_DB08`, `HIERARCHY_28_DB08`) |
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
import { leftRow } from './wipeLeft';
import { readCustomerOrderViews } from './wipeReads';
import type { WipeScope } from './wipeScope';
import type { CommerceCompany, CommerceCustomer, CommerceGet } from '@/types/commerceWire';
import type { WipeLeft } from '@/types/demoDataWipe';

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
    /** Names of what stays, by why. */
    installed: string[];
    elsewhere: string[];
    orderedElsewhere: string[];
    unread: string[];
}

/** What deciding the companies is handed. */
export interface CompanyInputs {
    scope: WipeScope;
    /** The chosen websites' customers in a company, as read. */
    inCompany: readonly CommerceCustomer[];
    /** Every customer of a wholly chosen website no install record lists. */
    wholeCustomerIds: ReadonlySet<number>;
    recorded: { companies: ReadonlySet<string>; customers: ReadonlySet<string> };
}

const companyIdOf = (customer: CommerceCustomer): number => Number(customer.extension_attributes?.company_attributes?.company_id ?? 0);

async function readCompany(get: CommerceGet, id: number): Promise<{ company: CommerceCompany; members: number[] } | undefined> {
    try {
        const company = await readOrNull<CommerceCompany>(get, `company/${segment(id)}`);
        return company ? { company, members: await companyMembers(get, String(id)) } : undefined;
    } catch {
        return undefined;
    }
}

/** Why the company stays, once who is in it is known; nothing when it goes. */
async function whyStays(get: CommerceGet, everyone: readonly number[], inputs: CompanyInputs): Promise<Exclude<keyof CompanyDecision, 'remove'> | undefined> {
    if (everyone.some((id) => inputs.recorded.customers.has(String(id)))) return 'installed';
    if (everyone.some((id) => !inputs.wholeCustomerIds.has(id))) return 'elsewhere';
    try {
        const orders = await readCustomerOrderViews(get, everyone);
        return orders.some((order) => !inputs.scope.viewIds.has(order.viewId)) ? 'orderedElsewhere' : undefined;
    } catch {
        return 'unread';
    }
}

async function judge(get: CommerceGet, id: number, inputs: CompanyInputs, decided: CompanyDecision): Promise<void> {
    const read = await readCompany(get, id);
    const name = read?.company.company_name ?? `company ${id}`;
    if (inputs.recorded.companies.has(String(id))) return void decided.installed.push(name);
    const admin = read?.company.super_user_id;
    if (read === undefined || admin === undefined) return void decided.unread.push(name);
    const everyone = [...new Set([Number(admin), ...read.members])];
    const why = await whyStays(get, everyone, inputs);
    if (why) return void decided[why].push(name);
    decided.remove.push({ id: String(id), name, memberIds: everyone.map(String), ...(read.company.customer_group_id === undefined ? {} : { groupId: Number(read.company.customer_group_id) }) });
}

/** Decide every company the chosen websites' customers name. Reads only. */
export async function decideCompanies(get: CommerceGet, inputs: CompanyInputs): Promise<CompanyDecision> {
    const decided: CompanyDecision = { remove: [], installed: [], elsewhere: [], orderedElsewhere: [], unread: [] };
    const ids = [...new Set(inputs.inCompany.map(companyIdOf))];
    for (const id of ids) await judge(get, id, inputs, decided);
    return decided;
}

/** What the SC is told about the companies that stay. */
export function companiesLeft(decided: CompanyDecision): WipeLeft[] {
    return [
        leftRow('companies', decided.installed, 'Demo Builder installed them or a customer in them, so removing that datapack decides'),
        leftRow('companies', decided.elsewhere, 'a customer in them is on a website not chosen'),
        leftRow('companies', decided.orderedElsewhere, 'a customer in them has an order in a store not chosen'),
        leftRow('companies', decided.unread, 'who is in them could not be read'),
    ];
}
