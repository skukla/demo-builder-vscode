/**
 * The demo setup checks Demo Builder can run itself (AB-26x), by the name a catalog
 * entry's `setupSteps[].check` gives.
 *
 * Each check reads Commerce over REST and answers whether the step is done, in words the
 * flyout shows. Pure over the read it is handed, so it is tested without Commerce.
 *
 * @module features/app-builder/services/setupChecks
 */

import { readProductSets, setsInWords, setsWithoutOwner } from './erpOwnerAttributeSets';
import {
    cardPaymentsEnabled,
    erpConfirmedStatus,
    partiallyHeldStatus,
    paymentOnAccountEnabled,
    priceScopeWebsite,
    storefrontReturnsEnabled,
    websiteNamer,
} from './setupConfigChecks';
import type { SetupCheck } from '@/types/appBuilderComponents';

/** A signed Commerce REST GET, answering the body as text or an "Error: " line. */
export type CommerceRead = (path: string) => Promise<string>;

/** Where the project's store is, for a check that reads a website's own setting. */
export interface SetupCheckScope {
    websiteCode?: string;
}

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
 * that is where a company without its own prices belongs. The company's own shared catalog is
 * where the integration publishes the ERP's customer prices (`erp/prices`, AB-26z), so the
 * buyer sees them on the listing, the product page and the cart; Commerce allows a company
 * one shared catalog, and a bare customer group with no catalog leaves the company in none.
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
    const onPublic = companies.filter((c) => publicGroups.has(c.customer_group_id));
    const withOwn = companies.filter((c) => !publicGroups.has(c.customer_group_id));
    return { done: true, note: catalogsInWords(withOwn, onPublic) };
}

/** "Northgate and Harbor each have their own shared catalog. Altura uses the public one." */
function catalogsInWords(withOwn: CompanyRow[], onPublic: CompanyRow[]): string {
    const parts: string[] = [];
    if (withOwn.length > 0) {
        const names = andList(withOwn.map(nameOf));
        parts.push(withOwn.length === 1 ? `${names} has its own shared catalog.` : `${names} each have their own shared catalog.`);
    }
    if (onPublic.length > 0) {
        const names = andList(onPublic.map(nameOf));
        const catalog = withOwn.length > 0 ? 'the public one' : 'the public shared catalog';
        parts.push(onPublic.length === 1 ? `${names} uses ${catalog}.` : `${names} use ${catalog}.`);
    }
    return parts.join(' ');
}

/** "A", "A and B", "A, B and C". */
function andList(names: string[]): string {
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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

interface StockRow {
    stock_id?: number;
    name?: string;
    extension_attributes?: { sales_channels?: Array<{ type?: string; code?: string }> };
}

const SOURCES_PATH = 'inventory/sources?searchCriteria[pageSize]=200';
const LINKS_PATH = 'inventory/stock-source-links?searchCriteria[pageSize]=200';
const STOCKS_PATH = 'inventory/stocks?searchCriteria[pageSize]=200';
const DEFAULT_SOURCE = 'default';

const couldNot = (answer: string): SetupCheckResult => ({ note: `Could not check: ${answer.replace(/^Error: /u, '')}` });

/** The websites a stock sells to, by code. */
const websitesOf = (stock: StockRow): string[] =>
    (stock.extension_attributes?.sales_channels ?? []).filter((c) => c.type === 'website' && c.code).map((c) => String(c.code));

/**
 * The ERP has an inventory source of its own, in a stock a website sells from (owner,
 * 2026-09-27). Commerce's Default Stock holds only the Default Source ("Custom sources cannot
 * be assigned to Default Stock", Adobe's "Add a stock"; Commerce refused the link on Bodea the
 * same day), so a website sells from the ERP's warehouse only through a stock of its own.
 */
async function erpSourceInWebsiteStock(read: CommerceRead): Promise<SetupCheckResult> {
    const sources = await readItems<SourceRow>(read, SOURCES_PATH, 'source');
    if (typeof sources === 'string') return couldNot(sources);
    const others = sources.filter((s) => s.enabled && s.source_code !== DEFAULT_SOURCE);
    if (others.length === 0) return { done: false, note: 'Commerce has only the Default Source.' };
    const links = await readItems<StockLinkRow>(read, LINKS_PATH, 'stock link');
    if (typeof links === 'string') return couldNot(links);
    const stocks = await readItems<StockRow>(read, STOCKS_PATH, 'stock');
    if (typeof stocks === 'string') return couldNot(stocks);
    const stockById = new Map(stocks.map((stock) => [stock.stock_id, stock]));
    const sold = others.flatMap((source) =>
        links
            .filter((link) => link.source_code === source.source_code)
            .map((link) => ({ source, stock: stockById.get(link.stock_id) }))
            .filter((row): row is { source: SourceRow; stock: StockRow } => Boolean(row.stock && websitesOf(row.stock).length)),
    );
    if (sold.length > 0) {
        const { source, stock } = sold[0];
        const websiteName = await websiteNamer(read);
        const sellers = andList(websitesOf(stock).map(websiteName));
        return { done: true, note: `${sourceName(source)} is assigned to ${stock.name}, which ${sellers} sells from.` };
    }
    const linked = others.filter((source) => links.some((link) => link.source_code === source.source_code));
    if (linked.length > 0) {
        return { done: false, note: `${listed(linked)} assigned to a stock no website sells from.` };
    }
    return {
        done: false,
        note: `${listed(others)} assigned to no stock, so no website sells from ${plural(others, 'them', 'it')}.`,
    };
}

const plural = (rows: unknown[], many: string, one: string): string => (rows.length > 1 ? many : one);
const sourceName = (source: SourceRow): string => source.name ?? source.source_code ?? 'a source';

/** "East Warehouse is" / "East Warehouse, West Warehouse are". */
function listed(sources: SourceRow[]): string {
    return `${sources.map(sourceName).join(', ')} ${plural(sources, 'are', 'is')}`;
}

interface AttributeRow {
    attribute_code?: string;
    frontend_input?: string;
}

/** Commerce answers a missing attribute with a 404; anything else is a read that failed. */
const MISSING = /^Error: Commerce REST answered HTTP 404\./u;

/** One product attribute: its row, `null` when Commerce has none, or the error line. */
async function readAttribute(read: CommerceRead, code: string): Promise<AttributeRow | null | string> {
    const text = await read(`products/attributes/${code}`);
    if (MISSING.test(text)) return null;
    if (text.startsWith('Error:')) return text;
    try {
        return JSON.parse(text.slice(text.indexOf('{'))) as AttributeRow;
    } catch {
        return 'Error: Commerce answered something that is not a product attribute.';
    }
}

/**
 * The two product values several ERPs route and sell by exist (owner, 2026-09-28): `erp_owner`
 * names the ERP that fulfils a product, and must be a Text Field, because a Dropdown's API value
 * is the option's number, not the ERP's id, and must be in every attribute set the products use
 * (AB-74); `brand` is what buyers see, in any input type. Which products carry them is the SC's
 * scenario (Assign products on an ERP's card), never seeded.
 */
async function erpAttributesExist(read: CommerceRead): Promise<SetupCheckResult> {
    const owner = await readAttribute(read, 'erp_owner');
    if (typeof owner === 'string') return couldNot(owner);
    const brand = await readAttribute(read, 'brand');
    if (typeof brand === 'string') return couldNot(brand);
    const missing = (['erp_owner', 'brand'] as const).filter((code) => (code === 'erp_owner' ? owner : brand) === null);
    if (missing.length > 0) {
        return { done: false, note: `Commerce has no ${missing.join(' or ')} product attribute.` };
    }
    if (owner?.frontend_input !== 'text') {
        return {
            done: false,
            note: `erp_owner is a ${owner?.frontend_input ?? 'field of unknown type'}; it must be a Text Field so it carries the ERP's id.`,
        };
    }
    return ownerInEverySet(read);
}

/** Notes the signed REST read puts above a body ("[pageSize 20 applied …]"); never JSON. */
const READ_NOTE = /^\[[a-z][^\n]*\n/giu;

/** The text read as a parsed GET: a body, or a throw with Commerce's words. */
function parsedGet(read: CommerceRead) {
    return async (path: string): Promise<unknown> => {
        const text = (await read(path)).replace(READ_NOTE, '');
        if (text.startsWith('Error:')) throw new Error(text.replace(/^Error: /u, ''));
        return JSON.parse(text) as unknown;
    };
}

/**
 * The third half of the step (AB-74): `erp_owner` is in every attribute set the store's
 * products use, because Commerce drops a value for an attribute outside the product's set and
 * still answers 200. The sets missing it are named, with how many products each holds.
 */
async function ownerInEverySet(read: CommerceRead): Promise<SetupCheckResult> {
    try {
        const get = parsedGet(read);
        const missing = await setsWithoutOwner(get, await readProductSets(get));
        if (missing.length === 0) {
            return { done: true, note: 'erp_owner (Text Field) and brand both exist, and erp_owner is in every attribute set your products use.' };
        }
        return {
            done: false,
            note:
                `erp_owner is not in the attribute set${missing.length > 1 ? 's' : ''} ${setsInWords(missing)}, ` +
                'so an ERP tag written to those products is dropped. Demo Builder can add it.',
        };
    } catch (error) {
        return { note: `Could not check the attribute sets: ${error instanceof Error ? error.message : String(error)}` };
    }
}

const CHECKS: Record<SetupCheck, (read: CommerceRead, scope: SetupCheckScope) => Promise<SetupCheckResult>> = {
    'companies-have-own-catalogs': companiesHaveOwnCatalogs,
    'erp-source-in-website-stock': erpSourceInWebsiteStock,
    'erp-attributes-exist': erpAttributesExist,
    'erp-confirmed-status': erpConfirmedStatus,
    'partially-held-status': partiallyHeldStatus,
    'price-scope-website': priceScopeWebsite,
    'payment-on-account-enabled': paymentOnAccountEnabled,
    'storefront-returns-enabled': storefrontReturnsEnabled,
    'card-payments-enabled': cardPaymentsEnabled,
};

/**
 * Run one named check.
 *
 * @param check - the check the step names
 * @param read - a signed Commerce REST GET
 * @param scope - the project's store, for a check of a website's own setting
 * @returns whether the step is done, and why
 */
export function runSetupCheck(
    check: SetupCheck,
    read: CommerceRead,
    scope: SetupCheckScope = {},
): Promise<SetupCheckResult> {
    return CHECKS[check](read, scope);
}
