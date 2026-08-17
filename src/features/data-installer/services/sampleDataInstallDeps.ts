/**
 * The live wiring behind {@link installSampleData}.
 *
 * Kept apart from the orchestration on purpose: `sampleDataInstall` decides WHAT
 * happens and is testable without a service, while this is the part that needs a
 * write client, a token and a poller. Splitting them is what lets every branch —
 * refusal, partial import, empty inventory — have a test that runs in
 * milliseconds.
 *
 * @module features/data-installer/services/sampleDataInstallDeps
 */

import { resolveDataInstallerAccess } from '../handlers/dataInstallerHandlers';
import { brokerForContext } from './commerceCredentialBroker';
import { resolveCommerceCredentials } from './commerceCredentials';
import { DataInstallerWriteClient } from './dataInstallerWriteClient';
import { watchImportJob } from './importJobRunner';
import type { SampleDataDeps } from './sampleDataInstall';
import { PollingService } from '@/core/shell/pollingService';
import type { HandlerContext } from '@/types/handlers';

/**
 * What this needs to know about a project.
 *
 * Typed rather than `unknown` because the credential resolver dispatches on
 * `stackBackend`, which is NOT a persisted field — it is mapped from
 * `componentSelections.backend`, and `unknown` plus a cast is exactly how that
 * mapping went missing (see {@link buildSampleDataDeps}).
 */
export interface SampleDataProject {
    componentSelections?: { backend?: string };
    componentConfigs?: Record<string, Record<string, string | boolean | number | undefined>>;
    adobe?: { organization?: string };
}

/** Build the dependency set for one build's sample-data install. */
export function buildSampleDataDeps(
    context: HandlerContext,
    project: SampleDataProject,
    report: (message: string) => void,
): SampleDataDeps {
    return {
        credentials: async () => {
            // The broker matters MORE here than anywhere else: this runs during
            // project creation, and a project that selected no App Builder
            // components is exactly the one with no workspace to mint a pair in.
            // Omitting it would leave every unit test green and the feature inert
            // on its main path.
            //
            // `stackBackend` is a CredentialProject field, NOT a persisted one.
            // This passed the raw project through `as never`, so it was undefined,
            // the dispatch matched neither backend, and every caller got
            // "This project has no usable Commerce credentials."
            //
            // Measured live 2026-08-17: a reset ran the full ~3-minute pipeline,
            // was answered "Remove Sample Data" at a prompt whose OWN credential
            // check had just succeeded, and then failed the removal on this line.
            // Two resolutions of the same question disagreeing is the symptom that
            // the second one was not asking it properly.
            //
            // The same defect sat in `edsResetUI` and, one shape earlier, in
            // `importHandlers` (`stack?.backend`). Three sites, one cause: a cast
            // that silenced the compiler. Hence the typed parameter above —
            // nothing here is cast, so the next caller cannot repeat it.
            const resolution = await resolveCommerceCredentials({
                project: {
                    stackBackend: project.componentSelections?.backend ?? '',
                    componentConfigs: project.componentConfigs ?? {},
                },
                broker: brokerForContext(context, project),
            });
            // The pair goes into the REQUEST and nowhere else — never into the
            // result, never into a log line.
            return resolution.ok
                ? { ok: true, credentials: resolution.credentials }
                : { ok: false, reason: 'This project has no usable Commerce credentials.' };
        },

        // What the service HOLDS, which is the detail plus a batch item lookup —
        // the same pairing `get-datapack-detail` does. A pack can DECLARE a type
        // the service stores no item for, and asking for it imports nothing while
        // reporting a failure that is not one.
        inventory: async (id) => {
            const access = await resolveDataInstallerAccess(context);
            if (!access.ok) {
                return [];
            }
            const detail = await access.client.getDatapackDetail(id);
            if (detail.dataTypes.length === 0) {
                return [];
            }
            const inventory = await access.client.batchGetDataItems(id, detail.dataTypes);
            return inventory.present;
        },

        startImport: async (request) => {
            const client = await writeClient(context);
            return client.startImport(request as never);
        },

        // The Reset workflow's half. Same request, same client, different verb.
        startDelete: async (request) => {
            const client = await writeClient(context);
            return client.startDelete(request as never);
        },

        watch: async ({ activationId, requestedTypes, onProgress }) => {
            const client = await writeClient(context);
            const result = await watchImportJob({
                client: client as never,
                activationId,
                requestedTypes,
                polling: new PollingService(),
                operation: 'import',
                ...(onProgress ? { onProgress } : {}),
            });
            return { outcome: result.outcome, perType: result.perType };
        },

        onProgress: (perType) => {
            const done = Object.values(perType).filter(
                (state) => state === 'success' || state === 'error',
            ).length;
            report(`Installing sample data — ${done} of ${Object.keys(perType).length} types done`);
        },
    };
}

/** The write client, built the way the import handlers build it. */
async function writeClient(context: HandlerContext): Promise<DataInstallerWriteClient> {
    const access = await resolveDataInstallerAccess(context);
    if (!access.ok) {
        throw new Error('The Data Installer is not reachable for this project.');
    }
    return new DataInstallerWriteClient({
        baseUrl: access.baseUrl,
        getToken: access.getToken,
        // One line per service call in Debug Logs — the first live dry run
        // refused with an EMPTY channel, undebuggable for the user and for us.
        log: (line) => context.debugLogger.debug(`[Data Installer] ${line}`),
    });
}
