/**
 * A project's Finish Setup steps, read from where they live (PL-101): Republish the Code from the
 * project's record, and Set the Root Category from its datapack's install record on disk. The
 * handlers and the dashboard's status pushes read the same steps through here, so the guide, the
 * "N steps remaining" line and the tile dots cannot disagree.
 *
 * @module features/dashboard/services/projectFinishSetup
 */

import { finishSetupOf } from './finishSetup';
import {
    nodeRecordFiles,
    type RecordFiles,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { recordedRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import type { PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * The root step the project's datapack install record holds, if any. Reads no store.
 *
 * @throws InstallRecordError when the record cannot be read
 */
export async function readPackRootStep(
    project: Project,
    files: RecordFiles = nodeRecordFiles,
): Promise<PackRootStep | undefined> {
    const held = project.datapack;
    if (!held) return undefined;
    return recordedRootStep(files, project.path, { name: held.name, version: held.version });
}

/**
 * The project's steps for a status push. Never throws: an install record it cannot read costs
 * the root step (logged), not the dashboard's status.
 *
 * @param project - the project
 * @param logger - where an unreadable record is said
 * @param files - the install record's reader; the disk unless a test hands one in
 */
export async function projectFinishSetup(
    project: Project,
    logger: Logger,
    files: RecordFiles = nodeRecordFiles,
): Promise<SetupChecklistItem[]> {
    let packRoot: PackRootStep | undefined;
    try {
        packRoot = await readPackRootStep(project, files);
    } catch (error) {
        logger.warn(
            `[Finish Setup] Could not read the datapack's install record: ${(error as Error).message}`,
        );
    }
    return finishSetupOf(project, packRoot);
}
