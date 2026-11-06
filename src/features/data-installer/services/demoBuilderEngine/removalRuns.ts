/**
 * Take back what a removal takes, in the record's order, with as few calls as Commerce allows. Both a
 * pack's removal (`removePack`) and installing a pack again where it no longer has something
 * (`repeatInstall.applyRemovals`) go through here.
 *
 * - Products and gift cards: through the Import API, a run of them at a time (`bulkRemoval.ts`).
 * - Kinds whose route takes a list: one call for a run of them (stock links; a shared catalog's
 *   companies, categories or products, one call per catalog).
 * - Anything Commerce deletes along with something else being removed: no call of its own; it leaves
 *   the record with that one (`impliedRemovals.ts`).
 * - The rest: one call each.
 *
 * @module features/data-installer/services/demoBuilderEngine/removalRuns
 */

import { ASSIGNMENT_KINDS, type AssignmentKind } from './b2bKeys';
import { type BulkRemovalAccess, removeProductsInBulk } from './bulkRemoval';
import { impliedRemovals } from './impliedRemovals';
import type { CreatedObject, InstallRecorder } from './installRecord';
import { PRODUCT_KINDS } from './productKinds';
import { takeBack } from './removers';
import { removeAssignmentPairs } from './sharedCatalogKinds';
import { LINK_KIND, removeStockSourceLinks } from './stockKinds';
import type { CommerceSend } from '@/types/commerceWire';

/** Kinds taken back several to a call: the route takes a list. */
const IN_ONE_CALL: Record<string, (send: CommerceSend, ids: readonly string[]) => Promise<void>> = {
    [LINK_KIND]: removeStockSourceLinks,
    ...Object.fromEntries(
        ASSIGNMENT_KINDS.map((kind: AssignmentKind) => [
            kind,
            (send: CommerceSend, ids: readonly string[]) => removeAssignmentPairs(send, kind, ids),
        ]),
    ),
};

/** Which run an object goes in: products together, a list kind with its own kind, anything else alone. */
const runOf = (object: CreatedObject): string => {
    if (PRODUCT_KINDS.includes(object.kind)) return 'products';
    return IN_ONE_CALL[object.kind] ? object.kind : 'one';
};

/** The objects in order, split where the run they go in changes. */
export function removalRuns(objects: readonly CreatedObject[]): CreatedObject[][] {
    const runs: CreatedObject[][] = [];
    for (const object of objects) {
        const last = runs[runs.length - 1];
        if (last && runOf(last[0]) === runOf(object)) last.push(object);
        else runs.push([object]);
    }
    return runs;
}

/** Send one call for a run of a list kind, naming the kind when Commerce refuses it. */
async function inOneCall(
    commerce: BulkRemovalAccess,
    run: readonly CreatedObject[],
): Promise<void> {
    try {
        await IN_ONE_CALL[run[0].kind](
            commerce.send,
            run.map((o) => o.id),
        );
    } catch (error) {
        throw new Error(
            `Could not take back ${run.length} ${run[0].kind}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Take back every object in `take`, in its order, dropping each from the record once it has gone.
 *
 * @param after - told of each object as it leaves the record (a repeat install logs each)
 * @throws the first refusal, after what went before it has left the record
 */
export async function takeBackAll(
    commerce: BulkRemovalAccess,
    recorder: Pick<InstallRecorder, 'drop'>,
    take: readonly CreatedObject[],
    after: (objects: readonly CreatedObject[]) => void = () => undefined,
): Promise<void> {
    const implied = impliedRemovals(take);
    const withAlong = (objects: readonly CreatedObject[]) => [
        ...objects,
        ...objects.flatMap((o) => implied.takesWith.get(o) ?? []),
    ];
    for (const run of removalRuns(take.filter((o) => !implied.covered.has(o)))) {
        if (runOf(run[0]) === 'products') {
            await removeProductsInBulk(commerce, recorder, run, (object) =>
                takeBack(commerce, object),
            );
            after(run);
        } else if (runOf(run[0]) !== 'one') {
            await inOneCall(commerce, run);
            await recorder.drop(...withAlong(run));
            after(withAlong(run));
        } else {
            for (const object of run) {
                await takeBack(commerce, object);
                await recorder.drop(...withAlong([object]));
                after(withAlong([object]));
            }
        }
    }
}
