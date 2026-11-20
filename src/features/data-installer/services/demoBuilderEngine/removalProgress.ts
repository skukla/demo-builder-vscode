/**
 * How far an uninstall has got, by data type (walk F161, owner 2026-11-16): the type it takes out
 * now and that type's count, "1,200 of 2,046 products". It was one bare count over every type
 * ("10 of 10"), which said nothing of what was going out. The window words it
 * ("Uninstalling Products, 1,200 of 2,046", `importSteps.ts`).
 *
 * @module features/data-installer/services/demoBuilderEngine/removalProgress
 */

import type { CreatedObject } from './installRecord';
import { packKindOf } from './storeCopies';

/** The kind products are deleted under in bulk, counted as each call lands (`bulkRemoval.ts`). */
const BULK_KIND = 'products';

const digits = (n: number): string => n.toLocaleString('en-US');

/** Each pack kind's count among the objects. */
function totalsOf(objects: readonly CreatedObject[]): Map<string, number> {
    const totals = new Map<string, number>();
    for (const object of objects) {
        const kind = packKindOf(object.kind);
        totals.set(kind, (totals.get(kind) ?? 0) + 1);
    }
    return totals;
}

/**
 * The counter a removal reports through: `said` when objects are gone, `deleted` as each bulk
 * product call lands, before its run says them all.
 *
 * @param take - everything the removal takes back
 * @param progress - where each line goes; a line is sent only when it changes
 */
export function removalCounter(
    take: readonly CreatedObject[],
    progress: ((line: string) => void) | undefined,
): { begin: () => void; said: (objects: readonly CreatedObject[]) => void; deleted: (n: number) => void } {
    const totals = totalsOf(take);
    const done = new Map<string, number>();
    let inRun = 0;
    let current: string | undefined;
    let shown = '';
    const send = (): void => {
        if (!current) return;
        const total = totals.get(current) ?? 0;
        const count = Math.min(
            total,
            (done.get(current) ?? 0) + (current === BULK_KIND ? inRun : 0),
        );
        const line = `${digits(count)} of ${digits(total)} ${current}`;
        if (line === shown) return;
        shown = line;
        progress?.(line);
    };
    return {
        // The first type at 0 as deleting starts: the line moves on from "Preparing to uninstall" at
        // once, rather than when the first batch lands.
        begin: () => {
            current = take[0] ? packKindOf(take[0].kind) : undefined;
            send();
        },
        said: (objects) => {
            for (const object of objects) {
                const kind = packKindOf(object.kind);
                done.set(kind, (done.get(kind) ?? 0) + 1);
                current = kind;
            }
            inRun = 0;
            send();
        },
        deleted: (n) => {
            inRun += n;
            current = BULK_KIND;
            send();
        },
    };
}
