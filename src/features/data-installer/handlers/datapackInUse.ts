/**
 * Which projects on this machine use a datapack, or one save of it (Phase 2, step-02 slices 3 and
 * 4). A save a project names is never deleted: its datapack and its install record would name a
 * save that no longer exists, and Reset could not take its data out again. Deleting a save asks
 * this first, and so does trimming old saves after a save.
 *
 * The open project and every other local project are read, never written
 * (`loadOtherProjects`). A list that cannot be read counts as no other project: the open project
 * is still checked.
 *
 * @module features/data-installer/handlers/datapackInUse
 */

import { loadOtherProjects } from '@/core/state/otherProjects';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/**
 * The names of the projects that use a datapack, or one save of it when `version` is given.
 *
 * @param context - the handler context, for the state manager
 * @param name - the datapack's name in the library
 * @param version - one save; undefined matches any
 */
export async function projectsUsing(
    context: HandlerContext,
    name: string,
    version?: string,
): Promise<string[]> {
    return (await projectsWith(context, name))
        .filter((project) => version === undefined || project.datapack?.version === version)
        .map((project) => getProjectDisplayName(project));
}

/** The saves of a datapack that projects on this machine use: never trimmed. */
export async function savesInUse(context: HandlerContext, name: string): Promise<Set<string>> {
    const used = (await projectsWith(context, name)).flatMap((project) =>
        project.datapack ? [project.datapack.version] : [],
    );
    return new Set(used);
}

/** The open project and every other local one that uses a datapack, any save of it. */
async function projectsWith(context: HandlerContext, name: string): Promise<Project[]> {
    const open = await context.stateManager.getCurrentProject();
    const others = await loadOtherProjects(context, open?.path).catch((): Project[] => []);
    return [open, ...others].filter((project): project is Project => project?.datapack?.name === name);
}

/** The refusal a delete gives when projects use what it would delete. */
export function inUseRefusal(users: readonly string[], what: 'save' | 'datapack'): string {
    const who = users.length === 1 ? `${users[0]} uses` : `${users.join(', ')} use`;
    return `${who} this ${what}, so it can't be deleted. Uninstall it there first.`;
}
