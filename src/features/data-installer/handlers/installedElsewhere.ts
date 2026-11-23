/**
 * A pack installed on another Commerce instance (step-07 D6, owner 2026-11-14): the project's
 * Commerce connection changed after the install, so its record's ids belong to a store the project
 * no longer reaches. Removing by them here would delete unrelated objects and strand the pack there.
 *
 * Asked first by everything that reads or writes the store on a pack's behalf, before any save or
 * removal: `settleChangesBeforeRemoval` (every removal door) and `openProjectStore` (the changes
 * read, the preview, the save). A record written before the instance was kept has none, and reads
 * as before (rule 3).
 *
 * @module features/data-installer/handlers/installedElsewhere
 */

import { nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { deriveImportInstance } from '../services/importInstance';
import { onAnotherInstance } from '../services/instanceKey';
import { heldDisplayName } from './libraryWriter';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** The stop, by the pack's display name. */
export function installedElsewhereLine(displayName: string): string {
    return `${displayName} is installed on another Commerce instance. Switch the project back to remove it.`;
}

/**
 * Why nothing may be read, saved or removed for this pack, or undefined when it may.
 *
 * @throws InstallRecordError when the record is there but cannot be read, as every reader of it does
 */
export async function installedElsewhere(
    context: HandlerContext,
    project: Project,
    pack: DatapackId,
): Promise<HandlerResponse | undefined> {
    const record = await readInstallRecord(nodeRecordFiles, project.path, pack);
    if (!onAnotherInstance(record?.instance, deriveImportInstance(project.componentConfigs)))
        return undefined;
    const held = project.datapack;
    const shown =
        held && held.name === pack.name && held.version === pack.version ? held : { ...pack };
    return {
        success: false,
        error: installedElsewhereLine(await heldDisplayName(context, shown)),
        code: ErrorCode.INVALID_OPERATION,
    };
}

/**
 * The instance the install record of the project's datapack notes, when it notes one: where the
 * datapack is, which Configure's and the agent's question read (`datapackLeftByChange`).
 *
 * @throws InstallRecordError when the record is there but cannot be read
 */
export async function recordedInstanceOf(project: Project): Promise<string | undefined> {
    const held = project.datapack;
    if (!held) return undefined;
    return (await readInstallRecord(nodeRecordFiles, project.path, { name: held.name, version: held.version }))?.instance;
}
