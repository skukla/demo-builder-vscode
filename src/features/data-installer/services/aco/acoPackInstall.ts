/**
 * Load an ACO pack into the project's ACO instance and take it back out (PL-60 P4), through the one
 * ACO client (`acoClient.ts`).
 *
 * The rules are the Commerce engine's where ACO allows them (`runPack.ts`, step 14):
 * - every row of every kind is checked before the first write (`acoRowProblems`), and a pack with
 *   one row ACO could not take is refused whole, naming it;
 * - a row ACO refuses at write time (400, 404, 409, 422) is skipped and named, and the rest go in:
 *   a refused batch is sent again one row at a time to find which; anything else (401, 403, 429
 *   after retries, 5xx, no answer) stops the install;
 * - the install record lists each row by the pack's own key, written down BEFORE its batch is
 *   sent, so a write that got no answer is still removed. A row ACO refused leaves the record
 *   again. What ACO answers a delete of a key it never took is NOT verified (no live call has been
 *   made); a 404 is read as already gone, and anything else stops the removal and says so.
 *
 * What ACO does NOT allow, said plainly rather than pretended (owner, 2026-10-31): its ingestion API
 * has deletes but no list or get, so nothing here can read back what ACO holds. There are no
 * fingerprints, no "edited since", no capture. Installing again sends every row again and replaces
 * ACO's copy; removing deletes exactly what the record lists, whether or not it was changed in
 * ACO's screens since, and whether or not ACO already held a row with that key before the install.
 *
 * @module features/data-installer/services/aco/acoPackInstall
 */

import {
    type CreatedObject,
    type InstallRecorder,
    type RecordFiles,
    forgetInstallRecord,
    openInstallRecord,
    readInstallRecord,
} from '../demoBuilderEngine/installRecord';
import type { SkippedRow } from '../demoBuilderEngine/kindContext';
import { AcoApiError, type AcoClient } from './acoClient';
import { ACO_KINDS, type AcoKind, deletePathOf } from './acoKinds';
import type { DatapackId } from '@/types/datapack';

/** A pack's rows, by data kind. */
export type AcoPackItems = Record<string, unknown>;

/** What an ACO install is handed. */
export interface AcoInstallContext {
    client: AcoClient;
    recorder: InstallRecorder;
    log: (line: string) => void;
}

/** What an ACO install did. */
export interface AcoInstallOutcome {
    /** Rows ACO accepted. */
    loaded: number;
    /** Rows ACO refused, each named with its reason. */
    skipped: SkippedRow[];
    /** The catalog source locales the pack's rows name. */
    locales: string[];
}

/** What an ACO removal did. */
export interface AcoRemovalResult {
    removed: number;
    /** True when the pack had no record: this engine never loaded it here. */
    noRecord: boolean;
}

/** The answers that refuse one row, not the instance. */
const ROW_STATUSES = new Set([400, 404, 409, 422]);

function isRowRefusal(error: unknown): error is AcoApiError {
    return error instanceof AcoApiError && error.stage === 'ingestion' && error.status !== undefined && ROW_STATUSES.has(error.status);
}

/** ACO's words alone, without the status line the client puts first. */
function reasonOf(error: AcoApiError): string {
    return error.message.replace(/^ACO answered \d+ for [^:]*: /u, '');
}

const rowsOf = (records: unknown): Record<string, unknown>[] => records as Record<string, unknown>[];

/** The pack's ACO kinds this engine loads, in load order. */
function kindsIn(items: AcoPackItems): AcoKind[] {
    return ACO_KINDS.filter((entry) => entry.kind in items);
}

/**
 * Every row of the pack's ACO kinds that ACO could not take, each named by kind and position; none
 * when all of them read. Run before the first write, by the install and the dry run.
 */
export function acoRowProblems(items: AcoPackItems): string[] {
    const problems: string[] = [];
    for (const kind of kindsIn(items)) {
        const records = items[kind.kind];
        if (!Array.isArray(records)) {
            problems.push(`${kind.kind}: its rows must be a list`);
            continue;
        }
        records.forEach((row, index) => {
            const problem = kind.problem(row);
            if (problem) problems.push(`${kind.kind} row ${index + 1}: ${problem}`);
        });
    }
    return problems;
}

/** Rows in batches of `size`, the last one shorter. */
export function chunks<T>(rows: readonly T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    return out;
}

function objectFor(kind: AcoKind, row: Record<string, unknown>): CreatedObject {
    const key = kind.keyOf(row);
    return { kind: kind.kind, id: JSON.stringify(key.remove), key: key.name };
}

/** Send a refused batch again one row at a time: refused rows are skipped and leave the record. */
async function rowByRow(ctx: AcoInstallContext, kind: AcoKind, batch: Record<string, unknown>[], skipped: SkippedRow[]): Promise<number> {
    let loaded = 0;
    for (const row of batch) {
        const object = objectFor(kind, row);
        try {
            loaded += await ctx.client.post(kind.path, [row]);
        } catch (error) {
            if (!isRowRefusal(error)) throw error;
            const refused = { kind: kind.kind, key: object.key ?? object.id, reason: reasonOf(error) };
            skipped.push(refused);
            ctx.log(`skipped ${refused.kind} ${refused.key}: ${refused.reason}`);
            await ctx.recorder.drop(object);
        }
    }
    return loaded;
}

async function installKind(ctx: AcoInstallContext, kind: AcoKind, rows: Record<string, unknown>[], skipped: SkippedRow[]): Promise<number> {
    let loaded = 0;
    for (const batch of chunks(rows, kind.batch)) {
        // Written down before it is sent: a write that gets no answer may still have landed.
        await ctx.recorder.confirm([], batch.map((row) => objectFor(kind, row)));
        try {
            loaded += await ctx.client.post(kind.path, batch);
        } catch (error) {
            if (!isRowRefusal(error)) throw error;
            loaded += await rowByRow(ctx, kind, batch, skipped);
        }
    }
    return loaded;
}

function localesOf(items: AcoPackItems): string[] {
    const locales = new Set<string>();
    for (const kind of kindsIn(items)) {
        for (const row of rowsOf(items[kind.kind])) {
            const locale = (row.source as { locale?: unknown } | undefined)?.locale;
            if (typeof locale === 'string') locales.add(locale);
        }
    }
    return [...locales];
}

/**
 * Load every ACO kind the pack holds, in order. The caller has run `acoRowProblems` first.
 *
 * @param onKind - called as each kind starts, for progress
 * @throws AcoApiError when ACO refuses who we are, asks us to slow down past the retries, fails or
 *   does not answer; what was sent stays on the record
 */
export async function installAcoPack(ctx: AcoInstallContext, items: AcoPackItems, onKind: (kind: string) => void = () => undefined): Promise<AcoInstallOutcome> {
    const skipped: SkippedRow[] = [];
    let loaded = 0;
    for (const kind of kindsIn(items)) {
        onKind(kind.kind);
        loaded += await installKind(ctx, kind, rowsOf(items[kind.kind]), skipped);
    }
    return { loaded, skipped, locales: localesOf(items) };
}

/** The record's objects of one kind, grouped in removal order: the reverse of load order. */
function removalGroups(created: readonly CreatedObject[]): Array<{ kind: AcoKind; objects: CreatedObject[] }> {
    return [...ACO_KINDS]
        .reverse()
        .map((kind) => ({ kind, objects: created.filter((o) => o.kind === kind.kind) }))
        .filter((group) => group.objects.length > 0);
}

/**
 * Delete everything the record lists, by the pack's own keys, newest kind first, dropping each from
 * the record as its delete is accepted; forget the record once it is empty.
 *
 * @throws AcoApiError when ACO refuses a delete; what was deleted stays off the record, so running
 *   it again carries on from there
 */
export async function removeAcoPack(
    client: AcoClient,
    files: RecordFiles,
    target: { projectPath: string; pack: DatapackId },
): Promise<AcoRemovalResult> {
    const record = await readInstallRecord(files, target.projectPath, target.pack);
    if (!record) return { removed: 0, noRecord: true };
    const recorder = await openInstallRecord(files, target.projectPath, target.pack, () => record.startedAt);
    let removed = 0;
    for (const { kind, objects } of removalGroups(recorder.created)) {
        for (const batch of chunks(objects, kind.batch)) {
            try {
                await client.post(deletePathOf(kind), batch.map((o) => JSON.parse(o.id) as unknown));
            } catch (error) {
                // Not there is gone: what removal wants.
                if (!(error instanceof AcoApiError && error.status === 404)) throw error;
            }
            for (const object of batch) await recorder.drop(object);
            removed += batch.length;
        }
    }
    await forgetInstallRecord(files, target.projectPath, target.pack);
    return { removed, noRecord: false };
}
