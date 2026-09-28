/**
 * Demo Builder fills the ERP from Commerce (AB-26y step 1, owner 2026-09-25): the copy that
 * gives a demo ERP its products, customers and structure, run by Demo Builder rather than by
 * the integration, because copying Commerce is demo setup and not something a real
 * integration does.
 *
 * It reads Commerce with the project's signed client, asks the ERP integration which
 * settings are in force (each website's sales organisation, which products this ERP owns),
 * and writes the ERP through its ordinary import: partners and the structure first, then
 * products in batches, the way the integration's mirror did.
 *
 * @module features/app-builder/services/erpFill
 */

import {
    listCompanies,
    listProducts,
    listSources,
    listStock,
    listVariantAttributes,
    listWebsites,
    storeConfigs,
    type CommerceGet,
} from './erpFillReaders';
import {
    ownershipFilter,
    partnersFrom,
    productsFrom,
    salesOrgOf,
    structureFrom,
    type ErpPartnerRow,
    type ErpProductRow,
    type ErpSettings,
    type ErpStructure,
} from './erpFillRows';

/** The integration's settings in force (`GET erp/settings?websites=`). */
export interface ResolvedErpSettings {
    default: ErpSettings;
    websites: Record<string, ErpSettings>;
}

/** One body of the ERP's `POST admin/import`. */
export interface ErpImportBody {
    partners?: ErpPartnerRow[];
    products?: ErpProductRow[];
    projectName?: string;
    structure?: ErpStructure;
}

/** One row of the integration's key map (its `erp/keymap`): which Commerce record is which ERP record. */
export interface ErpKeyMapEntry {
    kind: 'customer';
    commerce: string;
    erp: string;
    /** The ERP the pair belongs to, by its list id; absent = the integration's first ERP. */
    erpId?: string;
}

export interface ErpFillDeps {
    get: CommerceGet;
    settings: (websiteCodes: string[]) => Promise<ResolvedErpSettings>;
    /** The ERP's import; throws with the ERP's own words when it refuses. */
    importRecords: (body: ErpImportBody) => Promise<void>;
    /**
     * Hand the integration the key map, whole. `false` when the integration keeps none: one
     * deployed before it had `erp/keymap`, which must still fill (it matches by Commerce ids).
     */
    saveKeyMap: (entries: ErpKeyMapEntry[]) => Promise<boolean>;
    onProgress?: (message: string) => void;
}

export interface ErpFillResult {
    partners: number;
    products: number;
    /** Products another ERP owns under this one's settings, left out. */
    skipped: number;
    /** What this ERP owns, in words, when it does not own everything. */
    owns?: string;
    /** Customers in the key map handed to the integration; absent when it keeps none. */
    paired?: number;
}

/**
 * Products per import request: small, so each request stays well under Runtime's 1 MB
 * limit and progress moves more than once for a typical demo catalogue (the mirror's
 * reasoning, `PRODUCT_BATCH`).
 */
export const PRODUCT_BATCH = 25;

function batches<T>(rows: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    // An empty catalog still sends one products import: that is what stamps the ERP's last import.
    return out.length > 0 ? out : [[]];
}

/** What Commerce and the integration say, read in one pass. */
async function readEverything(deps: ErpFillDeps) {
    const [products, stock, companies, sourceNames, websites, configs] = await Promise.all([
        listProducts(deps.get),
        listStock(deps.get),
        listCompanies(deps.get),
        listSources(deps.get),
        listWebsites(deps.get),
        storeConfigs(deps.get),
    ]);
    const settings = await deps.settings(websites.map((site) => site.code));
    const attributeIds = [...new Set(products.flatMap((p) => p.optionAttributeIds))];
    const attributes = await listVariantAttributes(deps.get, attributeIds);
    return { products, stock, companies, sourceNames, websites, configs, settings, attributes };
}

/**
 * Fill the ERP from Commerce as it stands.
 *
 * @param deps - Commerce, the integration's settings, the ERP's import
 * @param projectName - the demo's name, for the ERP's default customer
 * @returns how many partners and products went in, and what was left out
 */
export async function fillErp(deps: ErpFillDeps, projectName: string): Promise<ErpFillResult> {
    deps.onProgress?.('Reading Commerce');
    const read = await readEverything(deps);
    const settingsByWebsite = new Map(read.websites.map((site) => [site.id, read.settings.websites[site.code] ?? {}]));
    const salesOrgByWebsite = new Map(
        read.websites.map((site) => [site.id, salesOrgOf(settingsByWebsite.get(site.id)).salesOrg]),
    );
    const filter = ownershipFilter(read.settings.default);
    const owned = read.products.filter((p) =>
        filter.owns({
            customAttributes: p.customAttributes,
            sourceCodes: (read.stock.get(p.sku) ?? []).map((row) => row.code),
        }),
    );
    const partners = partnersFrom(read.companies, read.websites, salesOrgByWebsite);
    const products = productsFrom(owned, read.stock, read.sourceNames, read.attributes);

    deps.onProgress?.(`Sending ${partners.length} customers`);
    const structure = structureFrom(read.websites, read.configs, settingsByWebsite);
    await deps.importRecords({ partners, projectName, structure });
    let done = 0;
    // In order: the count shown is the count imported so far.
    for (const batch of batches(products, PRODUCT_BATCH)) {
        await deps.importRecords({ products: batch });
        done += batch.length;
        deps.onProgress?.(`Sent ${done} of ${products.length} products`);
    }
    // Last, so the map never names a customer the ERP does not hold yet.
    // Paired from the companies: the rows the ERP takes carry no Commerce id.
    const keyMap = read.companies.map(
        (company, index): ErpKeyMapEntry => ({ kind: 'customer', commerce: String(company.id), erp: partners[index].id }),
    );
    const kept = await deps.saveKeyMap(keyMap);
    if (!kept) deps.onProgress?.('The integration keeps no key map yet; update it to have one');
    const skipped = read.products.length - owned.length;
    return {
        partners: partners.length,
        products: products.length,
        skipped,
        ...(skipped > 0 ? { owns: filter.describe } : {}),
        ...(kept ? { paired: keyMap.length } : {}),
    };
}
