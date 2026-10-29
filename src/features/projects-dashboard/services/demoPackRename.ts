/**
 * A project rename follows into the demo's own pack (datapack-engine step 07, owner
 * 2026-10-27): the pack's display name is the project's until the SC renames the pack
 * themselves (`ownDatapack.renamed`). The pack's library name is fixed and never changes.
 *
 * Best effort, after the project rename has succeeded: the project records the new display
 * name (the next save writes it anyway), and every version the library lists as the SC's is
 * renamed there. A library that cannot be reached, or refuses, costs one log line.
 *
 * @module features/projects-dashboard/services/demoPackRename
 */

import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { openLibraryWriter } from '@/features/data-installer/handlers/libraryWriter';
import { myVersions } from '@/features/data-installer/services/demoPack';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import type { HandlerContext } from '@/types/handlers';

/** The two library calls a rename makes. */
export interface PackRenameStore {
    /** The SC's own versions of the pack, by name. */
    list: (name: string) => Promise<DatapackId[]>;
    rename: (id: DatapackId, displayName: string) => Promise<'updated' | 'not-found'>;
}

/** Opens the library, or says why it cannot. */
export type OpenPackRenameStore = (context: HandlerContext) => Promise<PackRenameStore | { refusal: string }>;

const LOG_PREFIX = '[Rename]';

/** The library as the signed-in SC: its list of their versions, and its rename. */
export const openPackRenameStore: OpenPackRenameStore = async (context) => {
    const library = await openLibraryWriter(context);
    if (!library.ok) return { refusal: library.reason };
    return {
        list: (name) => myVersions(library.client, name),
        rename: (id, displayName) => library.writer.updateDisplayName(id, displayName),
    };
};

/** What renaming in the library did, in words, and whether every version went. */
interface RenameOutcome {
    said: string;
    complete: boolean;
}

/** Rename every version the library lists; how many of how many went, never a throw. */
async function renameVersions(store: PackRenameStore, name: string, displayName: string): Promise<RenameOutcome> {
    let versions: DatapackId[];
    try {
        versions = await store.list(name);
    } catch (error) {
        return { said: `the library could not list it (${error instanceof Error ? error.message : String(error)})`, complete: false };
    }
    let renamed = 0;
    for (const id of versions) {
        renamed += await store.rename(id, displayName).then(
            (outcome) => (outcome === 'updated' ? 1 : 0),
            () => 0,
        );
    }
    return { said: `${renamed} of ${versions.length} versions renamed in the library`, complete: renamed === versions.length };
}

/**
 * Give the demo's own pack the project's new display name, unless the SC renamed the pack.
 *
 * @param context - the handler context
 * @param project - the project, already renamed and saved
 * @param open - opens the library (the live one by default; a fake in tests)
 */
export async function followRenameIntoPack(
    context: HandlerContext,
    project: Project,
    open: OpenPackRenameStore = openPackRenameStore,
): Promise<void> {
    const own = project.ownDatapack;
    if (!own || own.renamed) return;
    const displayName = getProjectDisplayName(project);
    if (own.displayName === displayName) return;
    project.ownDatapack = { ...own, displayName };
    try {
        await context.stateManager.saveProjectConfigOnly(project);
        const store = await open(context);
        const outcome: RenameOutcome =
            'refusal' in store
                ? { said: `not renamed in the library: ${store.refusal}`, complete: false }
                : await renameVersions(store, own.name, displayName);
        const line = `${LOG_PREFIX} This demo's pack ${own.name} is now "${displayName}": ${outcome.said}`;
        if (outcome.complete) context.logger.info(line);
        else context.logger.warn(line);
    } catch (error) {
        context.logger.warn(`${LOG_PREFIX} This demo's pack ${own.name} could not follow the rename: ${error instanceof Error ? error.message : String(error)}`);
    }
}
