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

import { resolveDataInstallerAccess, resolveDatapackAccess } from '../handlers/dataInstallerHandlers';
import { SERVICE_REMOVAL_UNAVAILABLE, libraryReads } from '../handlers/libraryReads';
import { dataTypeLabel } from '../ui/dataTypeLabel';
import { buildDatapackEngine, installedByDemoBuilder } from './buildDatapackEngine';
import type { DatapackEngine } from './datapackEngine';
import { watchImportJob } from './importJobRunner';
import type { SampleDataDeps } from './sampleDataInstall';
import { PollingService } from '@/core/shell/pollingService';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import type { Project } from '@/types/base';
import type { DatapackStoreName } from '@/types/datapack';
import type { HandlerContext } from '@/types/handlers';

/** What this deps set is being built for. */
export type SampleDataMode = 'install' | 'remove';

/**
 * Build the dependency set for one sample-data job.
 *
 * `mode` exists because this builder serves BOTH `installSampleData` and
 * `removeSampleData`, and the name the poller logs is phrased by it.
 *
 * It used to be hardcoded to the install wording, so a reset's REMOVAL logged
 * `data-installer import <id>` on every poll, and its progress bar said
 * "Installing" while deleting (found 2026-08-17). The progress line's wording now
 * comes from each surface's step in the stage table ("Installing the datapack",
 * Reset's removal step), so the report below carries only the counts.
 */
/**
 * One live progress update for a sample-data job. Callers compose it for
 * their surface (`typesLine`): the types done and the ones processing go on
 * the line under the surface's step.
 */
export interface SampleDataProgress {
    /** Types finished (success or error). */
    done: number;
    /** Total types in the job. */
    total: number;
    /** Friendly labels of the types processing RIGHT NOW (often one). */
    processing: string[];
}

export function buildSampleDataDeps(
    context: HandlerContext,
    project: Project,
    report: (progress: SampleDataProgress) => void,
    mode: SampleDataMode = 'install',
): SampleDataDeps {
    // One engine for the whole job: Demo Builder's keeps its jobs in memory, so the engine
    // that starts one has to be the engine that is asked how it is going.
    let built: Promise<DatapackEngine> | undefined;
    const engineOnce = (): Promise<DatapackEngine> => (built ??= engine(context, project, mode));
    return {
        // What the service HOLDS, which is the detail plus a batch item lookup —
        // the same pairing `get-datapack-detail` does. A pack can DECLARE a type
        // the service stores no item for, and asking for it imports nothing while
        // reporting a failure that is not one.
        // Asked of the store that holds the pack: the Data Installer unless the project
        // recorded the library.
        inventory: async ({ store, ...id }) => {
            const held = async (from: DatapackStoreName): Promise<string[]> => {
                const access = await resolveDataInstallerAccess(context, from);
                if (!access.ok) return [];
                const detail = await access.client.getDatapackDetail(id);
                if (detail.dataTypes.length === 0) return [];
                return (await access.client.batchGetDataItems(id, detail.dataTypes)).present;
            };
            if (store === 'library') return held('library');
            // The datapack store's copy first, as the install reads it (`readPackItems`).
            const fromStore = await held('library').catch(() => []);
            return fromStore.length > 0 ? fromStore : held('installer');
        },

        startImport: async (request) => (await engineOnce()).startImport(request),

        // The Reset workflow's half. Same request, same engine, different verb.
        startDelete: async (request) => (await engineOnce()).startDelete(request),

        /**
         * Polls through the engine, the one that started the job and keeps it in memory.
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
            const result = await watchImportJob({
                client: await engineOnce(),
                activationId,
                requestedTypes,
                polling: new PollingService(),
                operation: operation ?? (mode === 'remove' ? 'reset' : 'import'),
                ...(onProgress ? { onProgress } : {}),
            });
            return { outcome: result.outcome, perType: result.perType, ...(result.reason ? { reason: result.reason } : {}) };
        },

        onProgress: (perType) => {
            const entries = Object.entries(perType);
            report({
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

/** The engine, built the way the import handlers build it (`buildDatapackEngine`). */
async function engine(context: HandlerContext, project: Project, mode: SampleDataMode): Promise<DatapackEngine> {
    const access = await resolveDatapackAccess(context);
    if (!access.ok) {
        throw new Error('Datapacks are not available for this project.');
    }
    // A pack the Data Installer service installed has no record here: only Clear Demo Data clears it.
    if (mode === 'remove' && project.datapack && !(await installedByDemoBuilder(project.path, project.datapack))) {
        throw new Error(SERVICE_REMOVAL_UNAVAILABLE);
    }
    // The org that owns the store is the org the sign-in must be in, as the screen's import
    // checks (`importHandlers`, `orgGuard`).
    if (context.authManager) {
        const orgFailure = await orgGuard(context, project, context.authManager);
        if (orgFailure) throw new Error(orgFailure.error);
    }
    return buildDatapackEngine(
        {
            catalog: access.client,
            libraryCatalog: libraryReads(context),
            project,
            authManager: context.authManager,
            secrets: context.context?.secrets,
        },
        (line) => context.debugLogger.debug(`[Data Installer] ${line}`),
    );
}
