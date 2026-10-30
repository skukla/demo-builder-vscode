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
import type { DataTypeStatus, ImportStart, ValidationResult } from '../../types';
import type { CredentialCheck, ImportRequest } from '../dataInstallerWriteClient';
import type { DatapackEngine } from '../datapackEngine';
import { type RecordFiles, type TargetCodes, nodeRecordFiles, openInstallRecord, readInstallRecord } from './installRecord';
import { resolveEngineTarget, sessionFor } from './installTarget';
import { packRootOf, readStoreRoot, underStoreRootLine } from './packRoot';
import { type RootStepAsker, rootStepLine } from './packRootStep';
import { containersLine } from './removers';
import { keptLine } from './repeatInstall';
import { type PackItems, installPack, removePack, unsupportedKinds } from './runPack';
import { settingsLine, settingsWebsite } from './storeConfigKind';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What this engine needs from the project it installs into. */
export interface DemoBuilderEngineDeps {
    /** The project's signed Commerce access, or why there is none. */
    commerce: () => Promise<{ get: CommerceGet; send: CommerceSend } | { refusal: string }>;
    /** The pack's rows for the kinds asked, from the store that holds it. */
    readPack: (id: DatapackId, dataTypes: string[], source: DatapackStoreName) => Promise<PackItems>;
    projectPath: string;
    log: (line: string) => void;
    files?: RecordFiles;
    now?: () => Date;
    /**
     * How an install asks the SC for the one Admin step a pack can leave, and opens the Admin
     * (step 12): `askDuringOperation` and the dashboard's Admin opening, from `buildDatapackEngine`.
     * Absent, the step is left open on the record without a question.
     */
    asker?: RootStepAsker;
    /** Told once when a job ends, however it ends: the activity log's writer (step 14). */
    onJobEnd?: (end: JobEnd) => void;
}

/** How one job ended, for the activity log (`engineActivityLog.ts`). */
export interface JobEnd {
    activationId: string;
    operation: 'import' | 'delete';
    request: ImportRequest;
    perType: Record<string, DataTypeStatus>;
    reason?: string;
    note?: string;
    startedAt: number;
    finishedAt: number;
}

const NO_TARGET = 'Choose the website and store view to install into first.';

interface Job {
    perType: Record<string, DataTypeStatus>;
    reason?: string;
    /** What installing again kept because the SC had changed it (step 05), in one line. */
    note?: string;
    /** A removal kept containers holding the SC's things, so part of the pack is still in the store. */
    leftInStore?: boolean;
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

/**
 * Why the pack cannot be installed to this target, when the record says it is installed elsewhere:
 * a repeat install compares what it made where it made it, and one record spans one website. A
 * record made before the target was kept says it by the website its settings went to.
 */
async function elsewhere(deps: DemoBuilderEngineDeps, request: ImportRequest, target: TargetCodes): Promise<string | undefined> {
    const record = await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, request.id);
    if (!record) return undefined;
    const website = record.target?.websiteCode ?? settingsWebsite(record.created);
    const moved = website !== undefined && website !== target.websiteCode;
    const otherView = record.target !== undefined && record.target.storeCode !== target.storeCode;
    if (!moved && !otherView) return undefined;
    const where = moved ? `the website ${website}` : `the store view ${record.target?.storeCode}`;
    return `${request.id.name}@${request.id.version} is installed on ${where}. Remove it first, or install it there.`;
}

/** Install: the target, the rows, then each kind in order, its status moving as it runs. */
async function runInstall(deps: DemoBuilderEngineDeps, request: ImportRequest, job: Job): Promise<void> {
    if (!request.target) throw new Error(NO_TARGET);
    const conflict = await elsewhere(deps, request, request.target);
    if (conflict) throw new Error(conflict);
    const items = await deps.readPack(request.id, request.dataTypes, request.source ?? 'installer');
    const missing = request.dataTypes.filter((kind) => !(kind in items));
    if (missing.length > 0) throw new Error(`The pack holds no ${missing.join(', ')}.`);
    const commerce = await access(deps);
    const target = await resolveEngineTarget(commerce.get, request.target);
    const session = sessionFor(target);
    // Step 12: whether another store shows this store's root decides where a pack's own root goes.
    if (packRootOf(items.categories)) session.storeRoot = await readStoreRoot(commerce.get, request.target);
    const now = deps.now ?? (() => new Date());
    const recorder = await openInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, request.id, () => now().toISOString(), request.target);
    let current: string | undefined;
    const outcome = await installPack({ ...commerce, recorder, session, log: deps.log, asker: deps.asker }, items, (kind) => {
        if (current) job.perType[current] = 'success';
        current = kind;
        job.perType[kind] = 'processing';
    });
    job.note = [
        keptLine(outcome.kept),
        containersLine(outcome.containers),
        settingsLine(outcome.settings, 'Set'),
        underStoreRootLine(outcome.rootPlacement, items.categories, session.storeRoot),
        rootStepLine(outcome.rootStep),
    ].filter(Boolean).join(' ') || undefined;
    if (current) job.perType[current] = 'success';
}

/** Run a job in the background, ending every requested kind terminal whatever happens. */
function start(deps: DemoBuilderEngineDeps, jobs: Map<string, Job>, request: ImportRequest, operation: JobEnd['operation'], work: (job: Job) => Promise<void>): ImportStart {
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
            const { perType, reason, note, startedAt, finishedAt } = job;
            deps.onJobEnd?.({ activationId, operation, request, perType: { ...perType }, reason, note, startedAt, finishedAt });
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
                const conflict = await elsewhere(deps, request, request.target);
                if (conflict) return { valid: false, reason: conflict };
                await resolveEngineTarget((await access(deps)).get, request.target);
                return { valid: true };
            } catch (error) {
                return { valid: false, reason: errorText(error) };
            }
        },
        startImport: async (request) => start(deps, jobs, request, 'import', (job) => runInstall(deps, request, job)),
        startDelete: async (request) =>
            start(deps, jobs, request, 'delete', async (job) => {
                const result = await removePack(await access(deps), deps.files ?? nodeRecordFiles, { projectPath: deps.projectPath, pack: request.id });
                if (result.noRecord) throw new Error('Demo Builder did not install this pack in this project, so there is nothing of its to remove.');
                job.note = [containersLine(result.kept), settingsLine(result.settings, 'Put back')].filter(Boolean).join(' ') || undefined;
                if (result.kept.length > 0) job.leftInStore = true;
                for (const kind of Object.keys(job.perType)) job.perType[kind] = 'success';
            }),
        async getJobStatus(activationId) {
            const job = jobs.get(activationId);
            return {
                activationId,
                perType: { ...(job?.perType ?? {}) },
                hasRecord: job !== undefined,
                ...(job?.note ? { note: job.note } : {}),
                ...(job?.leftInStore ? { leftInStore: true } : {}),
                ...(job?.finishedAt !== undefined ? { processingTimeMs: job.finishedAt - job.startedAt } : {}),
            };
        },
        async getJobFailureReason(activationId) {
            const reason = jobs.get(activationId)?.reason;
            return reason ? { error: reason } : undefined;
        },
    };
}
