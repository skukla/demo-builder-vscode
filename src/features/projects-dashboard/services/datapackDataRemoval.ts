/**
 * "Uninstall Datapack" on a project delete (owner, 2026-11-09, walk F96): the data the project's
 * datapack put in Commerce, removed before the project's files, the SC's changes in it settled
 * first, as a reset removes it (`removeProjectSampleData`: saved into the SC's own pack, else the
 * reset's Save As question). Without it the data stays in Commerce, and the delete says so.
 *
 * Offered only where a removal can work: the project has a datapack Demo Builder installed (an
 * install record), and a Commerce backend to remove it from. Unticked, and never chosen by the
 * `cleanupBehavior` setting: it writes to a store.
 *
 * Deleting the datapack itself is the library's job (its Remove), never a project delete's (owner,
 * 2026-11-09: the delete question offered "Delete Datapack, every version" until then).
 *
 * @module features/projects-dashboard/services/datapackDataRemoval
 */

import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { libraryDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import { installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
import { type AskSaveAsName, removeProjectSampleData } from '@/features/eds/services/reset/edsResetSampleData';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** The datapack data a project delete may remove with it, as the SC knows the pack. */
export interface RemovableData {
    displayName: string;
}

/**
 * Whether a delete of this project may remove datapack data: not when the project has no datapack,
 * none Demo Builder installed, or no Commerce backend. A batch reads the rest itself.
 */
export async function hasRemovableData(project: Project): Promise<boolean> {
    const held = project.datapack;
    if (!held || commerceBackendOf(project) === undefined) return false;
    return installedByDemoBuilder(project.path, { name: held.name, version: held.version });
}

/** The data a single delete of this project may remove, as its question names it. */
export async function removableDataOf(context: HandlerContext, project: Project): Promise<RemovableData | undefined> {
    const held = project.datapack;
    if (!held || !(await hasRemovableData(project))) return undefined;
    return { displayName: (await libraryDisplayName(context, held)) ?? held.name };
}

/**
 * Remove it, the changes settled first.
 *
 * @param askName - the SC's answer about a pack that is not theirs: asked in the window, or
 *   given up front (a batch, an agent)
 * @returns why the data was not all removed, so the delete stops; undefined when it was
 */
export async function removeDataBeforeDelete(context: HandlerContext, project: Project, report: ReportStage, askName?: AskSaveAsName): Promise<string | undefined> {
    const why = await removeProjectSampleData(project, context, report, askName);
    return why ? `Its datapack was not uninstalled, so the project was kept: ${why}` : undefined;
}
