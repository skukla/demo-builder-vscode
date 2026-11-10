/**
 * The `product_export` kind: products in Commerce's import form, the Data Installer service's own kind
 * for them (`dsc-data-installer-api`, `config/data_processors_import.json`: `JsonImportProcessor`, one
 * `{ source: { entity, behavior, items } }` body sent to `import/json`). A pack holding it installs here
 * as it does there, with the service's substitutions: the target's website on every row, its store view
 * on a store view's rows, its root category first in every category path.
 *
 * Where this deliberately differs from the service, to keep "whatever can be done can be undone":
 * - A category path the store lacks is made by the categories kind first, so it is on the record; the
 *   import would make it unrecorded.
 * - A SKU the store already has is left alone, the pack's own from an earlier install included: the
 *   import would overwrite it, and an install never overwrites an edit made in the Admin. One the pack
 *   made and the SC deleted since stays deleted, as every kind's does.
 * - Every product is pending on the record before its call, and read back after it: only a SKU the
 *   store now has counts as made, since the answer counts refused rows too (`importApi.ts`).
 * - A row that did not land is sent on its own, stopping on its error, for Commerce's reason.
 * - The root goes first in EVERY path of a row's comma-separated list, not only the first.
 *
 * Children go in one call and their parents in the next: a configurable sent with its children is
 * refused, checked before they exist (13 of 13 refused together, 13 of 13 made after, 2026-11-06).
 *
 * @module features/data-installer/services/demoBuilderEngine/productExportKind
 */

import { z } from 'zod';
import { LINKING_OPTIONS } from '../../types';
import { skusInStore } from './bulkProducts';
import { installCategories, parseCategoryPack } from './categoriesKind';
import { importBody, importOneRow, importRefusal } from './importApi';
import type { CreatedObject } from './installRecord';
import { eachFewAtOnce, type KindContext, readOrNull, REQUESTS_AT_ONCE, segment } from './kindContext';
import type { PendingObject } from './pendingRecord';
import { GIFT_CARD_KIND, PRODUCT_KIND } from './productKinds';
import { skipRow } from './refusedRows';
import { runInBatches } from '@/core/utils/promiseUtils';

export const PRODUCT_EXPORT_KIND = 'product_export';

/** Products per import call: it runs inside the request, and the Commerce client gives up after ten seconds. */
export const PRODUCTS_PER_IMPORT = 100;

/**
 * Parents per import call. A configurable costs far more in a big call than in a small one: 100 in one
 * call took 97 s, 19 in three calls of six or seven took 2 s (ACCS sandbox, 2026-11-06).
 */
export const PARENTS_PER_IMPORT = 20;

/**
 * Import calls in flight at once, for products that link no others: three ran together and every row
 * landed whole (2026-11-06). Parents go one call at a time: with three calls at once, 80 of Luma's 147
 * configurables were made with their children linked but no options, and the same rows imported one
 * call at a time came out whole (ACCS sandbox, 2026-11-06).
 */
export const IMPORT_CALLS_AT_ONCE = 3;

/** The rows in calls of at most `size` products, a product's store-view rows in the same call as it. */
function callsOf(rows: readonly ExportRow[], size: number): ExportRow[][] {
    const bySku = new Map<string, ExportRow[]>();
    for (const row of rows) bySku.set(row.sku, [...(bySku.get(row.sku) ?? []), row]);
    const products = [...bySku.values()];
    return Array.from({ length: Math.ceil(products.length / size) }, (_, i) => products.slice(i * size, (i + 1) * size).flat());
}

/** Types that link other products, so they go after them. */
const PARENT_TYPES = new Set(['configurable', 'bundle', 'grouped']);

const rowSchema = z
    .object({ sku: z.string().min(1), product_type: z.string().min(1) })
    .passthrough();
const packSchema = z.object({
    source: z
        .object({ entity: z.literal('catalog_product'), items: z.array(rowSchema) })
        .passthrough(),
});

export type ExportRow = z.infer<typeof rowSchema>;

/** The pack's rows, or why they cannot be installed. */
export function parseProductExport(records: unknown): ExportRow[] {
    const parsed = packSchema.safeParse(records);
    if (!parsed.success)
        throw new Error(
            `The datapack's product_export rows are not in the shape Commerce takes: ${parsed.error.issues[0]?.message}`,
        );
    return parsed.data.source.items;
}

/** The record kind a row's product is kept under: a gift card as one, so it is read and removed as one. */
const kindOf = (row: ExportRow): string =>
    row.product_type === 'giftcard' ? GIFT_CARD_KIND : PRODUCT_KIND;

/** A row's category paths, each its own: the export joins them with commas. */
const pathsOf = (row: ExportRow): string[] =>
    typeof row.categories === 'string'
        ? row.categories
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
        : [];

/** A path under `root`: its first part, the source store's root, replaced. */
const onRoot = (path: string, root: string): string =>
    [root, ...path.split('/').slice(1)].join('/');

/** The row as this store takes it: the service's substitutions (see the module comment). */
function forStore(row: ExportRow, ctx: KindContext, root: string): Record<string, unknown> {
    const out: Record<string, unknown> = {
        ...row,
        product_websites: ctx.session.websiteCode ?? row.product_websites,
    };
    if (
        typeof row.store_view_code === 'string' &&
        row.store_view_code !== '' &&
        ctx.session.storeCode
    )
        out.store_view_code = ctx.session.storeCode;
    if (typeof row.categories === 'string')
        out.categories = pathsOf(row)
            .map((p) => onRoot(p, root))
            .join(',');
    return out;
}

/** Every category the rows name, as the categories kind takes them: each path's parts, made in turn. */
function categoriesNamed(rows: readonly ExportRow[], root: string): unknown {
    const full = new Set<string>();
    for (const path of rows.flatMap(pathsOf).map((p) => onRoot(p, root))) {
        const parts = path.split('/');
        for (let depth = 2; depth <= parts.length; depth += 1)
            full.add(parts.slice(0, depth).join('/'));
    }
    const categories = [...full].map((path) => {
        const parts = path.split('/');
        return {
            category: {
                name: parts[parts.length - 1],
                path: parts.slice(0, -1).join('/'),
                is_active: true,
                include_in_menu: true,
            },
        };
    });
    return { categories };
}

/** The name of the root the products' categories go under: the session's, read when not known yet. */
async function rootName(ctx: KindContext): Promise<string> {
    if (ctx.session.rootCategory.name) return ctx.session.rootCategory.name;
    const root = await readOrNull<{ name?: string }>(
        ctx.get,
        `categories/${segment(ctx.session.rootCategory.id)}`,
    );
    return root?.name ?? 'Default Category';
}

const pendingOf = (rows: readonly ExportRow[]): PendingObject[] =>
    rows.map((r) => ({ kind: kindOf(r), key: r.sku, id: r.sku }));

/** One call's rows imported, read back, recorded; a row that did not land sent alone for its reason. */
async function importCall(
    ctx: KindContext,
    rows: readonly ExportRow[],
    root: string,
    skipKind: string,
): Promise<void> {
    await ctx.recorder.markPending(pendingOf(rows));
    await ctx.send(
        'POST',
        'import/json',
        importBody(
            'catalog_product',
            'append',
            rows.map((r) => forStore(r, ctx, root)),
        ),
    );
    const there = await skusInStore(
        ctx.get,
        rows.map((r) => r.sku),
    );
    let missing = rows.filter((r) => !there.has(r.sku.toLowerCase()));
    const reasons = new Map<string, string>();
    for (const row of missing)
        reasons.set(
            row.sku,
            (await importOneRow(ctx.send, 'catalog_product', forStore(row, ctx, root))) ?? '',
        );
    if (missing.length > 0) {
        const now = await skusInStore(
            ctx.get,
            missing.map((r) => r.sku),
        );
        missing = missing.filter((r) => !now.has(r.sku.toLowerCase()));
    }
    const made = rows.filter((r) => !missing.includes(r));
    const objects: CreatedObject[] = made.map((r) => ({ kind: kindOf(r), id: r.sku, key: r.sku }));
    await ctx.recorder.confirm(pendingOf(made), objects);
    for (const row of made) ctx.log(`created product ${row.sku}`);
    await ctx.recorder.forgetPending(pendingOf(missing));
    for (const sku of new Set(missing.map((r) => r.sku)))
        skipRow(ctx, {
            kind: skipKind,
            key: sku,
            reason: reasons.get(sku) || 'Commerce took the row but did not make the product',
        });
}

/**
 * The products count as the progress line says it, and while configurable products go in, the slow
 * part named after it (walk F122). Both install routes say it here, so they say it the same way.
 */
export function productsLine(done: number, total: number, noun: string, parents: boolean): string {
    const count = `${done.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} ${noun}`;
    return parents ? `${count}${LINKING_OPTIONS}` : count;
}

/**
 * Install the rows: their categories first, then the products the pack may make, children before
 * parents, a hundred to an import call.
 */
export async function installProductExport(
    ctx: KindContext,
    rows: readonly ExportRow[],
): Promise<void> {
    const root = await rootName(ctx);
    await installCategories(ctx, parseCategoryPack(categoriesNamed(rows, root)));
    // A store view's rows are a product's too: one line per product, said on its store-wide row.
    const there = await skusInStore(ctx.get, [...new Set(rows.map((r) => r.sku))]);
    const ours = (row: ExportRow) => ctx.recorder.has(kindOf(row), row.sku);
    for (const row of rows.filter(
        (r) => there.has(r.sku.toLowerCase()) && !ours(r) && !r.store_view_code,
    ))
        ctx.log(`left ${row.sku} alone: the store already has it`);
    const todo = rows.filter((r) => !there.has(r.sku.toLowerCase()) && !ours(r));
    const total = new Set(todo.map((r) => r.sku)).size;
    let done = 0;
    const counted = (parents: boolean) => (count: number) => {
        done += count;
        ctx.progress?.(productsLine(done, total, 'products', parents));
    };
    // Children first, all of them, then the parents that link them.
    await importProductRows(ctx, todo.filter((r) => !PARENT_TYPES.has(r.product_type)), { skipKind: PRODUCT_EXPORT_KIND, parents: false, onDone: counted(false) });
    await importProductRows(ctx, todo.filter((r) => PARENT_TYPES.has(r.product_type)), { skipKind: PRODUCT_EXPORT_KIND, parents: true, onDone: counted(true) });
}

/**
 * Import these rows, a few calls at once, a product's store-view rows in its own call; each product
 * pending first, read back, recorded, a refused one named under `skipKind`. One wave: none of them may
 * link another in the same rows.
 *
 * @param onDone - told how many products each call settled, for the progress line
 */
export async function importProductRows(
    ctx: KindContext,
    rows: readonly ExportRow[],
    options: { skipKind: string; parents: boolean; onDone?: (count: number) => void },
): Promise<void> {
    if (rows.length === 0) return;
    const root = await rootName(ctx);
    await eachFewAtOnce(
        callsOf(rows, options.parents ? PARENTS_PER_IMPORT : PRODUCTS_PER_IMPORT),
        async (call) => {
            // Each call's time, for Debug Logs (walk F122): what decides whether smaller calls, or
            // counting mid-call, would move the products count more often.
            const started = Date.now();
            await importCall(ctx, call, root, options.skipKind);
            const count = new Set(call.map((r) => r.sku)).size;
            ctx.log(`imported ${count} ${options.parents ? 'parent' : 'simple'} products in one call in ${((Date.now() - started) / 1000).toFixed(1)} s`);
            options.onDone?.(count);
        },
        options.parents ? 1 : IMPORT_CALLS_AT_ONCE,
    );
    if (options.parents) await checkConfigurables(ctx, rows, root, options.skipKind);
}

/** A configurable's options as the store holds them; none means it cannot be bought by size or colour. */
async function optionsOf(ctx: KindContext, sku: string): Promise<unknown[]> {
    return ((await readOrNull<unknown[]>(ctx.get, `configurable-products/${segment(sku)}/options/all`)) ?? []) as unknown[];
}

/**
 * Every configurable the import made, checked for its options: one made with its children linked but
 * no options (seen live, 2026-11-06) is imported again alone, and if it still has none it is named as
 * skipped rather than left half-made. Its children and the product itself stay on the record.
 */
async function checkConfigurables(ctx: KindContext, rows: readonly ExportRow[], root: string, skipKind: string): Promise<void> {
    const made = rows.filter((r) => r.product_type === 'configurable' && !r.store_view_code && ctx.recorder.has(kindOf(r), r.sku));
    const bare = (await runInBatches([...made], REQUESTS_AT_ONCE, async (r) => ((await optionsOf(ctx, r.sku)).length === 0 ? r : undefined))).filter(
        (r): r is ExportRow => r !== undefined,
    );
    for (const row of bare) {
        await ctx.send('POST', 'import/json', importBody('catalog_product', 'append', [forStore(row, ctx, root)], 'validation-stop-on-errors'));
        if ((await optionsOf(ctx, row.sku)).length > 0) continue;
        skipRow(ctx, { kind: skipKind, key: row.sku, reason: 'Commerce made it with its children but without its options, twice' });
    }
}

/**
 * Bring products the pack made before up to the pack's rows, a hundred to an import call: an update a
 * reinstall decided on (`repeatInstall.applyUpdates`). Each call stops on its first refused row, so the
 * row is named; the call is sent again without it. Only a product's store-wide row is sent.
 *
 * @returns the SKUs brought up to the pack; a refused one is skipped and named
 */
export async function updateProductRows(ctx: KindContext, rows: readonly ExportRow[]): Promise<string[]> {
    const root = await rootName(ctx);
    const updated: string[] = [];
    for (let start = 0; start < rows.length; start += PRODUCTS_PER_IMPORT) {
        let call = rows.slice(start, start + PRODUCTS_PER_IMPORT);
        while (call.length > 0) {
            const answer = await ctx.send('POST', 'import/json', importBody('catalog_product', 'append', call.map((r) => forStore(r, ctx, root)), 'validation-stop-on-errors'));
            const refusal = importRefusal(answer);
            if (refusal === undefined) {
                updated.push(...call.map((r) => r.sku));
                break;
            }
            // "Row N": the call's Nth row, which stopped it; nothing in the call was imported.
            const at = Number(/^Row (\d+)/u.exec(refusedLine(answer))?.[1] ?? 1) - 1;
            const bad = call[Math.min(Math.max(at, 0), call.length - 1)];
            skipRow(ctx, { kind: PRODUCT_EXPORT_KIND, key: bad.sku, reason: refusal });
            call = call.filter((r) => r !== bad);
        }
    }
    return updated;
}

/** The raw line of a stop-on-errors refusal, row number included. */
function refusedLine(answer: unknown): string {
    return (Array.isArray(answer) ? answer : []).find((line): line is string => typeof line === 'string' && !/^Entities Processed:/iu.test(line)) ?? '';
}
