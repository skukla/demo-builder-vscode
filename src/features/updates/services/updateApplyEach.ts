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

/** How one item's result reads as a row's outcome. */
export type DescribeItem = (result: CategoryResult) => ItemOutcome;

/** A kind of update an apply runs: every row kind but the extension, which runs apart. */
export type ItemKind = Exclude<PendingUpdateKind, 'extension'>;

/** Told as each item starts and ends: its kind, the selection entry, and how it went. */
export type ItemObserver = (kind: ItemKind, entry: object, outcome: ItemOutcome) => void;

/**
 * Watch an observer's outcomes for the items that ended done, so the apply refreshes
 * only the local copies an update actually wrote to (2026-10-21: a run where the SC kept
 * every block and left every clash refreshed both projects anyway). With no observer
 * nothing is told item by item, so nothing is known, and every selected project is
 * refreshed as before.
 *
 * @param onItem - the caller's observer, when there is one
 * @returns the observer to hand on, and the items it saw end done
 */
export function watchingDone(onItem?: ItemObserver): { onItem?: ItemObserver; done?: ReadonlySet<object> } {
    if (!onItem) return {};
    const done = new Set<object>();
    const watching: ItemObserver = (kind, entry, outcome) => {
        if (outcome.state === 'done') done.add(entry);
        onItem(kind, entry, outcome);
    };
    return { onItem: watching, done };
}

/**
 * Run one category: as one call, or item by item when someone is told each.
 *
 * @param kind - the category, as the Updates modal's rows name it
 * @param items - its selected entries
 * @param run - the category's core, applied to a list of entries
 * @param onItem - told as each item starts and ends
 * @param describe - how one item's result reads as an outcome, when the category's own
 * results need reading differently (a deferral recorded as a name, a clash answered)
 * @returns the category's result
 */
export async function eachItem<T extends object>(
    kind: ItemKind,
    items: T[],
    run: (some: T[]) => Promise<CategoryResult>,
    onItem: ItemObserver | undefined,
    describe: DescribeItem = outcomeOf,
): Promise<CategoryResult> {
    if (!onItem) return run(items);
    const merged = emptyResult();
    for (const item of items) {
        onItem(kind, item, { state: 'running' });
        const one = await run([item]);
        mergeInto(merged, one);
        onItem(kind, item, describe(one));
    }
    return merged;
}
