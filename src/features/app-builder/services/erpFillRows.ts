/**
 * The ERP fill's rows (AB-26y step 1): Commerce's products, companies and websites turned
 * into the ERP's products, business partners and structure, sorted by the ERP integration's
 * settings. Pure, so it is tested without either system.
 *
 * Ported from the integration's `lib/mirror.js` and `lib/structure.js`
 * (skukla/commerce-erp-integration, 2026-09-27), which did this job until Demo Builder took
 * it over; the rules are theirs, unchanged: a configurable product is a parent with no stock
 * of its own, a variant names its parent and what it varies on, a company buys through the
 * sales organisation of its admin's website, and the ownership setting decides which
 * products belong to this ERP.
 *
 * @module features/app-builder/services/erpFillRows
 */

/** One Commerce product as the fill reads it. */
export interface CommerceProductRow {
    id: number;
    sku: string;
    name?: string;
    listPrice: number;
    typeId: string;
    /** A configurable's variants, by product id. */
    childIds: number[];
    /** The attribute ids a configurable's variants differ on. */
    optionAttributeIds: string[];
    customAttributes: Record<string, unknown>;
}

/** One inventory source's quantity of one SKU. */
export interface StockRow {
    code: string;
    quantity: number;
}

/** An attribute configurables vary on: its code, label, and option labels by value. */
export interface VariantAttribute {
    code: string;
    label: string;
    options: Map<string, string>;
}

/** One B2B company as the fill reads it, with its credit and its admin's website. */
export interface CommerceCompanyRow {
    id: number;
    name: string;
    blocked: boolean;
    creditLimit: number | null;
    legalAddress: LegalAddress | null;
    legalName: string | null;
    resellerId: string | null;
    vatTaxId: string | null;
    websiteId: number | null;
}

export interface LegalAddress {
    city: string | null;
    countryId: string | null;
    postcode: string | null;
    region: string | null;
    street: string[];
    telephone: string | null;
}

export interface CommerceWebsite {
    id: number;
    code: string;
    name: string;
}

/** What the store configuration says about a website. */
export interface WebsiteConfig {
    currency: string | null;
    locale: string | null;
}

/** The ERP integration's settings as it resolves them: setting name → value. */
export type ErpSettings = Record<string, boolean | string | undefined>;

export interface ErpWarehouse {
    code: string;
    name: string;
    quantity: number;
}

/** A product as the ERP imports it (demo-erp `admin/import`, `products`). */
export interface ErpProductRow {
    sku: string;
    name: string;
    listPrice: number;
    type: 'simple' | 'configurable';
    warehouses: ErpWarehouse[];
    parentSku?: string;
    variantAttributes?: Array<{ label: string; value: string }>;
}

/**
 * A business partner as the ERP imports it (`partners`); the id is `C<company id>`. It carries
 * no Commerce id: the ERP holds none (contract version 3), and the integration's key map says
 * which Commerce company each customer is.
 */
export interface ErpPartnerRow {
    id: string;
    name: string;
    blocked: boolean;
    creditLimit?: number;
    legalAddress: LegalAddress | null;
    legalName: string | null;
    resellerId: string | null;
    salesOrgs: string[];
    vatTaxId: string | null;
}

/** The structure block (`structure`): each website and the sales organisation that sells through it. */
export interface ErpStructure {
    websites: Array<{
        code: string;
        name: string;
        salesOrg: string;
        salesOrgName: string | null;
        storeInfo: { address: null; countryId: string | null; currency: string | null; vatNumber: null };
    }>;
}

const DEFAULT_SALES_ORG = '1000';

/** The sales organisation a website's settings name, else 1000. */
export function salesOrgOf(settings: ErpSettings | undefined): { salesOrg: string; salesOrgName?: string } {
    const set = settings?.structure_sales_org;
    const salesOrg = typeof set === 'string' && set ? set : DEFAULT_SALES_ORG;
    const name = settings?.structure_sales_org_name;
    return typeof name === 'string' && name ? { salesOrg, salesOrgName: name } : { salesOrg };
}

/** What the ownership filter looks at on a product. */
export interface OwnedProduct {
    sourceCodes?: string[];
    customAttributes?: Record<string, unknown>;
}

export interface OwnershipFilter {
    mode: 'all' | 'sources' | 'attribute';
    owns: (product: OwnedProduct) => boolean;
    describe: string;
}

const codesOf = (text: unknown): string[] =>
    String(text ?? '').split(',').map((code) => code.trim()).filter(Boolean);

function attributeOf(text: unknown): { code: string; value: string } | null {
    const raw = String(text ?? '');
    const at = raw.indexOf('=');
    return at <= 0 ? null : { code: raw.slice(0, at).trim(), value: raw.slice(at + 1).trim() };
}

/**
 * Which products belong to this ERP (the integration's rule M3): every product, those
 * stocked in the named sources, or those whose attribute names this ERP. A mode whose
 * setting is blank owns nothing, and says so.
 */
export function ownershipFilter(settings: ErpSettings | undefined): OwnershipFilter {
    const mode = settings?.structure_owns;
    if (mode === 'sources') {
        const codes = new Set(codesOf(settings?.structure_owns_sources));
        const named = codes.size ? [...codes].join(', ') : 'no source (the setting is blank)';
        return {
            mode,
            describe: `products stocked in ${named}`,
            owns: (product) => (product.sourceCodes ?? []).some((code) => codes.has(code)),
        };
    }
    if (mode === 'attribute') {
        const attribute = attributeOf(settings?.structure_owns_attribute);
        return {
            mode,
            describe: attribute
                ? `products whose ${attribute.code} is ${attribute.value}`
                : 'products whose attribute names this ERP (the setting is blank)',
            owns: (product) =>
                Boolean(attribute) && String(product.customAttributes?.[attribute?.code ?? ''] ?? '') === attribute?.value,
        };
    }
    return { mode: 'all', describe: 'every product', owns: () => true };
}

function warehousesFor(sku: string, stock: Map<string, StockRow[]>, names: Map<string, string>): ErpWarehouse[] {
    return (stock.get(sku) ?? []).map((row) => ({ code: row.code, name: names.get(row.code) || row.code, quantity: row.quantity }));
}

/** "Silver · 128GB"-style values of a variant, in the order its parent lists them. */
function variantValues(
    product: CommerceProductRow,
    parent: CommerceProductRow,
    attributes: Map<string, VariantAttribute>,
): Array<{ label: string; value: string }> {
    return parent.optionAttributeIds.map((id) => {
        const attribute = attributes.get(id);
        const raw = attribute ? product.customAttributes[attribute.code] : undefined;
        const value = raw === undefined || raw === null ? '' : (attribute?.options.get(String(raw)) ?? String(raw));
        return { label: attribute?.label ?? id, value };
    });
}

/** Each variant's configurable parent, by the variant's product id. */
function parentsOf(products: CommerceProductRow[]): Map<number, CommerceProductRow> {
    const ids = new Set(products.map((p) => p.id));
    const parentOf = new Map<number, CommerceProductRow>();
    for (const p of products.filter((row) => row.typeId === 'configurable')) {
        for (const childId of p.childIds.filter((id) => ids.has(id))) parentOf.set(childId, p);
    }
    return parentOf;
}

/**
 * The ERP's product rows: a configurable is a parent with no stock of its own; every other
 * product carries one warehouse per inventory source it is stocked in, named from the
 * store's sources (or by code).
 */
export function productsFrom(
    products: CommerceProductRow[],
    stock: Map<string, StockRow[]>,
    sourceNames: Map<string, string> = new Map(),
    attributes: Map<string, VariantAttribute> = new Map(),
): ErpProductRow[] {
    const withSku = products.filter((p) => p.sku);
    const parentOf = parentsOf(withSku);
    return withSku.map((p) => {
        const row = { listPrice: p.listPrice, name: p.name || p.sku, sku: p.sku };
        if (p.typeId === 'configurable') return { ...row, type: 'configurable', warehouses: [] };
        const parent = parentOf.get(p.id);
        const variant = parent ? { parentSku: parent.sku, variantAttributes: variantValues(p, parent, attributes) } : {};
        return { ...row, ...variant, type: 'simple', warehouses: warehousesFor(p.sku, stock, sourceNames) };
    });
}

/**
 * The ERP's business partners: a company buys through the sales organisation of its
 * admin's website; a company with no admin website belongs to none yet.
 */
export function partnersFrom(
    companies: CommerceCompanyRow[],
    websites: CommerceWebsite[],
    salesOrgByWebsite: Map<number, string>,
): ErpPartnerRow[] {
    const siteById = new Map(websites.map((site) => [site.id, site]));
    return companies.map((c) => {
        const site = c.websiteId === null ? undefined : siteById.get(c.websiteId);
        return {
            blocked: c.blocked,
            creditLimit: c.creditLimit ?? undefined,
            id: `C${c.id}`,
            legalAddress: c.legalAddress,
            legalName: c.legalName,
            name: c.name,
            resellerId: c.resellerId,
            salesOrgs: site ? [salesOrgByWebsite.get(site.id) ?? DEFAULT_SALES_ORG] : [],
            vatTaxId: c.vatTaxId,
        };
    });
}

/**
 * The structure block: each website, the sales organisation its settings name, and what
 * the store configuration says. Store Information (address, VAT) is not readable over
 * REST, so those stay null.
 */
export function structureFrom(
    websites: CommerceWebsite[],
    configs: Map<number, WebsiteConfig>,
    settingsByWebsite: Map<number, ErpSettings>,
): ErpStructure {
    return {
        websites: websites.map((site) => {
            const config = configs.get(site.id);
            const locale = config?.locale ?? '';
            const { salesOrg, salesOrgName } = salesOrgOf(settingsByWebsite.get(site.id));
            return {
                code: site.code,
                name: site.name,
                salesOrg,
                salesOrgName: salesOrgName ?? null,
                storeInfo: {
                    address: null,
                    countryId: locale.includes('_') ? locale.split('_')[1] : null,
                    currency: config?.currency ?? null,
                    vatNumber: null,
                },
            };
        }),
    };
}
