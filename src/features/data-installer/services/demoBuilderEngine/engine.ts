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
 * An install honours the request's kinds (`askedKinds.ts`). A removal does not take any: it takes
 * what the install record lists, so its checks ask nothing of the pack, which may be long gone.
 *
 * @module features/data-installer/services/demoBuilderEngine/engine
 */

import * as crypto from 'crypto';
import type { DataTypeStatus, ImportStart, InstallCheck, KeptRootStep, ValidationResult } from '../../types';
import { dataTypeLabel } from '../../ui/dataTypeLabel';
import type { CredentialCheck, ImportRequest } from '../dataInstallerWriteClient';
import type { DatapackEngine } from '../datapackEngine';
import { askedRows, kindsAddedFor } from './askedKinds';
import { type RecordFiles, type TargetCodes, nodeRecordFiles, openInstallRecord, readInstallRecord } from './installRecord';
import { resolveEngineTarget, sessionFor } from './installTarget';
import type { SkippedRow } from './kindContext';
import { type FindLayer, type LayerLookup, applySettingsLayer, layerKept, layerProblems, layerTroubleLine, lookUpAskedLayer, settingsDoneLine, withLayerRows } from './layerStep';
import { packRootOf, readStoreRoot, underStoreRootLine } from './packRoot';
import { type RootStepAsker, rootStepLine } from './packRootStep';
import { ambiguousKeysLine } from './productLookups';
import { skippedLine } from './refusedRows';
import { refusedRemovalsLine } from './removalRuns';
import { containersLine } from './removers';
import { keptLine, tookOutLine } from './repeatInstall';
import { type PackItems, PackRowsError, installPack, packRowProblems, removePack, unsupportedKinds } from './runPack';
import { STORE_CONFIG_KIND, settingsLine, settingsWebsite } from './storeConfigKind';
import { checkAfterInstall, holdsProductRows } from './verifyInstall';
import { andList } from '@/core/utils/andList';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What an SC will wonder next, measured on a live install: search took about 17 minutes (2026-11-03). */
const AFTER_PRODUCTS_LINES = [
    'Products can take up to 20 minutes to appear in storefront search.',
    "This datapack doesn't include product images. Products show the images that are in AEM Assets.",
];

/** What this engine needs from the project it installs into. */
export interface DemoBuilderEngineDeps {
    /** The project's signed Commerce access, or why there is none. */
    commerce: () => Promise<{ get: CommerceGet; send: CommerceSend } | { refusal: string }>;
    /** Every row the pack holds, from the store that holds it. What a request installs is decided here. */
    readPack: (id: DatapackId, source: DatapackStoreName) => Promise<PackItems>;
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
    /** The pack's settings layer from the library (step 09). Absent, a pack has none. */
    findLayer?: FindLayer;
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

/**
 * A removal of a pack this engine has no record of (step 14 item 20, owner 2026-10-30): refused,
 * with nothing matched by name, and the SC pointed at "Clear demo data" (`demoDataWipe/wipePlan.ts`),
 * which clears what Demo Builder did not install. Agents reach it as `check_demo_data` and `clear_demo_data`.
 */
const NO_RECORD =
    'Demo Builder did not install this pack in this project, so it has no record of what the pack made and removes ' +
    'nothing by name. To clear what an earlier install left in the store, use Clear Demo Data on the Data Installer screen.';

interface Job {
    perType: Record<string, DataTypeStatus>;
    reason?: string;
    /** What installing again kept because the SC had changed it (step 05), in one line. */
    note?: string;
    /** How far the kind in progress has got, when it can say ("450 of 2,046 products"). */
    detail?: string;
    /** A removal kept containers holding the SC's things, so part of the pack is still in the store. */
    leftInStore?: boolean;
    /** The kept root's Admin step (step 12), for the result's rows. */
    keptRoot?: KeptRootStep;
    /** Seconds each kind took, and when the kind in progress began (`JobStatusSnapshot.timings`). */
    timings: Record<string, number>;
    kindStartedAt?: number;
    /** Every row the install skipped, Commerce's reason whole. */
    skipped?: SkippedRow[];
    /** The store checked against the pack once the install's products are in (`checkAfterInstall`). */
    check?: InstallCheck;
    startedAt: number;
    finishedAt?: number;
}

/** Record the seconds the kind in progress took, once. */
function stopClock(job: Job, kind: string | undefined): void {
    if (!kind || job.kindStartedAt === undefined) return;
    job.timings[kind] = Math.round((Date.now() - job.kindStartedAt) / 100) / 10;
    job.kindStartedAt = undefined;
}

/** Close the kind in progress: its state, and the seconds it took. */
function endKind(job: Job, kind: string | undefined): void {
    if (!kind) return;
    job.perType[kind] = 'success';
    stopClock(job, kind);
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
async function elsewhere(deps: DemoBuilderEngineDeps, request: ImportRequest, target: TargetCodes, ask = 'Remove it first, or install it there.'): Promise<string | undefined> {
    const record = await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, request.id);
    if (!record) return undefined;
    const website = record.target?.websiteCode ?? settingsWebsite(record.created);
    const moved = website !== undefined && website !== target.websiteCode;
    const otherView = record.target !== undefined && record.target.storeCode !== target.storeCode;
    if (!moved && !otherView) return undefined;
    const where = moved ? `the website ${website}` : `the store view ${record.target?.storeCode}`;
    return `${request.id.name}@${request.id.version} is installed on ${where}. ${ask}`;
}

/** Why the pack cannot answer the request, when it lacks a kind the request asks for. */
function missingKinds(request: ImportRequest, items: PackItems): string | undefined {
    const missing = request.dataTypes.filter((kind) => !(kind in items));
    return missing.length > 0 ? `The pack holds no ${missing.join(', ')}.` : undefined;
}

/** The note's line for what an install added because the kinds asked for need it; the form ticks these itself. */
function addedKindsLine(all: PackItems, dataTypes: readonly string[]): string | undefined {
    const added = kindsAddedFor(all, dataTypes);
    return added.length > 0 ? `Also installed ${andList(added.map((kind) => dataTypeLabel(kind).toLowerCase()))}: the data types asked for need them.` : undefined;
}

/** Every reason the pack's and its layer's rows cannot be installed, before the first write. */
function rowProblems(items: PackItems, lookup: LayerLookup, websiteCode: string): string[] {
    return [...packRowProblems(items, websiteCode), ...layerProblems(lookup, websiteCode)];
}

/** Install: the target, the rows, then each kind in order, its status moving as it runs. */
async function runInstall(deps: DemoBuilderEngineDeps, request: ImportRequest, job: Job): Promise<void> {
    if (!request.target) throw new Error(NO_TARGET);
    const conflict = await elsewhere(deps, request, request.target);
    if (conflict) throw new Error(conflict);
    const all = await deps.readPack(request.id, request.source ?? 'installer');
    const items = askedRows(all, request.dataTypes);
    const lookup = await lookUpAskedLayer(deps.findLayer, request.id, all, request.dataTypes);
    const missing = missingKinds(request, withLayerRows(all, lookup));
    if (missing) throw new Error(missing);
    const refused = layerProblems(lookup, request.target.websiteCode);
    if (refused.length > 0) throw new PackRowsError(rowProblems(items, lookup, request.target.websiteCode));
    const commerce = await access(deps);
    const target = await resolveEngineTarget(commerce.get, request.target);
    const session = sessionFor(target);
    // Step 12: whether another store shows this store's root decides where a pack's own root goes.
    if (packRootOf(items.categories)) session.storeRoot = await readStoreRoot(commerce.get, request.target);
    const now = deps.now ?? (() => new Date());
    const recorder = await openInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, request.id, () => now().toISOString(), request.target);
    let current: string | undefined;
    const progress = (line: string): void => void (job.detail = line);
    const ctx = { ...commerce, recorder, session, log: deps.log, asker: deps.asker, progress };
    const outcome = await installPack(ctx, items, (kind) => {
        // Its rows are in, so the last kind's clock stops; it stays in progress to the end.
        if (kind === undefined) return stopClock(job, current);
        endKind(job, current);
        current = kind;
        job.kindStartedAt = Date.now();
        job.perType[kind] = 'processing';
        job.detail = undefined;
    });
    job.detail = undefined;
    // The last kind stays in progress through the layer: the watcher ends when every kind asked for
    // has, and the note says what the layer did (step 09).
    const layerStopped = await applySettingsLayer(ctx, lookup);
    if (STORE_CONFIG_KIND in job.perType && lookup.state === 'found') job.perType[STORE_CONFIG_KIND] = layerStopped ? 'error' : 'success';
    if (layerStopped) job.reason = layerStopped;
    // The last kind stays in progress through the check too, so whatever waits on the install waits for it.
    job.detail = 'Checking the products against the datapack';
    const checked = await checkAfterInstall(ctx, items, outcome.kept);
    job.detail = undefined;
    job.check = checked.check;
    job.note = [
        addedKindsLine(all, request.dataTypes),
        skippedLine(session.skipped),
        tookOutLine(outcome.tookOut),
        refusedRemovalsLine(outcome.notTakenOut, 'Installing'),
        keptLine([...outcome.kept, ...layerKept(lookup, ctx)]),
        containersLine(outcome.containers),
        settingsDoneLine(lookup, ctx),
        layerTroubleLine(lookup, layerStopped),
        underStoreRootLine(outcome.rootPlacement, items.categories, session.storeRoot),
        rootStepLine(outcome.rootStep),
        ambiguousKeysLine(session.ambiguousCategoryKeys),
        checked.line,
        ...(holdsProductRows(items) ? AFTER_PRODUCTS_LINES : []),
    ].filter(Boolean).join(' ') || undefined;
    job.skipped = session.skipped;
    endKind(job, current);
}

/** Run a job in the background, ending every requested kind terminal whatever happens. */
function start(deps: DemoBuilderEngineDeps, jobs: Map<string, Job>, request: ImportRequest, operation: JobEnd['operation'], work: (job: Job) => Promise<void>): ImportStart {
    const activationId = `demo-builder-${crypto.randomUUID()}`;
    const job: Job = { perType: Object.fromEntries(request.dataTypes.map((kind) => [kind, 'pending' as DataTypeStatus])), timings: {}, startedAt: Date.now() };
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
                // Step 14 item 2: the pack's rows, every kind's, as the install checks them before its first write.
                const all = await deps.readPack(request.id, request.source ?? 'installer');
                const items = askedRows(all, request.dataTypes);
                const lookup = await lookUpAskedLayer(deps.findLayer, request.id, all, request.dataTypes);
                const missing = missingKinds(request, withLayerRows(all, lookup));
                if (missing) return { valid: false, reason: missing };
                const problems = rowProblems(items, lookup, request.target.websiteCode);
                if (problems.length > 0) return { valid: false, reason: new PackRowsError(problems, 'would be').message };
                await resolveEngineTarget((await access(deps)).get, request.target);
                return { valid: true };
            } catch (error) {
                return { valid: false, reason: errorText(error) };
            }
        },
        async validateRemoval(request): Promise<ValidationResult> {
            try {
                // The one thing a removal needs of the request: that the store it names is where the record says.
                const conflict = request.target ? await elsewhere(deps, request, request.target, 'Choose that one to remove it.') : undefined;
                if (conflict) return { valid: false, reason: conflict };
                await access(deps);
                return { valid: true };
            } catch (error) {
                return { valid: false, reason: errorText(error) };
            }
        },
        startImport: async (request) => start(deps, jobs, request, 'import', (job) => runInstall(deps, request, job)),
        startDelete: async (request) =>
            start(deps, jobs, request, 'delete', async (job) => {
                const progress = (line: string): void => void (job.detail = line);
                const result = await removePack(await access(deps), deps.files ?? nodeRecordFiles, { projectPath: deps.projectPath, pack: request.id, log: deps.log, progress });
                job.detail = undefined;
                if (result.noRecord) throw new Error(NO_RECORD);
                const lines = [containersLine(result.kept), refusedRemovalsLine(result.refused, 'Removing'), settingsLine(result.settings, 'Put back')];
                job.note = lines.filter(Boolean).join(' ') || undefined;
                if (result.kept.length > 0 || result.refused.length > 0) job.leftInStore = true;
                if (result.keptRoot) job.keptRoot = result.keptRoot;
                for (const kind of Object.keys(job.perType)) job.perType[kind] = 'success';
            }),
        async getJobStatus(activationId) {
            const job = jobs.get(activationId);
            return {
                activationId,
                perType: { ...(job?.perType ?? {}) },
                hasRecord: job !== undefined,
                ...(job?.note ? { note: job.note } : {}),
                ...(job?.detail ? { detail: job.detail } : {}),
                ...(job?.leftInStore ? { leftInStore: true } : {}),
                ...(job?.keptRoot ? { keptRoot: job.keptRoot } : {}),
                ...(job && Object.keys(job.timings).length > 0 ? { timings: { ...job.timings } } : {}),
                ...(job?.check ? { check: job.check } : {}),
                ...(job?.skipped && job.skipped.length > 0 ? { skipped: job.skipped.map(({ kind, key, reason }) => ({ kind, key, reason })) } : {}),
                ...(job?.finishedAt !== undefined ? { processingTimeMs: job.finishedAt - job.startedAt } : {}),
            };
        },
        async getJobFailureReason(activationId) {
            const reason = jobs.get(activationId)?.reason;
            return reason ? { error: reason } : undefined;
        },
    };
}
