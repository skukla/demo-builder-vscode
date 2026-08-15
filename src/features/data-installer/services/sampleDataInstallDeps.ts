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
import { resolveCommerceCredentials } from './commerceCredentials';
import { DataInstallerWriteClient } from './dataInstallerWriteClient';
import { watchImportJob } from './importJobRunner';
import type { SampleDataDeps } from './sampleDataInstall';
import { PollingService } from '@/core/shell/pollingService';
import type { HandlerContext } from '@/types/handlers';

/** Build the dependency set for one build's sample-data install. */
export function buildSampleDataDeps(
    context: HandlerContext,
    project: unknown,
    report: (message: string) => void,
): SampleDataDeps {
    return {
        credentials: async () => {
            const resolution = await resolveCommerceCredentials({ project: project as never });
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
