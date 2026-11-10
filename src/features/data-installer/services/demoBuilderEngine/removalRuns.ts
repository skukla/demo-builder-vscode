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
 * Commerce refusing one object (400, 404, 409 or 422, as `refusedRows.ts` counts a refused row) does
 * not stop the rest: the object stays in the store and on the record, so the next run tries it again,
 * and the outcome names it with Commerce's reason (live, 2026-11-06: "Attribute size is locked. This
 * attribute is used in configurable products." stopped a reinstall part-way).
 *
 * @module features/data-installer/services/demoBuilderEngine/removalRuns
 */

import { dataTypeLabel } from '../../ui/dataTypeLabel';
import { ASSIGNMENT_KINDS, type AssignmentKind } from './b2bKeys';
import { type BulkRemovalAccess, removeProductsInBulk } from './bulkRemoval';
import { impliedRemovals } from './impliedRemovals';
import type { CreatedObject, InstallRecorder } from './installRecord';
import { PRODUCT_KINDS } from './productKinds';
import { commerceMessage, isRowRefusal } from './refusedRows';
import { TakeBackRefused, takeBack } from './removers';
import { removeAssignmentPairs } from './sharedCatalogKinds';
import { LINK_KIND, removeStockSourceLinks } from './stockKinds';
import { andList } from '@/core/utils/andList';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
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
        const what = `Could not take back ${run.length} ${run[0].kind}`;
        if (error instanceof CommerceReadError) throw new TakeBackRefused(what, error);
        throw new Error(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** Something Commerce would not take back: still in the store, and on the record. */
export interface RefusedRemoval {
    kind: string;
    /** The pack's name for it, or its id. */
    key: string;
    /** What Commerce said. */
    reason: string;
}

/**
 * Do one take-back; when Commerce refuses these objects, write each down as refused and answer false.
 *
 * @throws anything that is not a refusal of these objects: not signed in, throttled, no answer
 */
async function tryTakeBack(objects: readonly CreatedObject[], refused: RefusedRemoval[], work: () => Promise<void>): Promise<boolean> {
    try {
        await work();
        return true;
    } catch (error) {
        if (!(error instanceof TakeBackRefused) || !isRowRefusal(error)) throw error;
        const reason = commerceMessage(error.refusal);
        refused.push(...objects.map((o) => ({ kind: o.kind, key: o.key ?? o.id, reason })));
        return false;
    }
}

/**
 * Take back every object in `take`, in its order, dropping each from the record once it has gone.
 *
 * @param after - told of each object as it leaves the record (a repeat install logs each)
 * @returns what Commerce refused to take back: left in the store and on the record
 * @throws the first failure that is not a refusal, after what went before it has left the record
 */
export async function takeBackAll(
    commerce: BulkRemovalAccess,
    recorder: Pick<InstallRecorder, 'drop'>,
    take: readonly CreatedObject[],
    after: (objects: readonly CreatedObject[]) => void = () => undefined,
): Promise<RefusedRemoval[]> {
    const implied = impliedRemovals(take);
    const refused: RefusedRemoval[] = [];
    const gone = async (objects: readonly CreatedObject[]) => {
        const along = [...objects, ...objects.flatMap((o) => implied.takesWith.get(o) ?? [])];
        await recorder.drop(...along);
        after(along);
    };
    for (const run of removalRuns(take.filter((o) => !implied.covered.has(o)))) {
        const started = Date.now();
        await takeBackRun(commerce, recorder, run, refused, gone, after);
        commerce.log?.(`took back ${kindsOfRun(run)} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    }
    for (const row of refused) commerce.log?.(`could not take back ${row.kind} ${row.key}: ${row.reason}`);
    return refused;
}

/**
 * Every kind in a run with its count, in the order first met: "2046 products and 2 giftcards". Named by
 * its first object alone, a run of products and gift cards logged "took back 2048 giftcards" (live,
 * 2026-11-09).
 */
export function kindsOfRun(run: readonly CreatedObject[]): string {
    const counts = new Map<string, number>();
    for (const object of run) counts.set(object.kind, (counts.get(object.kind) ?? 0) + 1);
    return andList([...counts].map(([kind, count]) => `${count} ${kind}`));
}

/** One run of the removal: products in bulk, a kind in one call, or each object alone. */
async function takeBackRun(
    commerce: BulkRemovalAccess,
    recorder: Pick<InstallRecorder, 'drop'>,
    run: CreatedObject[],
    refused: RefusedRemoval[],
    gone: (objects: readonly CreatedObject[]) => Promise<void>,
    after: (objects: readonly CreatedObject[]) => void,
): Promise<void> {
    {
        if (runOf(run[0]) === 'products') {
            await removeProductsInBulk(commerce, recorder, run, (object) => takeBack(commerce, object));
            after(run);
        } else if (runOf(run[0]) !== 'one') {
            if (await tryTakeBack(run, refused, () => inOneCall(commerce, run))) await gone(run);
        } else {
            for (const object of run) {
                if (await tryTakeBack([object], refused, () => takeBack(commerce, object))) await gone([object]);
            }
        }
    }
}

/** How many refused removals the line names; Debug Logs names each one. */
const NAMED_REFUSALS = 10;

/**
 * The one line about what Commerce would not take back, or nothing.
 *
 * @param again - what tries it again: "Installing" the pack again, or "Removing" it again
 */
export function refusedRemovalsLine(refused: readonly RefusedRemoval[], again: 'Installing' | 'Uninstalling'): string | undefined {
    if (refused.length === 0) return undefined;
    const rows = refused.slice(0, NAMED_REFUSALS).map((row) => `${dataTypeLabel(row.kind).toLowerCase()} ${row.key} (${row.reason.replace(/\.$/u, '')})`);
    const count = refused.length === 1 ? '1 item' : `${refused.length.toLocaleString('en-US')} items`;
    const more = refused.length > NAMED_REFUSALS ? `; and ${refused.length - NAMED_REFUSALS} more, each named in Debug Logs` : '';
    return `Commerce would not take out ${count}: ${rows.join('; ')}${more}. ${again} the datapack again tries again.`;
}
