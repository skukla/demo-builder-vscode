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

import { canProvisionAccsCredentials } from '../services/accsProvisionEligibility';
import { resolveProjectCredentials } from '../services/commerceCredentialBroker';
import {
    DataInstallerWriteClient,
    type ImportRequest,
    type ImportTarget,
} from '../services/dataInstallerWriteClient';
import { resolveInstallTarget } from '../services/sampleDataInstall';
import type { ImportJobRecord } from '../types';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { exportHandlers } from './exportHandlers';
import { JOB_KEY, runAndWatch } from './importJobWatch';
import { importTargetHandlers } from './importTargetHandlers';
import { provisionAccsHandlers } from './provisionAccsHandler';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { handleBackgroundOperation } from '@/core/vscode/operationProgress';
import { handleAnswerOperationPrompt } from '@/core/vscode/operationPrompt';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

/** Wording for each credential gap. The service module returns reasons only. */
const CREDENTIAL_MESSAGES: Record<string, string> = {
    'missing-paas-admin':
        'This project has no Commerce admin username and password saved, so an import cannot authenticate.',
    // "Add them" was the whole story when the user was the only source. There
    // are now two, and on a project with no Adobe workspace the OTHER one
    // failing is the likelier cause — so the message says both what did not
    // happen and the two ways forward. The service is never named: this repo is
    // public and the string ships in the VSIX.
    'needs-accs-credentials':
        'ACCS imports need an Adobe OAuth Server-to-Server client id and secret, and the shared credential service did not supply one. Add the pair to this project, or ask an administrator for access to the shared credential.',
    'unsupported-backend':
        'This project has no Adobe Commerce backend, so there is nothing to import into.',
    // Distinct from the gap above because the remedy is: the extension has no
    // shared credential service to fall back on, and that is a setting the user
    // can add. Naming the setting is safe; naming its value would not be.
    'no-credential-service':
        'ACCS imports need an Adobe OAuth Server-to-Server client id and secret, and no shared credential service is configured to supply one. Add a service under demoBuilder.accsDiscovery.services, or add the pair to this project.',
};

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
}

export const importHandlers = defineHandlers({
    // Closing a running import hands it to a notification that keeps narrating
    // (PL-59 R8); this is the channel that says so.
    backgroundOperation: handleBackgroundOperation,
    // The SC answered a question the work was paused on — a sign-in that expired,
    // a prerequisite missing, a merge needing a decision (PL-59, owner 2026-09-20).
    answerOperationPrompt: handleAnswerOperationPrompt,
    // Stage 3 lives in its own module; merged here so the panel and the tests
    // keep ONE handler map to reach for. The modal's prefill reads and the
    // Console provisioning button were split out the same way (2026-10-08).
    ...exportHandlers,
    ...importTargetHandlers,
    ...provisionAccsHandlers,
    'start-datapack-import': async (
        context: HandlerContext,
        payload?: StartImportPayload,
    ): Promise<HandlerResponse> => {
        const prepared = await prepareImport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        const { writeClient, request } = prepared;

        // The sync twin is the only thing that will tell us this request is
        // malformed. A 202 from the async entry point would not.
        return runAndWatch(context, writeClient, request, {
            operation: 'import',
            begin: () => writeClient.startImport(request),
            rejected: 'The Data Installer rejected this import request.',
            failed: 'The import could not be started.',
        });
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
                error: 'This removes the datapack\'s data from the Commerce instance and cannot be undone. Confirm to proceed.',
                code: ErrorCode.INVALID_OPERATION,
            };
        }

        const prepared = await prepareImport(context, payload);
        if ('response' in prepared) {
            return prepared.response;
        }
        const { writeClient, request } = prepared;

        return runAndWatch(context, writeClient, request, {
            operation: 'reset',
            begin: () => writeClient.startDelete(request),
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

    const credentials = await resolveProjectCredentials(context, project);
    if (!credentials.ok) {
        return {
            response: {
                success: false,
                error: CREDENTIAL_MESSAGES[credentials.reason] ?? 'Commerce credentials are missing.',
                code: ErrorCode.INVALID_OPERATION,
                // The UI offers console-free provisioning on exactly this gap —
                // matching a message string would be the brittle version of
                // this. The Adobe-binding half is what makes the offer
                // honourable: without a workspace the button has nowhere to
                // create the pair and can only refuse a second time.
                data: {
                    needsAccsCredentials:
                        credentials.reason === 'needs-accs-credentials' &&
                        canProvisionAccsCredentials(project.adobe),
                },
            },
        };
    }

    return {
        writeClient: new DataInstallerWriteClient({
            baseUrl: access.baseUrl,
            getToken: access.getToken,
            // One line per service call in Debug Logs. The first live dry run
            // refused with an EMPTY channel — undebuggable for the user and us.
            log: (line) => context.debugLogger.debug(`[Data Installer] ${line}`),
        }),
        request: {
            id: { name: input.datapackName, version: input.version },
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
            target: input.target ?? resolveInstallTarget(project) ?? undefined,
            credentials: credentials.credentials,
        },
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
    return { datapackName, version, commerceInstance, dataTypes, target: target.target };
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
