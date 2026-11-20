/**
 * The project's datapack as Restore and Update need it (step-07 U1): the datapack the project uses,
 * named by the request, Demo Builder's install record of it, and the Commerce instance it writes to;
 * or the refusal, in the action's own words. Read only.
 *
 * @module features/data-installer/handlers/heldInstall
 */

import { type InstallRecord, nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { deriveImportInstance } from '../services/importInstance';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** What a Restore or an Update stands on. */
export interface HeldInstall {
    project: Project;
    held: NonNullable<Project['datapack']>;
    record: InstallRecord;
    commerceInstance: string;
}

/** The action's refusals: the datapack named is not the project's; Demo Builder never installed it. */
export interface HeldRefusals {
    notHeld: string;
    noRecord: string;
}

const NO_INSTANCE = 'This project names no Commerce instance to act on.';

/** A refusal: nothing changed. */
export const refuse = (error: string): { response: HandlerResponse } => ({
    response: { success: false, error, code: ErrorCode.INVALID_OPERATION },
});

/** The project's datapack named `name`, its install record and instance, or the refusal. */
export async function readHeldInstall(
    context: HandlerContext,
    name: string | undefined,
    words: HeldRefusals,
): Promise<HeldInstall | { response: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    const held = project?.datapack;
    if (!project || !held || !name || held.name !== name) return refuse(words.notHeld);
    const record = await readInstallRecord(nodeRecordFiles, project.path, held);
    if (!record) return refuse(words.noRecord);
    const commerceInstance = deriveImportInstance(project.componentConfigs);
    if (!commerceInstance) return refuse(NO_INSTANCE);
    return { project, held, record, commerceInstance };
}
