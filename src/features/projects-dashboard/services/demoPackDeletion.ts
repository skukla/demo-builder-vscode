/**
 * "Also delete its pack": when the SC ticks it on a project delete, or an agent passes
 * `deletePack: true`, every version of the pack the project uses goes. Offered only when that
 * pack is the SC's own and no other project on this machine uses it (owner, 2026-11-03,
 * `.rptc/plans/datapack-save-as/`), so a delete never takes a pack another demo resets to.
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

import { loadOtherProjects } from '@/core/state/otherProjects';
import { openLibraryWriter } from '@/features/data-installer/handlers/libraryWriter';
import { myVersions } from '@/features/data-installer/services/demoPack';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import type { HandlerContext } from '@/types/handlers';

/** A pack a project delete may take with it: its name in the library, and what the SC calls it. */
export interface DeletablePack {
    name: string;
    displayName: string;
}

/** The two library calls the delete makes. */
export interface DemoPackStore {
    /** The SC's own versions of the pack, by name. */
    list: (name: string) => Promise<DatapackId[]>;
    remove: (id: DatapackId) => Promise<'deleted' | 'not-found'>;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The pack a delete of this project may take with it: the one it uses, when it is in the library,
 * is the SC's, and no other project on this machine uses it. None when any of that is untrue or
 * cannot be read: keeping a pack is reversible and deleting one is not.
 *
 * @param context - the handler context, for the other projects and the library
 * @param project - the project being deleted
 */
export async function deletablePackOf(context: HandlerContext, project: Project): Promise<DeletablePack | undefined> {
    const held = project.datapack;
    if (held?.store !== 'library') return undefined;
    try {
        const others = await loadOtherProjects(context, project.path);
        if (others.some((other) => other.datapack?.name === held.name)) return undefined;
        const library = await openLibraryWriter(context);
        if (!library.ok) return undefined;
        const page = await library.client.findDatapacks({ datapackName: held.name });
        const mine = page.items.find((item) => item.id.name === held.name && item.mine === true);
        return mine ? { name: held.name, displayName: mine.displayName } : undefined;
    } catch (error) {
        context.debugLogger.debug(`[Delete Project] Could not tell whether ${held.name} can go with it: ${errorText(error)}`);
        return undefined;
    }
}

/**
 * Delete every version of the pack the library lists as the SC's.
 *
 * @param store - the library's list and delete
 * @param pack - the pack the project uses
 * @returns one cleanup result, never a throw
 */
export async function deleteDemoPack(store: DemoPackStore, pack: DeletablePack): Promise<CleanupResultItem> {
    const name = pack.displayName;
    let versions: DatapackId[];
    try {
        versions = await store.list(pack.name);
    } catch (error) {
        return { type: 'datapack', name, success: false, error: `Its versions could not be listed: ${errorText(error)}` };
    }
    if (versions.length === 0) {
        return { type: 'datapack', name, success: true, skipped: true, error: 'No version of it was found.' };
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
 * Delete the pack a project uses from the library, opened as the signed-in SC.
 *
 * @param context - the handler context
 * @param pack - the pack, as `deletablePackOf` found it
 * @returns one cleanup result, never a throw
 */
export async function deleteProjectDemoPack(context: HandlerContext, pack: DeletablePack): Promise<CleanupResultItem> {
    const library = await openLibraryWriter(context).catch((error: unknown) => ({ ok: false as const, reason: errorText(error) }));
    if (!library.ok) {
        return { type: 'datapack', name: pack.displayName, success: false, error: library.reason };
    }
    const result = await deleteDemoPack(
        { list: (name) => myVersions(library.client, name), remove: (id) => library.writer.deleteDatapack(id) },
        pack,
    );
    context.logger.info(`[Delete Project] Its pack ${pack.name}: ${result.success ? 'deleted' : (result.error ?? 'not deleted')}`);
    return result;
}
