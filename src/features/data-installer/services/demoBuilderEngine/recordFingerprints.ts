/**
 * Hash what an install made, once it has made it (step 05): every recorded object without a
 * store hash is read back from the store, in pack form, and given its key, the store's hash
 * (`fingerprint`) and the hash of the pack row it was made from (`wrote`).
 *
 * One read after the writes, rather than Commerce's answer to each write: a new stock is
 * answered with its id alone (seen live by the ERP warehouse step), and no answer to the other
 * writes is recorded in the repo, so reading back is the one way every kind is hashed alike, and
 * by the same route a later comparison reads it.
 *
 * A read that fails leaves those objects unhashed and the install standing: the writes are done,
 * and the next install hashes them then, as it does an object recorded before hashes were kept.
 *
 * @module features/data-installer/services/demoBuilderEngine/recordFingerprints
 */

import { fingerprintRow } from './fingerprint';
import type { CreatedObject } from './installRecord';
import type { KindContext } from './kindContext';
import { keyOf } from './packForm';
import { productLookups } from './productLookups';
import { READABLE_KINDS, onceInventory, packKindOf, packedFingerprint, readCopies, rowsByKey } from './storeCopies';

/** One object, hashed from its copy now and against the row it matches, if any. */
function hashed(kind: string, object: CreatedObject, copy: unknown, rows: Map<string, unknown>, key: string | undefined): CreatedObject {
    const row = key === undefined ? undefined : rows.get(key);
    const { wrote: _wrote, ...rest } = object;
    return {
        ...rest,
        ...(key !== undefined ? { key } : {}),
        fingerprint: fingerprintRow(copy),
        ...(row !== undefined ? { wrote: packedFingerprint(kind, row) } : { ...(object.wrote ? { wrote: object.wrote } : {}) }),
    };
}

/** The store's copies of some recorded objects of each kind, read with one set of lookups. */
async function copiesByKind(ctx: KindContext, objects: readonly CreatedObject[]): Promise<Map<string, Map<string, unknown>>> {
    // Fresh lookups: an install's own have cached answers from before its writes.
    const lk = productLookups(ctx);
    const inventory = onceInventory(ctx);
    const byKind = new Map<string, Map<string, unknown>>();
    for (const kind of READABLE_KINDS) {
        const of = objects.filter((o) => o.kind === kind);
        if (of.length === 0) continue;
        try {
            byKind.set(kind, await readCopies(ctx, lk, kind, of, inventory));
        } catch (error) {
            ctx.log(`could not read ${kind} back to hash: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return byKind;
}

/**
 * Read back and hash every recorded object that has no store hash yet.
 *
 * @param items - the pack's rows, by kind, for the hash of the row each object was made from
 */
export async function recordFingerprints(ctx: KindContext, items: Record<string, unknown>): Promise<void> {
    const pending = ctx.recorder.created.filter((o) => o.fingerprint === undefined);
    const copies = await copiesByKind(ctx, pending);
    for (const object of pending) {
        const copy = copies.get(object.kind)?.get(object.id);
        if (copy === undefined) continue;
        const rows = rowsByKey(object.kind, items[packKindOf(object.kind)]);
        const next = hashed(object.kind, object, copy, rows, object.key ?? keyOf(object.kind, copy));
        await ctx.recorder.update({ kind: next.kind, id: next.id, key: next.key, fingerprint: next.fingerprint, wrote: next.wrote });
    }
}

/**
 * The record for a version just saved from the store: every object hashed afresh from the
 * store now, keyed by what the saved rows call it, against the row the version holds for it.
 * An object the store no longer has is left off: the version does not hold it either.
 *
 * @param saved - the saved version's rows, by kind
 */
export async function rebaseRecord(ctx: KindContext, created: readonly CreatedObject[], saved: Record<string, unknown>): Promise<CreatedObject[]> {
    const copies = await copiesByKind(ctx, created);
    const rebased: CreatedObject[] = [];
    for (const object of created) {
        const copy = copies.get(object.kind)?.get(object.id);
        if (copy === undefined) continue;
        const rows = rowsByKey(object.kind, saved[packKindOf(object.kind)]);
        rebased.push(hashed(object.kind, object, copy, rows, keyOf(object.kind, copy)));
    }
    return rebased;
}
