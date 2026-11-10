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
import { saveNote } from '../services/demoBuilderEngine/saveOutcome';
import { saveStoreChanges } from '../services/demoBuilderEngine/saveStore';
import { StoreChangesError } from '../services/demoBuilderEngine/storeAccess';
import { type SaveInto, planSave, recordSave } from '../services/demoPack';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { ProjectStore, SaveOpened } from './storeChangesHandlers';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { OperationOutcome, ReportStage } from '@/core/vscode/withOperationProgress';
import type { Project } from '@/types/base';
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

/** A save the SC must name: the demo's pack is a team pack, not theirs, or none. Writes nothing. */
function needsName(): HandlerResponse {
    return {
        success: false,
        error: 'This datapack is a team datapack or not yours, so the changes cannot be saved into it. Save them as a new datapack of your own: send saveAs with its name.',
        code: ErrorCode.INVALID_OPERATION,
        data: { needsName: true },
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
    if (held?.store === 'library') {
        const library = await resolveDataInstallerAccess(context, 'library');
        if (library.ok) {
            try {
                const page = await library.client.findDatapacks({ datapackName: held.name });
                // A team pack is never saved into, even by its owner: every demo is made from it (F80).
                const mine = page.items.find((item) => item.id.name === held.name && item.mine === true && item.team !== true);
                if (mine) return { name: held.name, displayName: mine.displayName };
            } catch (error) {
                // Not known to be the SC's, so never written: Save As is the safe answer.
                context.debugLogger.debug(`${LOG_PREFIX} Could not tell whose ${held.name} is: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return { response: needsName() };
}

/** Capture, write the new version into the library, and record it on the project. */
export async function saveToPack(
    context: HandlerContext,
    opened: SaveOpened,
    into: SaveInto,
    report: ReportStage,
): Promise<HandlerResponse & OperationOutcome> {
    const library = await resolveDataInstallerAccess(context, 'library');
    if (!library.ok) return library.response;
    const writer = new DatapackStoreWriter({
        baseUrl: library.baseUrl,
        getToken: library.getToken,
        ...(library.orgCode ? { orgCode: library.orgCode } : {}),
        log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
        inParts: true,
    });
    try {
        // No `update`: the version saved is always new, so nothing in the library is written over.
        const at = new Date();
        const { pack, source, picks } = opened;
        const plan = planSave(opened.project, pack, into, at);
        const saveAs = { id: plan.id, displayName: plan.displayName };
        const target = { saveAs, picks, ...(pack ? { pack } : {}), ...(source ? { source } : {}) };
        const result = await saveStoreChanges(opened.deps, target, (file) => writePackToStore(writer, file), report);
        // Nothing changed (walk F89): nothing was written and the demo keeps its version, so say so.
        if (result.unchanged) return unchangedAnswer(result);
        // The pack it was made from names the store its rows were actually read from.
        const recorded = planSave(opened.project, pack ? { ...pack, store: result.readFrom } : undefined, { name: plan.id.name, displayName: plan.displayName }, at);
        await recordOnProject(context, opened.project, { ...recorded, id: plan.id });
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
        // A clean save ends on the small result, where it went and which pack the demo now uses
        // (owner, 2026-11-09; no rows, review 2026-11-10). The agent keeps the whole sentence, in
        // `data.message`.
        const startedFrom = pack ? { name: pack.name, displayName: result.installedName } : undefined;
        const note = saveNote({ name: plan.id.name, displayName: plan.displayName }, startedFrom, getProjectDisplayName(opened.project));
        return { success: true, note, ...(result.details.length > 0 ? { details: result.details } : {}), data };
    } catch (error) {
        return failure(context, error, 'Your changes could not be saved.');
    }
}

/**
 * A save that found nothing to save: "No Changes to Save" is the whole result (review, 2026-11-10),
 * and the version the demo uses stays. The agent's answer keeps the sentence, in `data.message`.
 */
function unchangedAnswer(result: Awaited<ReturnType<typeof saveStoreChanges>>): HandlerResponse & OperationOutcome {
    return {
        success: true,
        title: 'No Changes to Save',
        data: { datapackName: result.saved.name, version: result.saved.version, unchanged: true, counts: result.counts, message: result.sentence },
    };
}

/**
 * Record on the project the save started from that it now uses the new version, as its install
 * record already says (walk F95). A save can run in the background while the SC opens another
 * project; it used to write to whichever project was open when it ended, naming the wrong pack
 * there. The save's own project, still open, is saved as before; one no longer open is written
 * without opening it (`saveProjectConfigOnly`), so the project the SC is in stays as it is.
 */
async function recordOnProject(context: HandlerContext, startedOn: Project, save: Parameters<typeof recordSave>[1]): Promise<void> {
    const open = await context.stateManager.getCurrentProject();
    if (open?.path === startedOn.path) {
        recordSave(open, save);
        await context.stateManager.saveProject(open);
        return;
    }
    context.debugLogger.debug(`${LOG_PREFIX} recorded the save on ${startedOn.name}, the project it started from; ${open?.name ?? 'no project'} is open now`);
    recordSave(startedOn, save);
    await context.stateManager.saveProjectConfigOnly(startedOn);
}

