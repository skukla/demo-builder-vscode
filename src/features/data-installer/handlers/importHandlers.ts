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

import { buildDatapackEngine, engineThatInstalled } from '../services/buildDatapackEngine';
import { selectedDatapackEngine } from '../services/dataInstallerConfig';
import type { ImportRequest, ImportTarget } from '../services/dataInstallerWriteClient';
import type { DatapackEngine } from '../services/datapackEngine';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import type { DatapackId, DatapackStoreName, ImportJobRecord } from '../types';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { datapackLibraryHandlers } from './datapackLibraryHandlers';
import { type DatapackWriteAccess, resolveDatapackWriteAccess } from './datapackWriteGate';
import { datapackZipHandlers } from './datapackZipHandlers';
import { exportHandlers } from './exportHandlers';
import { JOB_KEY, runAndWatch } from './importJobWatch';
import { importTargetHandlers } from './importTargetHandlers';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { handleBackgroundOperation } from '@/core/vscode/operationProgress';
import { handleAnswerOperationPrompt } from '@/core/vscode/operationPrompt';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
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
}

export const importHandlers = defineHandlers({
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
    // Library pack actions: remove your own, copy one into the Data Installer.
    ...datapackLibraryHandlers,
    'start-datapack-import': async (
        context: HandlerContext,
        payload?: StartImportPayload,
    ): Promise<HandlerResponse> => {
        const prepared = await prepareImport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        const { engine, request } = prepared;

        // The sync twin is the only thing that will tell us this request is
        // malformed. A 202 from the async entry point would not.
        return runAndWatch(context, engine, request, {
            operation: 'import',
            begin: () => engine.startImport(request),
            rejected: 'The Data Installer rejected this import request.',
            failed: 'The import could not be started.',
        });
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

        const prepared = await prepareImport(context, payload, 'remove');
        if ('response' in prepared) {
            return prepared.response;
        }
        const { engine, request } = prepared;

        return runAndWatch(context, engine, request, {
            operation: 'reset',
            begin: () => engine.startDelete(request),
            rejected: 'The Data Installer rejected this reset request.',
            failed: 'The reset could not be started.',
        });
    },

    'get-datapack-import-status': async (context: HandlerContext): Promise<HandlerResponse> => {
        const transient = new TransientStateManager(context.context);
        const record = await transient.get<ImportJobRecord | null>(JOB_KEY, null);
        return { success: true, data: record };
    },
});

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
    // A removal goes through the engine that installed the pack; anything else through the
    // one the setting chooses (DI-5).
    write: 'install' | 'remove' = 'install',
): Promise<
    { engine: DatapackEngine; request: ImportRequest } | { response: HandlerResponse }
> {
    const input = readInput(payload);
    if ('error' in input) {
        return { response: { success: false, error: input.error } };
    }

    const gate = await resolveDatapackWriteAccess(context, 'import');
    if ('response' in gate) {
        return gate;
    }

    const pack = { name: input.datapackName, version: input.version };
    const engine = await engineFor(context, gate, { pack, write, source: input.source });
    if ('response' in engine) {
        return engine;
    }
    return {
        engine: engine.engine,
        request: {
            id: pack,
            source: input.source,
            commerceInstance: input.commerceInstance,
            dataTypes: input.dataTypes,
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
 * The engine for one write: for a removal the one that installed the pack, otherwise the one
 * the setting chooses (DI-5). The service installs only from its own catalog, so a library pack
 * with the service chosen is refused with what to do instead.
 */
async function engineFor(
    context: HandlerContext,
    gate: DatapackWriteAccess,
    write: { pack: DatapackId; write: 'install' | 'remove'; source: DatapackStoreName },
): Promise<{ engine: DatapackEngine } | { response: HandlerResponse }> {
    const engineId =
        write.write === 'remove' ? await engineThatInstalled(gate.project.path, write.pack) : selectedDatapackEngine();
    // Demo Builder's engine writes into the project's own store with the project's credential, so
    // the sign-in must be in the org that owns that store. Checked before anything is written, with
    // the extension's one org guard (adobe-org-context): a mismatch says "Switch IMS Org" rather
    // than failing half way through with Commerce's refusal (owner, 2026-10-28).
    if (engineId === 'demo-builder' && context.authManager) {
        const orgFailure = await orgGuard(context, gate.project, context.authManager);
        if (orgFailure) {
            return { response: { success: false, error: orgFailure.error, code: ErrorCode.ORG_MISMATCH } };
        }
    }
    if (engineId === 'service' && write.source === 'library') {
        return {
            response: {
                success: false,
                error:
                    'The Data Installer service installs only packs in its own catalog. Copy this one to the Data Installer first, ' +
                    'or set demoBuilder.dataInstaller.engine to demo-builder.',
            },
        };
    }
    return {
        engine: buildDatapackEngine(
            engineId,
            {
                ...gate,
                authManager: context.authManager,
                secrets: context.context?.secrets,
                libraryCatalog: async () => {
                    const library = await resolveDataInstallerAccess(context, 'library');
                    if (!library.ok) throw new Error('The datapack library is not reachable.');
                    return library.client;
                },
            },
            (line) => context.debugLogger.debug(`[Data Installer] ${line}`),
        ),
    };
}

/** Validate the payload, returning either usable input or the reason it is not. */
function readInput(
    payload: StartImportPayload | undefined,
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
        return { error: 'A Commerce instance is required — it is where the data will be written.' };
    }
    const dataTypes = payload?.dataTypes ?? [];
    if (dataTypes.length === 0) {
        return { error: 'Select at least one data type to import.' };
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
            error: 'Choose both a target website and a store view, or neither — the Data Installer needs the pair.',
        };
    }
    return { target: { websiteCode, storeCode } };
}
