/**
 * Does the store hold what the pack says? A read-only check of an install's products against the pack
 * they came from (owner, 2026-11-06). Two defects shipped through installs that reported success with
 * nothing skipped: Luma's sizes written "32" where the option was "Size 32", taken as option id 32, so
 * about 500 products got the wrong size; and 80 of 147 configurables made with their children linked
 * but no options, so no size or colour could be chosen. Both were found by hand.
 *
 * For each product the pack made (the install record's, or every product the pack holds when there is
 * no record), in either pack form (`products` records or `product_export` rows):
 * - it is in the store;
 * - a configurable has options, on the attributes the pack names, and the children the pack names;
 * - each select or multi-select value the pack names is the option the store holds (by label; a pack
 *   value that is the stored option's id also matches);
 * - its price, when the pack gives one.
 *
 * @module features/data-installer/services/demoBuilderEngine/verifyInstall
 */

import { pairs } from '../exportPack/exportRows';
import { sameText } from './b2bReads';
import { type InstallRecord, nodeRecordFiles, readInstallRecord } from './installRecord';
import { type KindContext, REQUESTS_AT_ONCE } from './kindContext';
import { PRODUCT_EXPORT_KIND } from './productExportKind';
import { additionalAsCustom } from './productImportRows';
import { PRODUCT_KINDS } from './productKinds';
import { isNumeric, type ProductLookups, productLookups } from './productLookups';
import { parseProductRows } from './productsKind';
import { openStore, type StoreChangesDeps } from './storeAccess';
import { knowingSkus, readProducts } from './storeCopies';
import { runInBatches } from '@/core/utils/promiseUtils';
import type { CommerceProduct } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** Examples named per finding: enough to act on, few enough to read. */
const EXAMPLES = 20;

/** What the pack says of one product. */
interface PackProduct {
    sku: string;
    type: string;
    price?: number;
    values: Map<string, string[]>;
    optionCodes: string[];
    children: string[];
}

/** One finding: how many, and the first few. */
export interface Finding<T> {
    count: number;
    examples: T[];
}

/** The check's answer. */
export interface InstallCheck {
    verdict: 'matches' | 'differs';
    checked: number;
    /**
     * How many of each the check actually compared, so a `matches` that compared nothing (a pack whose
     * values name no attribute the store has, say) reads as that rather than as a clean install.
     */
    compared: { values: number; prices: number; configurables: number };
    missing: Finding<string>;
    configurablesWithoutOptions: Finding<string>;
    configurablesDiffer: Finding<{ sku: string; differs: string }>;
    valuesDiffer: Finding<{ sku: string; attribute: string; pack: string; store: string }>;
    pricesDiffer: Finding<{ sku: string; pack: number; store: number }>;
}

const finding = <T>(all: T[]): Finding<T> => ({
    count: all.length,
    examples: all.slice(0, EXAMPLES),
});
const listOf = (value: unknown): string[] =>
    (Array.isArray(value) ? value : String(value ?? '').split(','))
        .map((v) => String(v).trim())
        .filter(Boolean);

/** The pack's products in `products` record form. */
function fromRecords(records: unknown): PackProduct[] {
    return parseProductRows(records).map((row) => {
        const ext = (row.extension_attributes ?? {}) as {
            configurable_product_options?: Array<{ attribute_id?: unknown }>;
            configurable_product_links?: unknown[];
        };
        const price = (row as { price?: unknown }).price;
        return {
            sku: row.sku,
            type: row.type_id,
            ...(typeof price === 'number' ? { price } : {}),
            values: new Map(
                additionalAsCustom(row).map((a) => [a.attribute_code, listOf(a.value)]),
            ),
            optionCodes: (ext.configurable_product_options ?? []).map((o) =>
                String(o.attribute_id ?? ''),
            ),
            children: (ext.configurable_product_links ?? []).map(String),
        };
    });
}

/** The pack's products in `product_export` row form: each product's store-wide row. */
function fromImportRows(records: unknown): PackProduct[] {
    const items = (
        (records as { source?: { items?: Array<Record<string, string>> } } | null)?.source?.items ??
        []
    ).filter((r) => !r.store_view_code);
    return items.map((r) => {
        const variations = String(r.configurable_variations ?? '')
            .split('|')
            .filter(Boolean)
            .map((v) => pairs(v));
        return {
            sku: r.sku,
            type: r.product_type,
            ...(r.price !== undefined && r.price !== '' ? { price: Number(r.price) } : {}),
            values: new Map(
                Object.entries(pairs(String(r.additional_attributes ?? ''))).map(([code, v]) => [
                    code,
                    v.split('|').map((x) => x.trim()),
                ]),
            ),
            optionCodes: [
                ...new Set(variations.flatMap((v) => Object.keys(v).filter((k) => k !== 'sku'))),
            ],
            children: variations.map((v) => v.sku).filter(Boolean),
        };
    });
}

/** Every product the pack holds, in whichever form it holds them. */
function packProducts(items: Record<string, unknown>): PackProduct[] {
    return [
        ...(items.products ? fromRecords(items.products) : []),
        ...(items.giftcards ? fromRecords(items.giftcards) : []),
        ...(items[PRODUCT_EXPORT_KIND] ? fromImportRows(items[PRODUCT_EXPORT_KIND]) : []),
    ];
}

/** A stored select value as its labels; a value the store holds no option for is kept as it is. */
async function storedLabels(lk: ProductLookups, code: string, value: unknown): Promise<string[]> {
    return Promise.all(
        listOf(value).map(
            async (id) => (await lk.optionLabel(code, id).catch(() => undefined)) ?? id,
        ),
    );
}

/** Whether a pack value names the stored option: by label, or as the stored option's own id. */
const sameValue = (pack: string, label: string, storedId: string): boolean =>
    sameText(pack, label) || (isNumeric(pack) && pack === storedId);

/** The select values of one product that differ between pack and store, and how many were compared. */
async function valueDiffs(lk: ProductLookups, pack: PackProduct, stored: CommerceProduct) {
    const out: InstallCheck['valuesDiffer']['examples'] = [];
    let compared = 0;

    for (const [code, packValues] of pack.values) {
        const attribute = await lk.attribute(code).catch(() => undefined);
        if (
            !attribute?.is_user_defined ||
            !['select', 'multiselect'].includes(attribute.frontend_input ?? '')
        )
            continue;
        compared += 1;
        const raw = stored.custom_attributes?.find((a) => a.attribute_code === code)?.value;
        const ids = listOf(raw);
        const labels = await storedLabels(lk, code, raw);
        const matches =
            packValues.length === ids.length &&
            packValues.every((v) => ids.some((id, i) => sameValue(v, labels[i], id)));
        if (!matches)
            out.push({
                sku: pack.sku,
                attribute: code,
                pack: packValues.join(', '),
                store: labels.join(', ') || '(none)',
            });
    }
    return { compared, diffs: out };
}

/**
 * What a configurable lacks or holds differently: its options' attributes and its children. Both come
 * with the product as the store lists it (`extension_attributes`, checked live 2026-11-06), so this
 * asks nothing more per configurable: asking `configurable-products/{sku}/options/all` for each of
 * Luma's 147 took the check past the 60 seconds an agent's client waits.
 */
async function configurableDiff(lk: ProductLookups, pack: PackProduct, stored: CommerceProduct) {
    const options =
        (stored.extension_attributes?.configurable_product_options as
            | Array<{ attribute_id?: unknown }>
            | undefined) ?? [];
    if (options.length === 0) return { bare: true };
    const codes = await Promise.all(
        options.map(
            async (o) => (await lk.attributeCode(String(o.attribute_id))) ?? String(o.attribute_id),
        ),
    );
    const children = await Promise.all(
        ((stored.extension_attributes?.configurable_product_links as unknown[]) ?? []).map((id) =>
            lk.productSku(String(id)),
        ),
    );
    const lower = (xs: Array<string | undefined>) =>
        new Set(xs.filter(Boolean).map((x) => String(x).toLowerCase()));
    const missingCodes = pack.optionCodes.filter((c) => !lower(codes).has(c.toLowerCase()));
    const missingChildren = pack.children.filter((c) => !lower(children).has(c.toLowerCase()));
    if (missingCodes.length === 0 && missingChildren.length === 0) return { bare: false };
    const differs = [
        missingCodes.length > 0 ? `no option for ${missingCodes.join(', ')}` : '',
        missingChildren.length > 0 ? `${missingChildren.length} children not linked` : '',
    ]
        .filter(Boolean)
        .join('; ');
    return { bare: false, differs };
}

/**
 * Check the store against the pack, for the products the pack made.
 *
 * @param record - the install record, when this engine installed the pack; without one every product
 *   the pack holds is checked
 */
export async function verifyInstall(
    ctx: KindContext,
    items: Record<string, unknown>,
    record: InstallRecord | undefined,
): Promise<InstallCheck> {
    const made = record
        ? new Set(
              record.created
                  .filter((o) => PRODUCT_KINDS.includes(o.kind))
                  .map((o) => o.id.toLowerCase()),
          )
        : undefined;
    const wanted = packProducts(items).filter((p) => !made || made.has(p.sku.toLowerCase()));
    const stored = await readProducts(
        ctx,
        wanted.map((p) => p.sku),
    );
    const bySku = new Map(stored.map((p) => [p.sku.toLowerCase(), p]));
    const lk = knowingSkus(productLookups(ctx), stored);
    const missing: string[] = [];
    const bare: string[] = [];
    const configDiffs: InstallCheck['configurablesDiffer']['examples'] = [];
    const prices: InstallCheck['pricesDiffer']['examples'] = [];
    const values: InstallCheck['valuesDiffer']['examples'] = [];
    const compared = { values: 0, prices: 0, configurables: 0 };
    await runInBatches(wanted, REQUESTS_AT_ONCE, async (pack) => {
        const copy = bySku.get(pack.sku.toLowerCase());
        if (!copy) return void missing.push(pack.sku);
        if (pack.type === 'configurable') {
            compared.configurables += 1;
            const diff = await configurableDiff(lk, pack, copy);
            if (diff.bare) bare.push(pack.sku);
            else if (diff.differs) configDiffs.push({ sku: pack.sku, differs: diff.differs });
        }
        if (pack.price !== undefined && pack.type !== 'configurable') {
            compared.prices += 1;
            if (Math.abs(Number(copy.price ?? 0) - pack.price) > 0.005)
                prices.push({ sku: pack.sku, pack: pack.price, store: Number(copy.price ?? 0) });
        }
        const read = await valueDiffs(lk, pack, copy);
        compared.values += read.compared;
        values.push(...read.diffs);
    });
    const clean =
        missing.length + bare.length + configDiffs.length + values.length + prices.length === 0;
    return {
        verdict: clean ? 'matches' : 'differs',
        checked: wanted.length,
        compared,
        missing: finding(missing.sort()),
        configurablesWithoutOptions: finding(bare.sort()),
        configurablesDiffer: finding(configDiffs),
        valuesDiffer: finding(values),
        pricesDiffer: finding(prices),
    };
}

/**
 * Check the project's store against a pack: the pack read from `source`, the install record from the
 * project. Reads only: the store is opened without a recorder, so not even the record is touched.
 *
 * @returns the check, and `installed`: whether Demo Builder's engine has a record of installing it here
 */
export async function verifyPackInstall(
    deps: StoreChangesDeps,
    pack: DatapackId,
    source: DatapackStoreName,
): Promise<InstallCheck & { installed: boolean }> {
    const items = await deps.readPack(pack, source);
    const record = await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack);
    const ctx = await openStore(deps, undefined, record);
    return { installed: record !== undefined, ...(await verifyInstall(ctx, items, record)) };
}
