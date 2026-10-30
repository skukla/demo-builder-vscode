/**
 * Make an Adobe Commerce Optimizer (ACO) pack from the project's Commerce store, for the store
 * views the SC picks, and save it into the SC's datapack library (datapack-engine step 14
 * item 19, PL-60). The port of the Data Installer service's `process-aco-datapack` export; what
 * it reads, makes and does differently is `.rptc/research/datapack-engine/aco-export-spec.md`.
 *
 * The kinds run in the service's order, each on its own: a kind whose read or shape check fails
 * is reported with its reason and the others are still saved, as the service stores each kind
 * on its own. The pack is written once, through the seam "Save store changes" writes through
 * (`writePackToStore`, never `update`), so a name and version already in the library is refused
 * and the save is undone by deleting the pack from the library.
 *
 * Installing an ACO pack is not here: Demo Builder's engine refuses ACO kinds (step 11), and
 * PL-60 owns their install.
 *
 * @module features/data-installer/services/acoExport/acoPackExport
 */

import { DatapackTransferError, type PackWriteOutcome } from '../datapackTransfer';
import type { DatapackFile } from '../datapackZip';
import { type ChosenViews, buildAcoKind } from './acoPackKinds';
import { acoRowsProblem } from './acoPackSchemas';
import { type AcoCommerce, AcoExportError, AcoStoreReads } from './acoStoreReads';
import { ACO_EXPORT_KINDS, type AcoExportKind, type AcoPackRows } from '@/types/acoPack';
import type { DatapackId } from '@/types/datapack';

/** What to make, and from which store views. */
export interface AcoExportRequest {
    id: DatapackId;
    displayName?: string;
    /** Store view codes; none means every one, as the service exports. */
    storeViews?: string[];
    /** Kinds to make; none means all five. */
    dataTypes?: string[];
}

/** What one kind did, in the shape the export screen already reads (`ExportDatapackResult`). */
export interface AcoKindOutcome {
    dataType: AcoExportKind;
    success: boolean;
    exported: number;
    /** Products left out: downloadable and grouped ones (prices: downloadable only). */
    excluded: number;
    reason?: string;
}

/** What the export did. */
export interface AcoExportOutcome {
    /** Every kind asked for was made and saved. */
    success: boolean;
    perType: AcoKindOutcome[];
    /** The pack written into the library, when anything was. */
    saved?: DatapackId;
    /** The store views the rows were made for. */
    storeViews: string[];
    /** The one sentence the SC reads. */
    sentence: string;
}

export interface AcoExportDeps {
    commerce: AcoCommerce;
    log: (line: string) => void;
    now?: () => Date;
}

/** The kinds asked for, in the service's order; anything else is refused before a read. */
function kindsAsked(dataTypes: readonly string[] | undefined): AcoExportKind[] {
    if (!dataTypes || dataTypes.length === 0) return [...ACO_EXPORT_KINDS];
    const unknown = dataTypes.filter(
        (type) => !(ACO_EXPORT_KINDS as readonly string[]).includes(type),
    );
    if (unknown.length > 0) {
        throw new AcoExportError(
            `An ACO pack is made of ${ACO_EXPORT_KINDS.join(', ')}; ${unknown.join(', ')} cannot be made from a Commerce store here (the Data Installer's own export makes no product layers either).`,
        );
    }
    return ACO_EXPORT_KINDS.filter((kind) => dataTypes.includes(kind));
}

/** The store views asked for, checked against the store's; every one when none were asked. */
async function storeViewsAsked(
    reads: AcoStoreReads,
    asked: readonly string[] | undefined,
): Promise<ChosenViews> {
    const known = (await reads.storeViews()).map((view) => view.code);
    if (!asked || asked.length === 0) return { codes: [...new Set(known)].sort(), chosen: false };
    const missing = asked.filter((code) => !known.includes(code));
    if (missing.length > 0)
        throw new AcoExportError(
            `The store has no store view ${missing.join(', ')}. It has ${known.join(', ')}.`,
        );
    return { codes: [...new Set(asked)].sort(), chosen: true };
}

/** One kind's rows, or why there are none. */
async function runKind(
    kind: AcoExportKind,
    make: () => Promise<{ rows: unknown[]; excluded: number }>,
): Promise<{ outcome: AcoKindOutcome; rows: unknown[] }> {
    try {
        const { rows, excluded } = await make();
        const problem =
            rows.length > 0 ? acoRowsProblem(kind, rows as AcoPackRows[typeof kind]) : undefined;
        if (problem)
            return {
                outcome: {
                    dataType: kind,
                    success: false,
                    exported: 0,
                    excluded,
                    reason: `The Data Installer's schema refuses it: ${problem}`,
                },
                rows: [],
            };
        return {
            outcome: { dataType: kind, success: true, exported: rows.length, excluded },
            rows,
        };
    } catch (error) {
        // The store itself refused (no sign-in, no credential): nothing else can be read either.
        if (error instanceof AcoExportError) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        return {
            outcome: { dataType: kind, success: false, exported: 0, excluded: 0, reason },
            rows: [],
        };
    }
}

/** Write the kinds that have rows; a refused kind is marked failed with the library's reason. */
async function save(
    request: AcoExportRequest,
    built: Array<{ outcome: AcoKindOutcome; rows: unknown[] }>,
    write: (file: DatapackFile) => Promise<PackWriteOutcome>,
    now: Date,
): Promise<DatapackId | undefined> {
    const items = built
        .filter((b) => b.rows.length > 0)
        .map((b) => ({ dataType: b.outcome.dataType, records: b.rows }));
    if (items.length === 0) return undefined;
    let written: PackWriteOutcome;
    try {
        written = await write({
            id: request.id,
            displayName: request.displayName ?? request.id.name,
            items,
            source: 'library',
            exportedAt: now.toISOString(),
        });
    } catch (error) {
        if (!(error instanceof DatapackTransferError)) throw error;
        throw new AcoExportError(
            `${request.id.name}@${request.id.version} is already in your datapack library. Choose another version, or delete that one first.`,
        );
    }
    for (const failed of written.failed) {
        const entry = built.find((b) => b.outcome.dataType === failed.dataType);
        if (entry)
            entry.outcome = {
                ...entry.outcome,
                success: false,
                reason: `The library did not take it: ${failed.reason}`,
            };
    }
    return request.id;
}

function sentenceFor(outcome: Omit<AcoExportOutcome, 'sentence'>, id: DatapackId): string {
    if (!outcome.saved) return 'The store had nothing to put in an ACO pack, so nothing was saved.';
    const made = outcome.perType.filter((t) => t.success && t.exported > 0).length;
    const failed = outcome.perType.filter((t) => !t.success).length;
    const tail = failed > 0 ? ` ${failed} of the kinds could not be made; each says why.` : '';
    return `Saved the ACO pack ${id.name}@${id.version} to your datapack library: ${made} kinds for ${outcome.storeViews.join(', ')}.${tail}`;
}

/**
 * Make the pack and save it.
 *
 * @throws AcoExportError when the store cannot be read at all, a store view or kind asked for
 *   does not exist, or the library already holds that name and version (nothing is written)
 */
export async function exportAcoPack(
    deps: AcoExportDeps,
    request: AcoExportRequest,
    write: (file: DatapackFile) => Promise<PackWriteOutcome>,
): Promise<AcoExportOutcome> {
    const kinds = kindsAsked(request.dataTypes);
    const reads = new AcoStoreReads(deps.commerce, deps.log);
    const views = await storeViewsAsked(reads, request.storeViews);
    const built = [];
    for (const kind of kinds) {
        deps.log(`aco export: making ${kind} for ${views.codes.join(', ')}`);
        built.push(await runKind(kind, () => buildAcoKind(kind, reads, views)));
    }
    const saved = await save(request, built, write, (deps.now ?? (() => new Date()))());
    const perType = built.map((b) => b.outcome);
    const outcome = {
        success: perType.every((t) => t.success),
        perType,
        storeViews: views.codes,
        ...(saved ? { saved } : {}),
    };
    return { ...outcome, sentence: sentenceFor(outcome, request.id) };
}
