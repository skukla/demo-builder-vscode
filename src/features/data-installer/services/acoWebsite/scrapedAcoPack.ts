/**
 * Save a website's products as an ACO pack in the SC's datapack library (PL-60 slice A).
 *
 * The rows are `scrapedAcoRows`'; each kind passes the Data Installer's own schema
 * (`acoRowsProblem`, the check G5's export runs) before anything is written, and the pack is
 * written once, through the same seam G5's export writes through (`writePackToStore`, handed in,
 * never `update`). So a name and version already in the library is refused, and the save is
 * undone by deleting the pack from the library (`delete_library_datapack`).
 *
 * The pack lands in the library for review, never in ACO (owner, P3): its description and the
 * answer both name every value the page did not state, so the SC can check them before loading.
 *
 * @module features/data-installer/services/acoWebsite/scrapedAcoPack
 */

import { acoRowsProblem } from '../acoExport/acoPackSchemas';
import { DatapackTransferError, type PackWriteOutcome } from '../datapackTransfer';
import type { DatapackFile } from '../datapackZip';
import { type ProposedValues, ScrapedPackError, scrapedAcoRows } from './scrapedAcoRows';
import { ACO_EXPORT_KINDS, type AcoExportKind, type AcoPackRows } from '@/types/acoPack';
import type { DatapackId } from '@/types/datapack';
import type { ProposableField, ScrapedProduct } from '@/types/scrapedProduct';

/**
 * The book prices go in when none is named: the one an ACO storefront reads when it sends no
 * `AC-Price-Book-ID` (`main`, per `.rptc/research/aco-support/research.md`, source S4).
 */
export const DEFAULT_PRICE_BOOK_ID = 'main';

/** What to save. */
export interface ScrapedPackRequest {
    id: DatapackId;
    displayName?: string;
    locale: string;
    currency: string;
    priceBookId?: string;
    products: readonly ScrapedProduct[];
}

/** What the save did. */
export interface ScrapedPackOutcome {
    saved: DatapackId;
    kinds: Array<{ dataType: AcoExportKind; rows: number }>;
    /** Kinds the library did not take, each with its reason. */
    failed: Array<{ dataType: string; reason: string }>;
    proposed: ProposedValues[];
    unpriced: string[];
    /** The one sentence the SC reads. */
    sentence: string;
}

/** Singular or plural, with its count. */
const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** How each proposable field is counted in a sentence. */
const FIELD_WORDS: Record<ProposableField, [string, string]> = {
    price: ['price', 'prices'],
    currency: ['currency', 'currencies'],
    sku: ['SKU', 'SKUs'],
    description: ['description', 'descriptions'],
    categories: ['category list', 'category lists'],
};

/** "3 prices and 12 SKUs were proposed …", or that every value was read. */
function proposedSentence(proposed: readonly ProposedValues[]): string {
    if (proposed.length === 0) return 'Every value was read from the page.';
    const counts = (Object.keys(FIELD_WORDS) as ProposableField[])
        .map((field) => [field, proposed.filter((p) => p.fields.includes(field)).length] as const)
        .filter(([, n]) => n > 0)
        .map(([field, n]) => count(n, ...FIELD_WORDS[field]));
    const list = counts.length > 1 ? `${counts.slice(0, -1).join(', ')} and ${counts[counts.length - 1]}` : counts[0];
    return `${list} ${counts.length === 1 && proposed.length === 1 ? 'was' : 'were'} proposed, not read from the page; review them before loading.`;
}

const unpricedSentence = (unpriced: readonly string[]): string =>
    unpriced.length === 0 ? '' : ` ${count(unpriced.length, 'product has', 'products have')} no price.`;

/** The kinds with rows, in the service's order, each checked against the service's schema. */
function checkedItems(rows: AcoPackRows): Array<{ dataType: AcoExportKind; records: unknown[] }> {
    const items = ACO_EXPORT_KINDS.filter((kind) => rows[kind].length > 0).map((kind) => ({
        dataType: kind,
        records: rows[kind] as unknown[],
    }));
    for (const item of items) {
        const problem = acoRowsProblem(item.dataType, rows[item.dataType]);
        if (problem)
            throw new ScrapedPackError(
                `The Data Installer's schema refuses the ${item.dataType}: ${problem}. Nothing was saved.`,
            );
    }
    return items;
}

/** Where the products came from, for the pack's description. */
function originsOf(products: readonly ScrapedProduct[]): string {
    return [...new Set(products.map((p) => p.origin))].join(', ');
}

/**
 * Make the pack and save it into the library.
 *
 * @param write - writes a pack file into the library (`writePackToStore(writer, file)`)
 * @throws ScrapedPackError when the products cannot be made into a pack, a kind fails the
 *   service's schema, or the library already holds that name and version (nothing is written)
 */
export async function saveScrapedAcoPack(
    request: ScrapedPackRequest,
    write: (file: DatapackFile) => Promise<PackWriteOutcome>,
    now: () => Date = () => new Date(),
): Promise<ScrapedPackOutcome> {
    const { id } = request;
    const displayName = request.displayName ?? id.name;
    const currency = request.currency.trim().toUpperCase();
    const made = scrapedAcoRows(request.products, {
        locale: request.locale,
        currency,
        priceBookId: request.priceBookId ?? DEFAULT_PRICE_BOOK_ID,
        priceBookName: `${displayName} (${currency})`,
    });
    const items = checkedItems(made.rows);
    const review = `${proposedSentence(made.proposed)}${unpricedSentence(made.unpriced)}`;
    const date = now();
    let written: PackWriteOutcome;
    try {
        written = await write({
            id,
            displayName,
            description: `Read from ${originsOf(request.products)} on ${date.toISOString().slice(0, 10)}. ${review}`,
            items,
            source: 'library',
            exportedAt: date.toISOString(),
        });
    } catch (error) {
        if (!(error instanceof DatapackTransferError)) throw error;
        throw new ScrapedPackError(
            `${id.name}@${id.version} is already in your datapack library. Choose another version, or delete that one first.`,
        );
    }
    const failedLine = written.failed.map((f) => ` The library did not take the ${f.dataType}: ${f.reason}.`).join('');
    return {
        saved: id,
        kinds: items.map((item) => ({ dataType: item.dataType, rows: item.records.length })),
        failed: written.failed,
        proposed: made.proposed,
        unpriced: made.unpriced,
        sentence: `Saved the ACO pack ${id.name}@${id.version} to your datapack library: ${count(made.rows.aco_products.length, 'product')}, ${count(made.rows.aco_categories.length, 'category', 'categories')}. ${review}${failedLine}`,
    };
}
