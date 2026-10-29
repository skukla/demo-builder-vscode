/**
 * "Also delete its pack" (datapack-engine step 07): when the SC ticks it on a project delete,
 * or an agent passes `deletePack: true`, every version of the demo's own library pack goes.
 *
 * Offered unticked, and never chosen by the `cleanupBehavior` setting: keeping a pack is
 * reversible and deleting one is not. It runs after the project's other cleanup and never
 * fails the delete; what was and was not deleted goes on the cleanup results.
 *
 * Library only: the library lets only a pack's owner delete it, and lists only the SC's own
 * versions as theirs (`myVersions`).
 *
 * @module features/projects-dashboard/services/demoPackDeletion
 */

import { openLibraryWriter } from '@/features/data-installer/handlers/libraryWriter';
import { myVersions } from '@/features/data-installer/services/demoPack';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import type { DatapackId, OwnDatapack } from '@/types/datapack';
import type { HandlerContext } from '@/types/handlers';

/** The two library calls the delete makes. */
export interface DemoPackStore {
    /** The SC's own versions of the pack, by name. */
    list: (name: string) => Promise<DatapackId[]>;
    remove: (id: DatapackId) => Promise<'deleted' | 'not-found'>;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Delete every version of the demo's own pack the library lists as the SC's.
 *
 * @param store - the library's list and delete
 * @param pack - the project's own pack
 * @returns one cleanup result, never a throw
 */
export async function deleteDemoPack(store: DemoPackStore, pack: OwnDatapack): Promise<CleanupResultItem> {
    const name = pack.displayName ?? pack.name;
    let versions: DatapackId[];
    try {
        versions = await store.list(pack.name);
    } catch (error) {
        return { type: 'datapack', name, success: false, error: `The datapack library could not list it: ${errorText(error)}` };
    }
    if (versions.length === 0) {
        return { type: 'datapack', name, success: true, skipped: true, error: 'The datapack library holds no version of it.' };
    }
    const kept: string[] = [];
    for (const id of versions) {
        try {
            await store.remove(id);
        } catch (error) {
            kept.push(`${id.version} (${errorText(error)})`);
        }
    }
    if (kept.length === 0) return { type: 'datapack', name, success: true };
    const deleted = versions.length - kept.length;
    return {
        type: 'datapack',
        name,
        success: false,
        error: `Deleted ${deleted} of ${versions.length} versions. Not deleted: ${kept.join(', ')}.`,
    };
}

/**
 * Delete the project's own pack from the library, opened as the signed-in SC.
 *
 * @param context - the handler context
 * @param pack - the project's own pack
 * @returns one cleanup result, never a throw
 */
export async function deleteProjectDemoPack(context: HandlerContext, pack: OwnDatapack): Promise<CleanupResultItem> {
    const library = await openLibraryWriter(context).catch((error: unknown) => ({ ok: false as const, reason: errorText(error) }));
    if (!library.ok) {
        return { type: 'datapack', name: pack.displayName ?? pack.name, success: false, error: library.reason };
    }
    const result = await deleteDemoPack(
        { list: (name) => myVersions(library.client, name), remove: (id) => library.writer.deleteDatapack(id) },
        pack,
    );
    context.logger.info(`[Delete Project] Its pack ${pack.name}: ${result.success ? 'deleted' : (result.error ?? 'not deleted')}`);
    return result;
}
