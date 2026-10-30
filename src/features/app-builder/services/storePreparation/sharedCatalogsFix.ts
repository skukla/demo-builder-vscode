/**
 * The `company-shared-catalogs` fix (AB-77): a custom shared catalog per company the
 * `companies-have-own-catalogs` check finds without one of its own (a company in no catalog,
 * or sharing a custom catalog with another), created with `POST sharedCatalog` and assigned
 * with `POST sharedCatalog/<id>/assignCompanies` (the routes and bodies from the data
 * installer's endpoint list and processors, and Magento's SharedCatalogInterface). A company
 * on the public catalog is left there: that is where a company without its own prices belongs.
 *
 * The undo unassigns the company (Commerce puts it back on the public catalog) and deletes
 * only a catalog this run created, and only while it holds nothing the fix did not put there
 * (datapack-engine step 06, AB-83). The apply reads back what the new catalog holds (its
 * companies, products and categories) and records it; the undo reads the same three lists and
 * hands what is there beyond that to the one rule (`decideOwnedChange`). A catalog holding more
 * is kept, with the company still taken out of it, and the undo says so in one line. A kept
 * catalog stays on the step's record (`remaining`), so a later undo deletes it once it is empty.
 *
 * The three reads are `GET sharedCatalog/{id}/companies`, `/products` and `/categories`, read
 * live on 2026-10-29: companies come as a JSON-encoded string of ids (`"[\"23\"]"`), products as
 * SKUs, categories as ids. Any other shape refuses the undo of that catalog rather than delete it.
 *
 * **Its customer group goes with it** (live, 2026-10-30, scratch-1028, the datapack engine's
 * removal): deleting a shared catalog deletes the customer group it uses and moves that group's
 * customers to General. So the catalog is also kept while its group holds a customer the fix did
 * not put there: one not in the company the fix assigned (its `company_attributes.company_id`,
 * read live 2026-10-30, `COMPANY_ADMIN_ATTRIBUTES_DB08`). The group is the catalog's own
 * `customer_group_id` from `GET sharedCatalog/{id}` (typed to the list item, which was captured;
 * this read itself was not), and its customers a `GET customers/search` on `group_id` (not
 * captured). Every read comes first, so a read that fails writes nothing. Each line names the
 * catalog as the store calls it now.
 *
 * @module features/app-builder/services/storePreparation/sharedCatalogsFix
 */

import { errorText, type FixApplied, type FixDeps, type FixPreview, type FixUndone, type StepFix } from './fixContract';
import { andList } from '@/core/utils/andList';
import { decideOwnedChange } from '@/core/utils/ownedChange';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import { fingerprintRow } from '@/features/data-installer/services/demoBuilderEngine/fingerprint';
import type {
    CommerceCompanyList,
    CommerceCompanyRow,
    CommerceCustomer,
    CommerceSharedCatalog,
    CommerceSharedCatalogList,
    CommerceGet,
} from '@/types/commerceWire';
import type { SharedCatalogHeld, SharedCatalogsStepRecord, StorePreparationStepRecord } from '@/types/storePreparation';

const COMPANIES_PATH = 'company/?searchCriteria[pageSize]=200&fields=items[id,company_name,customer_group_id]';
const CATALOGS_PATH = 'sharedCatalog/?searchCriteria[pageSize]=200&fields=items[id,name,customer_group_id,type]';
const PUBLIC_CATALOG = 1;
const CUSTOM_CATALOG = 0;
/** Commerce's "Retail Customer" tax class, the one a new shared catalog takes in the Admin. */
const RETAIL_TAX_CLASS = 3;

const nameOf = (company: CommerceCompanyRow): string => company.company_name ?? `company ${company.id}`;

/** The companies that need a catalog of their own: in none, or sharing a custom one (all but its first). */
export function companiesNeedingCatalogs(companies: CommerceCompanyRow[], catalogs: CommerceSharedCatalog[]): CommerceCompanyRow[] {
    const byGroup = new Map(catalogs.map((catalog) => [catalog.customer_group_id, catalog]));
    const seen = new Set<number>();
    const needing: CommerceCompanyRow[] = [];
    for (const company of companies) {
        const catalog = byGroup.get(company.customer_group_id);
        if (!catalog) needing.push(company);
        else if (catalog.type !== PUBLIC_CATALOG && catalog.id !== undefined) {
            if (seen.has(catalog.id)) needing.push(company);
            seen.add(catalog.id);
        }
    }
    return needing;
}

async function readNeeding(get: CommerceGet): Promise<CommerceCompanyRow[]> {
    const companies = ((await get(COMPANIES_PATH)) as CommerceCompanyList | null)?.items ?? [];
    const catalogs = ((await get(CATALOGS_PATH)) as CommerceSharedCatalogList | null)?.items ?? [];
    return companiesNeedingCatalogs(companies, catalogs);
}

const catalogName = (company: CommerceCompanyRow): string => `${nameOf(company)} Catalog`;

export const sharedCatalogsFix: StepFix = {
    async preview(deps): Promise<FixPreview> {
        const needing = await readNeeding(deps.commerce.get);
        return { changes: needing.map((company) => `Create the shared catalog ${catalogName(company)} and assign ${nameOf(company)} to it`) };
    },
    async apply(deps): Promise<FixApplied> {
        const { get, send } = deps.commerce;
        const changes: string[] = [];
        const rejected: string[] = [];
        const record: SharedCatalogsStepRecord = { kind: 'shared-catalogs', catalogs: [] };
        for (const company of await readNeeding(get)) {
            const name = catalogName(company);
            let id: number;
            try {
                const body: { sharedCatalog: CommerceSharedCatalog } = { sharedCatalog: { name, type: CUSTOM_CATALOG, store_id: 0, tax_class_id: RETAIL_TAX_CLASS } };
                id = Number(await send('POST', 'sharedCatalog', body));
                if (!Number.isInteger(id)) throw new Error('Commerce did not answer the new catalog id.');
            } catch (error) {
                rejected.push(`Create the shared catalog ${name}: ${errorText(error)}`);
                continue;
            }
            try {
                await send('POST', `sharedCatalog/${id}/assignCompanies`, { companies: [{ id: company.id }] });
                changes.push(`Created the shared catalog ${name} and assigned ${nameOf(company)} to it`);
            } catch (error) {
                changes.push(`Created the shared catalog ${name}`);
                rejected.push(`Assign ${nameOf(company)} to ${name}: ${errorText(error)}`);
            }
            // A failed read-back records no `held`: the undo then counts only the company as the fix's.
            const held = await readHeld(get, id).catch(() => undefined);
            record.catalogs.push({ id, name, companyId: company.id, companyName: nameOf(company), ...(held ? { held } : {}) });
        }
        return { changes, rejected, ...(record.catalogs.length > 0 ? { record } : {}) };
    },
    async undo(deps, record: StorePreparationStepRecord): Promise<FixUndone> {
        if (record.kind !== 'shared-catalogs') return { changes: [], rejected: [`The record is not a shared-catalog record (${record.kind}).`] };
        let present: Set<number | undefined>;
        try {
            present = new Set((((await deps.commerce.get(CATALOGS_PATH)) as CommerceSharedCatalogList | null)?.items ?? []).map((c) => c.id));
        } catch (error) {
            return { changes: [], rejected: [`Read the shared catalogs: ${errorText(error)}`] };
        }
        const changes: string[] = [];
        const rejected: string[] = [];
        const kept: string[] = [];
        const remaining: SharedCatalogsStepRecord = { kind: 'shared-catalogs', catalogs: [] };
        // A catalog no longer in the list was deleted since: nothing left to undo.
        for (const catalog of record.catalogs.filter((c) => present.has(c.id))) {
            try {
                const undone = await undoCatalog(deps.commerce, catalog);
                if (undone.change) changes.push(undone.change);
                if (undone.kept) {
                    kept.push(undone.kept);
                    // Stays recorded, so a later undo deletes it once it is empty.
                    remaining.catalogs.push(catalog);
                }
            } catch (error) {
                rejected.push(`Undo the shared catalog ${catalog.name}: ${errorText(error)}`);
            }
        }
        return {
            changes,
            rejected,
            ...(kept.length > 0 ? { kept: kept.join(' ') } : {}),
            ...(remaining.catalogs.length > 0 ? { remaining } : {}),
        };
    },
};

type RecordedCatalog = SharedCatalogsStepRecord['catalogs'][number];

const unread = (what: string) => new Error(`Commerce answered the catalog's ${what} in a shape Demo Builder does not read.`);

/** Ids from a catalog list: Magento answers its companies JSON-encoded in a string, its categories as numbers. */
function idsIn(answer: unknown, what: string): number[] {
    let list = answer;
    if (typeof answer === 'string') {
        try {
            list = JSON.parse(answer);
        } catch {
            throw unread(what);
        }
    }
    const ids = Array.isArray(list) ? list.map(Number) : [NaN];
    if (ids.some((id) => !Number.isInteger(id))) throw unread(what);
    return ids;
}

/** SKUs from a catalog's product list: SKUs, or rows carrying one. */
function skusIn(answer: unknown): string[] {
    if (!Array.isArray(answer)) throw unread('products');
    const skus: string[] = [];
    for (const row of answer) {
        const sku: unknown = typeof row === 'string' ? row : (row as { sku?: unknown } | null)?.sku;
        if (typeof sku !== 'string') throw unread('products');
        skus.push(sku);
    }
    return skus;
}

/**
 * What a catalog holds now. Also the datapack engine's read of a catalog (step 08), so the two
 * read Commerce's three lists one way.
 */
export async function readHeld(get: CommerceGet, id: number): Promise<SharedCatalogHeld> {
    return {
        companies: idsIn(await get(`sharedCatalog/${id}/companies`), 'companies'),
        products: skusIn(await get(`sharedCatalog/${id}/products`)),
        categories: idsIn(await get(`sharedCatalog/${id}/categories`), 'categories'),
    };
}

/** What a catalog holds beyond what the fix left in it. */
function beyond(now: SharedCatalogHeld, left: SharedCatalogHeld): SharedCatalogHeld {
    return {
        companies: now.companies.filter((id) => !left.companies.includes(id)),
        products: now.products.filter((sku) => !left.products.includes(sku)),
        categories: now.categories.filter((id) => !left.categories.includes(id)),
    };
}

const NOTHING_MORE: SharedCatalogHeld = { companies: [], products: [], categories: [] };
const counted = (n: number, one: string, many: string) => (n === 0 ? [] : [`${n} ${n === 1 ? one : many}`]);

/** "2 products, 1 category and 1 company". */
function heldWords(extra: SharedCatalogHeld): string {
    return andList([...counted(extra.products.length, 'product', 'products'), ...counted(extra.categories.length, 'category', 'categories'), ...counted(extra.companies.length, 'company', 'companies')]);
}

/** Who is in a customer group, but the company the fix assigned: those it did not put there. */
async function othersInGroup(get: CommerceGet, groupId: number | undefined, companyId: number): Promise<number[]> {
    if (!groupId) return [];
    const criteria =
        `&searchCriteria[filterGroups][0][filters][0][field]=group_id&searchCriteria[filterGroups][0][filters][0][value]=${groupId}` +
        '&searchCriteria[filterGroups][0][filters][0][conditionType]=eq';
    const customers = await readAllPages<CommerceCustomer>(get, 'customers/search', criteria);
    return customers.filter((c) => c.extension_attributes?.company_attributes?.company_id !== companyId).map((c) => Number(c.id));
}

/** Why a catalog is kept: "it holds 1 product, and its customer group holds 2 customers". */
function keptWhy(extra: SharedCatalogHeld, others: number): string {
    const held = heldWords(extra);
    const group = others > 0 ? [`its customer group holds ${counted(others, 'customer', 'customers').join('')}`] : [];
    return [...(held ? [`it holds ${held}`] : []), ...group].join(', and ');
}

/**
 * Take the company out of the catalog if it is still in it, then delete the catalog unless it, or
 * its customer group, holds what the fix did not put there (the shared rule, over what is there
 * beyond it). Every read comes before the first write.
 */
async function undoCatalog(commerce: FixDeps['commerce'], catalog: RecordedCatalog): Promise<{ change?: string; kept?: string }> {
    const store = (await commerce.get(`sharedCatalog/${catalog.id}`)) as CommerceSharedCatalog | null;
    const name = store?.name || catalog.name;
    const now = await readHeld(commerce.get, catalog.id);
    const others = await othersInGroup(commerce.get, store?.customer_group_id, catalog.companyId);
    const left = catalog.held ?? { ...NOTHING_MORE, companies: [catalog.companyId] };
    const extra = beyond(now, left);
    const unassigned = now.companies.includes(catalog.companyId);
    if (unassigned) await commerce.send('POST', `sharedCatalog/${catalog.id}/unassignCompanies`, { companies: [{ id: catalog.companyId }] });
    const back = unassigned ? `; ${catalog.companyName} is back on the public catalog` : '';
    const outcome = decideOwnedChange({
        recorded: fingerprintRow({ ...NOTHING_MORE, customers: [] }),
        current: fingerprintRow({ ...extra, customers: others }),
        wanted: undefined,
    });
    if (outcome === 'remove') {
        await commerce.send('DELETE', `sharedCatalog/${catalog.id}`, undefined);
        return { change: `Deleted the shared catalog ${name}${back}` };
    }
    return {
        ...(unassigned ? { change: `Took ${catalog.companyName} out of the shared catalog ${name}${back}` } : {}),
        kept: `Kept the shared catalog ${name}: ${keptWhy(extra, others.length)} Demo Builder did not put there.`,
    };
}
