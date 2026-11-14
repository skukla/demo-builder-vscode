/**
 * "Uninstall Datapack" on a project delete (owner, 2026-11-09, walk F96): the data the project's
 * datapack put in Commerce, removed before the project's files, the SC's changes in it settled
 * first, as a reset removes it (`removeProjectSampleDataOutcome`: saved into the SC's own pack, else the
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
import { installedByDemoBuilder } from '@/features/data-installer/services/buildDatapackEngine';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
import { removeProjectSampleDataOutcome, type SaveAsAnswering } from '@/features/eds/services/reset/edsResetSampleData';
import { savedIntoLine, type DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** The delete's stop when the removal left part of the datapack in the store on purpose. */
const LEFT_IN_COMMERCE = 'Part of its datapack was left in Commerce, so the project was kept';

/**
 * Whether a delete of this project may remove datapack data: not when the project has no datapack,
 * none Demo Builder installed, or no Commerce backend. The batch and the agent tool read the rest
 * themselves.
 */
export async function hasRemovableData(project: Project): Promise<boolean> {
    const held = project.datapack;
    if (!held || commerceBackendOf(project) === undefined) return false;
    return installedByDemoBuilder(project.path, { name: held.name, version: held.version });
}

/** What the removal before a delete says: why the delete stops, or where the changes went first. */
export interface DeleteDataRemoval {
    stopped?: string;
    saved?: string;
}

/**
 * Remove it, the changes settled first.
 *
 * @param askName - the SC's answer about a pack that is not theirs: asked in the window, or
 *   given up front (a batch, an agent)
 * @returns `stopped`, why the data was not all removed, so the delete stops; `saved`, the line for a
 *   save into the SC's own pack first, for the batch row (owner, 2026-11-14). A removal that stopped
 *   partway says part of it came out (step-05 S7), never "was not uninstalled"; one that left part
 *   in Commerce on purpose names what, in the engine's note.
 */
export async function removeDataBeforeDelete(context: HandlerContext, project: Project, report: ReportStage, askName?: SaveAsAnswering): Promise<DeleteDataRemoval> {
    const removal = await removeProjectSampleDataOutcome(project, context, report, askName);
    const stopped = stopOf(removal);
    if (stopped) return { stopped };
    const saved = savedIntoLine(removal);
    return saved ? { saved } : {};
}

/** Why the delete stops, or undefined when the data all came out. */
function stopOf({ kept, partly, leftInStore, note }: DatapackRemoval): string | undefined {
    // Part left in Commerce on purpose: deleting the files would leave it with no project naming it (step-07 D1).
    if (leftInStore) return note ? `${LEFT_IN_COMMERCE}: ${note}` : `${LEFT_IN_COMMERCE}.`;
    if (kept === undefined) return undefined;
    return partly ? `Part of its datapack was uninstalled, so the project was kept: ${kept}` : `Its datapack was not uninstalled, so the project was kept: ${kept}`;
}
