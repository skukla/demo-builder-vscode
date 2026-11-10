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
import { type DataTypeStatus, ENGINE_PHASES, FINISHING_STOP, REPLACE_STOP, type ImportStart, type InstallCheck, type JobStatusSnapshot, type KeptRootStep, type ValidationResult } from '../../types';
import type { DatapackEngine } from '../datapackEngine';
import type { CredentialCheck, ImportRequest } from '../importRequest';
import { addedKindsLine, askedRows, missingKinds } from './askedKinds';
import { removeRecordedPack, removeReplacedPack } from './engineRemoval';
import { AFTER_PRODUCTS_LINES, type NoteLine, noteOf, rowNotesOf } from './installNote';
import { type RecordFiles, type TargetCodes, nodeRecordFiles, openInstallRecord, readInstallRecord } from './installRecord';
import { resolveEngineTarget, sessionFor } from './installTarget';
import { timed } from './jobClock';
import type { SkippedRow } from './kindContext';
import { type FindLayer, type LayerLookup, applySettingsLayer, layerKept, layerProblems, layerTroubleLine, lookUpAskedLayer, settingsDoneLine, withLayerRows } from './layerStep';
import { packRootOf, readStoreRoot, underStoreRootLine } from './packRoot';
import { type RootStepAsker, rootStepLine } from './packRootStep';
import { ambiguousKeysLine } from './productLookups';
import { reuseComparison } from './recentComparison';
import { isWorthRetrying, skippedLine } from './refusedRows';
import { refusedRemovalsLine } from './removalRuns';
import { containersLine } from './removers';
import { keptLine, tookOutLine } from './repeatInstall';
import { type PackItems, PackRowsError, installPack, packRowProblems, refusedKindsReason, unsupportedKinds } from './runPack';
import { STORE_CONFIG_KIND, settingsWebsite } from './storeConfigKind';
import { checkAfterInstall } from './verifyInstall';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

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

/** What the job is doing at its end; also `detail`, which notifications and agents read. */
const CHECK_PHASE = ENGINE_PHASES.checking;

const NO_TARGET = 'Choose the website and store view to install into first.';

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
    /** The kind that failed: in progress when the job stopped, or the settings layer, which fails without stopping it. */
    stoppedAt?: string;
    /** Whether running the install again could get past what stopped it (`isWorthRetrying`). */
    retryable?: boolean;
    /** What the job is doing while no one kind is: reading the store first, the check at the end. */
    phase?: string;
    /** Every kind's rows are in: a stop from here is the finishing work's, not the last kind's. */
    finishing?: boolean;
    /** The note's lines the SC needs to read; the rest are for the record and agents. */
    scLines?: string[];
    /** When the install wrote products: how long until storefront search shows them. */
    searchDelay?: string;
    /** A line for each data type with a problem that did not stop the install (`rowNotesOf`). */
    rowNotes?: Record<string, string>;
    /** Removing the pack the import replaces (walk F97), before anything is installed. */
    replacing?: DataTypeStatus;
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

/** Where a job stopped: removing the pack it replaces, the finishing work, or the kind in progress. */
function stopOf(job: Job): string | undefined {
    if (job.replacing === 'error') return REPLACE_STOP;
    if (job.finishing) return FINISHING_STOP;
    return Object.keys(job.perType).find((kind) => job.perType[kind] === 'processing');
}

/**
 * Mark every kind not yet finished as failed: the covering set must end terminal. Once every kind's
 * rows are in, the one kept in progress is done, and the stop is the finishing work's.
 */
function failRest(job: Job, error: unknown): void {
    job.reason = errorText(error);
    job.phase = job.detail = undefined;
    // A removal of the pack it replaces that stopped: nothing was installed, and its row says why.
    if (job.replacing === 'processing') job.replacing = 'error';
    const stoppedAt = stopOf(job);
    if (stoppedAt) job.stoppedAt = stoppedAt;
    job.retryable = isWorthRetrying(error);
    for (const [kind, status] of Object.entries(job.perType)) {
        if (job.finishing && status === 'processing') job.perType[kind] = 'success';
        else if (status === 'pending' || status === 'processing') job.perType[kind] = 'error';
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
async function elsewhere(deps: DemoBuilderEngineDeps, request: ImportRequest, target: TargetCodes, ask = 'Uninstall it first, or install it there.'): Promise<string | undefined> {
    const record = await readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, request.id);
    if (!record) return undefined;
    const website = record.target?.websiteCode ?? settingsWebsite(record.created);
    const moved = website !== undefined && website !== target.websiteCode;
    const otherView = record.target !== undefined && record.target.storeCode !== target.storeCode;
    if (!moved && !otherView) return undefined;
    const where = moved ? `the website ${website}` : `the store view ${record.target?.storeCode}`;
    return `${request.id.name}@${request.id.version} is installed on ${where}. ${ask}`;
}

/** Every reason the pack's and its layer's rows cannot be installed, before the first write. */
function rowProblems(items: PackItems, lookup: LayerLookup, websiteCode: string): string[] {
    return [...packRowProblems(items, websiteCode), ...layerProblems(lookup, websiteCode)];
}

/** Install: the target, the rows, then each kind in order, its status moving as it runs. */
async function runInstall(deps: DemoBuilderEngineDeps, request: ImportRequest, job: Job): Promise<void> {
    const wanted = request.target;
    if (!wanted) throw new Error(NO_TARGET);
    const conflict = await timed(deps.log, `Install of ${request.id.name}: checked other websites`, () => elsewhere(deps, request, wanted));
    if (conflict) throw new Error(conflict);
    job.phase = ENGINE_PHASES.reading;
    const all = await timed(deps.log, `Install of ${request.id.name}: read the datapack`, () => deps.readPack(request.id, request.source ?? 'installer'));
    const items = askedRows(all, request.dataTypes);
    const lookup = await lookUpAskedLayer(deps.findLayer, request.id, all, request.dataTypes);
    const missing = missingKinds(request, withLayerRows(all, lookup));
    if (missing) throw new Error(missing);
    const refused = layerProblems(lookup, wanted.websiteCode);
    if (refused.length > 0) throw new PackRowsError(rowProblems(items, lookup, wanted.websiteCode));
    const commerce = await access(deps);
    // Walk F97: the pack this replaces goes first, once this one is known to install; a removal that fails installs nothing.
    const replaced = request.replaces ? await removeReplacedPack(job, commerce, deps.files ?? nodeRecordFiles, { ...deps, pack: request.replaces }) : undefined;
    const target = await resolveEngineTarget(commerce.get, wanted);
    const session = sessionFor(target);
    // Step 12: whether another store shows this store's root decides where a pack's own root goes.
    if (packRootOf(items.categories)) session.storeRoot = await readStoreRoot(commerce.get, wanted);
    const now = deps.now ?? (() => new Date());
    const recorder = await openInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, request.id, () => now().toISOString(), wanted);
    let current: string | undefined;
    const progress = (line: string): void => void (job.detail = line);
    const ctx = { ...commerce, recorder, session, log: deps.log, asker: deps.asker, progress };
    // Reading what an earlier install made, before the first kind: the long wait of an install run again.
    job.phase = ENGINE_PHASES.comparing;
    const earlier = reuseComparison(deps, request.id, wanted);
    const outcome = await installPack(ctx, items, (kind) => {
        // Its rows are in, so the last kind's clock stops; it stays in progress to the end, while
        // the engine takes out what the pack dropped and reads back what it wrote.
        job.phase = kind === undefined ? ENGINE_PHASES.recording : undefined;
        if (kind === undefined) {
            job.finishing = true;
            return stopClock(job, current);
        }
        endKind(job, current);
        current = kind;
        job.kindStartedAt = Date.now();
        job.perType[kind] = 'processing';
        job.detail = undefined;
    }, earlier);
    job.detail = undefined;
    // The last kind stays in progress through the layer: the watcher ends when every kind asked for
    // has, and the note says what the layer did (step 09).
    if (lookup.state === 'found') job.phase = ENGINE_PHASES.settings;
    const layerStopped = await applySettingsLayer(ctx, lookup);
    if (STORE_CONFIG_KIND in job.perType && lookup.state === 'found') job.perType[STORE_CONFIG_KIND] = layerStopped ? 'error' : 'success';
    if (layerStopped) {
        // The settings are the one kind that can fail without stopping the job: its row says why.
        job.reason = layerStopped;
        job.stoppedAt = STORE_CONFIG_KIND;
    }
    // The last kind stays in progress through the check too, so whatever waits on the install waits for it.
    job.detail = job.phase = CHECK_PHASE;
    const checked = await checkAfterInstall(ctx, items, outcome.kept, outcome.productsRead);
    job.detail = job.phase = undefined;
    job.check = checked.check;
    Object.assign(job, noteOf([
        [replaced, true],
        [addedKindsLine(all, request.dataTypes), false],
        [skippedLine(session.skipped), false],
        [tookOutLine(outcome.tookOut), true],
        [refusedRemovalsLine(outcome.notTakenOut, 'Installing'), true],
        [keptLine([...outcome.kept, ...layerKept(lookup, ctx)]), true],
        [containersLine(outcome.containers), true],
        [settingsDoneLine(lookup, ctx), false],
        [layerTroubleLine(lookup, layerStopped), true],
        [underStoreRootLine(outcome.rootPlacement, items.categories, session.storeRoot), false],
        [rootStepLine(outcome.rootStep), outcome.rootStep?.state !== 'done'],
        [ambiguousKeysLine(session.ambiguousCategoryKeys), false],
        [checked.line, false],
        ...(outcome.productsWritten ? AFTER_PRODUCTS_LINES.map((line): NoteLine => [line, false]) : []),
    ]));
    if (outcome.productsWritten) job.searchDelay = AFTER_PRODUCTS_LINES[0];
    const rowNotes = rowNotesOf(session.skipped);
    if (Object.keys(rowNotes).length > 0) job.rowNotes = rowNotes;
    job.skipped = session.skipped;
    endKind(job, current);
}

/** What the window draws from a job beyond its kinds' states: what it is doing, where it stopped, what to read. */
function whereItStands(job: Job): Pick<JobStatusSnapshot, 'phase' | 'stoppedAt' | 'retryable' | 'scLines' | 'searchDelay' | 'rowNotes' | 'replacing'> {
    return {
        ...(job.rowNotes ? { rowNotes: job.rowNotes } : {}),
        ...(job.phase ? { phase: job.phase } : {}),
        ...(job.stoppedAt ? { stoppedAt: job.stoppedAt } : {}),
        ...(job.retryable ? { retryable: true } : {}),
        ...(job.scLines ? { scLines: job.scLines } : {}),
        ...(job.searchDelay ? { searchDelay: job.searchDelay } : {}),
        ...(job.replacing ? { replacing: job.replacing } : {}),
    };
}

/** Run a job in the background, ending every requested kind terminal whatever happens. */
function start(deps: DemoBuilderEngineDeps, jobs: Map<string, Job>, request: ImportRequest, operation: JobEnd['operation'], work: (job: Job) => Promise<void>): ImportStart {
    const activationId = `demo-builder-${crypto.randomUUID()}`;
    const job: Job = { perType: Object.fromEntries(request.dataTypes.map((kind) => [kind, 'pending' as DataTypeStatus])), timings: {}, startedAt: Date.now() };
    jobs.set(activationId, job);
    void work(job)
        .catch((error: unknown) => {
            deps.log(`[Data Installer] Demo Builder engine: ${request.id.name}@${request.id.version} stopped: ${errorText(error)}`);
            failRest(job, error);
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
                if (unsupported.length > 0) return { valid: false, reason: refusedKindsReason(unsupported) };
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
                const conflict = request.target ? await elsewhere(deps, request, request.target, 'Choose that one to uninstall it.') : undefined;
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
                const result = await removeRecordedPack(await access(deps), deps.files ?? nodeRecordFiles, { projectPath: deps.projectPath, pack: request.id, log: deps.log, progress });
                job.detail = undefined;
                job.note = result.note;
                if (result.leftInStore) job.leftInStore = true;
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
                ...(job ? whereItStands(job) : {}),
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
