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
 *   records the new version. Confirm-gated; its progress goes to the screen's progress window
 *   when started from one. Undone by deleting the new version from the library
 *   (`delete-library-datapack`).
 *
 * Both open as every datapack write does (`resolveDatapackWriteAccess`), then check the sign-in
 * is in the org that owns the store (`orgGuard`, adobe-org-context), since both read it with the
 * project's own credential.
 *
 * @module features/data-installer/handlers/storeChangesHandlers
 */

import { projectCommerce, readPackItems } from '../services/buildDatapackEngine';
import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import { writePackToStore } from '../services/datapackTransfer';
import { type StoreChangesDeps, StoreChangesError, previewChanges, saveStoreChanges } from '../services/demoBuilderEngine/storeChanges';
import { type DemoPackSave, demoPackSaveFor, recordDemoPackSave } from '../services/demoPack';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { resolveDatapackWriteAccess } from './datapackWriteGate';
import { libraryReads } from './libraryReads';
import { DATAPACK_SAVE_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { type OperationOutcome, withOperationProgress } from '@/core/vscode/withOperationProgress';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
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

interface OpenedStore {
    project: Project;
    deps: StoreChangesDeps;
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

/** The access both actions share, or the response to answer instead. */
async function openStoreChanges(context: HandlerContext, payload: StoreChangesPayload | undefined): Promise<OpenedStore | { response: HandlerResponse }> {
    const input = readPayload(payload);
    if ('error' in input) return { response: { success: false, error: input.error } };
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
    return { project: gate.project, deps, ...input };
}

function failure(context: HandlerContext, error: unknown, fallback: string): HandlerResponse {
    if (error instanceof StoreChangesError) return { success: false, error: error.message };
    context.logger.warn(`${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: `${fallback} Details are in Debug Logs.`, code: ErrorCode.UNKNOWN };
}

/** Record on the project that its store now matches the new version of its own pack. */
async function recordOnProject(context: HandlerContext, save: DemoPackSave): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return;
    recordDemoPackSave(project, save);
    await context.stateManager.saveProject(project);
}

/** Capture, write the new version into the library, and record it on the project. */
async function save(context: HandlerContext, opened: OpenedStore, report: (stage: string) => void): Promise<HandlerResponse & OperationOutcome> {
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
        const plan = demoPackSaveFor(opened.project, opened.pack, at);
        const saveAs = { id: plan.id, displayName: plan.displayName };
        const target = { pack: opened.pack, saveAs, ...(opened.source ? { source: opened.source } : {}) };
        const result = await saveStoreChanges(opened.deps, target, (file) => writePackToStore(writer, file), report);
        // The pack it was made from names the store its rows were actually read from.
        await recordOnProject(context, demoPackSaveFor(opened.project, { ...opened.pack, store: result.readFrom }, at));
        context.logger.info(`${LOG_PREFIX} Saved the store's copy of ${opened.pack.name}@${opened.pack.version} as ${result.saved.name}@${result.saved.version} in the datapack library`);
        const data: SaveStoreChangesResult = {
            datapackName: result.saved.name,
            version: result.saved.version,
            displayName: plan.displayName,
            previous: opened.pack,
            counts: result.counts,
            message: result.sentence,
        };
        return { success: true, note: result.sentence, data };
    } catch (error) {
        return failure(context, error, 'The store changes could not be saved.');
    }
}

export const storeChangesHandlers = defineHandlers({
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
                    error: 'This saves the store\'s copy of the pack as a new version in the datapack library. Confirm to proceed.',
                    code: ErrorCode.INVALID_OPERATION,
                };
            }
            const opened = await openStoreChanges(context, payload);
            if ('response' in opened) return opened.response;
            const options = { id: DATAPACK_SAVE_OPERATION_ID, title: 'Saving store changes', inModal: payload.progress === 'modal' };
            return withOperationProgress(options, (report) => save(context, opened, (stage) => report(stage)));
        },
        () => DATAPACK_SAVE_OPERATION_ID,
    ),
});
