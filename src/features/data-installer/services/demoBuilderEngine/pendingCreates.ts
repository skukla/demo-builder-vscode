/**
 * Every create the engine sends goes through here (step 14 item 1): a pending entry is written to
 * the install record BEFORE the create is sent, and swapped for the object once Commerce answers.
 *
 * Why: a write that times out can still land (Commerce writes have taken over 120 s and landed
 * after the client gave up). Without the entry, the next install found the object, called it "the
 * store already has it", never recorded it, and removal left it in the store for good, which
 * breaks "whatever can be done can be undone". With it, the next install or removal looks for the
 * object (`pendingFinders.ts`) and, finding it, records it as the pack's.
 *
 * A create Commerce refused (it answered 4xx) certainly did not land, so its entry is dropped
 * there and then. Anything else (no answer, a 5xx, an answer missing the new id) leaves it.
 *
 * @module features/data-installer/services/demoBuilderEngine/pendingCreates
 */

import type { CreatedObject } from './installRecord';
import { type KindContext, MissingNameError } from './kindContext';
import type { PendingObject } from './pendingRecord';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';

/**
 * True when a failed create certainly made nothing: Commerce answered it with a 4xx, or the row
 * named something the store lacks, so it was never sent.
 */
export function certainlyNotMade(error: unknown): boolean {
    if (error instanceof MissingNameError) return true;
    if (!(error instanceof CommerceReadError) || error.status === undefined) return false;
    return error.status >= 400 && error.status < 500;
}

/**
 * Create one or more objects in one call, recorded as pending first.
 *
 * @param pending - what the call will make, as the record's pending entries
 * @param make - sends the create and answers the objects made (their ids from Commerce's answer)
 * @returns the objects made, now on the record
 * @throws whatever `make` throws; the pending entries stay unless Commerce refused the create
 */
export async function createRecorded(
    ctx: Pick<KindContext, 'recorder'>,
    pending: readonly PendingObject[],
    make: () => Promise<readonly CreatedObject[]>,
): Promise<readonly CreatedObject[]> {
    await ctx.recorder.markPending(pending);
    let objects: readonly CreatedObject[];
    try {
        objects = await make();
    } catch (error) {
        if (certainlyNotMade(error)) await ctx.recorder.forgetPending(pending);
        throw error;
    }
    await ctx.recorder.confirm(pending, objects);
    return objects;
}

/** Create one object, recorded as pending first (`createRecorded`, for the common case). */
export async function createOne(
    ctx: Pick<KindContext, 'recorder'>,
    pending: PendingObject,
    make: () => Promise<CreatedObject>,
): Promise<CreatedObject> {
    const [object] = await createRecorded(ctx, [pending], async () => [await make()]);
    return object;
}
