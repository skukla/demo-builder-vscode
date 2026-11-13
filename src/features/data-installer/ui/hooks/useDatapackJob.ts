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
 * Its parts are their own hooks: `useJobStatus`, `useJobStart`, `useJobSwitch`, `useJobResult`
 * and `useJobPhases`.
 *
 * @module features/data-installer/ui/hooks/useDatapackJob
 */

import { type Dispatch, useCallback, useReducer } from 'react';
import type { ImportJobRecord } from '../../types';
import type { ResultContent } from '../components/importResult';
import {
    datapackJob,
    startJob,
    type JobEvent,
    type JobKind,
    type JobState,
} from '../components/job/datapackJob';
import type { TypeRow } from '../components/job/installRows';
import { type DataInstallerRequest, useDataInstallerRequest } from './useDataInstallerRequest';
import type { ImportRuns } from './useImportRetry';
import { useJobPhases } from './useJobPhases';
import { useJobReads, useRequestBody } from './useJobReads';
import { useJobResult } from './useJobResult';
import { useJobStart } from './useJobStart';
import { useJobStatus } from './useJobStatus';
import { type JobSwitch, useJobSwitch } from './useJobSwitch';
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
