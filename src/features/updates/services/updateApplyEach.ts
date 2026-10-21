/**
 * Run an update category item by item, telling a watcher as each starts and ends
 * (2026-10-21). The Updates modal draws each row's progress from it.
 *
 * Every category core already loops item by item with nothing shared across items, so
 * applying them one at a time and adding the results up gives the same totals.
 *
 * @module features/updates/services/updateApplyEach
 */

import { emptyResult, mergeInto, outcomeOf, type CategoryResult, type ItemOutcome } from './updateApplyResult';
import type { PendingUpdateKind } from '@/types/pendingUpdates';

/** A kind of update an apply runs: every row kind but the extension, which runs apart. */
export type ItemKind = Exclude<PendingUpdateKind, 'extension'>;

/** Told as each item starts and ends: its kind, the selection entry, and how it went. */
export type ItemObserver = (kind: ItemKind, entry: object, outcome: ItemOutcome) => void;

/**
 * Run one category: as one call, or item by item when someone is told each.
 *
 * @param kind - the category, as the Updates modal's rows name it
 * @param items - its selected entries
 * @param run - the category's core, applied to a list of entries
 * @param onItem - told as each item starts and ends
 * @param deferredLine - how a deferral reads, when the core records only a name
 * @returns the category's result
 */
export async function eachItem<T extends object>(
    kind: ItemKind,
    items: T[],
    run: (some: T[]) => Promise<CategoryResult>,
    onItem: ItemObserver | undefined,
    deferredLine?: (deferred: string) => string,
): Promise<CategoryResult> {
    if (!onItem) return run(items);
    const merged = emptyResult();
    for (const item of items) {
        onItem(kind, item, { state: 'running' });
        const one = await run([item]);
        mergeInto(merged, one);
        onItem(kind, item, outcomeOf(one, deferredLine));
    }
    return merged;
}
