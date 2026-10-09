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

import { readAllPages, type CommerceGet } from './erpFillReaders';
import { OWNER_CODE } from './erpOwnerAttributeSets';
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

/** Enabled products (status 1), the ones the ERPs are filled with, in the fields an assignment reads. */
export async function listAssignableProducts(get: CommerceGet): Promise<AssignProductRow[]> {
    const status =
        '&searchCriteria[filter_groups][0][filters][0][field]=status&searchCriteria[filter_groups][0][filters][0][value]=1';
    const [items, labels] = await Promise.all([readAllPages<RawProduct>(get, 'products', status), brandLabels(get)]);
    return items
        .filter((product) => product.sku)
        .map((product) => {
            const attributes = attributesOf(product);
            const brand = brandOf(attributes[BRAND], labels);
            return {
                sku: product.sku,
                attributeSetId: Number(product.attribute_set_id),
                categoryIds: categoriesOf(product),
                ...(brand ? { brand } : {}),
                owner: attributes[OWNER_CODE] ?? '',
                websiteIds: (product.extension_attributes?.website_ids ?? []).map(Number),
                attributes,
            };
        });
}

/** The store's category names by id (`GET categories/list`). */
export async function listCategoryNames(get: CommerceGet): Promise<Map<string, string>> {
    const items = await readAllPages<{ id: number | string; name?: string }>(get, 'categories/list');
    return new Map(items.map((category) => [String(category.id), category.name ?? `Category ${category.id}`]));
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

/** Counted choices, the most products first, then by name. */
function counted(values: Array<{ value: string; label: string }>): ErpAssignChoice[] {
    const byValue = new Map<string, ErpAssignChoice>();
    for (const { value, label } of values) {
        const choice = byValue.get(value) ?? { value, label, count: 0 };
        choice.count += 1;
        byValue.set(value, choice);
    }
    return [...byValue.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The pickers' choices: the categories and brands the products carry, each with its count. */
export function choicesOf(
    rows: readonly ErpAssignProduct[],
    categoryNames: ReadonlyMap<string, string>,
): { categories: ErpAssignChoice[]; brands: ErpAssignChoice[] } {
    const categories = counted(
        rows.flatMap((row) => row.categoryIds.map((id) => ({ value: id, label: categoryNames.get(id) ?? `Category ${id}` }))),
    );
    const brands = counted(rows.flatMap((row) => (row.brand ? [{ value: row.brand, label: row.brand }] : [])));
    return { categories, brands };
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
