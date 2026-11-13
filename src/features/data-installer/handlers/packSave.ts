/**
 * Where a save from the project's store goes, and the save itself: Save and Save As (owner,
 * 2026-11-03, `.rptc/plans/datapack-save-as/`). Split from `storeChangesHandlers.ts`, which
 * opens the store and dispatches, when the two doors became one decision that also serves a
 * removal's "save my changes first" (`removalChanges.ts`).
 *
 * - `saveIntoFor`: a new pack under the name sent (Save As), unless the SC already has one by that
 *   name, else the demo's pack when the
 *   library lists it as the SC's (Save), else the answer that a name is needed. A library that
 *   cannot be asked is never taken to mean the SC's: Save As is the safe answer.
 * - `saveToPack`: capture, write the new version into the library (never `update`), and record
 *   on the project that it now uses it. `saveInWindow` is the same save in its progress window,
 *   ending a save that stops on the row it stopped on.
 *
 * @module features/data-installer/handlers/packSave
 */

import { nameProblem } from '../saveAsName';
import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import { writePackToStore } from '../services/datapackTransfer';
import { stoppedRows } from '../services/demoBuilderEngine/capturePhases';
import { saveNote } from '../services/demoBuilderEngine/saveOutcome';
import { saveStoreChanges } from '../services/demoBuilderEngine/saveStore';
import { StoreChangesError } from '../services/demoBuilderEngine/storeAccess';
import { type SaveInto, planSave, recordSave } from '../services/demoPack';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { ProjectStore, SaveOpened } from './storeChangesHandlers';
import { trimOldSaves } from './trimSaves';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { OperationOutcome, ReportStage } from '@/core/vscode/withOperationProgress';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { OperationRow } from '@/types/webviewPayloads';
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
 * The names of the SC's own datapacks in the library, as the Datapacks screen counts them
 * (`ownedOf`): a new one may not take one (J3-1). The projects list's save question reads it too
 * (`projectsBatch.ts`). None when the library
 * cannot be asked: the library's own name is generated (`packIdFor`), so a repeated display name
 * overwrites nothing.
 */
export async function ownNames(context: HandlerContext): Promise<string[]> {
    const library = await resolveDataInstallerAccess(context, 'library');
    if (!library.ok) return [];
    try {
        const page = await library.client.findDatapacks({});
        return page.items.filter((item) => item.mine === true).map((item) => item.displayName);
    } catch (error) {
        context.debugLogger.debug(`${LOG_PREFIX} Could not read your datapacks' names: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

/**
 * Where a save goes: a new pack under the name sent (Save As), refused when the SC already has one by that name, else the demo's pack when it is
 * the SC's (Save); or the answer that a name is needed.
 */
export async function saveIntoFor(
    context: HandlerContext,
    store: ProjectStore,
    saveAs: { displayName?: unknown } | undefined,
): Promise<SaveInto | { response: HandlerResponse }> {
    const typed = typeof saveAs?.displayName === 'string' ? saveAs.displayName.trim() : '';
    if (typed) {
        const taken = nameProblem(typed, await ownNames(context));
        return taken ? { response: { success: false, error: taken, code: ErrorCode.INVALID_OPERATION } } : { displayName: typed };
    }
    const held = store.project.datapack;
    if (held?.store === 'library') {
        const library = await resolveDataInstallerAccess(context, 'library');
        if (library.ok) {
            try {
                const page = await library.client.findDatapacks({ datapackName: held.name });
                // A team pack is never saved into, even by its owner: every demo is made from it (F80).
                const mine = page.items.find((item) => item.id.name === held.name && item.mine === true && item.team !== true);
                // Sharing is a property of the pack, any version (`datapackCatalog`): the save keeps it.
                const shared = page.items.some((item) => item.id.name === held.name && item.shared === true);
                if (mine) return { name: held.name, displayName: mine.displayName, shared };
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
        const result = await saveStoreChanges(opened.deps, target, (file) => writePackToStore(writer, file, { shared: into.shared === true }), report);
        // Nothing changed (walk F89): nothing was written and the demo keeps its version, so say so.
        if (result.unchanged) return unchangedAnswer(result);
        // The pack it was made from names the store its rows were actually read from.
        const recorded = planSave(opened.project, pack ? { ...pack, store: result.readFrom } : undefined, { name: plan.id.name, displayName: plan.displayName }, at);
        await recordOnProject(context, opened.project, { ...recorded, id: plan.id });
        // A save into the SC's own datapack keeps two saves; a Save As made a new one (Phase 2).
        if (into.name) await trimOldSaves(context, library, plan.id);
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
        // Into the pack it started from, the title says where it went (J3-1, owner 2026-11-12).
        const ending = note ? { note } : { title: `Saved to ${plan.displayName}` };
        return { success: true, ...ending, ...(result.details.length > 0 ? { details: result.details } : {}), data };
    } catch (error) {
        return failure(context, error, 'Your changes could not be saved.');
    }
}

/**
 * The save in its progress window: the steps it last sent are kept, so a save that stops ends on
 * the row it stopped on, a failed write on the save row (decisions.md, Phase 7b), the reason the
 * sentence under them. Only the window gets rows: an agent's answer is the sentence.
 */
export async function saveInWindow(
    context: HandlerContext,
    opened: SaveOpened,
    into: SaveInto,
    report: ReportStage,
): Promise<HandlerResponse & OperationOutcome> {
    let last: OperationRow[] | undefined;
    const keep: ReportStage = (stage, step, position, rows) => {
        if (rows) last = rows;
        report(stage, step, position, rows);
    };
    const result = await saveToPack(context, opened, into, keep);
    return !result.success && last ? { ...result, rows: stoppedRows(last) } : result;
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

