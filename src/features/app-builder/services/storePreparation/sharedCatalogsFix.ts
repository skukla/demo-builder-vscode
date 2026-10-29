/**
 * The `company-shared-catalogs` fix (AB-77): a custom shared catalog per company the
 * `companies-have-own-catalogs` check finds without one of its own (a company in no catalog,
 * or sharing a custom catalog with another), created with `POST sharedCatalog` and assigned
 * with `POST sharedCatalog/<id>/assignCompanies` (the routes and bodies from the data
 * installer's endpoint list and processors, and Magento's SharedCatalogInterface). A company
 * on the public catalog is left there: that is where a company without its own prices belongs.
 *
 * The undo unassigns the company (Commerce puts it back on the public catalog) and deletes
 * only a catalog this run created.
 *
 * @module features/app-builder/services/storePreparation/sharedCatalogsFix
 */

import { errorText, type FixApplied, type FixPreview, type FixUndone, type StepFix } from './fixContract';
import type { CommerceCompanyList, CommerceCompanyRow, CommerceSharedCatalog, CommerceSharedCatalogList, CommerceGet } from '@/types/commerceWire';
import type { SharedCatalogsStepRecord, StorePreparationStepRecord } from '@/types/storePreparation';

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
                record.catalogs.push({ id, name, companyId: company.id, companyName: nameOf(company) });
                changes.push(`Created the shared catalog ${name} and assigned ${nameOf(company)} to it`);
            } catch (error) {
                record.catalogs.push({ id, name, companyId: company.id, companyName: nameOf(company) });
                changes.push(`Created the shared catalog ${name}`);
                rejected.push(`Assign ${nameOf(company)} to ${name}: ${errorText(error)}`);
            }
        }
        return { changes, rejected, ...(record.catalogs.length > 0 ? { record } : {}) };
    },
    async undo(deps, record: StorePreparationStepRecord): Promise<FixUndone> {
        if (record.kind !== 'shared-catalogs') return { changes: [], rejected: [`The record is not a shared-catalog record (${record.kind}).`] };
        const { send } = deps.commerce;
        const changes: string[] = [];
        const rejected: string[] = [];
        for (const catalog of record.catalogs) {
            try {
                await send('POST', `sharedCatalog/${catalog.id}/unassignCompanies`, { companies: [{ id: catalog.companyId }] });
                await send('DELETE', `sharedCatalog/${catalog.id}`, undefined);
                changes.push(`Deleted the shared catalog ${catalog.name}; ${catalog.companyName} is back on the public catalog`);
            } catch (error) {
                rejected.push(`Delete the shared catalog ${catalog.name}: ${errorText(error)}`);
            }
        }
        return { changes, rejected };
    },
};
