/**
 * Which products an "Assign products" covers, and what writing `erp_owner` on them would do
 * (AB-74): the store's products in the fields the selection reads, the pickers' choices, the
 * preview the SC confirms, and the bulk bodies for the write and for its undo.
 *
 * Pure apart from the reads, which run over a GET it is handed. The product fields are the
 * ones the Bodea sandbox answered for `GET products` (tests/fixtures/commerce-rest/
 * products-page.json): `attribute_set_id`, `extension_attributes.category_links` and
 * `.website_ids`, and `custom_attributes`.
 *
 * @module features/app-builder/services/erpAssignSelection
 */

import { readAllPages } from './erpFillReaders';
import { OWNER_CODE } from './erpOwnerAttributeSets';
import type { CommerceGet } from '@/types/commerceWire';
import type {
    AttributeSetWithoutOwner,
    ErpAssignChoice,
    ErpAssignPreview,
    ErpAssignProduct,
    ErpProductSelection,
} from '@/types/erpAssign';
import type { ErpOwnedProductRow } from '@/types/erpOwnership';

const BRAND = 'brand';
/** How many SKUs the preview shows the SC. */
const EXAMPLES = 5;

/** One product as the assignment reads it: what the preview reads, and what ownership needs. */
export interface AssignProductRow extends ErpAssignProduct {
    websiteIds: number[];
    /** Every custom attribute as a string, for the ownership resolver. */
    attributes: Record<string, string>;
}

interface RawProduct {
    sku: string;
    name?: string;
    attribute_set_id?: number;
    custom_attributes?: Array<{ attribute_code: string; value: unknown }>;
    extension_attributes?: {
        category_links?: Array<{ category_id: string | number }>;
        website_ids?: Array<number | string>;
    };
}

/** A dropdown brand's option labels by value; an attribute that is absent or free text answers none. */
async function brandLabels(get: CommerceGet): Promise<Map<string, string>> {
    try {
        const attribute = (await get(`products/attributes/${BRAND}`)) as {
            options?: Array<{ value: unknown; label: unknown }>;
        } | null;
        return new Map(
            (attribute?.options ?? [])
                .filter((option) => String(option.value ?? '') !== '')
                .map((option) => [String(option.value), String(option.label).trim()]),
        );
    } catch {
        return new Map();
    }
}

/** The custom attributes as strings, empty values left out. */
function attributesOf(product: RawProduct): Record<string, string> {
    const out: Record<string, string> = {};
    for (const { attribute_code: code, value } of product.custom_attributes ?? []) {
        if (value === undefined || value === null || value === '' || Array.isArray(value)) continue;
        out[code] = String(value);
    }
    return out;
}

/** Categories from the links, else from the `category_ids` custom attribute. */
function categoriesOf(product: RawProduct): string[] {
    const links = (product.extension_attributes?.category_links ?? []).map((link) => String(link.category_id));
    if (links.length > 0) return links;
    const ids = product.custom_attributes?.find((a) => a.attribute_code === 'category_ids')?.value;
    return Array.isArray(ids) ? ids.map(String) : [];
}

/** The brand as the SC reads it: a dropdown's label, else the value stored; none when unset. */
function brandOf(value: string | undefined, labels: ReadonlyMap<string, string>): string | undefined {
    if (!value) return undefined;
    return labels.get(value) ?? value;
}

/**
 * Only the fields `RawProduct` reads. A full product carries stock, media and links besides:
 * on Justrite a page of 100 was 477 KB and 6.4 s in full, 275 KB and 2.2 s trimmed
 * (measured 2026-10-19). `total_count` stays, as the paging reads it.
 */
const PRODUCT_FIELDS =
    '&fields=total_count,items[sku,name,attribute_set_id,custom_attributes,extension_attributes[category_links,website_ids]]';

/** Which products a read covers: one website's, and only the SKUs named. Absent, all of them. */
export interface ProductScope {
    websiteId?: number;
    skus?: readonly string[];
}

/** SKUs per read when they are named: a list in the query string, kept short. */
const SKUS_PER_READ = 50;

/** The search criteria: enabled, and the scope's website and SKUs, each its own "and" group. */
function criteriaOf(websiteId: number | undefined, skus?: readonly string[]): string {
    const groups: Array<{ field: string; value: string; condition?: string }> = [{ field: 'status', value: '1' }];
    if (websiteId !== undefined) groups.push({ field: 'website_id', value: String(websiteId) });
    if (skus) groups.push({ field: 'sku', value: skus.map(encodeURIComponent).join(','), condition: 'in' });
    const filters = groups.map(({ field, value, condition }, index) => {
        const at = `searchCriteria[filter_groups][${index}][filters][0]`;
        return `&${at}[field]=${field}&${at}[value]=${value}${condition ? `&${at}[condition_type]=${condition}` : ''}`;
    });
    return `${filters.join('')}${PRODUCT_FIELDS}`;
}

/**
 * The products a scope covers. Named SKUs are read by an "in" filter, a few dozen at a time,
 * so a move of three products reads three (owner, 2026-10-19: every move read the whole
 * sandbox first); a SKU with a comma in it cannot be listed, so then everything is read.
 */
async function readProducts(get: CommerceGet, scope: ProductScope): Promise<RawProduct[]> {
    const { websiteId, skus } = scope;
    if (!skus || skus.some((sku) => sku.includes(','))) return readAllPages<RawProduct>(get, 'products', criteriaOf(websiteId));
    const read: RawProduct[] = [];
    for (let at = 0; at < skus.length; at += SKUS_PER_READ) {
        read.push(...(await readAllPages<RawProduct>(get, 'products', criteriaOf(websiteId, skus.slice(at, at + SKUS_PER_READ)))));
    }
    return read;
}

/**
 * Enabled products (status 1), the ones the ERPs are filled with, in the fields an assignment
 * reads; with a website id, only the products on that website (Commerce filters on
 * `website_id`: Justrite's 139 of the sandbox's 321, 2026-10-19); with SKUs, only those.
 */
export async function listAssignableProducts(get: CommerceGet, scope: ProductScope = {}): Promise<AssignProductRow[]> {
    const [items, labels] = await Promise.all([readProducts(get, scope), brandLabels(get)]);
    return items
        .filter((product) => product.sku)
        .map((product) => {
            const attributes = attributesOf(product);
            const brand = brandOf(attributes[BRAND], labels);
            return {
                sku: product.sku,
                ...(product.name ? { name: product.name } : {}),
                attributeSetId: Number(product.attribute_set_id),
                categoryIds: categoriesOf(product),
                ...(brand ? { brand } : {}),
                owner: attributes[OWNER_CODE] ?? '',
                websiteIds: (product.extension_attributes?.website_ids ?? []).map(Number),
                attributes,
            };
        });
}

/** One website's store, as the Assign products modal is scoped to it. */
export interface StoreScope {
    websiteId: number;
    websiteName: string;
    rootCategoryId: string;
    /** The store view's id, when a store view code was given. */
    storeId?: number;
}

/**
 * The project's website and the root catalog its store shows, by the website's code: a shared
 * sandbox holds several demos' catalogs, and the SC assigns from their own (owner,
 * 2026-10-18). Undefined when the code is unset or Commerce has no such website.
 *
 * With a store view's code, the store is that view's own (a website can hold several), and
 * the answer carries the view's id: where the datapack engine installs (DI-5). Undefined too
 * when the website has no such store view.
 */
export async function storeScopeOf(
    get: CommerceGet,
    websiteCode: string | undefined,
    storeCode?: string,
): Promise<StoreScope | undefined> {
    if (!websiteCode) return undefined;
    const sites = ((await get('store/websites')) ?? []) as Array<{ id: number | string; code: string; name: string; default_group_id?: number | string }>;
    const site = sites.find((candidate) => candidate.code === websiteCode);
    if (!site) return undefined;
    const view = storeCode ? await storeViewOf(get, storeCode, site.id) : undefined;
    if (storeCode && !view) return undefined;
    const groupId = view ? view.store_group_id : site.default_group_id;
    const groups = ((await get('store/storeGroups')) ?? []) as Array<{ id: number | string; root_category_id?: number | string }>;
    const group = groups.find((candidate) => String(candidate.id) === String(groupId));
    if (!group?.root_category_id) return undefined;
    return {
        websiteId: Number(site.id),
        websiteName: site.name,
        rootCategoryId: String(group.root_category_id),
        ...(view ? { storeId: Number(view.id) } : {}),
    };
}

/** The store view with this code on this website, if Commerce has one. */
async function storeViewOf(
    get: CommerceGet,
    code: string,
    websiteId: number | string,
): Promise<{ id: number | string; store_group_id: number | string } | undefined> {
    const views = ((await get('store/storeViews')) ?? []) as Array<{ id: number | string; code: string; website_id: number | string; store_group_id: number | string }>;
    return views.find((candidate) => candidate.code === code && String(candidate.website_id) === String(websiteId));
}

/**
 * The store's category labels by id (`GET categories/list`). Under a root, only that root's
 * categories, each labelled by its path below the root ("Signs › Danger Signs"), so one
 * catalog's categories are not mixed with another demo's. Without a root, every category by
 * its own name.
 */
export async function listCategoryLabels(get: CommerceGet, rootId?: string): Promise<Map<string, string>> {
    const items = await readAllPages<{ id: number | string; name?: string; path?: string }>(get, 'categories/list');
    const names = new Map(items.map((category) => [String(category.id), category.name ?? `Category ${category.id}`]));
    if (!rootId) return names;
    const labels = new Map<string, string>();
    for (const category of items) {
        const ids = (category.path ?? '').split('/');
        const at = ids.indexOf(rootId);
        if (at === -1 || at === ids.length - 1) continue;
        labels.set(String(category.id), ids.slice(at + 1).map((id) => names.get(id) ?? id).join(' › '));
    }
    return labels;
}

/** The row as the ownership resolver reads it. */
export function ownedRowOfAssign(row: AssignProductRow, websiteCodeById: ReadonlyMap<number, string>): ErpOwnedProductRow {
    return {
        sku: row.sku,
        websiteCodes: row.websiteIds.flatMap((id) => {
            const code = websiteCodeById.get(id);
            return code ? [code] : [];
        }),
        attributes: row.attributes,
    };
}

/** A selection's own words, for a refusal or a log line. */
export function selectionProblem(selection: ErpProductSelection | undefined): string | undefined {
    if (!selection) return 'Pick products by category, brand, SKU prefix or a list of SKUs.';
    if (selection.by === 'category' && !Number.isInteger(selection.categoryId)) return 'Pick a category.';
    if (selection.by === 'brand' && !selection.brand?.trim()) return 'Pick a brand.';
    if (selection.by === 'skuPrefix' && !selection.prefix?.trim()) return 'Type the start of the SKUs.';
    if (selection.by === 'skus' && !(selection.skus ?? []).some((sku) => sku.trim())) return 'Paste at least one SKU.';
    return undefined;
}

const lower = (text: string): string => text.trim().toLowerCase();

/** Whether a product is in the selection. SKUs and brands compare without case, as Commerce's do. */
export function inSelection(row: ErpAssignProduct, selection: ErpProductSelection): boolean {
    switch (selection.by) {
        case 'category':
            return row.categoryIds.includes(String(selection.categoryId));
        case 'brand':
            return row.brand !== undefined && lower(row.brand) === lower(selection.brand);
        case 'skuPrefix':
            return lower(row.sku).startsWith(lower(selection.prefix));
        default:
            return new Set(selection.skus.map(lower)).has(lower(row.sku));
    }
}

/** Pasted SKUs no product has. */
function unknownSkusOf(rows: readonly ErpAssignProduct[], selection: ErpProductSelection): string[] {
    if (selection.by !== 'skus') return [];
    const known = new Set(rows.map((row) => lower(row.sku)));
    return [...new Set(selection.skus.map((sku) => sku.trim()).filter(Boolean))].filter((sku) => !known.has(lower(sku)));
}

/**
 * The category filter's choices: the labelled categories the products carry, once each, by
 * name. No counts: the dialog's count says how many a pick shows (owner, 2026-10-19). A
 * category with no label is in another catalog (`listCategoryLabels`) and is left out.
 */
export function categoryChoicesOf(rows: readonly ErpAssignProduct[], labels: ReadonlyMap<string, string>): ErpAssignChoice[] {
    const byValue = new Map<string, ErpAssignChoice>();
    for (const id of rows.flatMap((row) => row.categoryIds)) {
        const label = labels.get(id);
        if (label) byValue.set(id, { value: id, label });
    }
    return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Everything the preview is worked out from. */
export interface AssignPreviewInput<R extends ErpAssignProduct = ErpAssignProduct> {
    rows: readonly R[];
    selection: ErpProductSelection;
    erp: ErpAssignPreview['erp'];
    /** The `erp_owner` value the write sets. */
    value: string;
    /** Who owns each SKU today, by list id (`ownersAcross`). */
    owners: ReadonlyMap<string, readonly string[]>;
    /** Each ERP's name, by list id. */
    names: ReadonlyMap<string, string>;
    setsWithoutOwner: readonly AttributeSetWithoutOwner[];
}

/** The products another ERP owns today that this write moves, by that ERP's name. */
function movedFromOf(rows: readonly ErpAssignProduct[], input: AssignPreviewInput): ErpAssignPreview['movedFrom'] {
    const counts = new Map<string, number>();
    for (const row of rows) {
        for (const owner of input.owners.get(row.sku) ?? []) {
            if (owner === input.erp.listId) continue;
            const name = input.names.get(owner) ?? owner;
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
    }
    return [...counts].map(([name, count]) => ({ name, count }));
}

/**
 * What writing the ERP's value on the selection would do, and the rows it would write.
 *
 * @returns the preview, and the rows to write (matched, not already tagged, in a set with erp_owner)
 */
export function previewAssignment<R extends ErpAssignProduct>(input: AssignPreviewInput<R>): { preview: ErpAssignPreview; toWrite: R[] } {
    const matched = input.rows.filter((row) => inSelection(row, input.selection));
    const outside = new Set(input.setsWithoutOwner.map((set) => set.id));
    const tagged = matched.filter((row) => row.owner === input.value);
    const blocked = matched.filter((row) => row.owner !== input.value && outside.has(row.attributeSetId));
    const toWrite = matched.filter((row) => row.owner !== input.value && !outside.has(row.attributeSetId));
    const blockedSets = input.setsWithoutOwner.filter((set) => blocked.some((row) => row.attributeSetId === set.id));
    return {
        preview: {
            erp: input.erp,
            matched: matched.length,
            toWrite: toWrite.length,
            examples: toWrite.slice(0, EXAMPLES).map((row) => row.sku),
            alreadyTagged: tagged.length,
            movedFrom: movedFromOf(toWrite, input),
            outsideSets: { count: blocked.length, sets: blockedSets },
            unknownSkus: unknownSkusOf(input.rows, input.selection),
        },
        toWrite,
    };
}

/** One product's `erp_owner` as a `PUT products/bySku` body: the SKU and the one attribute, nothing else. */
export function ownerBody(sku: string, value: string): { product: { sku: string; custom_attributes: Array<{ attribute_code: string; value: string }> } } {
    return { product: { sku, custom_attributes: [{ attribute_code: OWNER_CODE, value }] } };
}
