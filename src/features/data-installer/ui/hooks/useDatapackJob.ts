/**
 * The requests behind a datapack job window (step 03, S4 and S6), and the events they send its
 * phases (`datapackJob.ts`): the project's target, the job's status, the check
 * (`preview-datapack-changes`, for every install and switch; a switch also reads the held
 * datapack's changes, `useSwitchChanges`), Review Records' read, Dry Run, Install and Switch.
 *
 * Kept from the window this replaces (`ImportDatapackModal`):
 * - **The result is keyed on the LAST ACTION** (`resolveResult`), and **the job watched is the one
 *   the last action started** (`watchedActivation`): request state persists after settling.
 * - A window that finds a job already running (opened by Undo, Restore, or on an agent's job)
 *   watches THAT job, and its end is its result.
 * - **The target comes from the project**: its instance and its recorded website and store view,
 *   sent verbatim, never a picker. No instance: the no-instance result.
 * - **A switch's answer about the SC's changes rides on its start** (`settleReplacement`): keep,
 *   with a new datapack's name when the held one is not theirs, or drop.
 *
 * @module features/data-installer/ui/hooks/useDatapackJob
 */

import { type Dispatch, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { replacedName } from '../../replaceWords';
import type { ChangePreview } from '../../services/demoBuilderEngine/storeChanges';
import type { ImportJobRecord } from '../../types';
import { libraryField, STATUS_POLL_MS } from '../components/importModalJob';
import { watchedActivation } from '../components/importModalView';
import { resolveResult, type ResultContent } from '../components/importResult';
import {
    datapackJob,
    startJob,
    type JobEvent,
    type JobKind,
    type JobState,
} from '../components/job/datapackJob';
import { installRows, type TypeRow } from '../components/job/installRows';
import type { RemovalAnswer } from '../components/removalConfirm';
import { type DataInstallerRequest, useDataInstallerRequest } from './useDataInstallerRequest';
import { type ImportRuns, useImportRetry } from './useImportRetry';
import { useJobPickup } from './useJobPickup';
import {
    type SwitchChanges,
    type SwitchedFrom,
    useSavingStage,
    useSwitchChanges,
} from './useSwitchChanges';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import type { DatapackRecordsResult } from '@/types/webviewRequests';

/** What `get-datapack-import-target` says of the open project. */
interface JobTarget extends SwitchedFrom {
    instance?: string;
    scope?: { websiteCode: string; storeCode: string };
}

export interface DatapackJobArgs {
    id: DatapackId;
    displayName: string;
    source?: DatapackStoreName;
    /** The whole pack's data types: an install sends every one (decisions Phase 3, J2-1). */
    types: string[];
    /** The pack's types are still being read (`useVersionTypes`). */
    readingTypes: boolean;
    kind: JobKind;
    /** A switch's: the SC's own datapacks' names, which a new one may not take. */
    ownNames: readonly string[];
}

/** A switch's part of the job: the held datapack's changes and the save question's answers. */
export interface JobSwitch {
    changes: SwitchChanges;
    /** The held datapack, as the run's Uninstall row names it. */
    heldName?: string;
    /** The save's stage while the start waits on it. */
    savingStage?: string;
    /** Switch pressed: the save question, or the run. */
    press: () => void;
    /** The save question answered. */
    answer: (saves: boolean) => void;
}

export interface DatapackJob {
    state: JobState;
    rows: TypeRow[];
    /** The check could not be read: the summary says so. */
    checkFailed: boolean;
    records: DatapackRecordsResult['records'] | null;
    recordsReading: boolean;
    result: ResultContent | null;
    /** The job watched, once its record is read. */
    record: ImportJobRecord | null;
    /** Install was pressed and its job has not been recorded yet. */
    starting: boolean;
    /** The job watched is running. */
    running: boolean;
    retries: number;
    switching: JobSwitch;
    review: () => void;
    back: () => void;
    dryRun: () => void;
    install: () => void;
    retry: () => void;
    fixWithAi: () => void;
    /** Fix with AI on a Dry Run that found a problem. */
    fixDryRun: () => void;
}

const COMPARE = { timeout: TIMEOUTS.DATAPACK_IMPORT_COMPARE };
/** A switch's start may save the SC's changes first, and answers after the save (walk F105). */
const SAVE_THEN_WRITE = { timeout: TIMEOUTS.DATAPACK_SAVE_THEN_WRITE };
const NO_ROWS: TypeRow[] = [];
/** The message asking for the one-time tip about the setting (webview only; agents never send it). */
const SAVE_QUESTION_ANSWERED = 'datapack-save-question-answered';

/** A removal never starts from this window; `resolveResult` still reads one. */
const NO_RESET: DataInstallerRequest<{ activationId: string; savedNote?: string }> = {
    settled: false,
    load: () => undefined,
    loading: false,
    value: null,
    failure: null,
};

/** The job's status: read on open, again while it runs, and the running job it found, if any. */
function useJobStatus(state: JobState) {
    const status = useDataInstallerRequest<ImportJobRecord | null>('get-datapack-import-status');
    const record = status.value ?? null;
    const running = record?.outcome === 'watching';
    const { load } = status;
    useEffect(() => load({}), [load]);
    useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => load({}), STATUS_POLL_MS);
        return () => clearInterval(timer);
    }, [running, load]);
    // A job found running, or the one a window opened on a run was opened for, is the one watched.
    const [found, setFound] = useState<string | undefined>(undefined);
    const watches =
        record !== null && state.lastAction === null && (running || state.kind === 'watch');
    if (watches && found === undefined) setFound(record.activationId);
    return { status, record, running, found };
}

/** The check's reads: the target, and the preview of what installing changes. */
function useJobChecks(args: DatapackJobArgs) {
    const { id, source, kind } = args;
    const target = useDataInstallerRequest<JobTarget>('get-datapack-import-target');
    const preview = useDataInstallerRequest<ChangePreview>('preview-datapack-changes', COMPARE);
    const pack = useMemo(
        () => ({ datapackName: id.name, version: id.version, ...libraryField(source) }),
        [id, source],
    );
    const loadTarget = target.load;
    const loadPreview = preview.load;
    useEffect(() => {
        loadTarget({});
        if (kind !== 'watch') loadPreview(pack);
    }, [loadTarget, loadPreview, kind, pack]);
    const changes = useSwitchChanges(kind === 'switch', target.value, args.ownNames);
    return { target, preview, pack, changes };
}

/** The request body Dry Run and every start send: the whole pack, to the project's target. */
function useRequestBody(args: DatapackJobArgs, target: JobTarget | null, pack: object) {
    const instance = target?.instance ?? '';
    const scope = target?.scope;
    const { types } = args;
    return useCallback(
        () => ({
            ...pack,
            commerceInstance: instance,
            dataTypes: types,
            ...(scope ? { websiteCode: scope.websiteCode, storeCode: scope.storeCode } : {}),
        }),
        [pack, instance, types, scope],
    );
}

/** The start: Install, Retry, or Switch with its answer about the SC's changes. */
function useJobStart(body: () => object, dispatch: Dispatch<JobEvent>) {
    const start = useDataInstallerRequest<{ activationId: string }>(
        'start-datapack-import',
        SAVE_THEN_WRITE,
    );
    // The switch's answer, kept so a run started again sends the same one.
    const answer = useRef<RemovalAnswer | undefined>(undefined);
    const [savesFirst, setSavesFirst] = useState(false);
    const loadStart = start.load;
    const runStart = useCallback((): void => {
        dispatch({ type: 'start' });
        loadStart({ ...body(), ...answer.current });
    }, [loadStart, body, dispatch]);
    const runs = useImportRetry(runStart);
    const { startImport } = runs;
    const startWith = useCallback(
        (given: RemovalAnswer): void => {
            answer.current = given;
            setSavesFirst(given.changes === 'keep');
            startImport();
        },
        [startImport],
    );
    return { start, runs, startWith, savesFirst };
}

/** What a switch adds: Switch's press, the save question's answers, and the save's stage. */
function useJobSwitch(
    checks: ReturnType<typeof useJobChecks>,
    starts: ReturnType<typeof useJobStart>,
    dispatch: Dispatch<JobEvent>,
): JobSwitch {
    const { changes } = checks;
    const savingStage = useSavingStage(starts.savesFirst && starts.start.loading);
    const held = checks.target.value?.datapack;
    // As the run's Uninstall row names it: "Luma", or "Luma, eds-compatible" for a named version.
    const heldName = held ? replacedName(held, checks.target.value?.heldName ?? held.name) : undefined;
    return {
        changes,
        ...(heldName ? { heldName } : {}),
        ...(savingStage ? { savingStage } : {}),
        press: () => {
            const next = changes.onSwitch();
            if (next === 'ask') dispatch({ type: 'save-first' });
            else starts.startWith(next);
        },
        answer: (saves) => {
            webviewClient.postMessage(SAVE_QUESTION_ANSWERED);
            starts.startWith(changes.answer(saves));
        },
    };
}

/** The phase each answer moves the job to: the check's end, a Dry Run's answer, the run's end. */
function useJobPhases(
    state: JobState,
    dispatch: Dispatch<JobEvent>,
    seen: { running: boolean; checked: boolean; noInstance: boolean; result: ResultContent | null },
): void {
    const { phase } = state;
    const { running, checked, noInstance, result } = seen;
    useEffect(() => {
        if (phase !== 'check') return;
        if (running) dispatch({ type: 'running' });
        else if (noInstance) dispatch({ type: 'no-instance' });
        else if (checked) dispatch({ type: 'checked' });
    }, [phase, running, noInstance, checked, dispatch]);
    useEffect(() => {
        if (phase === 'dry-wait' && result) dispatch({ type: 'dry-answered' });
        if (phase === 'run' && result)
            dispatch({ type: 'ended', clean: result.finished === true && !result.run });
    }, [phase, result, dispatch]);
}

/** What the result reads: the last action's request, the job watched, a switch's failed save. */
function useJobResult(
    args: DatapackJobArgs,
    state: JobState,
    reqs: {
        dry: DataInstallerRequest<{ valid: boolean; reason?: string }>;
        starts: ReturnType<typeof useJobStart>;
        watch: ReturnType<typeof useJobStatus>;
        heldName?: string;
    },
) {
    const { dry, starts, watch, heldName } = reqs;
    const { start, runs } = starts;
    const started = state.lastAction
        ? watchedActivation(state.lastAction, start.value?.activationId, undefined)
        : watch.found;
    const pickingUp = useJobPickup(
        state.lastAction === 'start' ? start.value?.activationId : undefined,
        watch.record,
        watch.status.loading,
        watch.status.load,
    );
    const busy = dry.loading || start.loading || pickingUp;
    const action = state.lastAction ?? (watch.found ? 'start' : null);
    const replacing =
        state.kind === 'switch' && heldName ? { replacing: { name: heldName, dataTypes: args.types } } : {};
    const result = busy
        ? null
        : resolveResult(action, {
              name: args.displayName,
              retries: runs.retries,
              dryRun: dry,
              start,
              reset: NO_RESET,
              record: watch.record,
              startedActivation: started,
              ...replacing,
          });
    return { result, starting: start.loading || pickingUp };
}

/** The presses every window offers: Review Records, Back, Dry Run, Install and its ends. */
function jobPresses(
    dispatch: Dispatch<JobEvent>,
    reads: { records: DataInstallerRequest<DatapackRecordsResult>; dry: DataInstallerRequest<unknown> },
    send: { pack: object; body: () => object; runs: ImportRuns },
) {
    const { records, dry } = reads;
    const { runs } = send;
    return {
        review: () => {
            dispatch({ type: 'review' });
            if (!records.settled && !records.loading) records.load(send.pack);
        },
        back: () => dispatch({ type: 'back' }),
        dryRun: () => {
            dispatch({ type: 'dry-run' });
            dry.load(send.body());
        },
        install: runs.startImport,
        retry: runs.retry,
        fixWithAi: runs.fixWithAi,
        fixDryRun: runs.fixDryRunWithAi,
    };
}

export function useDatapackJob(args: DatapackJobArgs): DatapackJob {
    const [state, dispatch] = useReducer(datapackJob, args.kind, startJob);
    const checks = useJobChecks(args);
    const { target, preview, pack } = checks;
    const dry = useDataInstallerRequest<{ valid: boolean; reason?: string }>('validate-datapack-import');
    const records = useDataInstallerRequest<DatapackRecordsResult>('get-datapack-records');
    const watch = useJobStatus(state);
    const body = useRequestBody(args, target.value, pack);
    const starts = useJobStart(body, dispatch);
    const switching = useJobSwitch(checks, starts, dispatch);
    const heldName = switching.heldName;
    const { result, starting } = useJobResult(args, state, { dry, starts, watch, heldName });
    const settled = target.settled && watch.status.settled && preview.settled && checks.changes.settled;
    const noInstance = target.settled && !target.value?.instance;
    useJobPhases(state, dispatch, {
        running: watch.running,
        checked: settled && !args.readingTypes,
        noInstance,
        result,
    });
    const kinds = preview.value?.kinds;
    const rows = useMemo(() => (kinds ? installRows(kinds) : NO_ROWS), [kinds]);
    return {
        state,
        rows,
        checkFailed: preview.failure !== null,
        records: records.value?.records ?? null,
        recordsReading: !records.settled,
        result,
        record: watch.record,
        starting,
        running: watch.running,
        retries: starts.runs.retries,
        switching,
        ...jobPresses(dispatch, { records, dry }, { pack, body, runs: starts.runs }),
    };
}
