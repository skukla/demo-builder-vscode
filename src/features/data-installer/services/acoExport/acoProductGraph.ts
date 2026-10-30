/**
 * A store view's products as `aco_products` rows, assembled as the Data Installer service
 * assembles them (`acoConfigurableProductsExport.js` L234-342, `acoBundleProductsExport.js`
 * L168-226; `.rptc/research/datapack-engine/aco-export-spec.md` §3):
 *
 * 1. each configurable, with a `configurations` entry per super attribute, then each of its
 *    variants, linked `VARIANT_OF` it, carrying only its super-attribute values;
 * 2. each bundle with selections, with a `bundles` group per option, then each selection, linked
 *    `in_bundle` it (added to a row already made, so a variant in a bundle keeps both links);
 * 3. every other product.
 *
 * @module features/data-installer/services/acoExport/acoProductGraph
 */

import { type AttributeCatalog, optionFor, optionLabel } from './acoAttributeCatalog';
import { bundleGroups } from './acoBundleGroups';
import { productRow } from './acoProductRow';
import { customAttributeMap, slugOfLabel } from './acoRowParts';
import type {
    AcoConfiguration,
    AcoConfigurationValue,
    AcoProductAttribute,
    AcoProductRow,
    CommerceCatalogProduct,
    CommerceConfigurableOption,
} from '@/types/acoPack';

/** `<parent SKU>-<attribute code>-<label slug>`: how a variant names the choice it is (L36-40). */
const referenceId = (parentSku: string, code: string, label: string) =>
    `${parentSku.trim()}-${code.trim().toLowerCase()}-${slugOfLabel(label)}`;

/** An option's attribute code: by its id, else its label snake-cased (L48-59). */
function codeOf(option: CommerceConfigurableOption, catalog: AttributeCatalog): string | undefined {
    const byId =
        option.attribute_id === undefined
            ? undefined
            : catalog.idToCode.get(String(option.attribute_id));
    return (
        byId ?? (option.label ? option.label.trim().toLowerCase().replace(/\s+/gu, '_') : undefined)
    );
}

const optionsOf = (product: CommerceCatalogProduct) =>
    product.extension_attributes?.configurable_product_options ?? [];

/** Every super attribute any configurable here chooses by: what the options read is for (L67-86). */
export function superAttributeCodes(
    products: readonly CommerceCatalogProduct[],
    catalog: AttributeCatalog,
): string[] {
    const codes = new Set<string>();
    for (const product of products.filter((p) => p.type_id === 'configurable')) {
        for (const option of optionsOf(product)) {
            const code = codeOf(option, catalog);
            if (code) codes.add(code);
        }
    }
    return [...codes];
}

/** One configurable option's values, each labelled from the store's options (L153-176). */
function valuesOf(
    parentSku: string,
    code: string,
    option: CommerceConfigurableOption,
    catalog: AttributeCatalog,
): AcoConfigurationValue[] {
    const values: AcoConfigurationValue[] = [];
    for (const value of option.values ?? []) {
        const given = (value.label ?? '').trim();
        const guess = given || optionLabel(catalog, code, value.value_index);
        const label = optionFor(catalog, code, value.value_index, guess)?.label?.trim() ?? guess;
        if (label) values.push({ variantReferenceId: referenceId(parentSku, code, label), label });
    }
    return values;
}

/** The parent's configurations, by option position (L128-199). */
function configurationsOf(
    parent: CommerceCatalogProduct,
    catalog: AttributeCatalog,
): AcoConfiguration[] {
    const own = customAttributeMap(parent);
    const ordered = [...optionsOf(parent)].sort(
        (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
    );
    const configurations: AcoConfiguration[] = [];
    for (const option of ordered) {
        const code = codeOf(option, catalog);
        if (!code) continue;
        const values = valuesOf(parent.sku, code, option, catalog);
        if (values.length === 0) continue;
        const ownLabel = optionLabel(catalog, code, own[code]);
        configurations.push({
            attributeCode: code,
            label: catalog.byCode.get(code)?.default_frontend_label || option.label || code,
            defaultVariantReferenceId: ownLabel
                ? referenceId(parent.sku, code, ownLabel)
                : values[0].variantReferenceId,
            type: 'CONFIGURABLE',
            values,
        });
    }
    return configurations;
}

/** A variant's super-attribute values, by label, each naming the choice it is (L208-224). */
function variantAttributes(
    parentSku: string,
    child: CommerceCatalogProduct,
    codes: readonly string[],
    catalog: AttributeCatalog,
): AcoProductAttribute[] {
    const own = customAttributeMap(child);
    return codes
        .filter((code) => (own[code] ?? '').trim() !== '')
        .map((code) => {
            const label = optionLabel(catalog, code, own[code]);
            return {
                code,
                values: [label],
                variantReferenceId: referenceId(parentSku, code, label),
            };
        });
}

/** The products of one store view, by SKU and by id; downloadables are never carried (L243-259). */
export interface StoreProducts {
    bySku: Map<string, CommerceCatalogProduct>;
    skuById: Map<string, string>;
}

function indexed(products: readonly CommerceCatalogProduct[]): StoreProducts {
    const bySku = new Map<string, CommerceCatalogProduct>();
    const skuById = new Map<string, string>();
    for (const product of products.filter((p) => p.type_id !== 'downloadable')) {
        bySku.set(product.sku.trim(), product);
        if (product.id !== undefined) skuById.set(String(product.id), product.sku.trim());
    }
    return { bySku, skuById };
}

/** A configurable's variants by SKU: a string link IS a SKU, a number an id (L93-120). */
function variantSkus(parent: CommerceCatalogProduct, store: StoreProducts): string[] {
    const skus = (parent.extension_attributes?.configurable_product_links ?? []).map((link) =>
        typeof link === 'string' ? link.trim() : store.skuById.get(String(link)),
    );
    return [...new Set(skus.filter((sku): sku is string => Boolean(sku)))];
}

/** What has been made so far, and which SKUs are already accounted for. */
interface Graph {
    rows: AcoProductRow[];
    done: Set<string>;
    locale: string;
    slugs: ReadonlyMap<string, string>;
    catalog: AttributeCatalog;
}

/** Each configurable and its variants (L279-311). */
function addConfigurables(graph: Graph, store: StoreProducts): Set<string> {
    const variants = new Set<string>();
    for (const parent of [...store.bySku.values()].filter((p) => p.type_id === 'configurable')) {
        const configurations = configurationsOf(parent, graph.catalog);
        const codes = configurations.map((c) => c.attributeCode);
        const row = productRow(parent, graph.locale, graph.slugs, {
            omit: new Set(codes),
            configurations,
        });
        if (row) graph.rows.push(row);
        if (row) graph.done.add(parent.sku);
        for (const sku of variantSkus(parent, store)) {
            variants.add(sku);
            const child = store.bySku.get(sku);
            const attributes = child
                ? variantAttributes(parent.sku, child, codes, graph.catalog)
                : [];
            const variant = child
                ? productRow(child, graph.locale, graph.slugs, { omit: new Set(codes), attributes })
                : undefined;
            if (!variant) continue;
            graph.rows.push({ ...variant, links: [{ type: 'VARIANT_OF', sku: parent.sku }] });
            graph.done.add(sku);
        }
    }
    return variants;
}

/** Link a selection to its bundle: onto its row when made, else a row of its own (L199-224). */
function addSelection(graph: Graph, store: StoreProducts, bundleSku: string, sku: string): boolean {
    const link = { type: 'in_bundle' as const, sku: bundleSku };
    const made = graph.rows.find((row) => row.sku === sku);
    if (made) {
        const links = made.links ?? [];
        if (!links.some((l) => l.type === 'in_bundle' && l.sku === bundleSku))
            made.links = [...links, link];
        return true;
    }
    const product = store.bySku.get(sku);
    const row = product ? productRow(product, graph.locale, graph.slugs) : undefined;
    if (row) graph.rows.push({ ...row, links: [link] });
    return row !== undefined;
}

/** Each bundle with selections, and its selections (L177-226). */
function addBundles(graph: Graph, store: StoreProducts): Set<string> {
    const selections = new Set<string>();
    for (const bundle of [...store.bySku.values()].filter(
        (p) => p.type_id === 'bundle' && p.sku.trim(),
    )) {
        const bundles = bundleGroups(bundle, store.skuById);
        const row =
            bundles.length > 0
                ? productRow(bundle, graph.locale, graph.slugs, { bundles })
                : undefined;
        if (!row) continue;
        graph.rows.push(row);
        graph.done.add(bundle.sku.trim());
        const skus = new Set(bundles.flatMap((group) => group.items.map((item) => item.sku)));
        for (const sku of skus) {
            if (!addSelection(graph, store, bundle.sku.trim(), sku)) continue;
            selections.add(sku);
            graph.done.add(sku);
        }
    }
    return selections;
}

/** Every product of one store view as its rows. */
export function productGraph(
    products: readonly CommerceCatalogProduct[],
    locale: string,
    slugs: ReadonlyMap<string, string>,
    catalog: AttributeCatalog,
): AcoProductRow[] {
    const store = indexed(products);
    const graph: Graph = { rows: [], done: new Set(), locale, slugs, catalog };
    const variants = addConfigurables(graph, store);
    const selections = addBundles(graph, store);
    for (const [sku, product] of store.bySku) {
        if (graph.done.has(sku) || variants.has(sku) || selections.has(sku)) continue;
        const row = productRow(product, locale, slugs);
        if (row) graph.rows.push(row);
    }
    return graph.rows;
}
