/**
 * How far one data type's install has got, by row, for the import window: "<done> of <total>"
 * (walk F125, owner 2026-11-09). Every kind that writes rows says it the one way, so no row in the
 * window is left saying only that it is installing.
 *
 * The total is the rows this run will handle, worked out before the kind starts: a reinstall's
 * unchanged rows are not in it, so a reinstall with nothing to write says no count at all
 * (`rowsToCount` in `repeatInstall.ts`). "0 of N" is said at once, then each row once, when the kind
 * has finished with it: written, skipped, or found in place. A row outside the total is ignored, so a
 * kind says every row it passes without first asking whether it counts.
 *
 * Reporting only: nothing here decides what is written.
 *
 * @module features/data-installer/services/demoBuilderEngine/rowCount
 */

/** One kind's count of the rows it has finished with. */
export interface RowCount {
    /** A row of `kind`, by the pack's name for it (`keyOf`), is finished with; counted once, if it is in the total. */
    settled(kind: string, key: string | undefined): void;
}

/** The count of a kind with nothing to count, or no window to tell: says nothing. */
export const NO_COUNT: RowCount = { settled: () => undefined };

/** "1,000 of 1,901": the leading words of every kind's progress line. */
export function countLine(done: number, total: number): string {
    return `${done.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
}

/**
 * Start counting one kind's rows: "0 of N" at once, then one more as each row in `keys` is settled.
 * Nothing at all when there are no rows to count.
 *
 * @param kind - the kind the rows are settled as (a `customers_export` row is a customer)
 * @param keys - the rows this run will handle, by the pack's name for each
 */
export function startRowCount(
    progress: ((line: string) => void) | undefined,
    kind: string,
    keys: Iterable<string>,
): RowCount {
    const waiting = new Set(keys);
    const total = waiting.size;
    if (total === 0 || !progress) return NO_COUNT;
    let done = 0;
    progress(countLine(done, total));
    return {
        settled(of, key) {
            if (of !== kind || key === undefined || !waiting.delete(key)) return;
            done += 1;
            progress(countLine(done, total));
        },
    };
}

/**
 * Do one row's work, or one group's, then count its rows settled, whatever the work did.
 *
 * @param keys - the row's key, or the keys of every row the work settles
 */
export async function counted<T>(
    ctx: { count?: RowCount },
    kind: string,
    keys: string | readonly string[],
    work: () => Promise<T>,
): Promise<T> {
    try {
        return await work();
    } finally {
        for (const key of typeof keys === 'string' ? [keys] : keys) ctx.count?.settled(kind, key);
    }
}
