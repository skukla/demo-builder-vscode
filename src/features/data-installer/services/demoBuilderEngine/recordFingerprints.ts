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

import type { CaptureResult } from './capture';
import { fingerprintRow } from './fingerprint';
import type { CreatedObject, ObjectUpdate } from './installRecord';
import type { KindContext } from './kindContext';
import { keyOf } from './packForm';
import { GIFT_CARD_KIND } from './productKinds';
import { type ProductLookups, productLookups } from './productLookups';
import { STORE_CONFIG_KIND, rebasedSetting } from './storeConfigKind';
import { type ProductsSeen, READABLE_KINDS, onceInventory, packKindIn, packedFingerprint, readCopies, rowsByKey } from './storeCopies';
import type { CommerceProduct } from '@/types/commerceWire';

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

/**
 * Each kind's rows by key, indexed the first time a kind is asked for. Indexed per object, this and
 * a write per object were most of a two-minute pass after Luma's 2,046 products (2026-11-06).
 */
function rowsOnce(items: Record<string, unknown>): (kind: string) => Map<string, unknown> {
    const indexed = new Map<string, Map<string, unknown>>();
    return (kind) => {
        if (!indexed.has(kind)) indexed.set(kind, rowsByKey(kind, items[packKindIn(kind, items)]));
        return indexed.get(kind) as Map<string, unknown>;
    };
}

/**
 * The store's copies of some recorded objects of each kind, read with one set of lookups.
 *
 * @param lk - lookups whose answers are the store as it is now: an install's own have cached answers
 *   from before its writes, so a read-back makes fresh ones; a save's capture's are from moments ago
 */
async function copiesByKind(ctx: KindContext, objects: readonly CreatedObject[], lk: ProductLookups, seen?: ProductsSeen): Promise<Map<string, Map<string, unknown>>> {
    const inventory = onceInventory(ctx);
    const byKind = new Map<string, Map<string, unknown>>();
    for (const kind of READABLE_KINDS) {
        const of = objects.filter((o) => o.kind === kind);
        if (of.length === 0) continue;
        try {
            byKind.set(kind, await readCopies(ctx, lk, kind, of, inventory, seen));
        } catch (error) {
            ctx.log(`could not read ${kind} back to hash: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return byKind;
}

/**
 * Read back and hash every recorded object of the kinds this install ran that has no store hash yet.
 * A kind left out keeps what it has: hashing it now, after an earlier install stopped part way, would
 * take an edit made since for what the pack wrote.
 *
 * @param items - the pack's rows, by kind, for the hash of the row each object was made from
 */
export async function recordFingerprints(ctx: KindContext, items: Record<string, unknown>): Promise<CommerceProduct[]> {
    const pending = ctx.recorder.created.filter((o) => o.fingerprint === undefined && packKindIn(o.kind, items) in items);
    const read: CommerceProduct[] = [];
    const copies = await copiesByKind(ctx, pending, productLookups(ctx), (products) => void read.push(...products));
    const rowsOf = rowsOnce(items);
    const updates: ObjectUpdate[] = [];
    for (const object of pending) {
        const copy = copies.get(object.kind)?.get(object.id);
        if (copy === undefined) continue;
        const next = hashed(object.kind, object, copy, rowsOf(object.kind), object.key ?? keyOf(object.kind, copy));
        updates.push({ kind: next.kind, id: next.id, key: next.key, fingerprint: next.fingerprint, wrote: next.wrote });
    }
    if (updates.length > 0) await ctx.recorder.update(...updates);
    return read;
}

/**
 * The kinds whose saved row is found by the recorded id itself, since the pack names the row by it: a
 * product's or gift card's SKU, an attribute's code. Capture made those rows from the store through
 * the converters a read-back uses (`productPackForm`, `attributePackForm`), so the row is the copy.
 * Every other kind is recorded by the id the store gave it, which no pack row carries.
 */
const ROW_BY_ID: Record<string, readonly string[]> = {
    products: ['products', GIFT_CARD_KIND],
    [GIFT_CARD_KIND]: ['products', GIFT_CARD_KIND],
    product_attributes: ['product_attributes'],
};

/** The saved rows that are recorded objects' copies, by kind and recorded id (`ROW_BY_ID`). */
function copiesInRows(created: readonly CreatedObject[], saved: Record<string, unknown>): Map<string, Map<string, unknown>> {
    const byKind = new Map<string, Map<string, unknown>>();
    for (const kind of new Set(created.map((o) => o.kind))) {
        const from = ROW_BY_ID[kind];
        if (!from) continue;
        const rows = new Map<string, unknown>();
        for (const packKind of from) for (const [key, row] of rowsByKey(packKind, saved[packKind])) rows.set(key, row);
        byKind.set(kind, rows);
    }
    return byKind;
}

/**
 * The record for a version just saved from the store: every object hashed afresh from the
 * store now, keyed by what the saved rows call it, against the row the version holds for it.
 * An object the store no longer has is left off: the version does not hold it either. A setting
 * has no copy to hash: it stays, or removal would never put it back (step 09).
 *
 * Given the capture the version was saved from, it reads none of what the capture read: a product,
 * gift card or attribute is its saved row, and the rest are read through the capture's lookups.
 * Read again from the store, Luma's record took 36 s after its save (2026-11-09).
 *
 * @param saved - the saved version's rows, by kind
 * @param captured - the capture `saved` came from, moments before
 */
export async function rebaseRecord(
    ctx: KindContext,
    created: readonly CreatedObject[],
    saved: Record<string, unknown>,
    captured?: Pick<CaptureResult, 'lookups'>,
): Promise<CreatedObject[]> {
    const inRows = captured ? copiesInRows(created, saved) : new Map<string, Map<string, unknown>>();
    const copies = await copiesByKind(ctx, created.filter((o) => !inRows.get(o.kind)?.has(o.id)), captured?.lookups ?? productLookups(ctx));
    for (const [kind, rows] of inRows) copies.set(kind, new Map([...rows, ...(copies.get(kind) ?? [])]));
    const rebased: CreatedObject[] = [];
    const rowsOf = rowsOnce(saved);
    for (const object of created) {
        if (object.kind === STORE_CONFIG_KIND) {
            rebased.push(rebasedSetting(object, saved[STORE_CONFIG_KIND]));
            continue;
        }
        const copy = copies.get(object.kind)?.get(object.id);
        if (copy === undefined) continue;
        rebased.push(hashed(object.kind, object, copy, rowsOf(object.kind), keyOf(object.kind, copy)));
    }
    return rebased;
}
