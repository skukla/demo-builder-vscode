/**
 * The ACO pack kinds Demo Builder's engine loads (PL-60 P4): where each one is sent, what its
 * removal sends, and how its rows are checked before anything is written.
 *
 * The order and the paths are the Data Installer service's (`config/data_processors_aco_import.json`
 * and `config/endpoints/aco.json`), written in the lower-case form Adobe's docs and SDK use
 * (`/v1/catalog/...`). Every row is keyed by the pack's own name for it, and the delete payloads
 * are the SDK's (`@adobe-commerce/aco-ts-sdk` 1.2.2, `Feed*Delete`) and the service's
 * (`processors/Aco*DeleteProcessor.js` `_toDeletePayload`): `{code, source}`, `{slug, source}`,
 * `{sku, source}`, `{priceBookId}`, `{sku, priceBookId}`, and for a layer `{sku, source: {layer}}`.
 *
 * @module features/data-installer/services/aco/acoKinds
 */

import { acoRowsProblem } from '../acoExport/acoPackSchemas';
import type { AcoIngestionPath } from './acoClient';
import type { AcoExportKind, AcoPackRows } from '@/types/acoPack';

/** What a row's removal sends, and the pack's own name for it. */
export interface AcoRowKey {
    /** The ingestion delete's item for this row. */
    remove: Record<string, unknown>;
    /** The row as a person reads it: a SKU, a slug, a code, a price book id. */
    name: string;
}

/** One ACO kind. */
export interface AcoKind {
    kind: string;
    /** Where its rows are created; the delete is `${path}/delete`. */
    path: AcoIngestionPath;
    /** Rows per call, the service's batch sizes where it sets one. */
    batch: number;
    /** The row as a person reads the kind. */
    noun: string;
    /** Why ACO could not take this row, or undefined; checked before the first write. */
    problem(row: unknown): string | undefined;
    /** The row's key. Called only on a row `problem` passed. */
    keyOf(row: Record<string, unknown>): AcoRowKey;
}

/** The service's batch for products (`DEFAULT_ACO_PRODUCTS_IMPORT_BATCH_SIZE`). */
const PRODUCT_BATCH = 100;
/** The service's batch for prices (`DEFAULT_ACO_PRICES_IMPORT_BATCH_SIZE`). */
const PRICE_BATCH = 500;
/** The rest the service sends in one call; this keeps one call to a size ACO takes for products. */
const OTHER_BATCH = 100;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const localeOf = (row: Record<string, unknown>): string => text((row.source as { locale?: unknown } | undefined)?.locale);

/** The service's own schema, row by row, so the refusal names the row. */
function bySchema(kind: AcoExportKind) {
    return (row: unknown): string | undefined => acoRowsProblem(kind, [row] as AcoPackRows[typeof kind]);
}

/** A product layer: no schema is carried here, so its two keys are checked by hand. */
function layerProblem(row: unknown): string | undefined {
    if (!row || typeof row !== 'object') return 'a layer must be an object';
    const { sku, source } = row as { sku?: unknown; source?: { layer?: unknown } };
    if (typeof sku !== 'string' || sku.trim() === '') return 'a layer needs a sku';
    if (typeof source?.layer !== 'string' || source.layer.trim() === '') return 'a layer needs source.layer';
    return undefined;
}

const PRODUCTS: Omit<AcoKind, 'kind'> = {
    path: '/v1/catalog/products',
    batch: PRODUCT_BATCH,
    noun: 'product',
    problem: bySchema('aco_products'),
    keyOf: (row) => ({ remove: { sku: row.sku, source: { locale: localeOf(row) } }, name: `${text(row.sku)} (${localeOf(row)})` }),
};

/** Every kind, in the order a pack is loaded. Removal runs it backwards. */
export const ACO_KINDS: readonly AcoKind[] = [
    {
        kind: 'aco_metadata',
        path: '/v1/catalog/products/metadata',
        batch: OTHER_BATCH,
        noun: 'attribute',
        problem: bySchema('aco_metadata'),
        keyOf: (row) => ({ remove: { code: row.code, source: { locale: localeOf(row) } }, name: `${text(row.code)} (${localeOf(row)})` }),
    },
    {
        kind: 'aco_categories',
        path: '/v1/catalog/categories',
        batch: OTHER_BATCH,
        noun: 'category',
        problem: bySchema('aco_categories'),
        keyOf: (row) => ({ remove: { slug: row.slug, source: { locale: localeOf(row) } }, name: `${text(row.slug)} (${localeOf(row)})` }),
    },
    { kind: 'aco_products', ...PRODUCTS },
    // The service's second name for the same kind (`data_processors_aco_import.json`).
    { kind: 'aco_product', ...PRODUCTS },
    {
        kind: 'aco_price_books',
        path: '/v1/catalog/price-books',
        batch: OTHER_BATCH,
        noun: 'price book',
        problem: bySchema('aco_price_books'),
        keyOf: (row) => ({ remove: { priceBookId: row.priceBookId }, name: text(row.priceBookId) }),
    },
    {
        kind: 'aco_prices',
        path: '/v1/catalog/products/prices',
        batch: PRICE_BATCH,
        noun: 'price',
        problem: bySchema('aco_prices'),
        keyOf: (row) => ({ remove: { sku: row.sku, priceBookId: row.priceBookId }, name: `${text(row.sku)} in ${text(row.priceBookId)}` }),
    },
    {
        kind: 'aco_product_layers',
        path: '/v1/catalog/products/layers',
        batch: OTHER_BATCH,
        noun: 'product layer',
        problem: layerProblem,
        keyOf: (row) => {
            const source = row.source as { locale?: unknown; layer?: unknown };
            const remove = { sku: row.sku, source: { ...(typeof source.locale === 'string' ? { locale: source.locale } : {}), layer: source.layer } };
            return { remove, name: `${text(row.sku)} layer ${text(source.layer)}` };
        },
    },
];

/** Whether a pack data type is one of ACO's. */
export function isAcoKind(kind: string): boolean {
    return kind.startsWith('aco_');
}

/** The kind's entry, or undefined for a kind this engine does not load into ACO. */
export function acoKind(kind: string): AcoKind | undefined {
    return ACO_KINDS.find((entry) => entry.kind === kind);
}

/** The ingestion delete path for a kind. */
export function deletePathOf(kind: AcoKind): AcoIngestionPath {
    return `${kind.path}/delete` as AcoIngestionPath;
}
