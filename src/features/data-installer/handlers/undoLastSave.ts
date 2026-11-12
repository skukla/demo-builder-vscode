/**
 * Undo Last Save (Phase 2, step-02 slice 5; owner, 2026-11-12: "Undo Last Save?", then Commerce goes
 * back through the same run window). The project's own datapack keeps two saves (`saveTrim.ts`); this
 * goes back to the one before the newest.
 *
 * One job, through the import path every install takes (`startDatapackImport`): the newest save is
 * the pack the project holds, so the engine uninstalls it by its install record, then installs the
 * save before it. Unsaved changes are DROPPED, never saved: a save would make a version that the undo
 * then deletes. Only once the job ends in success is the newest save deleted, with its store
 * configuration (`deleteVersionWithLayer`); a job that fails or stops deletes nothing, and the
 * project keeps naming the newest save.
 *
 * Re-imports are locked to where the pack is installed (`useLockedScope`), so the target is the
 * install record's; a record written before it kept one falls back to the project's, as any import.
 *
 * @module features/data-installer/handlers/undoLastSave
 */

import { savesOf } from '../packVersions';
import { nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { deriveImportInstance } from '../services/importInstance';
import { sharedInFile } from '../services/sharedInFiles';
import { type DataInstallerAccess, resolveDataInstallerAccess } from './dataInstallerHandlers';
import { projectsUsing } from './datapackInUse';
import { deleteVersionWithLayer } from './datapackLibraryHandlers';
import { failure } from './datapackZipHandlers';
import { type StartImportPayload, startDatapackImport } from './importStart';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/** The `undo-last-save` message: the project's datapack, by its library name, and the consent. */
export interface UndoLastSavePayload {
    datapackName?: string;
    /** Must be true. Nothing changes in Commerce by default. */
    confirm?: boolean;
}

/** What an undo installs, and what it deletes once that succeeds. */
interface UndoPlan {
    access: Extract<DataInstallerAccess, { ok: true }>;
    newest: DatapackId;
    displayName: string;
    /** The import of the save before the newest, over it. */
    install: StartImportPayload;
}

const NOT_YOURS =
    'Undo Last Save works on the datapack this project uses, when it is one of your own in My Datapacks.';
const NO_EARLIER = 'There is no earlier save to go back to.';
const NOT_ON_NEWEST = 'This project uses an earlier save, not the last one, so there is no last save to undo here.';
const NO_RECORD = 'Demo Builder has no record of installing this datapack, so its last save cannot be taken out.';

const refuse = (error: string): { response: HandlerResponse } => ({
    response: { success: false, error, code: ErrorCode.INVALID_OPERATION },
});

/** The project's datapack, when it is the one named and in the library. */
async function heldNamed(
    context: HandlerContext,
    name: string | undefined,
): Promise<{ project: Project; held: NonNullable<Project['datapack']> } | undefined> {
    const project = await context.stateManager.getCurrentProject();
    const held = project?.datapack;
    if (!project || !held || !name || held.name !== name || held.store !== 'library')
        return undefined;
    return { project, held };
}

/** The data types a save holds, as the import form reads them (`get-datapack-detail`). */
async function typesHeld(access: UndoPlan['access'], id: DatapackId): Promise<string[]> {
    const detail = await access.client.getDatapackDetail(id);
    if (detail.dataTypes.length === 0) return [];
    return (await access.client.batchGetDataItems(id, detail.dataTypes)).present;
}

/** The SC's own saves of the held datapack: the newest, the one before it, and its name. */
async function savesToUndo(
    access: UndoPlan['access'],
    held: NonNullable<Project['datapack']>,
): Promise<{ newest: string; previous: string; displayName: string } | { response: HandlerResponse }> {
    // The SC's own versions, as `myVersions` reads them, with the team mark it does not keep.
    const page = await access.client.findDatapacks({ datapackName: held.name });
    const mine = page.items.filter((item) => item.mine === true && item.id.name === held.name);
    if (mine.length === 0 || mine.some((item) => item.team === true)) return refuse(NOT_YOURS);
    const [newest, previous] = savesOf(mine.map((item) => item.id.version));
    if (!newest || !previous) return { response: { success: false, error: NO_EARLIER } };
    if (held.version !== newest) return refuse(NOT_ON_NEWEST);
    const displayName = mine.find((item) => item.id.version === newest)?.displayName ?? held.name;
    return { newest, previous, displayName };
}

/** Where the held save is installed, and the instance: what the import of the earlier save sends. */
async function whereInstalled(
    project: Project,
    held: NonNullable<Project['datapack']>,
): Promise<Pick<StartImportPayload, 'commerceInstance' | 'websiteCode' | 'storeCode'> | { response: HandlerResponse }> {
    const record = await readInstallRecord(nodeRecordFiles, project.path, held);
    if (!record) return refuse(NO_RECORD);
    const commerceInstance = deriveImportInstance(project.componentConfigs);
    if (!commerceInstance) return refuse('This project names no Commerce instance to act on.');
    return { commerceInstance, ...(record.target ?? {}) };
}

/** Read everything the undo needs, or the refusal. Writes nothing. */
async function planUndo(
    context: HandlerContext,
    payload: UndoLastSavePayload | undefined,
): Promise<UndoPlan | { response: HandlerResponse }> {
    const found = await heldNamed(context, payload?.datapackName);
    if (!found) return refuse(NOT_YOURS);
    const { project, held } = found;
    const access = await resolveDataInstallerAccess(context, 'library');
    if (!access.ok) return { response: access.response };
    const saves = await savesToUndo(access, held);
    if ('response' in saves) return saves;
    const installed = await whereInstalled(project, held);
    if ('response' in installed) return installed;
    const dataTypes = await typesHeld(access, { name: held.name, version: saves.previous });
    if (dataTypes.length === 0) return refuse('The earlier save holds no data to go back to.');
    return {
        access,
        newest: { name: held.name, version: saves.newest },
        displayName: saves.displayName,
        install: {
            datapackName: held.name,
            version: saves.previous,
            source: 'library',
            dataTypes,
            ...installed,
            // An undo never asks "Save Your Changes First?" and never saves into the pack.
            changes: 'drop',
        },
    };
}

/**
 * After the job succeeded: delete the newest save and its store configuration. A save another
 * project on this machine still names is kept: that project would be stranded (`datapackInUse.ts`).
 * So is one this SC shared in a project file, as the save trim keeps it (`trimSaves.ts`).
 */
async function deleteNewest(context: HandlerContext, plan: UndoPlan): Promise<void> {
    const { newest } = plan;
    if (sharedInFile(context.context.globalState, newest)) {
        context.logger.info(`${LOG_PREFIX} Undid the last save of ${newest.name}; kept ${newest.version}, shared in a project file`);
        return;
    }
    const users = await projectsUsing(context, newest.name, newest.version);
    if (users.length > 0) {
        context.logger.info(
            `${LOG_PREFIX} Undid the last save of ${newest.name}; kept ${newest.version}, which ${users.join(', ')} uses`,
        );
        return;
    }
    await deleteVersionWithLayer(context, plan.access, newest);
    context.logger.info(
        `${LOG_PREFIX} Undid the last save of ${newest.name}; deleted ${newest.version}`,
    );
}

export const undoLastSaveHandlers = defineHandlers({
    'undo-last-save': async (
        context: HandlerContext,
        payload?: UndoLastSavePayload,
    ): Promise<HandlerResponse> => {
        let plan: UndoPlan | { response: HandlerResponse };
        try {
            plan = await planUndo(context, payload);
        } catch (error) {
            return failure(context, error, "The datapack's saves could not be read.");
        }
        if ('response' in plan) return plan.response;
        if (payload?.confirm !== true) {
            return refuse(
                `Commerce goes back to ${plan.displayName} as it was before your last save. ` +
                    'Anything you changed since is lost. Send confirm:true to proceed.',
            ).response;
        }
        const ready = plan;
        return startDatapackImport(context, ready.install, () => deleteNewest(context, ready));
    },
});
