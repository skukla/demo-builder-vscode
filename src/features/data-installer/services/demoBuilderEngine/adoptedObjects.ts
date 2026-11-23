/**
 * What the store had before a datapack, on that datapack's record (walk F187, owner 2026-11-16).
 *
 * A datapack made by Create holds what the SC built in the Admin; an install can find a row the
 * store already has. Neither made the row, but a save must follow it once it is renamed or edited,
 * and the save follows a datapack's rows by its record. So the record lists it, marked `adopted`:
 * a save, a repeat install and Save Changes read it as the datapack's, and every removal leaves it
 * in the store, as it found it, taking it off the record only.
 *
 * @module features/data-installer/services/demoBuilderEngine/adoptedObjects
 */

import type { CreatedObject, InstallRecorder } from './installRecord';

/** The store had it before the datapack: never removed. */
export const isAdopted = (object: Pick<CreatedObject, 'adopted'>): boolean =>
    object.adopted === true;

/** What a removal takes: everything but what the store had before. */
export const madeByEngine = <T extends Pick<CreatedObject, 'adopted'>>(
    objects: readonly T[],
): T[] => objects.filter((o) => !isAdopted(o));

/**
 * Take what the store had before off the record, leaving it in the store, and hand back the rest
 * for the removal to take.
 */
export async function leaveAdopted(
    recorder: Pick<InstallRecorder, 'drop'>,
    objects: readonly CreatedObject[],
): Promise<CreatedObject[]> {
    const adopted = objects.filter(isAdopted);
    if (adopted.length > 0) await recorder.drop(...adopted);
    return madeByEngine(objects);
}

/** A row the store already had, found by an install: on the record to be followed, never removed. */
export const adoptedRow = (kind: string, id: string, key: string): CreatedObject => ({
    kind,
    id,
    key,
    adopted: true,
});

/** Record a row an install found the store already has, when the store named its id (walk F187, F190). */
export async function adoptFound(recorder: Pick<InstallRecorder, 'record'>, kind: string, id: number | string | undefined, key: string): Promise<void> {
    if (id !== undefined) await recorder.record(adoptedRow(kind, String(id), key));
}
