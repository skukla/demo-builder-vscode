/**
 * What a removal does about the SC's changes (datapack-engine step 05). One path for every door:
 * the import window's confirm, `reset_datapack`, and a project reset or Edit that removes the pack.
 *
 * It finds changes with the preview's own read (`previewChanges`) and saves them with the save
 * itself (`openSave`, `saveIntoFor`, `saveToPack`): Save, a new version of the demo's pack when it
 * is the SC's, else Save As under the name sent, the previous version kept either way. Saving moves
 * the install record onto that version, so the removal that follows has to be of the saved
 * version; the caller is told which it is.
 *
 * A pack with no install record (the Data Installer service installed it) has no record of changes,
 * so nothing here applies to it, and its removal then points to Clear Demo Data. Objects recorded before hashes
 * were kept are not counted as changed: nothing can tell.
 *
 * @module features/data-installer/handlers/removalChanges
 */

import { type ChangesAnswer, type DatapackRemovalChanges, type DatapackRemovalScope, changesFromPreview, changesSentence } from '../removalChanges';
import { alwaysSaveChangesOnRemoval, changesOnRemoval } from '../services/dataInstallerConfig';
import { InstallRecordError, nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { kindsOnRecord } from '../services/demoBuilderEngine/runPack';
import { previewChanges } from '../services/demoBuilderEngine/storeChanges';
import { failure, saveIntoFor, saveToPack } from './packSave';
import { openProjectStore, openSave, readPayload, type StoreChangesPayload } from './storeChangesHandlers';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { pushOperationProgress, startModalRun } from '@/core/vscode/operationProgress';
import type { Project } from '@/types/base';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import type { SaveStoreChangesResult } from '@/types/webviewRequests';

/** What a removal is asked to do about changes. */
export interface RemovalChangesRequest {
    pack: DatapackId;
    source?: DatapackStoreName;
    /** The caller's answer. Absent: read, and let the setting or `unanswered` decide. */
    answer?: ChangesAnswer;
    /** With changes found and no answer: ask (an agent) or save (a door whose question was already asked). */
    unanswered: 'refuse' | 'keep';
    /** Turn on "always save" once a save has worked: the confirm's box. */
    rememberAlways?: boolean;
    /** Save As: the name for a new datapack, when the demo's pack is not the SC's. */
    saveAs?: { displayName?: unknown };
}

/** The version a save made: what the removal has to be of, and the sentence it ended on. */
export interface SavedFirst {
    id: DatapackId;
    dataTypes: string[];
    note: string;
}

const isSamePack = (a: DatapackId, b: DatapackId): boolean => a.name === b.name && a.version === b.version;

/** The store to read the installed version from: the one named, else the one the project records. */
function installedIn(project: Project, pack: DatapackId, named: DatapackStoreName | undefined): DatapackStoreName {
    if (named) return named;
    return project.datapack && isSamePack(project.datapack, pack) && project.datapack.store ? project.datapack.store : 'installer';
}

/** Whether Demo Builder's engine installed this pack in this project: only then is anything known. */
const hasRecord = async (project: Project, pack: DatapackId): Promise<boolean> =>
    (await readInstallRecord(nodeRecordFiles, project.path, pack)) !== undefined;

/** What a removal of this pack would lose, or the response to answer instead. Writes nothing. */
async function readChanges(context: HandlerContext, project: Project, pack: DatapackId, source: DatapackStoreName | undefined): Promise<DatapackRemovalChanges | { response: HandlerResponse }> {
    const alwaysSave = changesOnRemoval() === 'save';
    if (!(await hasRecord(project, pack))) return { count: 0, kinds: [], alwaysSave };
    // The check reads Commerce itself and keeps it for the save and uninstall after it (walk F128).
    const store = await openProjectStore(context, 'remember');
    if ('response' in store) return store;
    const answer = { alwaysSave, ...(await whereSaved(context, store)) };
    try {
        const changes = changesFromPreview(await previewChanges(store.deps, pack, installedIn(project, pack, source)));
        return { ...changes, ...(changes.count > 0 ? { sentence: changesSentence(changes.kinds) } : {}), ...answer };
    } catch (error) {
        return { response: failure(context, error, 'Commerce could not be read.') };
    }
}

/**
 * What removing a project's pack would lose, for any project rather than only the open one: what a
 * batch reset reads before it asks (owner, 2026-11-04). Writes nothing; nothing when the project
 * has no pack or its store could not be read.
 */
export async function readRemovalChangesOf(context: HandlerContext, project: Project): Promise<DatapackRemovalChanges | undefined> {
    const held = project.datapack;
    if (!held) return undefined;
    const changes = await readChanges(contextForProject(context, project), project, { name: held.name, version: held.version }, held.store);
    return 'response' in changes ? undefined : changes;
}

/** Where a save of the changes would go: the demo's pack by name (Save); none when it needs a name (Save As). */
async function whereSaved(context: HandlerContext, store: Parameters<typeof saveIntoFor>[1]): Promise<{ packName?: string }> {
    const into = await saveIntoFor(context, store, undefined);
    return 'response' in into ? {} : { packName: into.displayName };
}

/**
 * The record has moved on: an earlier save made a pack from this one, or a newer version of it, so
 * the data is that version's now. Sending the old name on would ask the service to delete by name.
 */
async function movedOn(project: Project, pack: DatapackId): Promise<HandlerResponse | undefined> {
    const held = project.datapack;
    if (!held || isSamePack(held, pack) || (await hasRecord(project, pack))) return undefined;
    const madeFromIt = held.origin !== undefined && isSamePack(held.origin, pack);
    const olderVersion = held.name === pack.name;
    if (!madeFromIt && !olderVersion) return undefined;
    if (!(await hasRecord(project, held))) return undefined;
    return {
        success: false,
        error: `What this pack put in Commerce was saved to ${held.name}@${held.version}, the datapack this demo now uses, so uninstall that one instead. Nothing was uninstalled.`,
        code: ErrorCode.INVALID_OPERATION,
    };
}

/** Save the store's copy now, reporting its stages; or the response saying why nothing was removed. */
async function saveFirst(context: HandlerContext, request: RemovalChangesRequest, report: (stage: string) => void): Promise<{ saved: SavedFirst } | { response: HandlerResponse }> {
    const payload: StoreChangesPayload = { datapackName: request.pack.name, version: request.pack.version, ...(request.source ? { source: request.source } : {}) };
    const opened = await openSave(context, payload);
    if ('response' in opened) return { response: notSaved(opened.response) };
    const into = await saveIntoFor(context, opened, request.saveAs);
    if ('response' in into) return { response: { ...into.response, code: ErrorCode.CHANGES_NEED_ANSWER } };
    const result = await saveToPack(context, opened, into, report);
    if (!result.success) return { response: notSaved(result) };
    const data = result.data as SaveStoreChangesResult;
    if (request.rememberAlways) await rememberAlways(context);
    return { saved: { id: { name: data.datapackName, version: data.version }, dataTypes: Object.keys(data.counts), note: data.message } };
}

/** A save that stopped: nothing is removed, and the confirm can say why. */
function notSaved(response: HandlerResponse): HandlerResponse {
    return { ...response, success: false, code: ErrorCode.CHANGES_NOT_SAVED };
}

/** A setting that will not write is not worth stopping a save that worked. */
async function rememberAlways(context: HandlerContext): Promise<void> {
    try {
        await alwaysSaveChangesOnRemoval();
    } catch (error) {
        context.logger.warn(`[Data Installer] Could not turn on saving changes before a removal: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** No answer, and something to lose: name it, and remove nothing. */
function askFor(changes: DatapackRemovalChanges): HandlerResponse {
    return {
        success: false,
        error:
            `${changes.sentence} Nothing was uninstalled. Tell the user, then call again with changes:"keep" to save them first ` +
            `(${changes.packName ? `into ${changes.packName}` : 'as a new datapack of theirs: also send saveAs with the name the user gives it'}), ` +
            'or changes:"drop" to lose them.',
        code: ErrorCode.CHANGES_NEED_ANSWER,
        data: {
            changes: changes.kinds,
            ...(changes.sentence ? { sentence: changes.sentence } : {}),
            ...(changes.packName ? { packName: changes.packName } : {}),
        },
    };
}

/** A read that failed is never "nothing changed". */
function couldNotCheck(response: HandlerResponse): HandlerResponse {
    return {
        ...response,
        error:
            `Could not check what changed since this pack was installed: ${response.error ?? 'no reason given.'} Nothing was uninstalled. ` +
            'Call again with changes:"drop" to uninstall it anyway, losing any changes.',
    };
}

/**
 * Settle the SC's changes before a removal: save them, ask, or find nothing to do.
 *
 * @param context - the handler context; its current project is the one removed from
 * @param request - the pack and what the caller answered
 * @param report - told each stage of a save
 * @returns the version saved, if one was (the removal must be of it), or the response to answer
 *   instead, in which case nothing has been removed
 */
export async function settleChangesBeforeRemoval(
    context: HandlerContext,
    request: RemovalChangesRequest,
    report: (stage: string) => void,
): Promise<{ saved?: SavedFirst } | { response: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return {};
    const moved = await movedOn(project, request.pack);
    if (moved) return { response: moved };
    if (!(await hasRecord(project, request.pack)) || request.answer === 'drop') return {};
    if (request.answer === 'keep') return saveFirst(context, request, report);
    const changes = await readChanges(context, project, request.pack, request.source);
    if ('response' in changes) return { response: couldNotCheck(changes.response) };
    if (changes.count === 0) return {};
    // Saving without asking needs somewhere to save: the demo's own pack, or a name already given.
    const canSave = changes.packName !== undefined || request.saveAs !== undefined;
    if ((request.unanswered === 'keep' || changes.alwaysSave) && canSave) return saveFirst(context, request, report);
    return { response: askFor(changes) };
}

/**
 * Where a save's stages go while a removal waits on it: the shared progress channel, which reaches
 * the window and the notification that takes over if the SC closes it, and the agent's chat. The
 * window is named at the first stage, so a removal with nothing to save sends it nothing.
 */
export function removalStageReporter(context: HandlerContext): (stage: string) => void {
    let named = false;
    return (stage) => {
        if (!named) startModalRun(DATAPACK_OPERATION_ID, context.sendMessage);
        named = true;
        reportPhase(stage);
        void pushOperationProgress({ id: DATAPACK_OPERATION_ID, state: 'running', stage });
    };
}

/** The stage a removal is on once the save has finished. */
export const STARTING_REMOVAL_STAGE = OPERATION_STAGES.removingDatapack.label;

/**
 * This context, with `project` as its current project. A project reset can be started from the
 * projects list, for a project other than the one the pointer on disk names, and everything a save
 * opens asks for the current one. A save's record lands on this same object, so the removal that
 * follows reads the version saved.
 */
export function contextForProject(context: HandlerContext, project: Project): HandlerContext {
    const stateManager = Object.create(context.stateManager) as HandlerContext['stateManager'];
    stateManager.getCurrentProject = async () => project;
    return { ...context, stateManager };
}

/** What a removal of this pack takes, when Demo Builder's engine installed it: read from the record alone. */
async function removalScope(project: Project | undefined, pack: DatapackId): Promise<DatapackRemovalScope> {
    const record = project ? await readInstallRecord(nodeRecordFiles, project.path, pack) : undefined;
    if (!record) return { recordedKinds: null };
    const at = record.target;
    return { recordedKinds: kindsOnRecord(record), ...(at ? { installedAt: { websiteCode: at.websiteCode, storeCode: at.storeCode } } : {}) };
}

/** The form's and the confirm's reads: what a removal of this pack would take, and would lose. Write nothing. */
export const removalChangesHandlers = defineHandlers({
    'get-datapack-removal-scope': async (context: HandlerContext, payload?: StoreChangesPayload): Promise<HandlerResponse> => {
        const input = readPayload(payload);
        if ('error' in input) return { success: false, error: input.error };
        try {
            return { success: true, data: await removalScope(await context.stateManager.getCurrentProject(), input.pack) };
        } catch (error) {
            if (error instanceof InstallRecordError) return { success: false, error: error.message };
            throw error;
        }
    },
    'get-datapack-removal-changes': async (context: HandlerContext, payload?: StoreChangesPayload): Promise<HandlerResponse> => {
        const input = readPayload(payload);
        if ('error' in input) return { success: false, error: input.error };
        const project = await context.stateManager.getCurrentProject();
        if (!project) return { success: false, error: 'Open a project before uninstalling a datapack.' };
        const changes = await readChanges(context, project, input.pack, input.source);
        return 'response' in changes ? changes.response : { success: true, data: changes };
    },
});
