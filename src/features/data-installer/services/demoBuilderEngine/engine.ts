/**
 * Demo Builder's engine behind the `DatapackEngine` seam: it installs and removes a pack from
 * the extension, over the project's own signed Commerce access (DI-5).
 *
 * The seam was written for the service, which starts a job and is then asked how it is going.
 * This keeps that shape so every screen, the wizard and the agent tools work unchanged: a start
 * answers a job id at once, the work runs here, and the job reads answer from memory, one status
 * per requested kind, as `watchImportJob` expects. A job lives as long as the extension host;
 * the install record on disk is what survives a closed window, so running the install again
 * carries on from it.
 *
 * The request's Commerce credentials are not used: this engine signs with the project's own
 * access, as the ERP work does.
 *
 * @module features/data-installer/services/demoBuilderEngine/engine
 */

import * as crypto from 'crypto';
import type { DataTypeStatus, DatapackId, ImportStart, ValidationResult } from '../../types';
import type { CredentialCheck, ImportRequest } from '../dataInstallerWriteClient';
import type { DatapackEngine } from '../datapackEngine';
import { type RecordFiles, nodeRecordFiles, openInstallRecord } from './installRecord';
import { resolveEngineTarget, sessionFor } from './installTarget';
import { type PackItems, installPack, removePack, unsupportedKinds } from './runPack';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

/** What this engine needs from the project it installs into. */
export interface DemoBuilderEngineDeps {
    /** The project's signed Commerce access, or why there is none. */
    commerce: () => Promise<{ get: CommerceGet; send: CommerceSend } | { refusal: string }>;
    /** The pack's rows for the kinds asked, from whichever store it is in. */
    readPack: (id: DatapackId, dataTypes: string[]) => Promise<PackItems>;
    projectPath: string;
    log: (line: string) => void;
    files?: RecordFiles;
    now?: () => Date;
}

const NO_TARGET = 'Choose the website and store view to install into first.';

interface Job {
    perType: Record<string, DataTypeStatus>;
    reason?: string;
    startedAt: number;
    finishedAt?: number;
}

/** Mark every kind not yet finished as failed: the covering set must end terminal. */
function failRest(job: Job, reason: string): void {
    job.reason = reason;
    for (const [kind, status] of Object.entries(job.perType)) {
        if (status === 'pending' || status === 'processing') job.perType[kind] = 'error';
    }
}

async function access(deps: DemoBuilderEngineDeps): Promise<{ get: CommerceGet; send: CommerceSend }> {
    const commerce = await deps.commerce();
    if ('refusal' in commerce) throw new Error(commerce.refusal);
    return commerce;
}

/** Install: the target, the rows, then each kind in order, its status moving as it runs. */
async function runInstall(deps: DemoBuilderEngineDeps, request: ImportRequest, job: Job): Promise<void> {
    if (!request.target) throw new Error(NO_TARGET);
    const items = await deps.readPack(request.id, request.dataTypes);
    const missing = request.dataTypes.filter((kind) => !(kind in items));
    if (missing.length > 0) throw new Error(`The pack holds no ${missing.join(', ')}.`);
    const commerce = await access(deps);
    const target = await resolveEngineTarget(commerce.get, request.target);
    const now = deps.now ?? (() => new Date());
    const recorder = await openInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, request.id, () => now().toISOString());
    let current: string | undefined;
    await installPack({ ...commerce, recorder, session: sessionFor(target), log: deps.log }, items, (kind) => {
        if (current) job.perType[current] = 'success';
        current = kind;
        job.perType[kind] = 'processing';
    });
    if (current) job.perType[current] = 'success';
}

/** Run a job in the background, ending every requested kind terminal whatever happens. */
function start(deps: DemoBuilderEngineDeps, jobs: Map<string, Job>, request: ImportRequest, work: (job: Job) => Promise<void>): ImportStart {
    const activationId = `demo-builder-${crypto.randomUUID()}`;
    const job: Job = { perType: Object.fromEntries(request.dataTypes.map((kind) => [kind, 'pending' as DataTypeStatus])), startedAt: Date.now() };
    jobs.set(activationId, job);
    void work(job)
        .catch((error: unknown) => {
            deps.log(`[Data Installer] Demo Builder engine: ${request.id.name}@${request.id.version} stopped: ${errorText(error)}`);
            failRest(job, errorText(error));
        })
        .finally(() => {
            job.finishedAt = Date.now();
        });
    return { activationId };
}

/**
 * The engine, for one project.
 *
 * @param deps - the project's Commerce access, where its packs are read from, and its path
 * @returns a `DatapackEngine` the screens drive as they drive the service's
 */
export function demoBuilderEngine(deps: DemoBuilderEngineDeps): DatapackEngine {
    const jobs = new Map<string, Job>();
    return {
        id: 'demo-builder',
        async checkCredentials(): Promise<CredentialCheck> {
            try {
                await (await access(deps)).get('store/websites');
                return { usable: true };
            } catch (error) {
                return { usable: false, reason: errorText(error) };
            }
        },
        async validateImport(request): Promise<ValidationResult> {
            try {
                if (!request.target) return { valid: false, reason: NO_TARGET };
                const unsupported = unsupportedKinds(Object.fromEntries(request.dataTypes.map((kind) => [kind, null])));
                if (unsupported.length > 0) return { valid: false, reason: `Demo Builder does not install ${unsupported.join(', ')} yet.` };
                await resolveEngineTarget((await access(deps)).get, request.target);
                return { valid: true };
            } catch (error) {
                return { valid: false, reason: errorText(error) };
            }
        },
        startImport: async (request) => start(deps, jobs, request, (job) => runInstall(deps, request, job)),
        startDelete: async (request) =>
            start(deps, jobs, request, async (job) => {
                const result = await removePack(await access(deps), deps.files ?? nodeRecordFiles, { projectPath: deps.projectPath, pack: request.id });
                if (result.noRecord) throw new Error('Demo Builder did not install this pack in this project, so there is nothing of its to remove.');
                for (const kind of Object.keys(job.perType)) job.perType[kind] = 'success';
            }),
        async getJobStatus(activationId) {
            const job = jobs.get(activationId);
            return {
                activationId,
                perType: { ...(job?.perType ?? {}) },
                hasRecord: job !== undefined,
                ...(job?.finishedAt !== undefined ? { processingTimeMs: job.finishedAt - job.startedAt } : {}),
            };
        },
        async getJobFailureReason(activationId) {
            const reason = jobs.get(activationId)?.reason;
            return reason ? { error: reason } : undefined;
        },
    };
}
