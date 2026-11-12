/**
 * The start of an import and the preparing every datapack write shares, out of `importHandlers.ts`
 * so a second door can start an import the same way without importing the handler map (Undo Last
 * Save, `undoLastSave.ts`). Validate before start, the detached watch, and access checked before
 * anything is sent are explained in `importHandlers.ts`.
 *
 * @module features/data-installer/handlers/importStart
 */

import { jobPurpose } from '../datapackWords';
import { buildDatapackEngine, installedByDemoBuilder } from '../services/buildDatapackEngine';
import type { DatapackEngine } from '../services/datapackEngine';
import { nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import { kindsOnRecord } from '../services/demoBuilderEngine/runPack';
import type { ImportRequest, ImportTarget } from '../services/importRequest';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import type { ImportJobRecord } from '../types';
import { type DatapackWriteAccess, resolveDatapackWriteAccess } from './datapackWriteGate';
import { waitForJob, waitMsOf } from './importJobWait';
import { JOB_KEY, runAndWatch } from './importJobWatch';
import { settleReplacement, withSavedNote } from './importReplacement';
import { SERVICE_REMOVAL_UNAVAILABLE, libraryReads } from './libraryReads';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Payload for a start request. */
export interface StartImportPayload {
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
export async function afterWait(context: HandlerContext, response: HandlerResponse, waitSeconds: unknown): Promise<HandlerResponse> {
    const waitMs = waitMsOf(waitSeconds);
    if (!response.success || waitMs === 0) return response;
    const transient = new TransientStateManager(context.context);
    const job = await waitForJob(() => transient.get<ImportJobRecord | null>(JOB_KEY, null), waitMs);
    return { ...response, data: { ...(response.data as object), job } };
}

/** What a caller other than `start-datapack-import` adds to a start; never read from a payload. */
export interface StartOptions {
    /** Work for once the job ends in success (`runAndWatch`): Undo Last Save's delete. */
    afterSuccess?: () => Promise<void>;
    /**
     * What the job is for when the start alone cannot say: Restore (`restoreDatapack.ts`), whose pack
     * installed is replaced even by its own version, or Undo Last Save. Else install or switch.
     */
    purpose?: 'restore' | 'undo';
}

/**
 * Start an import: prepared, settled against the pack it replaces (walk F97), validated, begun and
 * watched. `start-datapack-import`, Undo Last Save and Restore all start through here.
 */
export async function startDatapackImport(
    context: HandlerContext,
    payload: StartImportPayload | undefined,
    options: StartOptions = {},
): Promise<HandlerResponse> {
    const { afterSuccess } = options;
    const prepared = await prepareImport(context, payload);
    if ('response' in prepared) {
        return prepared.response;
    }
    const { engine } = prepared;
    // Walk F97: over another pack or version the demo uses, that pack goes first, its changes settled.
    const replacement = await settleReplacement(context, engine, prepared.request, payload, { restore: options.purpose === 'restore' });
    if ('response' in replacement) {
        return replacement.response;
    }
    const { request, replaces, saved, savedAs, replacesVersion } = replacement;

    // The sync twin is the only thing that will tell us this request is
    // malformed. A 202 from the async entry point would not.
    const started = await runAndWatch(context, engine, request, {
        operation: 'import',
        purpose: options.purpose ?? jobPurpose({ replaces, replacesVersion }),
        validate: replacement.validate ?? (() => engine.validateImport(request)),
        begin: () => engine.startImport(request),
        rejected: 'The Data Installer rejected this install request.',
        failed: 'The install could not be started.',
        ...(replaces ? { replaces } : {}),
        ...(savedAs ? { savedAs } : {}),
        ...(replacesVersion ? { replacesVersion } : {}),
        ...(afterSuccess ? { afterSuccess } : {}),
    });
    return withSavedNote(await afterWait(context, started, payload?.waitSeconds), saved, 'The install could not be started.');
}

/**
 * Everything both write handlers need, or the response to return instead.
 *
 * Extracted at the SECOND caller rather than the third: the two paths have to
 * agree on the guard and the request body byte for byte, or a
 * dry run would check something other than what a start would send — which is the
 * one thing that would make a dry run worse than useless.
 */
export async function prepareImport(
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
export function readInput(
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
