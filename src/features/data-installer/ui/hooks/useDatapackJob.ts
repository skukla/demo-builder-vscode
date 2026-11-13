/**
 * The requests behind a datapack job window (step 03, S4, S6 and S7), and the events they send its
 * phases (`datapackJob.ts`): the job's status, the check (`useJobReads`), Review Records' read, Dry
 * Run, and the one start the window's kind makes: Install and Switch start an import, Uninstall a
 * removal (`reset-datapack`).
 *
 * Kept from the window this replaced:
 * - **The result is keyed on the LAST ACTION** (`resolveResult`), and **the job watched is the one
 *   the last action started**: request state persists after settling.
 * - A window that finds a job already running (opened by Undo, Restore, or on an agent's job)
 *   watches THAT job, and its end is its result.
 * - **The target comes from the project**: its instance and its recorded website and store view,
 *   sent verbatim, never a picker. No instance: the no-instance result.
 * - **A switch's or an uninstall's answer about the SC's changes rides on its start**: keep, with a
 *   new datapack's name when the datapack is not theirs, or drop. An uninstall's Retry takes out what
 *   its record still lists, losing nothing more: a save made first is already behind it.
 *
 * @module features/data-installer/ui/hooks/useDatapackJob
 */

import { type Dispatch, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { replacedName } from '../../replaceWords';
import type { ImportJobRecord } from '../../types';
import { STATUS_POLL_MS } from '../components/importModalJob';
import { resolveResult, type ResultContent } from '../components/importResult';
import {
    datapackJob,
    startJob,
    type JobEvent,
    type JobKind,
    type JobState,
} from '../components/job/datapackJob';
import type { TypeRow } from '../components/job/installRows';
import { type DataInstallerRequest, useDataInstallerRequest } from './useDataInstallerRequest';
import { type ImportRuns, useImportRetry } from './useImportRetry';
import { useJobPickup } from './useJobPickup';
import { useJobReads, useRequestBody } from './useJobReads';
import { type RemovalAnswer, type SwitchChanges, useSavingStage } from './useSwitchChanges';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import type { DatapackRecordsResult } from '@/types/webviewRequests';

export interface DatapackJobArgs {
    id: DatapackId;
    displayName: string;
    source?: DatapackStoreName;
    /** The whole pack's data types: an install sends every one (decisions Phase 3, J2-1). */
    types: string[];
    /** The pack's types are still being read (`useVersionTypes`). */
    readingTypes: boolean;
    kind: JobKind;
    /** A switch's or an uninstall's: the SC's own datapacks' names, which a new one may not take. */
    ownNames: readonly string[];
}

/** A switch's or an uninstall's part of the job: the SC's changes and the save question's answers. */
export interface JobSwitch {
    changes: SwitchChanges;
    /** The held datapack, as a switch's run's Uninstall row names it. */
    heldName?: string;
    /** The save's stage while the start waits on it. */
    savingStage?: string;
    /** Where the save made first went, once the SC chose to save: the run's Save Your Changes says it. */
    savedTo?: string;
    /** Switch or Uninstall pressed: the save question, or the run. */
    press: () => void;
    /** The save question answered. */
    answer: (saves: boolean) => void;
}

export interface DatapackJob {
    state: JobState;
    rows: TypeRow[];
    /** The type table's read failed: the summary says so. */
    checkFailed: boolean;
    records: DatapackRecordsResult['records'] | null;
    recordsReading: boolean;
    result: ResultContent | null;
    /** The job watched, once its record is read. */
    record: ImportJobRecord | null;
    /** The start was pressed and its job has not been recorded yet. */
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

/** A switch's or an uninstall's start may save the SC's changes first, and answers after it (walk F105). */
const SAVE_THEN_WRITE = { timeout: TIMEOUTS.DATAPACK_SAVE_THEN_WRITE };
/** The message asking for the one-time tip about the setting (webview only; agents never send it). */
const SAVE_QUESTION_ANSWERED = 'datapack-save-question-answered';

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

/**
 * The start: Install, Switch or Uninstall with its answer about the SC's changes, and Retry. An
 * uninstall's Retry takes out what the stopped job's record still lists, and drops: whatever was to
 * be saved was saved before that job began, and the record moved onto the save.
 */
function useJobStart(kind: JobKind, body: () => object, dispatch: Dispatch<JobEvent>) {
    const start = useDataInstallerRequest<{ activationId: string }>(
        kind === 'uninstall' ? 'reset-datapack' : 'start-datapack-import',
        SAVE_THEN_WRITE,
    );
    // The answer, kept so a run started again sends the same one; and what a Retry takes out.
    const answer = useRef<RemovalAnswer | undefined>(undefined);
    const again = useRef<object | undefined>(undefined);
    const [savesFirst, setSavesFirst] = useState(false);
    const loadStart = start.load;
    const runStart = useCallback((): void => {
        dispatch({ type: 'start' });
        loadStart({ ...body(), ...again.current, ...answer.current });
    }, [loadStart, body, dispatch]);
    const runs = useImportRetry(runStart);
    const { startImport, retry } = runs;
    const startWith = useCallback(
        (given: RemovalAnswer): void => {
            answer.current = given;
            again.current = undefined;
            setSavesFirst(given.changes === 'keep');
            startImport();
        },
        [startImport],
    );
    const retryFrom = useCallback(
        (record: ImportJobRecord | null): void => {
            if (kind === 'uninstall' && record) {
                again.current = { datapackName: record.datapackName, version: record.version };
                answer.current = { changes: 'drop' };
                setSavesFirst(false);
            }
            retry();
        },
        [kind, retry],
    );
    return { start, runs, startWith, retryFrom, savesFirst };
}

/** Where a save made first goes: into the SC's own datapack, or the new one by the name given. */
function savedToOf(starts: ReturnType<typeof useJobStart>, changes: SwitchChanges, name: string | undefined) {
    if (!starts.savesFirst) return undefined;
    return changes.saveAs?.name.trim() ?? name;
}

/** What a switch or an uninstall adds: the press, the save question's answers, the save's stage. */
function useJobSwitch(
    args: DatapackJobArgs,
    checks: ReturnType<typeof useJobReads>,
    starts: ReturnType<typeof useJobStart>,
    dispatch: Dispatch<JobEvent>,
): JobSwitch {
    const { changes } = checks;
    const savingStage = useSavingStage(starts.savesFirst && starts.start.loading);
    const held = checks.target.value?.datapack;
    // As the run's Uninstall row names it: "Luma", or "Luma, eds-compatible" for a named version.
    const heldName = held ? replacedName(held, checks.target.value?.heldName ?? held.name) : undefined;
    const savedTo = savedToOf(starts, changes, args.kind === 'uninstall' ? args.displayName : heldName);
    return {
        changes,
        ...(heldName ? { heldName } : {}),
        ...(savingStage ? { savingStage } : {}),
        ...(savedTo ? { savedTo } : {}),
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
    // The one write this window makes: the job watched is the one it started, else the one found.
    const wrote = state.lastAction === 'start' || state.lastAction === 'reset';
    const started = state.lastAction ? start.value?.activationId : watch.found;
    const pickingUp = useJobPickup(
        wrote ? start.value?.activationId : undefined,
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
              reset: start,
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
    send: { pack: object; body: () => object; runs: ImportRuns; retry: () => void },
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
        retry: send.retry,
        fixWithAi: runs.fixWithAi,
        fixDryRun: runs.fixDryRunWithAi,
    };
}

export function useDatapackJob(args: DatapackJobArgs): DatapackJob {
    const [state, dispatch] = useReducer(datapackJob, args.kind, startJob);
    const checks = useJobReads(args);
    const { target, table, pack } = checks;
    const dry = useDataInstallerRequest<{ valid: boolean; reason?: string }>('validate-datapack-import');
    const records = useDataInstallerRequest<DatapackRecordsResult>('get-datapack-records');
    const watch = useJobStatus(state);
    const body = useRequestBody(args, target.value, pack);
    const starts = useJobStart(args.kind, body, dispatch);
    const switching = useJobSwitch(args, checks, starts, dispatch);
    const heldName = switching.heldName;
    const { result, starting } = useJobResult(args, state, { dry, starts, watch, heldName });
    const settled = target.settled && watch.status.settled && table.settled && checks.changes.settled;
    const noInstance = target.settled && !target.value?.instance;
    useJobPhases(state, dispatch, {
        running: watch.running,
        checked: settled && !args.readingTypes,
        noInstance,
        result,
    });
    const { retryFrom } = starts;
    const retry = useCallback(() => retryFrom(watch.record), [retryFrom, watch.record]);
    return {
        state,
        rows: table.rows,
        checkFailed: table.failed,
        records: records.value?.records ?? null,
        recordsReading: !records.settled,
        result,
        record: watch.record,
        starting,
        running: watch.running,
        retries: starts.runs.retries,
        switching,
        ...jobPresses(dispatch, { records, dry }, { pack, body, runs: starts.runs, retry }),
    };
}
