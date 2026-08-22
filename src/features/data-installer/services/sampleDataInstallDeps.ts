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
import { dataTypeLabel } from '../ui/dataTypeLabel';
import { resolveProjectCredentials } from './commerceCredentialBroker';
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

/** What this deps set is being built for. */
export type SampleDataMode = 'install' | 'remove';

/** The progress line's verb per job. */
const PROGRESS_VERB: Record<SampleDataMode, string> = {
    install: 'Installing',
    remove: 'Removing',
};

/**
 * Build the dependency set for one sample-data job.
 *
 * `mode` exists because this builder serves BOTH `installSampleData` and
 * `removeSampleData`, and two things it produces are phrased: the progress line
 * a user reads, and the name the poller logs.
 *
 * Both used to be hardcoded to the install wording, so a reset's REMOVAL
 * reported `Installing sample data — 2 of 14 types done` on the progress bar
 * while deleting, and logged `data-installer import <id>` on every poll. Found
 * 2026-08-17 when that progress line was read as evidence that reset reinstalls
 * data — it does not, and a backlog item was nearly written around the label.
 */
/**
 * One live progress update for a sample-data job. Callers compose it for
 * their surface: the wizard puts the count in the loading title and the
 * processing types in the detail row (the three-row contract); the reset
 * notification flattens it to one line.
 */
export interface SampleDataProgress {
    /** 'Installing' or 'Removing' — phrased by the job mode. */
    verb: string;
    /** Types finished (success or error). */
    done: number;
    /** Total types in the job. */
    total: number;
    /** Friendly labels of the types processing RIGHT NOW (often one). */
    processing: string[];
}

export function buildSampleDataDeps(
    context: HandlerContext,
    project: SampleDataProject,
    report: (progress: SampleDataProgress) => void,
    mode: SampleDataMode = 'install',
): SampleDataDeps {
    return {
        credentials: async () => {
            // The broker matters MORE here than anywhere else: this runs during
            // project creation, and a project that selected no App Builder
            // components is exactly the one with no workspace to mint a pair in.
            // Omitting it would leave every unit test green and the feature inert
            // on its main path.
            //
            // Through the shared resolver, which owns the `stackBackend` mapping.
            // This line passed a raw project through `as never` and so resolved
            // nothing for anyone — see `resolveProjectCredentials` for the three
            // sites that made the same mistake.
            const resolution = await resolveProjectCredentials(context, project);
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
            return client.startImport(request);
        },

        // The Reset workflow's half. Same request, same client, different verb.
        startDelete: async (request) => {
            const client = await writeClient(context);
            return client.startDelete(request);
        },

        /**
         * Polls with the READ client, which is the only one that can answer.
         *
         * `watchImportJob` needs a `JobStatusSource` — `getJobStatus` and
         * `getJobFailureReason` — and those live on `DataInstallerClient`. This
         * passed the WRITE client through `client as never`, which has neither, so
         * every poll threw `TypeError: e.getJobStatus is not a function`.
         *
         * Observed live 2026-08-17: a reset's delete was accepted (202) and then
         * polled to nothing, once per backoff step, with the job left unwatched.
         * The import path next door already passed `access.client` uncast; this is
         * the same call, made the same way. Another cast, another silent mismatch.
         */
        watch: async ({ activationId, requestedTypes, operation, onProgress }) => {
            const access = await resolveDataInstallerAccess(context);
            if (!access.ok) {
                throw new Error('The Data Installer is not reachable for this project.');
            }
            const result = await watchImportJob({
                client: access.client,
                activationId,
                requestedTypes,
                polling: new PollingService(),
                operation: operation ?? (mode === 'remove' ? 'reset' : 'import'),
                ...(onProgress ? { onProgress } : {}),
            });
            return { outcome: result.outcome, perType: result.perType };
        },

        onProgress: (perType) => {
            const entries = Object.entries(perType);
            report({
                verb: PROGRESS_VERB[mode],
                done: entries.filter(
                    ([, state]) => state === 'success' || state === 'error',
                ).length,
                total: entries.length,
                processing: entries
                    .filter(([, state]) => state === 'processing')
                    .map(([code]) => dataTypeLabel(code)),
            });
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
