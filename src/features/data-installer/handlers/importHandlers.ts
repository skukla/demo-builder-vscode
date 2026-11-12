/**
 * Import handlers — the spine that puts validate, start and watch in order.
 *
 * Three rules carry the weight here, and each fails silently if got wrong:
 *
 * **Validate BEFORE start, every time.** `process-datapack-async` returned a 202
 * and an activation id for an EMPTY body, while the synchronous twin 400s the
 * same request — validation happens in the worker. Skipping this step means the
 * user watches a job that was never going to run, and finds out minutes later.
 *
 * **The watch is DETACHED.** The handler returns the moment the service accepts;
 * `watchImportJob` keeps going on the extension host and records into
 * `TransientStateManager`. Closing the panel does not abandon an import, and the
 * webview request is not held open for the ten minutes a long install can take.
 *
 * **Access is checked before anything is sent.** A dry run first asks whether the
 * service can sign in to the instance; a refusal is a reason, not a failed request.
 *
 * Opens through `resolveDatapackWriteAccess` (config/auth, project, backend),
 * the gate the export handlers share, so a new write handler cannot skip a check.
 *
 * @module features/data-installer/handlers/importHandlers
 */

import { announcingChanges } from '../services/datapackChanges';
import type { ImportJobRecord } from '../types';
import { datapackLibraryHandlers } from './datapackLibraryHandlers';
import { datapackZipHandlers } from './datapackZipHandlers';
import { demoDataHandlers } from './demoDataHandlers';
import { exportHandlers } from './exportHandlers';
import { exportPackHandlers } from './exportPackHandlers';
import { importFixWithAiHandlers } from './importFixHandlers';
import { skippedPage, waitForJob, waitMsOf } from './importJobWait';
import { JOB_KEY, runAndWatch } from './importJobWatch';
import { withSavedNote } from './importReplacement';
import { type StartImportPayload, afterWait, prepareImport, readInput, startDatapackImport } from './importStart';
import { importTargetHandlers } from './importTargetHandlers';
import { STARTING_REMOVAL_STAGE, type SavedFirst, removalChangesHandlers, removalStageReporter, settleChangesBeforeRemoval } from './removalChanges';
import { restoreDatapackHandlers } from './restoreDatapack';
import { storeChangesHandlers } from './storeChangesHandlers';
import { undoLastSaveHandlers } from './undoLastSave';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { handleBackgroundOperation, pushOperationProgress } from '@/core/vscode/operationProgress';
import { handleAnswerOperationPrompt } from '@/core/vscode/operationPrompt';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/**
 * The actions that change the packs or which pack a project holds: each announces it once it
 * succeeds, so every open Datapacks screen reads its list again (F66, `datapackChanges.ts`). Wrapped
 * here, where the map is built, so the screens and the agent tools are one path. An import or removal
 * job announces again when it ends (`importJobWatch`).
 */
const CHANGES_PACKS = [
    'delete-library-datapack',
    'rename-library-datapack',
    'share-library-datapack',
    'mark-team-datapack',
    'copy-library-datapack-to-installer',
    'load-datapack-zip',
    'build-datapack-from-export',
    'save-store-changes-to-pack',
    'start-datapack-export',
    'start-datapack-import',
    'reset-datapack',
    'undo-last-save',
    'restore-datapack',
] as const;

export const importHandlers = announcingChanges(defineHandlers({
    // Closing a running import hands it to a notification that keeps narrating
    // (PL-59 R8); this is the channel that says so.
    backgroundOperation: handleBackgroundOperation,
    // The SC answered a question the work was paused on — a sign-in that expired,
    // a prerequisite missing, a merge needing a decision (PL-59, owner 2026-09-20).
    answerOperationPrompt: handleAnswerOperationPrompt,
    // Stage 3 lives in its own module; merged here so the panel and the tests
    // keep ONE handler map to reach for. The modal's prefill reads were split out
    // the same way (2026-10-08).
    ...exportHandlers,
    ...importTargetHandlers,
    // Datapack files (save a pack to a zip, load one back), same reason.
    ...datapackZipHandlers,
    ...exportPackHandlers,
    // Library pack actions: remove your own, copy one into the Data Installer.
    ...datapackLibraryHandlers,
    // What installing again would change, and saving the store's copy as a new version (step 05).
    ...storeChangesHandlers,
    // What a removal would lose, for its confirm (step 05).
    ...removalChangesHandlers,
    // What a website holds that Demo Builder did not install, and clearing it (step 10).
    ...demoDataHandlers,
    // An import that ended with a problem, handed to the SC's AI (owner, 2026-11-07).
    ...importFixWithAiHandlers,
    // Undo Last Save: the save before the newest, installed over it through the import path (Phase 2).
    ...undoLastSaveHandlers,
    // Restore: the demo's datapack, at its latest save, over what Commerce holds now (Phase 3/5).
    ...restoreDatapackHandlers,
    'start-datapack-import': async (
        context: HandlerContext,
        payload?: StartImportPayload,
    ): Promise<HandlerResponse> => startDatapackImport(context, payload),

    /**
     * The dry run — validate and stop.
     *
     * Same guard, same request body as a real start; it simply
     * does not go on to `startImport`. This exists because there was otherwise NO
     * way to check a request without writing: the start handler chains validate
     * and start, so a passing validation went straight to a real import.
     *
     * A refusal comes back as `{valid:false, reason}` with `success: true` — the
     * call worked and the service answered. Only a broken call is a failure.
     */
    'validate-datapack-import': async (
        context: HandlerContext,
        payload?: StartImportPayload,
    ): Promise<HandlerResponse> => {
        const prepared = await prepareImport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        try {
            // Access first. If the service cannot sign in to the instance, whether
            // the request is well-formed is not the answer anyone needs — and
            // `get-websites-and-stores` answers it without going near
            // process-datapack, so it cannot start work by accident.
            const access = await prepared.engine.checkCredentials(prepared.request);
            if (!access.usable) {
                return {
                    success: true,
                    data: {
                        valid: false,
                        reason: access.reason ?? 'The Data Installer could not sign in to that Commerce instance.',
                    },
                };
            }
            return {
                success: true,
                data: await prepared.engine.validateImport(prepared.request),
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'The request could not be validated.',
                code: ErrorCode.UNKNOWN,
            };
        }
    },

    /**
     * Remove this datapack's data from the instance, so the project can be reused.
     *
     * The same shape as a start — validate, then a 202, then the SAME runner
     * watching the same kind of activation id. That the runner needs no changes
     * is the seam working as designed.
     *
     * **What it takes is what its install record lists**, so the types sent are not asked for
     * and the job reports the record's kinds. A pack the Data Installer service installed has
     * no record, and is answered with Clear Demo Data (`SERVICE_REMOVAL_UNAVAILABLE`).
     *
     * **Confirm-gated.** A reset is destructive and the service has no undo, so it
     * takes the same explicit opt-in the destructive MCP tools use rather than
     * trusting a caller not to send it by accident.
     */
    'reset-datapack': async (
        context: HandlerContext,
        payload?: StartImportPayload,
    ): Promise<HandlerResponse> => {
        if (payload?.confirm !== true) {
            return {
                success: false,
                error: 'This removes the datapack\'s data from the Commerce instance and cannot be undone. Confirm to proceed.',
                code: ErrorCode.INVALID_OPERATION,
            };
        }

        const settled = await settleBeforeReset(context, payload);
        if ('response' in settled) {
            return settled.response;
        }
        const { saved } = settled;

        // Saving moved the install record onto the new version, so that is what gets removed.
        const prepared = await prepareImport(context, saved ? removalOfSaved(payload, saved) : payload, 'remove');
        if ('response' in prepared) {
            return withSavedNote(prepared.response, saved);
        }
        const { engine, request } = prepared;

        const started = await runAndWatch(context, engine, request, {
            operation: 'reset',
            validate: () => engine.validateRemoval(request),
            begin: () => engine.startDelete(request),
            rejected: 'The Data Installer rejected this uninstall request.',
            failed: 'The uninstall could not be started.',
        });
        return withSavedNote(await afterWait(context, started, payload?.waitSeconds), saved);
    },

    /** The running or last job, live while it runs; with `waitSeconds`, once it ends or the wait is up. */
    'get-datapack-import-status': async (
        context: HandlerContext,
        payload?: { waitSeconds?: number; skippedFrom?: number },
    ): Promise<HandlerResponse> => {
        const transient = new TransientStateManager(context.context);
        const read = () => transient.get<ImportJobRecord | null>(JOB_KEY, null);
        const record = await waitForJob(read, waitMsOf(payload?.waitSeconds));
        return { success: true, data: record ? skippedPage(record, payload?.skippedFrom) : record };
    },
}), CHANGES_PACKS);

/**
 * The SC's changes, before anything is removed (step 05), once the request itself is known to be
 * good: a save must never land for a removal that was always going to be refused.
 */
async function settleBeforeReset(
    context: HandlerContext,
    payload: StartImportPayload | undefined,
): Promise<{ saved?: SavedFirst } | { response: HandlerResponse }> {
    const input = readInput(payload, 'remove');
    if ('error' in input) {
        return { response: { success: false, error: input.error } };
    }
    const answer = payload?.changes;
    if (answer !== undefined && answer !== 'keep' && answer !== 'drop') {
        return { response: { success: false, error: `changes is keep or drop, not ${answer}.` } };
    }
    const stage = removalStageReporter(context);
    const settled = await settleChangesBeforeRemoval(
        context,
        {
            pack: { name: input.datapackName, version: input.version },
            // As it was sent: with none named, a save looks in the library and then the Data Installer.
            ...(payload?.source ? { source: input.source } : {}),
            ...(answer ? { answer } : {}),
            unanswered: 'refuse',
            ...(payload?.alwaysSave === true ? { rememberAlways: true } : {}),
            ...(payload?.saveAs ? { saveAs: payload.saveAs } : {}),
        },
        stage,
    );
    if ('saved' in settled && settled.saved) {
        stage(STARTING_REMOVAL_STAGE);
    }
    if ('response' in settled && settled.response.code === ErrorCode.CHANGES_NOT_SAVED) {
        // A window closed during the save handed it to a notification, which has to hear the end.
        void pushOperationProgress({ id: DATAPACK_OPERATION_ID, state: 'failed', error: settled.response.error ?? 'Your changes could not be saved.' });
    }
    return settled;
}

/** The removal of the version a save just made. */
function removalOfSaved(payload: StartImportPayload | undefined, saved: SavedFirst): StartImportPayload {
    return { ...payload, datapackName: saved.id.name, version: saved.id.version, source: 'library', dataTypes: saved.dataTypes };
}
