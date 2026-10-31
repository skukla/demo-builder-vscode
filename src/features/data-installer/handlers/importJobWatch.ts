/**
 * The write half import and reset share: validate, begin, record, and detach the watch.
 *
 * Split out of `importHandlers.ts` (decompose-god-file, 2026-10-08): the handlers
 * decide WHICH write runs and how its payload is read; this decides what happens
 * once a write is accepted, and it changes for different reasons — the record
 * shape, the progress channels, the watch's failure modes.
 *
 * **The watch is DETACHED.** `runAndWatch` returns the moment the service
 * accepts; `watchAndRecord` keeps going on the extension host and records into
 * `TransientStateManager`. Closing the panel does not abandon an import, and the
 * webview request is not held open for the ten minutes a long install can take.
 *
 * @module features/data-installer/handlers/importJobWatch
 */

import type { ImportRequest } from '../services/dataInstallerWriteClient';
import type { DatapackEngine } from '../services/datapackEngine';
import { watchImportJob } from '../services/importJobRunner';
import { IMPORT_PROGRESS_MESSAGE, type ImportJobRecord } from '../types';
import { progressLabel, progressStep, summarizeProgress } from '../ui/importProgress';
import { PollingService } from '@/core/shell/pollingService';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { detailFor, expectationFor } from '@/core/utils/operationStages';
import { pushOperationProgress } from '@/core/vscode/operationProgress';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Where the in-flight/last import is recorded. One per extension host. */
export const JOB_KEY = 'dataInstaller.import.current';

/**
 * What a datapack job shows on the SHARED progress channel, the notification the
 * modal hands it to: the stage table's step, as creation names it, and the types
 * finished and in flight on the line under it, as the modal words them (progress
 * vocabulary slice 5, owner 2026-10-16). It was "Importing the sample data (3 of 14)":
 * a count of types shown as the step's position, under a name creation did not use.
 */
function datapackStage(
    record: ImportJobRecord,
    perType: ImportJobRecord['perType'],
): { stage: string; step: string; expectation?: string } {
    const stage = progressStep(record.operation === 'reset' ? 'reset' : 'import');
    const step = progressLabel(summarizeProgress(perType ?? {}, record.dataTypes)) ?? detailFor(stage) ?? '';
    return { stage, step, expectation: expectationFor(stage) };
}

/**
 * Watch to a terminal outcome and record it.
 *
 * Runs after its caller has returned, so nothing is awaiting it and a throw could
 * only become an unhandled rejection.
 *
 * **Every exit writes the record.** This used to return silently when the guard
 * refused, and warn to a log channel when the runner threw — and in both cases the
 * record stayed `watching`, so the panel showed "Importing…" forever for a job
 * nobody was watching. A failure that reaches no one is also a failure no test can
 * catch: exactly that shape hid a logger fault which killed every watch through
 * five green gates. The import itself is unaffected — it is already running
 * server-side — so this reports a lost WATCH, never a failed import.
 */
async function watchAndRecord(
    context: HandlerContext,
    transient: TransientStateManager,
    record: ImportJobRecord,
    engine: DatapackEngine,
    resetOf: string | undefined,
): Promise<void> {
    try {
        // The engine that started the job is the one asked how it is going: only it knows.
        const result = await watchImportJob({
            client: engine,
            activationId: record.activationId,
            requestedTypes: record.dataTypes,
            polling: new PollingService(),
            ...(record.operation ? { operation: record.operation } : {}),
            // Each poll goes straight to the modal. Without this the webview
            // learns nothing until the job ends, which on a fourteen-type pack
            // is minutes of an unexplained spinner.
            onProgress: (perType) => {
                void context.sendMessage(IMPORT_PROGRESS_MESSAGE, {
                    activationId: record.activationId,
                    operation: record.operation,
                    perType,
                });
                // The SAME progress on the shared channel, so closing the modal
                // can hand the job to a notification that keeps narrating
                // (PL-59 R8). The modal's own view is richer — per type, with
                // counts — and stays where it is.
                void pushOperationProgress({
                    id: DATAPACK_OPERATION_ID,
                    state: 'running',
                    ...datapackStage(record, perType),
                });
            },
        });
        // What a repeat install kept goes with the success, for a notification to say too.
        const kept = result.note ? { note: result.note } : {};
        await pushOperationProgress(
            result.outcome === 'success'
                ? { id: DATAPACK_OPERATION_ID, state: 'succeeded', ...kept }
                : {
                      id: DATAPACK_OPERATION_ID,
                      state: 'failed',
                      error: result.reason ?? 'The job did not finish.',
                  },
        );
        await transient.set(JOB_KEY, {
            ...record,
            outcome: result.outcome,
            perType: result.perType,
            ...(result.reason ? { reason: result.reason } : {}),
            ...(result.note ? { note: result.note } : {}),
            ...(result.keptRoot ? { keptRoot: result.keptRoot } : {}),
            ...(result.processingTimeMs !== undefined
                ? { processingTimeMs: result.processingTimeMs }
                : {}),
        });
        if (resetOf !== undefined && result.outcome === 'success' && !result.leftInStore) {
            await clearDatapackOnProject(context, resetOf);
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        context.logger.warn(
            `[Data Installer] Stopped watching import ${record.activationId}: ${reason}`,
        );
        await stopWatching(transient, record, reason);
    }
}

/**
 * Record that the watch ended without an answer.
 *
 * The reason IS the payload: "we stopped looking" is not actionable without
 * saying why, and this is the only place the cause exists.
 */
async function stopWatching(
    transient: TransientStateManager,
    record: ImportJobRecord,
    reason: string,
): Promise<void> {
    await transient.set(JOB_KEY, { ...record, outcome: 'unwatchable', reason });
}

/**
 * Validate, begin, record, and detach the watch — the half import and reset share.
 *
 * These two handlers were a verbatim 35-line copy of each other, differing only
 * in which client method they call and two message strings. `prepareImport` was
 * already extracted at the second caller because "the two paths have to agree
 * byte for byte"; the RECORDING half was not, and it is the half that already
 * drifted once — `operation` was added to `ImportJobRecord` precisely because a
 * reset announced itself as "Import finished" in front of a user.
 *
 * The watch is DETACHED on purpose: awaiting it would hold the webview request
 * open for the ten minutes a long install can take, and tie the job's life to
 * the panel's.
 */
export async function runAndWatch(
    context: HandlerContext,
    engine: DatapackEngine,
    request: ImportRequest,
    spec: {
        operation: ImportJobRecord['operation'];
        begin: () => Promise<{ activationId: string }>;
        /** Wording when the service refuses the request shape. */
        rejected: string;
        /** Wording when the call itself fails. */
        failed: string;
    },
): Promise<HandlerResponse> {
    try {
        const verdict = await engine.validateImport(request);
        if (!verdict.valid) {
            return { success: false, error: verdict.reason ?? spec.rejected };
        }

        const started = await spec.begin();
        const record: ImportJobRecord = {
            activationId: started.activationId,
            datapackName: request.id.name,
            operation: spec.operation,
            version: request.id.version,
            commerceInstance: request.commerceInstance,
            dataTypes: request.dataTypes,
            startedAt: new Date().toISOString(),
            outcome: 'watching',
            perType: {},
        };
        const transient = new TransientStateManager(context.context);
        await transient.set(JOB_KEY, record);

        // An import is recorded at once; a reset is cleared only when it finishes (see below).
        const resetOf = spec.operation === 'reset' ? await projectPathNow(context) : undefined;
        if (spec.operation !== 'reset') await recordDatapackOnProject(context, request);

        void watchAndRecord(context, transient, record, engine, resetOf);

        return { success: true, data: { activationId: started.activationId } };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : spec.failed,
            code: ErrorCode.UNKNOWN,
        };
    }
}

/** The current project's path, or '' when there is none or it cannot be read: a reset then clears nothing. */
async function projectPathNow(context: HandlerContext): Promise<string> {
    try {
        return (await context.stateManager.getCurrentProject())?.path ?? '';
    } catch {
        return '';
    }
}

/**
 * Record on the PROJECT which datapack its instance now holds.
 *
 * `project.datapack` was written only by the wizard's Sample Data step, so a pack
 * imported from this modal left no trace on the project. `confirmSampleDataRemoval`
 * gates on exactly that field, so reset silently never offered to remove data the
 * user had just imported. Found live 2026-08-16: an import succeeded, and the
 * following reset asked nothing.
 *
 * **Recorded when the service ACCEPTS, not when the job finishes.** A partial
 * import still puts data on the instance, and a record written only on full
 * success would leave that data with nothing pointing at it — the failure mode
 * worth avoiding. The opposite error (recording a pack whose import then failed
 * entirely) costs one removal that reports nothing to remove.
 *
 * Never fatal. The import has already been accepted by the service by this point,
 * and failing the handler over a bookkeeping write would report a started job as
 * a failed one.
 */
async function recordDatapackOnProject(context: HandlerContext, request: ImportRequest): Promise<void> {
    try {
        const project = await context.stateManager.getCurrentProject();
        if (!project) {
            return;
        }
        // The store travels with the pack, so a copy or an exported file installs from it too.
        project.datapack = { name: request.id.name, version: request.id.version, store: request.source ?? 'installer' };
        await context.stateManager.saveProject(project);
        context.debugLogger.debug(`[Data Installer] project datapack recorded as ${request.id.name}@${request.id.version}`);
    } catch (error) {
        context.debugLogger.debug(`[Data Installer] could not record the datapack on the project: ${errorText(error)}`);
    }
}

/**
 * A reset that FINISHED, taking everything its pack put there, clears the project's pack.
 *
 * The rule (live, 2026-10-30): the project stops naming the pack only when the removal ended in
 * success with nothing left in the store. It was cleared when the reset was ACCEPTED, so a removal
 * that then stopped half done left a project naming no pack over a store still holding most of it,
 * and project reset (`confirmSampleDataRemoval`, which gates on this field) no longer offered to
 * finish the job. A removal that finishes but keeps containers holding the SC's things
 * (`leftInStore`) leaves it too: those stay on the install record, and the next removal is what
 * takes them once they are empty.
 *
 * Only the project the reset was started from: the SC may have opened another in the meantime.
 * The manifest is rebuilt from the project on every write (`projectConfigWriter`, "no merging
 * needed"), so `undefined` genuinely removes the field. Never fatal: the job has ended either way.
 */
async function clearDatapackOnProject(context: HandlerContext, projectPath: string): Promise<void> {
    try {
        const project = await context.stateManager.getCurrentProject();
        if (!project || projectPath === '' || project.path !== projectPath) {
            context.debugLogger.debug('[Data Installer] project datapack left as it was: the reset\'s project is no longer open');
            return;
        }
        project.datapack = undefined;
        await context.stateManager.saveProject(project);
        context.debugLogger.debug('[Data Installer] project datapack cleared');
    } catch (error) {
        context.debugLogger.debug(`[Data Installer] could not clear the datapack on the project: ${errorText(error)}`);
    }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
