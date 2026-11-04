/**
 * Where a save from the project's store goes, and the save itself: Save and Save As (owner,
 * 2026-11-03, `.rptc/plans/datapack-save-as/`). Split from `storeChangesHandlers.ts`, which
 * opens the store and dispatches, when the two doors became one decision that also serves a
 * removal's "save my changes first" (`removalChanges.ts`).
 *
 * - `saveIntoFor`: a new pack under the name sent (Save As), else the demo's pack when the
 *   library lists it as the SC's (Save), else the answer that a name is needed. A library that
 *   cannot be asked is never taken to mean the SC's: Save As is the safe answer.
 * - `saveToPack`: capture, write the new version into the library (never `update`), and record
 *   on the project that it now uses it.
 *
 * @module features/data-installer/handlers/packSave
 */

import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import { writePackToStore } from '../services/datapackTransfer';
import { saveStoreChanges } from '../services/demoBuilderEngine/saveStore';
import { StoreChangesError } from '../services/demoBuilderEngine/storeAccess';
import { type SaveInto, copyNameFor, planSave, recordSave } from '../services/demoPack';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { ProjectStore, SaveOpened } from './storeChangesHandlers';
import type { OperationOutcome } from '@/core/vscode/withOperationProgress';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { SaveStoreChangesResult } from '@/types/webviewRequests';

const LOG_PREFIX = '[Data Installer]';

/** A save or read that stopped, in the SC's words: the engine's own sentence, else the fallback. */
export function failure(context: HandlerContext, error: unknown, fallback: string): HandlerResponse {
    if (error instanceof StoreChangesError) return { success: false, error: error.message };
    context.logger.warn(`${LOG_PREFIX} ${fallback} ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, error: `${fallback} Details are in Debug Logs.`, code: ErrorCode.UNKNOWN };
}

/** A save the SC must name: the demo's pack is not theirs, or there is none. Writes nothing. */
function needsName(suggestedName: string): HandlerResponse {
    return {
        success: false,
        error: 'This datapack is not yours, so the changes cannot be saved into it. Save them as a new datapack of your own: send saveAs with its name.',
        code: ErrorCode.INVALID_OPERATION,
        data: { needsName: true, suggestedName },
    };
}

/**
 * Where a save goes: a new pack under the name sent (Save As), else the demo's pack when it is
 * the SC's (Save); or the answer that a name is needed.
 */
export async function saveIntoFor(
    context: HandlerContext,
    store: ProjectStore,
    saveAs: { displayName?: unknown } | undefined,
): Promise<SaveInto | { response: HandlerResponse }> {
    const typed = typeof saveAs?.displayName === 'string' ? saveAs.displayName.trim() : '';
    if (typed) return { displayName: typed };
    const held = store.project.datapack;
    const about = held ? await store.deps.describe(held) : undefined;
    if (held?.store === 'library') {
        const library = await resolveDataInstallerAccess(context, 'library');
        if (library.ok) {
            try {
                const page = await library.client.findDatapacks({ datapackName: held.name });
                const mine = page.items.find((item) => item.id.name === held.name && item.mine === true);
                if (mine) return { name: held.name, displayName: mine.displayName };
            } catch (error) {
                // Not known to be the SC's, so never written: Save As is the safe answer.
                context.debugLogger.debug(`${LOG_PREFIX} Could not tell whose ${held.name} is: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return { response: needsName(copyNameFor(about?.displayName)) };
}

/** Capture, write the new version into the library, and record it on the project. */
export async function saveToPack(
    context: HandlerContext,
    opened: SaveOpened,
    into: SaveInto,
    report: (stage: string, step?: string) => void,
): Promise<HandlerResponse & OperationOutcome> {
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
        const plan = planSave(opened.project, pack, into, at);
        const saveAs = { id: plan.id, displayName: plan.displayName };
        const target = { saveAs, picks, ...(pack ? { pack } : {}), ...(source ? { source } : {}) };
        const result = await saveStoreChanges(opened.deps, target, (file) => writePackToStore(writer, file), report);
        // The pack it was made from names the store its rows were actually read from.
        const recorded = planSave(opened.project, pack ? { ...pack, store: result.readFrom } : undefined, { name: plan.id.name, displayName: plan.displayName }, at);
        await recordOnProject(context, { ...recorded, id: plan.id });
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
            ...(result.settingsLayer ? { settingsLayer: result.settingsLayer } : {}),
        };
        return { success: true, note: result.sentence, data };
    } catch (error) {
        return failure(context, error, 'The store changes could not be saved.');
    }
}

/** Record on the project that it now uses the new version. */
async function recordOnProject(context: HandlerContext, save: Parameters<typeof recordSave>[1]): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return;
    recordSave(project, save);
    await context.stateManager.saveProject(project);
}

