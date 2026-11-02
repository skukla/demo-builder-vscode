/**
 * Which shared catalogs and customer groups a wipe removes (owner, 2026-11-02). **A shared catalog and
 * its customer group are one unit** (live 2026-10-30, `b2bContainers.ts`): deleting the catalog
 * deletes the group too and moves everyone in it to General. So they are decided as one, and nobody
 * who stays may be in the group.
 *
 * The groups looked at are those the customers and companies going are in, and any a clearing before
 * this one could not finish (`wipeUnfinished.ts`). Nothing else ties a group to the chosen stores: a
 * catalog nobody uses may be another demo's, about to be used, so it is not looked at.
 *
 * | Group, with its catalog if it has one | Done |
 * |---|---|
 * | every customer and company in it is going, and no cart rule that stays names it | removed: the catalog, then the group |
 * | Commerce's own (`NOT LOGGED IN`, `General`, `Wholesale`, `Retailer`, ids 0 to 3) or the public catalog's | never, and not reported: the list of what is never touched says it |
 * | an install record lists it | stays, named |
 * | a customer, company or cart rule that stays uses it | stays, named: deleting it would move them to General |
 * | who uses it could not be read | stays, named |
 *
 * | Read | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | the catalogs | `GET sharedCatalog`: `id`, `name`, `type`, `customer_group_id`, through `readCatalogs` | yes, 2026-09-28 and 2026-10-29 |
 * | a group's name | `GET customerGroups/{id}`: `code` | yes, 2026-09-28 |
 * | its customers | `GET customers/search`, `group_id` eq (the search `b2bContainers.ts` uses) | **no**: every answer is filtered again here |
 * | its companies | `GET company`, `customer_group_id` eq (the search `b2bContainers.ts` uses) | **no**: every answer is filtered again here |
 *
 * @module features/data-installer/services/demoDataWipe/wipeCatalogs
 */

import { PUBLIC_CATALOG_TYPE, filterBy, readCatalogs } from '../demoBuilderEngine/b2bReads';
import { removeCustomerGroup } from '../demoBuilderEngine/customerKinds';
import { readOrNull, segment } from '../demoBuilderEngine/kindContext';
import type { RemovalAccess } from '../demoBuilderEngine/removers';
import { removeCatalog } from '../demoBuilderEngine/sharedCatalogKinds';
import type { GoingCompany } from './wipeCompanies';
import { leftRow } from './wipeLeft';
import { absentAsEmpty, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceCompanyRow, CommerceCustomer, CommerceCustomerGroup, CommerceGet, CommerceSharedCatalog } from '@/types/commerceWire';
import type { WipeLeft } from '@/types/demoDataWipe';

/** Commerce's own groups: 0 `NOT LOGGED IN`, 1 `General`, 2 `Wholesale`, 3 `Retailer`. Magento's fixed ids. */
const BUILT_IN_GROUPS: ReadonlySet<number> = new Set([0, 1, 2, 3]);

/** A customer group a wipe removes, with the shared catalog on it, when it has one. */
export interface GoingGroup {
    groupId: number;
    groupName: string;
    catalog?: { id: number; name: string };
    /** Removed before it, or it stays: a customer or company still there would be moved to General. */
    needs: string[];
}

export interface CatalogDecision {
    remove: GoingGroup[];
    /** What stays, by why, each as { kind, name }. */
    installed: StayingGroup[];
    used: StayingGroup[];
    unread: StayingGroup[];
}

interface StayingGroup {
    kind: 'shared catalogs' | 'customer groups';
    name: string;
}

/** What deciding the catalogs and groups is handed. */
export interface CatalogInputs {
    goingCustomers: readonly CommerceCustomer[];
    goingCompanies: readonly GoingCompany[];
    /** Every rule this wipe does not delete. */
    stayingRules: readonly CommerceSalesRule[];
    recorded: { catalogs: ReadonlySet<string>; groups: ReadonlySet<string> };
    /** Groups a clearing before this one could not finish. */
    unfinishedGroups: readonly number[];
}

function candidateGroups(inputs: CatalogInputs): number[] {
    const ids = [
        ...inputs.goingCustomers.map((c) => c.group_id),
        ...inputs.goingCompanies.map((c) => c.groupId),
        ...inputs.unfinishedGroups,
    ].filter((id): id is number => id !== undefined);
    return [...new Set(ids.map(Number))].filter((id) => !BUILT_IN_GROUPS.has(id));
}

/** Everyone outside the wipe who uses the group. Filtered here: neither search is confirmed from a real answer. */
async function usedOutside(get: CommerceGet, groupId: number, inputs: CatalogInputs): Promise<boolean> {
    const customers = await readAllPages<CommerceCustomer>(get, 'customers/search', filterBy('group_id', groupId));
    const going = new Set(inputs.goingCustomers.map((c) => Number(c.id)));
    if (customers.some((c) => Number(c.group_id) === groupId && !going.has(Number(c.id)))) return true;
    const companies = await absentAsEmpty(() => readAllPages<CommerceCompanyRow>(get, 'company', filterBy('customer_group_id', groupId)));
    const goingCompanies = new Set(inputs.goingCompanies.map((c) => c.id));
    if (companies.some((c) => Number(c.customer_group_id) === groupId && !goingCompanies.has(String(c.id)))) return true;
    return inputs.stayingRules.some((rule) => (rule.customer_group_ids ?? []).map(Number).includes(groupId));
}

/** What must be gone before the group goes: everyone in it who is going. */
function needsOf(groupId: number, inputs: CatalogInputs): string[] {
    return [
        ...inputs.goingCompanies.filter((c) => c.groupId === groupId).map((c) => `company:${c.id}`),
        ...inputs.goingCustomers.filter((c) => Number(c.group_id) === groupId).map((c) => `customer:${c.id}`),
    ];
}

async function judge(get: CommerceGet, groupId: number, catalog: CommerceSharedCatalog | undefined, inputs: CatalogInputs, decided: CatalogDecision): Promise<void> {
    // A catalog names itself as the store calls it; its group was renamed to match when it was made.
    const group = await readOrNull<CommerceCustomerGroup>(get, `customerGroups/${segment(groupId)}`).catch(() => undefined);
    // Gone since: nothing to decide.
    if (group === null && !catalog) return;
    const groupName = group?.code ?? `group ${groupId}`;
    const staying: StayingGroup = catalog ? { kind: 'shared catalogs', name: catalog.name } : { kind: 'customer groups', name: groupName };
    if (group === undefined && !catalog) return void decided.unread.push(staying);
    if (inputs.recorded.groups.has(String(groupId)) || (catalog && inputs.recorded.catalogs.has(String(catalog.id)))) return void decided.installed.push(staying);
    try {
        if (await usedOutside(get, groupId, inputs)) return void decided.used.push(staying);
    } catch {
        return void decided.unread.push(staying);
    }
    decided.remove.push({ groupId, groupName, ...(catalog ? { catalog: { id: Number(catalog.id), name: catalog.name } } : {}), needs: needsOf(groupId, inputs) });
}

/** Decide every group the customers and companies going are in. Reads only. */
export async function decideCatalogs(get: CommerceGet, inputs: CatalogInputs): Promise<CatalogDecision> {
    const decided: CatalogDecision = { remove: [], installed: [], used: [], unread: [] };
    const groups = candidateGroups(inputs);
    if (groups.length === 0) return decided;
    const catalogs = await readCatalogs(get);
    for (const groupId of groups) {
        const catalog = catalogs.find((c) => Number(c.customer_group_id) === groupId);
        if (catalog?.type !== PUBLIC_CATALOG_TYPE) await judge(get, groupId, catalog, inputs, decided);
    }
    return decided;
}

/**
 * Delete a catalog and its group, or a group with no catalog, asking again first: the products and
 * customers before it can take minutes, and nobody may land in General. The group's delete after the
 * catalog's answers 404 when Commerce took it too, as it did live, which counts as gone.
 *
 * @throws Error when a customer or company is in the group now
 */
export async function removeEmptyGroup(commerce: RemovalAccess, group: GoingGroup): Promise<void> {
    const { get, send } = commerce;
    const customers = (await readAllPages<CommerceCustomer>(get, 'customers/search', filterBy('group_id', group.groupId))).filter((c) => Number(c.group_id) === group.groupId);
    const companies = (await absentAsEmpty(() => readAllPages<CommerceCompanyRow>(get, 'company', filterBy('customer_group_id', group.groupId)))).filter((c) => Number(c.customer_group_id) === group.groupId);
    const inIt = customers.length + companies.length;
    if (inIt > 0) throw new Error(`${inIt} customers or companies are still in it, and removing it would move them to General`);
    if (group.catalog) await removeCatalog(send, String(group.catalog.id));
    await removeCustomerGroup(send, String(group.groupId));
}

const rowsOf = (staying: readonly StayingGroup[], why: string): WipeLeft[] =>
    (['shared catalogs', 'customer groups'] as const).map((kind) => leftRow(kind, staying.filter((s) => s.kind === kind).map((s) => s.name), why));

/** What the SC is told about the catalogs and groups that stay. */
export function catalogsLeft(decided: CatalogDecision): WipeLeft[] {
    return [
        ...rowsOf(decided.installed, 'Demo Builder installed them, so removing that datapack decides'),
        ...rowsOf(decided.used, 'a customer, company or cart rule that stays uses them, and removing them would move those customers to General'),
        ...rowsOf(decided.unread, 'who uses them could not be read'),
    ];
}
