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
 * **Credentials are checked before anything is sent.** A missing pair is a
 * reason, not a failed request.
 *
 * Reuses `resolveDataInstallerAccess` for the config/auth half rather than
 * repeating it, so a new write handler cannot skip a check.
 *
 * @module features/data-installer/handlers/importHandlers
 */

import { resolveCommerceCredentials } from '../services/commerceCredentials';
import { DataInstallerWriteClient, type ImportRequest } from '../services/dataInstallerWriteClient';
import { watchImportJob } from '../services/importJobRunner';
import type { ImportJobRecord } from '../types';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { PollingService } from '@/core/shell/pollingService';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/** Where the in-flight/last import is recorded. One per extension host. */
const JOB_KEY = 'dataInstaller.import.current';

/** Wording for each credential gap. The service module returns reasons only. */
const CREDENTIAL_MESSAGES: Record<string, string> = {
    'missing-paas-admin':
        'This project has no Commerce admin username and password saved, so an import cannot authenticate.',
    'needs-accs-credentials':
        'ACCS imports need an Adobe OAuth Server-to-Server client id and secret. Add them before importing.',
    'unsupported-backend':
        'This project has no Adobe Commerce backend, so there is nothing to import into.',
};

/** Payload for a start request. */
interface StartImportPayload {
    datapackName?: string;
    version?: string;
    commerceInstance?: string;
    dataTypes?: string[];
    /** Reset only: must be true. Nothing removes data by default. */
    confirm?: boolean;
}

export const importHandlers = defineHandlers({
    'start-datapack-import': async (
        context: HandlerContext,
        payload?: StartImportPayload,
    ): Promise<HandlerResponse> => {
        const prepared = await prepareImport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        const { writeClient, request } = prepared;

        try {
            // The sync twin is the only thing that will tell us this request is
            // malformed. A 202 from the async entry point would not.
            const verdict = await writeClient.validateImport(request);
            if (!verdict.valid) {
                return {
                    success: false,
                    error: verdict.reason ?? 'The Data Installer rejected this import request.',
                };
            }

            const start = await writeClient.startImport(request);
            const record: ImportJobRecord = {
                activationId: start.activationId,
                datapackName: request.id.name,
                version: request.id.version,
                commerceInstance: request.commerceInstance,
                dataTypes: request.dataTypes,
                startedAt: new Date().toISOString(),
                outcome: 'watching',
                perType: {},
            };
            const transient = new TransientStateManager(context.context);
            await transient.set(JOB_KEY, record);

            // DETACHED on purpose. Awaiting would hold the webview request open
            // for up to ten minutes and tie the job's life to the panel's.
            void watchAndRecord(context, transient, record);

            return { success: true, data: { activationId: start.activationId } };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'The import could not be started.',
                code: ErrorCode.UNKNOWN,
            };
        }
    },

    /**
     * The dry run — validate and stop.
     *
     * Same guard, same credentials, same request body as a real start; it simply
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
            // Credentials first. If the pair cannot reach the instance, whether
            // the request is well-formed is not the answer anyone needs — and
            // `get-websites-and-stores` answers it without going near
            // process-datapack, so it cannot start work by accident.
            const access = await prepared.writeClient.checkCredentials(prepared.request);
            if (!access.usable) {
                return {
                    success: true,
                    data: {
                        valid: false,
                        reason: access.reason ?? 'These credentials did not reach that Commerce instance.',
                    },
                };
            }
            return {
                success: true,
                data: await prepared.writeClient.validateImport(prepared.request),
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
                error: 'A reset removes this datapack\'s data from the Commerce instance and cannot be undone. Confirm to proceed.',
                code: ErrorCode.INVALID_OPERATION,
            };
        }

        const prepared = await prepareImport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        const { writeClient, request } = prepared;

        try {
            const verdict = await writeClient.validateImport(request);
            if (!verdict.valid) {
                return {
                    success: false,
                    error: verdict.reason ?? 'The Data Installer rejected this reset request.',
                };
            }

            const start = await writeClient.startDelete(request);
            const record: ImportJobRecord = {
                activationId: start.activationId,
                datapackName: request.id.name,
                version: request.id.version,
                commerceInstance: request.commerceInstance,
                dataTypes: request.dataTypes,
                startedAt: new Date().toISOString(),
                outcome: 'watching',
                perType: {},
            };
            const transient = new TransientStateManager(context.context);
            await transient.set(JOB_KEY, record);

            void watchAndRecord(context, transient, record);

            return { success: true, data: { activationId: start.activationId } };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'The reset could not be started.',
                code: ErrorCode.UNKNOWN,
            };
        }
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
 * agree on the guard, the credentials and the request body byte for byte, or a
 * dry run would check something other than what a start would send — which is the
 * one thing that would make a dry run worse than useless.
 */
async function prepareImport(
    context: HandlerContext,
    payload: StartImportPayload | undefined,
): Promise<
    { writeClient: DataInstallerWriteClient; request: ImportRequest } | { response: HandlerResponse }
> {
    const input = readInput(payload);
    if ('error' in input) {
        return { response: { success: false, error: input.error } };
    }

    const access = await resolveDataInstallerAccess(context);
    if (!access.ok) {
        return { response: access.response };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { response: { success: false, error: 'Open a project before importing a datapack.' } };
    }

    const credentials = await resolveCommerceCredentials({
        project: {
            stackBackend: (project as { stack?: { backend?: string } }).stack?.backend ?? '',
            componentConfigs:
                (project as { componentConfigs?: Record<string, Record<string, string>> })
                    .componentConfigs ?? {},
        },
        secrets: context.context.secrets,
        projectName: (project as { name?: string }).name ?? '',
    });
    if (!credentials.ok) {
        return {
            response: {
                success: false,
                error: CREDENTIAL_MESSAGES[credentials.reason] ?? 'Commerce credentials are missing.',
                code: ErrorCode.INVALID_OPERATION,
            },
        };
    }

    return {
        writeClient: new DataInstallerWriteClient({
            baseUrl: access.baseUrl,
            getToken: access.getToken,
        }),
        request: {
            id: { name: input.datapackName, version: input.version },
            commerceInstance: input.commerceInstance,
            dataTypes: input.dataTypes,
            credentials: credentials.credentials,
        },
    };
}

/**
 * Watch to a terminal outcome and record it.
 *
 * Runs after its caller has returned. Errors are swallowed into the record
 * rather than thrown: nothing is awaiting this, so an unhandled rejection is the
 * only thing a throw could achieve.
 */
async function watchAndRecord(
    context: HandlerContext,
    transient: TransientStateManager,
    record: ImportJobRecord,
): Promise<void> {
    const access = await resolveDataInstallerAccess(context);
    if (!access.ok) {
        return;
    }
    try {
        const result = await watchImportJob({
            client: access.client,
            activationId: record.activationId,
            requestedTypes: record.dataTypes,
            polling: new PollingService(),
        });
        await transient.set(JOB_KEY, {
            ...record,
            outcome: result.outcome,
            perType: result.perType,
            ...(result.reason ? { reason: result.reason } : {}),
            ...(result.processingTimeMs !== undefined
                ? { processingTimeMs: result.processingTimeMs }
                : {}),
        });
    } catch (error) {
        context.logger.warn(
            `[Data Installer] Stopped watching import ${record.activationId}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/** Validate the payload, returning either usable input or the reason it is not. */
function readInput(
    payload: StartImportPayload | undefined,
):
    | { datapackName: string; version: string; commerceInstance: string; dataTypes: string[] }
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
    return { datapackName, version, commerceInstance, dataTypes };
}
