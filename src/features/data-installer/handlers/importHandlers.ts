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

import { buildDatapackEngine, installedByDemoBuilder } from '../services/buildDatapackEngine';
import { announcingChanges } from '../services/datapackChanges';
import type { DatapackEngine } from '../services/datapackEngine';
import { nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { kindsOnRecord } from '../services/demoBuilderEngine/runPack';
import type { ImportRequest, ImportTarget } from '../services/importRequest';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import type { ImportJobRecord } from '../types';
import { datapackLibraryHandlers } from './datapackLibraryHandlers';
import { type DatapackWriteAccess, resolveDatapackWriteAccess } from './datapackWriteGate';
import { datapackZipHandlers } from './datapackZipHandlers';
import { demoDataHandlers } from './demoDataHandlers';
import { exportHandlers } from './exportHandlers';
import { exportPackHandlers } from './exportPackHandlers';
import { importFixWithAiHandlers } from './importFixHandlers';
import { skippedPage, waitForJob, waitMsOf } from './importJobWait';
import { JOB_KEY, runAndWatch } from './importJobWatch';
import { settleReplacement, withSavedNote } from './importReplacement';
import { importTargetHandlers } from './importTargetHandlers';
import { SERVICE_REMOVAL_UNAVAILABLE, libraryReads } from './libraryReads';
import { STARTING_REMOVAL_STAGE, type SavedFirst, removalChangesHandlers, removalStageReporter, settleChangesBeforeRemoval } from './removalChanges';
import { storeChangesHandlers } from './storeChangesHandlers';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { handleBackgroundOperation, pushOperationProgress } from '@/core/vscode/operationProgress';
import { handleAnswerOperationPrompt } from '@/core/vscode/operationPrompt';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/** Payload for a start request. */
interface StartImportPayload {
    datapackName?: string;
    version?: string;
    commerceInstance?: string;
    dataTypes?: string[];
    /**
     * Where the pack lands — both codes or neither (see {@link readTarget}).
     * Omitted means the service's own default, `base`.
     */
    websiteCode?: string;
    storeCode?: string;
    /** Reset only: must be true. Nothing removes data by default. */
    confirm?: boolean;
    /** Which store holds the pack: `installer` (absent) or `library` (DI-5). */
    source?: string;
    /**
     * A reset, or an import replacing the demo's pack (walk F97): save the SC's changes first (into
     * the demo's pack when it is theirs, else as `saveAs`), or lose them.
     */
    changes?: string;
    /** With `changes: "keep"`: the name of a new datapack to save them as, when the demo's pack is not the SC's. */
    saveAs?: { displayName?: unknown };
    /** Only ever the confirm's box: turn on "always save" once a save has worked. */
    alwaysSave?: boolean;
    /** Agent: wait up to this many seconds (at most 45) for the job to end, saying its progress (`importJobWait.ts`). */
    waitSeconds?: number;
}

/**
 * A started job's answer, after waiting on it when asked: the job's record rides along as `job`, so
 * a job that ends inside the wait needs no second call.
 */
async function afterWait(context: HandlerContext, response: HandlerResponse, waitSeconds: unknown): Promise<HandlerResponse> {
    const waitMs = waitMsOf(waitSeconds);
    if (!response.success || waitMs === 0) return response;
    const transient = new TransientStateManager(context.context);
    const job = await waitForJob(() => transient.get<ImportJobRecord | null>(JOB_KEY, null), waitMs);
    return { ...response, data: { ...(response.data as object), job } };
}

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
    'start-datapack-import': async (
        context: HandlerContext,
        payload?: StartImportPayload,
    ): Promise<HandlerResponse> => {
        const prepared = await prepareImport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        const { engine } = prepared;
        // Walk F97: over another pack or version the demo uses, that pack goes first, its changes settled.
        const replacement = await settleReplacement(context, engine, prepared.request, payload);
        if ('response' in replacement) {
            return replacement.response;
        }
        const { request, replaces, saved, savedAs, replacesVersion } = replacement;

        // The sync twin is the only thing that will tell us this request is
        // malformed. A 202 from the async entry point would not.
        const started = await runAndWatch(context, engine, request, {
            operation: 'import',
            validate: replacement.validate ?? (() => engine.validateImport(request)),
            begin: () => engine.startImport(request),
            rejected: 'The Data Installer rejected this install request.',
            failed: 'The install could not be started.',
            ...(replaces ? { replaces } : {}),
            ...(savedAs ? { savedAs } : {}),
            ...(replacesVersion ? { replacesVersion } : {}),
        });
        return withSavedNote(await afterWait(context, started, payload?.waitSeconds), saved, 'The install could not be started.');
    },

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

/**
 * Everything both write handlers need, or the response to return instead.
 *
 * Extracted at the SECOND caller rather than the third: the two paths have to
 * agree on the guard and the request body byte for byte, or a
 * dry run would check something other than what a start would send — which is the
 * one thing that would make a dry run worse than useless.
 */
async function prepareImport(
    context: HandlerContext,
    payload: StartImportPayload | undefined,
    write: 'install' | 'remove' = 'install',
): Promise<
    { engine: DatapackEngine; request: ImportRequest } | { response: HandlerResponse }
> {
    const input = readInput(payload, write);
    if ('error' in input) {
        return { response: { success: false, error: input.error } };
    }

    const gate = await resolveDatapackWriteAccess(context, 'import');
    if ('response' in gate) {
        return gate;
    }

    const pack = { name: input.datapackName, version: input.version };
    const engine = await engineFor(context, gate, { pack, write });
    if ('response' in engine) {
        return engine;
    }
    const dataTypes = write === 'remove' ? await typesToRemove(gate.project.path, pack, input.dataTypes) : input.dataTypes;
    if (dataTypes.length === 0) {
        return { response: { success: false, error: 'Select at least one data type to uninstall.' } };
    }
    return {
        engine: engine.engine,
        request: {
            id: pack,
            source: input.source,
            commerceInstance: input.commerceInstance,
            dataTypes,
            // A caller that names a scope means it. One that names NONE gets the
            // project's, because the alternative is the SERVICE's `base`/`default`
            // — a scope nobody chose. The modal always sends a pair (its pickers
            // are seeded), so this is really the agent surface: the MCP rows leave
            // both codes optional and an agent that skips
            // `list_datapack_import_scopes` would otherwise import, and RESET,
            // against `base`.
            //
            // Half a pair never reaches here — `readTarget` refuses it — so this
            // cannot complete a partial specification into something the caller
            // did not ask for.
            target: input.target ?? resolveInstallTarget(gate.project) ?? undefined,
        },
    };
}


/**
 * What a removal reports on: what the install record lists, whatever was ticked; a record with
 * nothing left on it still has a job to run, over the types sent.
 */
async function typesToRemove(projectPath: string, pack: DatapackId, sent: string[]): Promise<string[]> {
    const record = await readInstallRecord(nodeRecordFiles, projectPath, pack);
    const kinds = record ? kindsOnRecord(record) : [];
    return kinds.length > 0 ? kinds : sent;
}

/**
 * The engine for one write. A removal of a pack the Data Installer service installed has no
 * install record to remove by, so it is answered with Clear Demo Data instead (DI-12).
 */
async function engineFor(
    context: HandlerContext,
    gate: DatapackWriteAccess,
    write: { pack: DatapackId; write: 'install' | 'remove' },
): Promise<{ engine: DatapackEngine } | { response: HandlerResponse }> {
    if (write.write === 'remove' && !(await installedByDemoBuilder(gate.project.path, write.pack))) {
        return { response: { success: false, error: SERVICE_REMOVAL_UNAVAILABLE, code: ErrorCode.INVALID_OPERATION } };
    }
    // The engine writes into the project's own store with the project's credential, so the
    // sign-in must be in the org that owns that store. Checked before anything is written, with
    // the extension's one org guard (adobe-org-context): a mismatch says "Switch IMS Org" rather
    // than failing half way through with Commerce's refusal (owner, 2026-10-28).
    if (context.authManager) {
        const orgFailure = await orgGuard(context, gate.project, context.authManager);
        if (orgFailure) {
            return { response: { success: false, error: orgFailure.error, code: ErrorCode.ORG_MISMATCH } };
        }
    }
    return {
        engine: buildDatapackEngine(
            {
                ...gate,
                authManager: context.authManager,
                secrets: context.context?.secrets,
                libraryCatalog: libraryReads(context),
            },
            (line) => context.debugLogger.debug(`[Data Installer] ${line}`),
        ),
    };
}

/** Validate the payload, returning either usable input or the reason it is not. */
function readInput(
    payload: StartImportPayload | undefined,
    // A removal's types are settled once its engine is known (`typesToRemove`).
    write: 'install' | 'remove' = 'install',
):
    | {
          datapackName: string;
          version: string;
          commerceInstance: string;
          dataTypes: string[];
          target: ImportTarget | undefined;
          source: DatapackStoreName;
      }
    | { error: string } {
    const datapackName = payload?.datapackName;
    const version = payload?.version;
    if (!datapackName || !version) {
        return { error: 'A datapack name and version are required.' };
    }
    // Required, and deliberately NOT defaulted from the project: an import writes
    // into whatever instance this names, and a wrong default writes sample data
    // into someone else's live demo.
    const commerceInstance = payload?.commerceInstance;
    if (!commerceInstance) {
        return { error: 'A Commerce instance is required: it is where the data will be written.' };
    }
    const dataTypes = payload?.dataTypes ?? [];
    if (write === 'install' && dataTypes.length === 0) {
        return { error: 'Select at least one data type to install.' };
    }
    const target = readTarget(payload);
    if ('error' in target) {
        return target;
    }
    const source = payload?.source ?? 'installer';
    if (source !== 'installer' && source !== 'library') {
        return { error: `There is no datapack store called ${source}: it is installer or library.` };
    }
    return { datapackName, version, commerceInstance, dataTypes, target: target.target, source };
}

/**
 * The website/store pair, refused here if it is half-supplied.
 *
 * The service takes both or neither and rejects a half pair — but it rejects it
 * in the worker, minutes after the 202 that told the user the import started.
 * Catching it before the request keeps the failure where the user can act on it.
 */
function readTarget(
    payload: StartImportPayload | undefined,
): { target: ImportTarget | undefined } | { error: string } {
    const websiteCode = payload?.websiteCode;
    const storeCode = payload?.storeCode;
    if (!websiteCode && !storeCode) {
        return { target: undefined };
    }
    if (!websiteCode || !storeCode) {
        return {
            error: 'Choose both a target website and a store view, or neither: the Data Installer needs the pair.',
        };
    }
    return { target: { websiteCode, storeCode } };
}
