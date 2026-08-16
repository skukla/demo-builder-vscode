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

import { provisionAccsCredentials } from '../services/accsCredentialProvisioner';
import { canProvisionAccsCredentials } from '../services/accsProvisionEligibility';
import { brokerForContext } from '../services/commerceCredentialBroker';
import { resolveCommerceCredentials } from '../services/commerceCredentials';
import {
    DataInstallerWriteClient,
    type ImportRequest,
    type ImportTarget,
} from '../services/dataInstallerWriteClient';
import { deriveImportInstance } from '../services/importInstance';
import { watchImportJob } from '../services/importJobRunner';
import {
    buildScopeDiscoveryParams,
    groupStoreViewsByWebsite,
} from '../services/importScopeDiscovery';
import { downloadWorkspaceConfigJson } from '../services/workspaceConfigDownload';
import { IMPORT_PROGRESS_MESSAGE, type ImportJobRecord } from '../types';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { exportHandlers } from './exportHandlers';
import { ServiceLocator } from '@/core/di';
import { PollingService } from '@/core/shell/pollingService';
import { TransientStateManager } from '@/core/state/transientStateManager';
import { discoverStoreStructure } from '@/features/eds/services/commerceStoreDiscovery';
import type { Project } from '@/types/base';
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
    // Stage 3 lives in its own module; merged here so the panel and the tests
    // keep ONE handler map to reach for.
    ...exportHandlers,
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
                error: 'A reset removes this datapack\'s data from the Commerce instance and cannot be undone. Confirm to proceed.',
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

    /**
     * What the import modal should prefill as the target, and where it came from.
     *
     * The field started empty because a spike could not PROVE the target was
     * derivable — none of the instances with Data Installer history matched a local
     * project, so a derived value had nothing to be checked against, and guessing a
     * write target with no undo was the wrong trade.
     *
     * Both halves of that reasoning have since expired. `checkCredentials` tests an
     * instance read-only, so a derived value is now verifiable before anything is
     * written. And the derivation already existed: `ACCS_ENDPOINT_PATTERN` has been
     * pulling the tenant id out of `ACCS_GRAPHQL_ENDPOINT` all along to build the
     * admin URL, and that id is a 21–22 character base62 nanoid — the shape the
     * spike measured for `commerce_instance`.
     *
     * **This answers; it does not decide.** It reports the instance the project
     * implies and nothing else — the field stays editable, and a dry run is what
     * checks a seeded value before an import writes with it.
     */
    'get-datapack-import-target': async (context: HandlerContext): Promise<HandlerResponse> => {
        // No guard and no client: this reads project state only. A missing project
        // is not a failure — the catalog is browsable without one, and the modal
        // simply asks the user to type the target.
        const project: Project | undefined = await context.stateManager.getCurrentProject();
        const configs = project?.componentConfigs ?? {};
        // The id is what the service needs and what nobody can read. The project
        // name is the only human-recognisable handle on the same target, so it
        // rides along for the modal to lead with.
        const projectName = project?.name;
        // The sample data this project was CREATED to hold, recorded by the
        // wizard's Sample Data area and never imported there. Reported here so
        // the panel can offer it directly instead of making the user re-find it
        // in a 25-name catalog.
        const datapack = project?.datapack;

        // Shared with the build's sample-data phase — see `deriveImportInstance`.
        // Two derivations would let the same pack land in different places
        // depending on which surface asked, with nothing to report the difference.
        const instance = deriveImportInstance(configs);
        if (instance) {
            return { success: true, data: { instance, projectName, datapack } };
        }

        return { success: true, data: { datapack } };
    },

    /**
     * The websites and store views a pack can be imported onto.
     *
     * Targeting is the INTENDED path (the service author, 2026-08-14: create the
     * website first, "then you can specify site and store on the data pack
     * import"). This is what fills that picker.
     *
     * **Discovery runs here, not in the webview.** The wizard's
     * `useStoreDiscovery` posts PaaS admin credentials from the panel because
     * the wizard holds them in form state; this feature deliberately keeps the
     * pair extension-side. So the structure is discovered where the credentials
     * already live and only the codes travel back.
     *
     * Optional by design: no project, no credentials or a failed discovery all
     * leave the user with a manual import onto the service's default. Only a
     * discovery that actively failed is worth an error — the rest is an empty
     * list.
     */
    'list-datapack-import-scopes': async (context: HandlerContext): Promise<HandlerResponse> => {
        const project = await context.stateManager.getCurrentProject();
        if (!project) {
            return { success: true, data: { websites: [] } };
        }

        const credentials = await resolveCommerceCredentials({
            project: {
                stackBackend: project.componentSelections?.backend ?? '',
                componentConfigs: project.componentConfigs ?? {},
            },
            secrets: context.context.secrets,
            projectName: project.name,
            broker: brokerForContext(context, project),
        });
        if (!credentials.ok) {
            // Not an error: the import still works, it just lands on the default.
            return { success: true, data: { websites: [] } };
        }

        const params = await buildScopeDiscoveryParams(context, project, credentials.credentials);
        if (!params) {
            return { success: true, data: { websites: [] } };
        }

        const result = await discoverStoreStructure(params);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        return { success: true, data: { websites: groupStoreViewsByWebsite(result.data) } };
    },

    /**
     * Console-free ACCS credential provisioning — the loop proven live
     * 2026-08-13, wired to THIS project's own Adobe binding.
     *
     * On success the pair lands in `componentConfigs['adobe-commerce-accs']` —
     * the DECLARED fields, exactly where a hand-pasted pair lives — and the
     * project is saved. One storage path, not two. The response never carries
     * the values; the next dry run reads them where everything else does.
     *
     * Panel-only by construction (never in the MCP maps): it creates a
     * credential in the user's Console workspace.
     */
    'provision-accs-credentials': async (context: HandlerContext): Promise<HandlerResponse> => {
        const project = await context.stateManager.getCurrentProject();
        if (!project) {
            return { success: false, error: 'Open a project first.', code: ErrorCode.PROJECT_NOT_FOUND };
        }
        if (project.componentSelections?.backend !== 'adobe-commerce-accs') {
            return {
                success: false,
                error: 'Automatic setup applies to ACCS backends only — PaaS uses the admin username and password.',
                code: ErrorCode.INVALID_OPERATION,
            };
        }
        const adobe = project.adobe;
        // Same predicate the OFFER uses. Kept shared so the button and the
        // guard behind it cannot disagree — they did, and the disagreement was
        // a button that could only ever refuse.
        if (!canProvisionAccsCredentials(adobe)) {
            return {
                success: false,
                error: 'This project has no Adobe project binding, so there is no workspace to provision in.',
                code: ErrorCode.INVALID_OPERATION,
            };
        }
        if (!context.authManager) {
            return { success: false, error: 'Adobe sign-in is required.', code: ErrorCode.AUTH_REQUIRED };
        }

        const executor = ServiceLocator.getCommandExecutor();
        const result = await provisionAccsCredentials(
            {
                auth: context.authManager,
                downloadWorkspaceJson: (target) => downloadWorkspaceConfigJson(executor, target),
                log: (line) => context.debugLogger.debug(`[Data Installer] provisioning: ${line}`),
            },
            { orgId: adobe.organization, projectId: adobe.projectId, workspaceId: adobe.workspace },
        );
        if (!result.ok) {
            return { success: false, error: result.reason, code: ErrorCode.UNKNOWN };
        }

        project.componentConfigs = project.componentConfigs ?? {};
        project.componentConfigs['adobe-commerce-accs'] = {
            ...project.componentConfigs['adobe-commerce-accs'],
            ACCS_OAUTH_CLIENT_ID: result.clientId,
            ACCS_OAUTH_CLIENT_SECRET: result.clientSecret,
        };
        await context.stateManager.saveProject(project);

        return { success: true };
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
            // `componentSelections.backend` — the field a PERSISTED project
            // actually carries, and what the other six readers in this repo use.
            // This read `stack?.backend` for its whole life, a shape that exists
            // only in wizard state, so EVERY real project resolved to '' and got
            // "this project has no Adobe Commerce backend". The unit fixtures had
            // the same invented shape and so agreed with it — a live dry run is
            // what caught it, which no test here could have.
            stackBackend: project.componentSelections?.backend ?? '',
            componentConfigs: project.componentConfigs ?? {},
        },
        secrets: context.context.secrets,
        projectName: project.name,
        broker: brokerForContext(context, project),
    });
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
            target: input.target,
            credentials: credentials.credentials,
        },
    };
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
): Promise<void> {
    const access = await resolveDataInstallerAccess(context);
    if (!access.ok) {
        await stopWatching(
            transient,
            record,
            'The Data Installer could not be reached to watch this job.',
        );
        return;
    }
    try {
        const result = await watchImportJob({
            client: access.client,
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
            },
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
async function runAndWatch(
    context: HandlerContext,
    writeClient: DataInstallerWriteClient,
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
        const verdict = await writeClient.validateImport(request);
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

        void watchAndRecord(context, transient, record);

        return { success: true, data: { activationId: started.activationId } };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : spec.failed,
            code: ErrorCode.UNKNOWN,
        };
    }
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
