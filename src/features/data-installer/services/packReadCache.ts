/**
 * Recent reads of a datapack's rows, shared by everything that reads them (owner, 2026-11-09,
 * walk F82).
 *
 * Every read of a pack's rows goes through `readPackItems`, and five callers make one: an import
 * run, its validation, the comparison before a re-import, the check after an install, and a save;
 * Create Datapack's lists read through a save's door. Reading Luma takes about 9 seconds, and one
 * re-import read it twice (its comparison, then its run), Create Datapack once per kind listed.
 * Each read is now kept for `CACHE_TTL.MEDIUM`, in the house cache entry (`core/cache`):
 *
 * - The read itself is kept, not only its answer, so two callers asking at once share one read.
 * - A read that fails is not kept: the next caller reads again.
 * - Demo Builder's own writes forget the pack: `DatapackStoreWriter` calls `forgetPackRead` as it
 *   creates a pack, adds rows to one or deletes one, in either store. A version is otherwise not
 *   rewritten, so a kept read is the pack as it is.
 *
 * Kept in memory only: a window reload forgets every read.
 *
 * @module features/data-installer/services/packReadCache
 */

import type { PackItems } from './demoBuilderEngine/runPack';
import { type CacheEntry, createCacheEntry, isExpired } from '@/core/cache/cacheUtils';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

const reads = new Map<string, CacheEntry<Promise<PackItems>>>();

const keyOf = (id: DatapackId, source: DatapackStoreName): string =>
    JSON.stringify([source, id.name, id.version]);

/**
 * The pack's rows: the read made in the last few minutes, or the one in progress, or a new one.
 *
 * @param read - reads the pack; called only when no recent read is kept
 */
export function cachedPackRead(
    id: DatapackId,
    source: DatapackStoreName,
    read: () => Promise<PackItems>,
): Promise<PackItems> {
    const key = keyOf(id, source);
    const kept = reads.get(key);
    if (kept && !isExpired(kept)) return kept.value;
    const reading = read();
    reads.set(key, createCacheEntry(reading, CACHE_TTL.MEDIUM));
    // A failed read is not kept, unless another has replaced it meanwhile.
    reading.catch(() => {
        if (reads.get(key)?.value === reading) reads.delete(key);
    });
    return reading;
}

/** Forget every kept read of one version, from either store: Demo Builder has just written it. */
export function forgetPackRead(id: DatapackId): void {
    for (const source of ['library', 'installer'] as const) reads.delete(keyOf(id, source));
}

/** Forget every kept read (tests). */
export function forgetPackReads(): void {
    reads.clear();
}
