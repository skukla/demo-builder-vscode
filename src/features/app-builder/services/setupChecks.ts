/**
 * The demo setup checks Demo Builder can run itself (AB-26x), by the name a catalog
 * entry's `setupSteps[].check` gives.
 *
 * Each check reads Commerce over REST and answers whether the step is done, in words the
 * flyout shows. Pure over the read it is handed, so it is tested without Commerce.
 *
 * @module features/app-builder/services/setupChecks
 */

import type { SetupCheck } from '@/types/appBuilderComponents';

/** A signed Commerce REST GET, answering the body as text or an "Error: " line. */
export type CommerceRead = (path: string) => Promise<string>;

/** How a check came out. `done` undefined = the check could not tell. */
export interface SetupCheckResult {
    done?: boolean;
    note: string;
}

interface CompanyRow {
    id?: number;
    company_name?: string;
    customer_group_id?: number;
}

interface CatalogRow {
    name?: string;
    customer_group_id?: number;
    /** 1 public, 0 custom. */
    type?: number;
}

const COMPANIES_PATH =
    'company/?searchCriteria[pageSize]=200&fields=items[id,company_name,customer_group_id]';
const CATALOGS_PATH =
    'sharedCatalog/?searchCriteria[pageSize]=200&fields=items[id,name,customer_group_id,type]';
const PUBLIC_CATALOG = 1;

/** One list's items, or the error line Commerce answered. */
async function readItems<T>(read: CommerceRead, path: string, what: string): Promise<T[] | string> {
    const text = await read(path);
    if (text.startsWith('Error:')) return text;
    try {
        const parsed = JSON.parse(text.slice(text.indexOf('{'))) as { items?: T[] };
        return parsed.items ?? [];
    } catch {
        return `Error: Commerce answered something that is not a ${what} list.`;
    }
}

const nameOf = (company: CompanyRow): string => company.company_name ?? `company ${company.id}`;

/** What is wrong with where the companies sit, one line per problem. */
function catalogProblems(companies: CompanyRow[], catalogs: CatalogRow[]): string[] {
    const catalogByGroup = new Map(catalogs.map((c) => [c.customer_group_id, c]));
    const problems: string[] = [];
    const byCustomCatalog = new Map<CatalogRow, string[]>();
    for (const company of companies) {
        const catalog = catalogByGroup.get(company.customer_group_id);
        if (!catalog) {
            problems.push(
                `${nameOf(company)} is in no shared catalog (customer group ${company.customer_group_id} has none)`,
            );
        } else if (catalog.type !== PUBLIC_CATALOG) {
            byCustomCatalog.set(catalog, [...(byCustomCatalog.get(catalog) ?? []), nameOf(company)]);
        }
    }
    for (const [catalog, names] of byCustomCatalog) {
        if (names.length > 1) {
            problems.push(
                `${names.join(', ')} share the custom catalog "${catalog.name}", so neither has prices of its own`,
            );
        }
    }
    return problems;
}

/**
 * Every company sits in a shared catalog, and a company with prices of its own has a custom
 * catalog nobody else is in (owner, 2026-09-26). Companies on the public catalog are fine:
 * that is where a company without its own prices belongs. At the cart Commerce tells the
 * integration only the buyer's customer group, and a shared catalog is what gives a company
 * its own group; a bare group with no catalog leaves the company in none.
 */
async function companiesHaveOwnCatalogs(read: CommerceRead): Promise<SetupCheckResult> {
    const companies = await readItems<CompanyRow>(read, COMPANIES_PATH, 'company');
    if (typeof companies === 'string') return { note: `Could not check: ${companies.replace(/^Error: /u, '')}` };
    if (companies.length === 0) return { note: 'Commerce has no companies yet.' };
    const catalogs = await readItems<CatalogRow>(read, CATALOGS_PATH, 'shared catalog');
    if (typeof catalogs === 'string') return { note: `Could not check: ${catalogs.replace(/^Error: /u, '')}` };
    const problems = catalogProblems(companies, catalogs);
    if (problems.length > 0) return { done: false, note: `${problems.join('; ')}.` };
    const publicGroups = new Set(catalogs.filter((c) => c.type === PUBLIC_CATALOG).map((c) => c.customer_group_id));
    const onPublic = companies.filter((c) => publicGroups.has(c.customer_group_id)).length;
    return {
        done: true,
        note: `Every company is in a shared catalog: ${onPublic} on the public one, ${companies.length - onPublic} with their own.`,
    };
}

interface SourceRow {
    source_code?: string;
    name?: string;
    enabled?: boolean;
}

interface StockLinkRow {
    stock_id?: number;
    source_code?: string;
}

const SOURCES_PATH = 'inventory/sources?searchCriteria[pageSize]=200';
const LINKS_PATH = 'inventory/stock-source-links?searchCriteria[pageSize]=200';
const DEFAULT_SOURCE = 'default';

/**
 * A second enabled inventory source sits in a stock beside the Default Source (owner,
 * 2026-09-27), so the ERP holds stock in more than one warehouse. A source in no stock sells
 * nothing, so the stock link is what counts, not the source alone.
 */
async function secondSourceInStock(read: CommerceRead): Promise<SetupCheckResult> {
    const sources = await readItems<SourceRow>(read, SOURCES_PATH, 'source');
    if (typeof sources === 'string') return { note: `Could not check: ${sources.replace(/^Error: /u, '')}` };
    const others = sources.filter((s) => s.enabled && s.source_code !== DEFAULT_SOURCE);
    if (others.length === 0) return { done: false, note: 'Commerce has only the Default Source.' };
    const links = await readItems<StockLinkRow>(read, LINKS_PATH, 'stock link');
    if (typeof links === 'string') return { note: `Could not check: ${links.replace(/^Error: /u, '')}` };
    const linked = new Set(links.map((link) => link.source_code));
    const inStock = others.filter((s) => linked.has(s.source_code));
    if (inStock.length === 0) {
        return { done: false, note: `${listed(others)} in no stock, so no website sells from ${plural(others, 'them', 'it')}.` };
    }
    return { done: true, note: `${listed(inStock)} in a stock beside the Default Source.` };
}

const plural = (rows: unknown[], many: string, one: string): string => (rows.length > 1 ? many : one);

/** "East Warehouse is" / "East Warehouse, West Warehouse are". */
function listed(sources: SourceRow[]): string {
    const names = sources.map((s) => s.name ?? s.source_code ?? 'a source').join(', ');
    return `${names} ${plural(sources, 'are', 'is')}`;
}

const CHECKS: Record<SetupCheck, (read: CommerceRead) => Promise<SetupCheckResult>> = {
    'companies-have-own-catalogs': companiesHaveOwnCatalogs,
    'second-source-in-stock': secondSourceInStock,
};

/**
 * Run one named check.
 *
 * @param check - the check the step names
 * @param read - a signed Commerce REST GET
 * @returns whether the step is done, and why
 */
export function runSetupCheck(check: SetupCheck, read: CommerceRead): Promise<SetupCheckResult> {
    return CHECKS[check](read);
}
