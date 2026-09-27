/**
 * What the ERP fill reads from Commerce (AB-26y step 1): products, variant attributes,
 * stock per source, source names, companies with their credit and admin's website,
 * websites and store configuration.
 *
 * Ported from the integration's `lib/commerce.js` readers (skukla/commerce-erp-integration,
 * 2026-09-27), over a plain GET that answers parsed JSON, so the same readers run over
 * Demo Builder's signed Commerce client and over the answers captured from the Bodea
 * sandbox in the tests. The paths and fields are the ones those readers used live.
 *
 * @module features/app-builder/services/erpFillReaders
 */

import type {
    CommerceCompanyRow,
    CommerceProductRow,
    CommerceWebsite,
    LegalAddress,
    StockRow,
    VariantAttribute,
    WebsiteConfig,
} from './erpFillRows';

/** A Commerce GET that answers the parsed body, or throws a CommerceReadError. */
export type CommerceGet = (path: string) => Promise<unknown>;

/** A read Commerce refused or never answered; `status` is the HTTP status when there was one. */
export class CommerceReadError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'CommerceReadError';
    }
}

const PAGE_SIZE = 100;
const COMPANY_BLOCKED = 3;

interface SearchPage {
    items?: unknown[];
    total_count?: number;
}

/** Every page of a search endpoint, with extra search criteria appended. */
export async function readAllPages<T>(get: CommerceGet, path: string, criteria = ''): Promise<T[]> {
    const items: T[] = [];
    let total = Number.POSITIVE_INFINITY;
    for (let page = 1; items.length < total; page += 1) {
        const query = `searchCriteria[currentPage]=${page}&searchCriteria[pageSize]=${PAGE_SIZE}${criteria}`;
        // Pages in order: total_count arrives with the first.
        const data = (await get(`${path}?${query}`)) as SearchPage;
        const batch = (data.items ?? []) as T[];
        items.push(...batch);
        total = Number(data.total_count ?? items.length);
        if (batch.length === 0) break;
    }
    return items;
}

/** A read that answers empty when the store does not have the endpoint (no MSI, no B2B). */
async function absentAsEmpty<T>(read: () => Promise<T[]>): Promise<T[]> {
    try {
        return await read();
    } catch (error) {
        if (error instanceof CommerceReadError && error.status === 404) return [];
        throw error;
    }
}

interface RawProduct {
    id: number;
    sku: string;
    name?: string;
    price?: number;
    type_id: string;
    custom_attributes?: Array<{ attribute_code: string; value: unknown }>;
    extension_attributes?: {
        configurable_product_links?: number[];
        configurable_product_options?: Array<{ attribute_id: string | number }>;
    };
}

/** Enabled products (status 1), in the fields the fill uses. */
export async function listProducts(get: CommerceGet): Promise<CommerceProductRow[]> {
    const status = '&searchCriteria[filter_groups][0][filters][0][field]=status&searchCriteria[filter_groups][0][filters][0][value]=1';
    const items = await readAllPages<RawProduct>(get, 'products', status);
    return items.map((p) => ({
        childIds: p.extension_attributes?.configurable_product_links ?? [],
        customAttributes: Object.fromEntries((p.custom_attributes ?? []).map((a) => [a.attribute_code, a.value])),
        id: p.id,
        listPrice: Number(p.price ?? 0),
        name: p.name,
        optionAttributeIds: (p.extension_attributes?.configurable_product_options ?? []).map((o) => String(o.attribute_id)),
        sku: p.sku,
        typeId: p.type_id,
    }));
}

interface RawAttribute {
    attribute_id: string | number;
    attribute_code: string;
    default_frontend_label?: string;
    options?: Array<{ value: unknown; label: unknown }>;
}

/** The attributes configurables vary on, by id; asked only for the ids the catalog uses. */
export async function listVariantAttributes(get: CommerceGet, ids: string[]): Promise<Map<string, VariantAttribute>> {
    if (ids.length === 0) return new Map();
    const inIds =
        '&searchCriteria[filter_groups][0][filters][0][condition_type]=in' +
        `&searchCriteria[filter_groups][0][filters][0][field]=attribute_id&searchCriteria[filter_groups][0][filters][0][value]=${ids.join(',')}`;
    const items = await readAllPages<RawAttribute>(get, 'products/attributes', inIds);
    return new Map(
        items.map((a) => [
            String(a.attribute_id),
            {
                code: a.attribute_code,
                label: a.default_frontend_label || a.attribute_code,
                options: new Map((a.options ?? []).map((o) => [String(o.value), String(o.label).trim()])),
            },
        ]),
    );
}

/** Stock per SKU, one row per inventory source, in whole non-negative units. */
export async function listStock(get: CommerceGet): Promise<Map<string, StockRow[]>> {
    const items = await readAllPages<{ sku: string; source_code: string; quantity?: number }>(get, 'inventory/source-items');
    const bySku = new Map<string, StockRow[]>();
    for (const item of items) {
        const rows = bySku.get(item.sku) ?? [];
        rows.push({ code: item.source_code, quantity: Math.max(0, Math.round(Number(item.quantity ?? 0))) });
        bySku.set(item.sku, rows);
    }
    return bySku;
}

/** Inventory source names by code; a store without sources answers none. */
export async function listSources(get: CommerceGet): Promise<Map<string, string>> {
    const sources = await absentAsEmpty(() =>
        readAllPages<{ source_code: string; name: string }>(get, 'inventory/sources'),
    );
    return new Map(sources.map((s) => [s.source_code, s.name]));
}

interface RawCompany {
    id: number;
    company_name: string;
    status?: number | string;
    legal_name?: string;
    reseller_id?: string;
    vat_tax_id?: string;
    super_user_id?: number;
    street?: string[] | string;
    city?: string;
    country_id?: string;
    postcode?: string;
    region?: string | null;
    telephone?: string;
}

function legalAddressOf(c: RawCompany): LegalAddress | null {
    const street = (Array.isArray(c.street) ? c.street : [c.street]).filter((line): line is string => Boolean(line));
    const address = {
        city: c.city ?? null,
        countryId: c.country_id ?? null,
        postcode: c.postcode ?? null,
        region: c.region ?? null,
        street,
        telephone: c.telephone ?? null,
    };
    const fields = [address.city, address.countryId, address.postcode, address.region, address.telephone];
    const empty = street.length === 0 && fields.every((value) => !value);
    return empty ? null : address;
}

/** A read that answers null when it fails: a company without a credit record, an admin that cannot be read. */
async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
    try {
        return await read();
    } catch {
        return null;
    }
}

async function companyRow(get: CommerceGet, c: RawCompany): Promise<CommerceCompanyRow> {
    const credit = (await orNull(() => get(`companyCredits/company/${c.id}`))) as { credit_limit?: number } | null;
    const admin = c.super_user_id
        ? ((await orNull(() => get(`customers/${c.super_user_id}`))) as { website_id?: number } | null)
        : null;
    return {
        blocked: Number(c.status) === COMPANY_BLOCKED,
        creditLimit: credit ? Number(credit.credit_limit ?? 0) : null,
        id: c.id,
        legalAddress: legalAddressOf(c),
        legalName: c.legal_name ?? null,
        name: c.company_name,
        resellerId: c.reseller_id ?? null,
        vatTaxId: c.vat_tax_id ?? null,
        websiteId: admin?.website_id === undefined ? null : Number(admin.website_id),
    };
}

/** B2B companies with their credit and admin's website; a store without B2B answers none. */
export async function listCompanies(get: CommerceGet): Promise<CommerceCompanyRow[]> {
    const companies = await absentAsEmpty(() => readAllPages<RawCompany>(get, 'company'));
    const rows: CommerceCompanyRow[] = [];
    // A few companies, each with two reads, in order.
    for (const company of companies) rows.push(await companyRow(get, company));
    return rows;
}

/** Commerce's websites, without Admin. */
export async function listWebsites(get: CommerceGet): Promise<CommerceWebsite[]> {
    const sites = ((await get('store/websites')) ?? []) as Array<{ id: number | string; code: string; name: string }>;
    return sites.filter((s) => s.code !== 'admin').map((s) => ({ code: s.code, id: Number(s.id), name: s.name }));
}

/** Each website's base currency and locale; the first store view of a website speaks for it. */
export async function storeConfigs(get: CommerceGet): Promise<Map<number, WebsiteConfig>> {
    const configs = ((await get('store/storeConfigs')) ?? []) as Array<{
        website_id: number | string;
        base_currency_code?: string;
        locale?: string;
    }>;
    const byWebsite = new Map<number, WebsiteConfig>();
    for (const config of configs) {
        const id = Number(config.website_id);
        if (!byWebsite.has(id)) byWebsite.set(id, { currency: config.base_currency_code ?? null, locale: config.locale ?? null });
    }
    return byWebsite;
}
