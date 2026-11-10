/**
 * Two datapack actions on the project's store, for a pack Demo Builder's engine installed there
 * (datapack-engine step 05):
 *
 * - `preview-datapack-changes`: what installing the pack again would bring up to the pack, add,
 *   take out, and keep because the SC changed it. Counts and a few names by kind, never rows.
 *   Writes nothing.
 * - `save-store-changes-to-pack`: Save and Save As (`demoPack.ts`, owner 2026-11-03). The
 *   store's copy of the pack it holds, and anything picked (`selections`, step 14), is written
 *   into the datapack LIBRARY:
 *   - **Save** (no `saveAs`): a new version of the demo's pack (`project.datapack`), when that
 *     pack is the SC's own. When it is not, nothing is written and the answer says a name is
 *     needed (`data.needsName`, with the name Save As would start with).
 *   - **Save As** (`saveAs.displayName`): a new pack of the SC's under that name.
 *   Either way the pack installed is left as it is, and the project then uses the new version.
 *   With no pack named, the pack read is the project's when Demo Builder installed it, else
 *   none, and the version holds only the picks (a store Demo Builder did not fill).
 *   Confirm-gated; its progress goes to the screen's progress window when started from one.
 *   Undone by deleting the new version from the library (`delete-library-datapack`).
 * - `verify-datapack-install`: whether the store holds what the pack says, for the products the pack
 *   made: each is there, a configurable has its options and children, select values are the options
 *   the pack names, and prices match. Counts and up to 20 examples per finding. Writes nothing.
 * - `listPickable` (for `list-datapack-export-items` with Demo Builder's engine): one kind of the
 *   store's items to pick from, less what the pack being saved holds already.
 *
 * - `countPickable` (for `count-datapack-export-items`): how many of each kind that list would read
 *   from, for greying out a kind with none before it is clicked.
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

import { KIND_NOUNS, PICKABLE_KINDS, type Selections, type StorePicks, isPickableKind, picksOf } from '../pickableKinds';
import { layerFinder, projectCommerce, readPackItems } from '../services/buildDatapackEngine';
import type { ReadWindowUse } from '../services/commerceReadWindow';
import { nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { checkRecordedRootStep, recordedRootStep, rootStepItem } from '../services/demoBuilderEngine/packRootCheck';
import type { PackRootStep } from '../services/demoBuilderEngine/packRootStep';
import { countPickable, listPickable } from '../services/demoBuilderEngine/saveStore';
import type { StoreChangesDeps } from '../services/demoBuilderEngine/storeAccess';
import { previewChanges } from '../services/demoBuilderEngine/storeChanges';
import { verifyPackInstall } from '../services/demoBuilderEngine/verifyInstall';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import type { DatapackSetupStep } from '../types';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { resolveDatapackWriteAccess } from './datapackWriteGate';
import { libraryReads } from './libraryReads';
import { failure, saveIntoFor, saveToPack } from './packSave';
import { DATAPACK_SAVE_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { handleOpenAdminPanel } from '@/features/dashboard/handlers/openUrlHandlers';
import type { Project } from '@/types/base';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import type { SaveStoreChangesRequest } from '@/types/webviewRequests';

const LOG_PREFIX = '[Data Installer]';

/** What either action may be sent. Every field is checked here: an agent sends these too. */
export interface StoreChangesPayload extends Partial<Omit<SaveStoreChangesRequest, 'confirm' | 'source' | 'saveAs'>> {
    /** Save As's name, checked here: an agent may send anything. */
    saveAs?: { displayName?: unknown };
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

export function readPayload(payload: StoreChangesPayload | undefined): { pack: DatapackId; source?: DatapackStoreName } | { error: string } {
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
export async function openProjectStore(context: HandlerContext, use?: ReadWindowUse): Promise<ProjectStore | { response: HandlerResponse }> {
    const gate = await resolveDatapackWriteAccess(context, 'import');
    if ('response' in gate) return gate;
    if (context.authManager) {
        const mismatch = await orgGuard(context, gate.project, context.authManager);
        if (mismatch) return { response: { success: false, error: mismatch.error, code: ErrorCode.ORG_MISMATCH } };
    }
    const libraryCatalog = libraryReads(context);
    const log = (line: string): void => context.debugLogger.debug(`${LOG_PREFIX} ${line}`);
    const deps: StoreChangesDeps = {
        // A changes check keeps what it reads; a save reuses it (`commerceReadWindow`, walk F128).
        commerce: projectCommerce({ project: gate.project, authManager: context.authManager, secrets: context.context?.secrets }, use ? { use, log } : undefined),
        readPack: (id, source) => readPackItems({ catalog: gate.catalog, libraryCatalog }, id, source),
        describe: describer(context, (id) => gate.catalog.getDatapackDetail(id)),
        projectPath: gate.project.path,
        target: resolveInstallTarget(gate.project) ?? undefined,
        log,
        // The settings layer (step 09) is previewed and saved as the engine applies it.
        ...layerFinder({ libraryCatalog }),
    };
    return { project: gate.project, deps };
}

/** The access the pack's actions share, or the response to answer instead. */
async function openStoreChanges(context: HandlerContext, payload: StoreChangesPayload | undefined, use?: ReadWindowUse): Promise<OpenedStore | { response: HandlerResponse }> {
    const input = readPayload(payload);
    if ('error' in input) return { response: { success: false, error: input.error } };
    const store = await openProjectStore(context, use);
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
export async function openSave(context: HandlerContext, payload: StoreChangesPayload): Promise<SaveOpened | { response: HandlerResponse }> {
    const read = picksOf(payload.selections);
    if ('error' in read) return { response: { success: false, error: read.error } };
    // A save reads what a changes check just read, when one did (walk F128).
    const store = await openProjectStore(context, 'reuse');
    if ('response' in store) return store;
    const target = await packToSave(store.project, payload);
    if ('error' in target) return { response: { success: false, error: target.error } };
    return { ...store, ...target, picks: read.picks };
}

export interface SaveOpened extends ProjectStore {
    pack?: DatapackId;
    source?: DatapackStoreName;
    picks: StorePicks;
}

/** The step's answer: the pack, and its step as the setup guide lists one, or null. */
function setupStepAnswer(pack: DatapackId, step: PackRootStep | undefined): HandlerResponse {
    const data: DatapackSetupStep = { datapackName: pack.name, version: pack.version, step: step ? rootStepItem(step) : null };
    return { success: true, data };
}

/**
 * One kind of the project's store to pick from, for a save with Demo Builder's engine (step 14):
 * the export door's `list-datapack-export-items`. Less what the pack being saved holds (the one
 * named, else the project's own when Demo Builder installed it). With `unused`, Add Items's list:
 * only what this demo does not use (`demoUses.ts`). Reads only.
 */
export async function listPickableItems(context: HandlerContext, payload: (StoreChangesPayload & { dataType?: string; unused?: boolean }) | undefined): Promise<HandlerResponse> {
    const kind = payload?.dataType ?? '';
    if (!isPickableKind(kind)) return { success: false, error: `Choose what to list: one of ${PICKABLE_KINDS.join(', ')}.` };
    const store = await openProjectStore(context);
    if ('response' in store) return store.response;
    const target = await packToSave(store.project, payload);
    if ('error' in target) return { success: false, error: target.error };
    try {
        return { success: true, data: await listPickable(store.deps, kind, target.pack, target.source, payload?.unused === true) };
    } catch (error) {
        return failure(context, error, `Commerce's ${KIND_NOUNS[kind][1]} could not be listed.`);
    }
}

/**
 * How many of each kind the project's store has, so a screen can grey out a kind with none before
 * it is clicked (the export door's `count-datapack-export-items`). Opened as `listPickableItems`
 * opens, so it counts the website and root that list reads. Reads only.
 */
export async function countPickableItems(context: HandlerContext, payload: StoreChangesPayload | undefined): Promise<HandlerResponse> {
    const store = await openProjectStore(context);
    if ('response' in store) return store.response;
    const target = await packToSave(store.project, payload);
    if ('error' in target) return { success: false, error: target.error };
    try {
        return { success: true, data: await countPickable(store.deps, target.pack, target.source) };
    } catch (error) {
        return failure(context, error, "Commerce's items could not be counted.");
    }
}

/** What the export door is sent: the picks, the name, and the service's own fields, which are refused here. */
interface StoreSavePayload {
    selections?: Selections;
    saveAs?: { displayName?: string };
    confirm?: boolean;
    progress?: 'modal';
    datapackName?: string;
    version?: string;
    commerceInstance?: string;
    dataTypes?: string[];
}

/**
 * The export fields that name the pack written, which only an ACO pack takes, and the service's
 * export did before it was deleted (DI-12): a save names its pack by the project's, or by `saveAs`.
 */
const NAMING_FIELDS = ['datapackName', 'version', 'commerceInstance', 'dataTypes'] as const;

/**
 * The export door (step 14, item 10): what is picked from the project's store, with the project's
 * pack when Demo Builder installed it, saved as Save or Save As (`saveAs`). The same save as
 * `save-store-changes-to-pack`; never a pack in the shared catalog.
 */
export async function saveFromStore(context: HandlerContext, payload: StoreSavePayload | undefined): Promise<HandlerResponse> {
    const named = NAMING_FIELDS.filter((field) => payload?.[field] !== undefined);
    if (named.length > 0) {
        return {
            success: false,
            error: `A save goes into My Datapacks under the project's datapack or saveAs, so ${named.join(', ')} cannot be sent. Send selections, and saveAs with a name for a new datapack.`,
            code: ErrorCode.INVALID_OPERATION,
        };
    }
    const save: StoreChangesPayload = { selections: payload?.selections, confirm: payload?.confirm };
    if (payload?.saveAs) save.saveAs = payload.saveAs;
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

    // The step's "Open Admin", as the dashboard's Admin button opens it.
    openAdminPanel: handleOpenAdminPanel,

    'preview-datapack-changes': async (context: HandlerContext, payload?: StoreChangesPayload): Promise<HandlerResponse> => {
        // The re-import's comparison is a changes check: it reads Commerce itself, and keeps it (F128).
        const opened = await openStoreChanges(context, payload, 'remember');
        if ('response' in opened) return opened.response;
        try {
            const preview = await previewChanges(opened.deps, opened.pack, opened.source ?? 'installer', payload?.dataTypes);
            return { success: true, data: { datapackName: opened.pack.name, version: opened.pack.version, ...preview } };
        } catch (error) {
            return failure(context, error, 'What installing again would change could not be read.');
        }
    },

    // Whether the store holds what the pack says (owner, 2026-11-06). Reads only.
    'verify-datapack-install': async (context: HandlerContext, payload?: StoreChangesPayload): Promise<HandlerResponse> => {
        const opened = await openStoreChanges(context, payload);
        if ('response' in opened) return opened.response;
        try {
            const check = await verifyPackInstall(opened.deps, opened.pack, opened.source ?? 'installer');
            return { success: true, data: { datapackName: opened.pack.name, version: opened.pack.version, ...check } };
        } catch (error) {
            return failure(context, error, 'Commerce could not be checked against the datapack.');
        }
    },

    'save-store-changes-to-pack': narrateOutcomeToModal<StoreChangesPayload>(
        async (context, payload) => {
            if (payload?.confirm !== true) {
                return {
                    success: false,
                    error: "This saves Commerce's copy of the datapack, and anything picked, into My Datapacks: a new version of this demo's datapack when it is yours, else a new datapack named by saveAs. Confirm to proceed.",
                    code: ErrorCode.INVALID_OPERATION,
                };
            }
            const opened = await openSave(context, payload);
            if ('response' in opened) return opened.response;
            const into = await saveIntoFor(context, opened, payload.saveAs);
            if ('response' in into) return into.response;
            const title = into.name ? `Saving ${into.displayName}` : `Creating ${into.displayName}`;
            const options = { id: DATAPACK_SAVE_OPERATION_ID, title, inModal: payload.progress === 'modal' };
            // The reporter itself, so the save's rows reach its window (walk F91: a wrapper passing on
            // only the stage and step dropped them, and the window kept its one spinner).
            return withOperationProgress(options, (report) => saveToPack(context, opened, into, report));
        },
        () => DATAPACK_SAVE_OPERATION_ID,
    ),
});
