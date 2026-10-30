/**
 * Two datapack actions on the project's store, for a pack Demo Builder's engine installed there
 * (datapack-engine step 05):
 *
 * - `preview-datapack-changes`: what installing the pack again would bring up to the pack, add,
 *   take out, and keep because the SC changed it. Counts and a few names by kind, never rows.
 *   Writes nothing.
 * - `save-store-changes-to-pack`: "Save store changes to this pack". The store's copy of the
 *   pack is written into the datapack LIBRARY as a new version of the demo's OWN pack (step 07,
 *   `demoPack.ts`, made at the first save), the pack installed is left as it is, and the project
 *   records the new version. Things the SC made by hand go in too when picked (`selections`,
 *   step 14). With no pack named, the pack is the project's own when Demo Builder installed it,
 *   else there is none and the version holds only the picks (a store Demo Builder did not fill).
 *   Confirm-gated; its progress goes to the screen's progress window when started from one.
 *   Undone by deleting the new version from the library (`delete-library-datapack`).
 * - `listPickable` (for `list-datapack-export-items` with Demo Builder's engine): one kind of the
 *   store's items to pick from, less what the pack being saved holds already.
 *
 * - `get-datapack-setup-step` / `check-datapack-setup-step` (step 12): the one Admin step a pack
 *   can leave (its root category is a root of its own, and only the SC can point the store at
 *   it), in the setup guide's step format, and its Check: the install's own read-only check
 *   (`GET store/storeGroups`), which marks it done with no reinstall. The get reads only the
 *   install record.
 *
 * The rest open as every datapack write does (`resolveDatapackWriteAccess`), then check the sign-in
 * is in the org that owns the store (`orgGuard`, adobe-org-context), since both read it with the
 * project's own credential.
 *
 * @module features/data-installer/handlers/storeChangesHandlers
 */

import { PICKABLE_KINDS, type Selections, type StorePicks, isPickableKind, picksOf } from '../pickableKinds';
import { projectCommerce, readPackItems } from '../services/buildDatapackEngine';
import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import { writePackToStore } from '../services/datapackTransfer';
import { nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { checkRecordedRootStep, recordedRootStep, rootStepItem } from '../services/demoBuilderEngine/packRootCheck';
import type { PackRootStep } from '../services/demoBuilderEngine/packRootStep';
import { listPickable, saveStoreChanges } from '../services/demoBuilderEngine/saveStore';
import { type StoreChangesDeps, StoreChangesError } from '../services/demoBuilderEngine/storeAccess';
import { previewChanges } from '../services/demoBuilderEngine/storeChanges';
import { type DemoPackSave, demoPackSaveFor, recordDemoPackSave, recordOwnPackName } from '../services/demoPack';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import type { DatapackSetupStep } from '../types';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { resolveDatapackWriteAccess } from './datapackWriteGate';
import { libraryReads } from './libraryReads';
import { DATAPACK_SAVE_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { type OperationOutcome, withOperationProgress } from '@/core/vscode/withOperationProgress';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { handleOpenAdminPanel } from '@/features/dashboard/handlers/openUrlHandlers';
import type { Project } from '@/types/base';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import type { SaveStoreChangesRequest, SaveStoreChangesResult } from '@/types/webviewRequests';

const LOG_PREFIX = '[Data Installer]';

/** What either action may be sent. Every field is checked here: an agent sends these too. */
export interface StoreChangesPayload extends Partial<Omit<SaveStoreChangesRequest, 'confirm' | 'source'>> {
    /**
     * Which store holds the pack: `installer` or `library`. The preview reads it from there
     * (the Data Installer when absent); a save reads the installed version's own rows from there
     * (the library, then the Data Installer, when absent).
     */
    source?: string;
    /** The kinds to look at; all the pack holds when absent. Preview only. */
    dataTypes?: string[];
    /** Save only: must be true. */
    confirm?: boolean;
}

/** The project's store, opened for reading with the project's own credential. */
export interface ProjectStore {
    project: Project;
    deps: StoreChangesDeps;
}

interface OpenedStore extends ProjectStore {
    pack: DatapackId;
    /** The store the caller named, if it named one. */
    source?: DatapackStoreName;
}

function readPayload(payload: StoreChangesPayload | undefined): { pack: DatapackId; source?: DatapackStoreName } | { error: string } {
    if (!payload?.datapackName || !payload.version) return { error: 'A datapack name and version are required.' };
    const { source } = payload;
    if (source !== undefined && source !== 'installer' && source !== 'library') {
        return { error: `There is no datapack store called ${source}: it is installer or library.` };
    }
    return { pack: { name: payload.datapackName, version: payload.version }, ...(source ? { source } : {}) };
}

type Detail = { displayName: string; description?: string };

/** What the pack is called and says: from the library, else the Data Installer, else its name. */
function describer(context: HandlerContext, fromInstaller: (id: DatapackId) => Promise<Detail>): StoreChangesDeps['describe'] {
    return async (id) => {
        const library = await resolveDataInstallerAccess(context, 'library');
        const reads = [...(library.ok ? [() => library.client.getDatapackDetail(id)] : []), () => fromInstaller(id)];
        for (const read of reads) {
            try {
                const detail = await read();
                return { displayName: detail.displayName, ...(detail.description ? { description: detail.description } : {}) };
            } catch {
                // The next store, or the name.
            }
        }
        return { displayName: id.name };
    };
}

/**
 * The project's store, opened as every datapack write opens it, with the sign-in checked against
 * the org that owns it; or the response to answer instead.
 */
export async function openProjectStore(context: HandlerContext): Promise<ProjectStore | { response: HandlerResponse }> {
    const gate = await resolveDatapackWriteAccess(context, 'import');
    if ('response' in gate) return gate;
    if (context.authManager) {
        const mismatch = await orgGuard(context, gate.project, context.authManager);
        if (mismatch) return { response: { success: false, error: mismatch.error, code: ErrorCode.ORG_MISMATCH } };
    }
    const libraryCatalog = libraryReads(context);
    const deps: StoreChangesDeps = {
        commerce: projectCommerce({ project: gate.project, authManager: context.authManager, secrets: context.context?.secrets }),
        readPack: (id, source) => readPackItems({ catalog: gate.catalog, libraryCatalog }, id, source),
        describe: describer(context, (id) => gate.catalog.getDatapackDetail(id)),
        projectPath: gate.project.path,
        target: resolveInstallTarget(gate.project) ?? undefined,
        log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
    };
    return { project: gate.project, deps };
}

/** The access the pack's actions share, or the response to answer instead. */
async function openStoreChanges(context: HandlerContext, payload: StoreChangesPayload | undefined): Promise<OpenedStore | { response: HandlerResponse }> {
    const input = readPayload(payload);
    if ('error' in input) return { response: { success: false, error: input.error } };
    const store = await openProjectStore(context);
    return 'response' in store ? store : { ...store, ...input };
}

/**
 * The pack a save or a pick list is of: the one named, else the project's own when Demo Builder
 * installed it (its record is on disk), else none: a store Demo Builder did not fill.
 */
export async function packToSave(project: Project, payload: StoreChangesPayload | undefined): Promise<{ pack?: DatapackId; source?: DatapackStoreName } | { error: string }> {
    if (payload?.datapackName || payload?.version) return readPayload(payload);
    const held = project.datapack;
    if (!held) return {};
    const pack = { name: held.name, version: held.version };
    return (await readInstallRecord(nodeRecordFiles, project.path, pack)) ? { pack, ...(held.store ? { source: held.store } : {}) } : {};
}

/** A save's store, its pack if it has one, and its picks; or the response to answer instead. */
async function openSave(context: HandlerContext, payload: StoreChangesPayload): Promise<SaveOpened | { response: HandlerResponse }> {
    const read = picksOf(payload.selections);
    if ('error' in read) return { response: { success: false, error: read.error } };
    const store = await openProjectStore(context);
    if ('response' in store) return store;
    const target = await packToSave(store.project, payload);
    if ('error' in target) return { response: { success: false, error: target.error } };
    return { ...store, ...target, picks: read.picks };
}

interface SaveOpened extends ProjectStore {
    pack?: DatapackId;
    source?: DatapackStoreName;
    picks: StorePicks;
}

function failure(context: HandlerContext, error: unknown, fallback: string): HandlerResponse {
    if (error instanceof StoreChangesError) return { success: false, error: error.message };
    context.logger.warn(`${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: `${fallback} Details are in Debug Logs.`, code: ErrorCode.UNKNOWN };
}

/**
 * Record on the project that its store now matches the new version of its own pack; for a save
 * of picks alone, only the own pack's name, so the next save is a version of the same pack and
 * the pack the project installs from is left as it was.
 */
async function recordOnProject(context: HandlerContext, save: DemoPackSave, holdsPack: boolean): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return;
    if (holdsPack) recordDemoPackSave(project, save);
    else recordOwnPackName(project, save);
    await context.stateManager.saveProject(project);
}

/** Capture, write the new version into the library, and record it on the project. */
async function save(context: HandlerContext, opened: SaveOpened, report: (stage: string) => void): Promise<HandlerResponse & OperationOutcome> {
    const library = await resolveDataInstallerAccess(context, 'library');
    if (!library.ok) return library.response;
    const writer = new DatapackStoreWriter({
        baseUrl: library.baseUrl,
        getToken: library.getToken,
        ...(library.orgCode ? { orgCode: library.orgCode } : {}),
        log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
    });
    try {
        // No `update`: the version saved is always new, so nothing in the library is written over.
        const at = new Date();
        const { pack, source, picks } = opened;
        const plan = demoPackSaveFor(opened.project, pack, at);
        const saveAs = { id: plan.id, displayName: plan.displayName };
        const target = { saveAs, picks, ...(pack ? { pack } : {}), ...(source ? { source } : {}) };
        const result = await saveStoreChanges(opened.deps, target, (file) => writePackToStore(writer, file), report);
        // The pack it was made from names the store its rows were actually read from.
        await recordOnProject(context, demoPackSaveFor(opened.project, pack ? { ...pack, store: result.readFrom } : undefined, at), pack !== undefined);
        const from = pack ? `the store's copy of ${pack.name}@${pack.version}` : 'what was picked from the store';
        context.logger.info(`${LOG_PREFIX} Saved ${from} as ${result.saved.name}@${result.saved.version} in the datapack library`);
        const data: SaveStoreChangesResult = {
            datapackName: result.saved.name,
            version: result.saved.version,
            displayName: plan.displayName,
            ...(pack ? { previous: pack } : {}),
            counts: result.counts,
            message: result.sentence,
            unnamed: result.unnamed,
            leftOut: result.leftOut,
        };
        return { success: true, note: result.sentence, data };
    } catch (error) {
        return failure(context, error, 'The store changes could not be saved.');
    }
}

/** The step's answer: the pack, and its step as the setup guide lists one, or null. */
function setupStepAnswer(pack: DatapackId, step: PackRootStep | undefined): HandlerResponse {
    const data: DatapackSetupStep = { datapackName: pack.name, version: pack.version, step: step ? rootStepItem(step) : null };
    return { success: true, data };
}

/**
 * One kind of the project's store to pick from, for a save with Demo Builder's engine (step 14):
 * the export door's `list-datapack-export-items`. Less what the pack being saved holds (the one
 * named, else the project's own when Demo Builder installed it). Reads only.
 */
export async function listPickableItems(context: HandlerContext, payload: (StoreChangesPayload & { dataType?: string }) | undefined): Promise<HandlerResponse> {
    const kind = payload?.dataType ?? '';
    if (!isPickableKind(kind)) return { success: false, error: `Choose what to list: one of ${PICKABLE_KINDS.join(', ')}.` };
    const store = await openProjectStore(context);
    if ('response' in store) return store.response;
    const target = await packToSave(store.project, payload);
    if ('error' in target) return { success: false, error: target.error };
    try {
        return { success: true, data: await listPickable(store.deps, kind, target.pack, target.source) };
    } catch (error) {
        return failure(context, error, `The store's ${kind} could not be listed.`);
    }
}

/** What the export door is sent: the picks, and the service's own fields, which are refused here. */
interface StoreSavePayload {
    selections?: Selections;
    confirm?: boolean;
    progress?: 'modal';
    datapackName?: string;
    version?: string;
    commerceInstance?: string;
    dataTypes?: string[];
}

/** The service's export fields, which name a pack in the shared catalog that this save never writes. */
const SERVICE_EXPORT_FIELDS = ['datapackName', 'version', 'commerceInstance', 'dataTypes'] as const;

/**
 * The export door with Demo Builder's engine (step 14, item 10): what is picked from the project's
 * store, with the project's own pack when Demo Builder installed it, saved as a new version of
 * the demo's own pack. The same save as "Save store changes"; never a pack in the shared catalog.
 */
export async function saveFromStore(context: HandlerContext, payload: StoreSavePayload | undefined): Promise<HandlerResponse> {
    const named = SERVICE_EXPORT_FIELDS.filter((field) => payload?.[field] !== undefined);
    if (named.length > 0) {
        return {
            success: false,
            error: `With Demo Builder's engine a save goes into this demo's own pack, never a named one, so ${named.join(', ')} cannot be sent. Send only selections.`,
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    const save: StoreChangesPayload = { selections: payload?.selections, confirm: payload?.confirm };
    if (payload?.progress) save.progress = payload.progress;
    return storeChangesHandlers['save-store-changes-to-pack'](context, save);
}

export const storeChangesHandlers = defineHandlers({
    // Step 12: the Admin step a pack left, from its install record. Reads no store.
    'get-datapack-setup-step': async (context: HandlerContext, payload?: StoreChangesPayload): Promise<HandlerResponse> => {
        const input = readPayload(payload);
        if ('error' in input) return { success: false, error: input.error };
        const project = await context.stateManager.getCurrentProject();
        if (!project) return setupStepAnswer(input.pack, undefined);
        return setupStepAnswer(input.pack, await recordedRootStep(nodeRecordFiles, project.path, input.pack));
    },

    // Step 12: the step's Check, read-only against the store; only the install record is written.
    'check-datapack-setup-step': async (context: HandlerContext, payload?: StoreChangesPayload): Promise<HandlerResponse> => {
        const opened = await openStoreChanges(context, payload);
        if ('response' in opened) return opened.response;
        try {
            return setupStepAnswer(opened.pack, await checkRecordedRootStep(opened.deps, opened.pack));
        } catch (error) {
            return failure(context, error, 'The step could not be checked.');
        }
    },

    // The step's "Open the Admin", as the dashboard's Admin button opens it.
    openAdminPanel: handleOpenAdminPanel,

    'preview-datapack-changes': async (context: HandlerContext, payload?: StoreChangesPayload): Promise<HandlerResponse> => {
        const opened = await openStoreChanges(context, payload);
        if ('response' in opened) return opened.response;
        try {
            const preview = await previewChanges(opened.deps, opened.pack, opened.source ?? 'installer', payload?.dataTypes);
            return { success: true, data: { datapackName: opened.pack.name, version: opened.pack.version, ...preview } };
        } catch (error) {
            return failure(context, error, 'What installing again would change could not be read.');
        }
    },

    'save-store-changes-to-pack': narrateOutcomeToModal<StoreChangesPayload>(
        async (context, payload) => {
            if (payload?.confirm !== true) {
                return {
                    success: false,
                    error: "This saves the store's copy of the pack, and anything picked, as a new version of this demo's own pack in the datapack library. Confirm to proceed.",
                    code: ErrorCode.INVALID_OPERATION,
                };
            }
            const opened = await openSave(context, payload);
            if ('response' in opened) return opened.response;
            const options = { id: DATAPACK_SAVE_OPERATION_ID, title: 'Saving store changes', inModal: payload.progress === 'modal' };
            return withOperationProgress(options, (report) => save(context, opened, (stage) => report(stage)));
        },
        () => DATAPACK_SAVE_OPERATION_ID,
    ),
});
