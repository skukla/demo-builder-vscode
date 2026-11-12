/**
 * The requests behind a datapack job window (step 03, S4), and the events they send its phases
 * (`datapackJob.ts`): the project's target, the job's status, the check (`preview-datapack-changes`,
 * for every install), Review Records' read, Dry Run and Install.
 *
 * Kept from the window this replaces (`ImportDatapackModal`):
 * - **The result is keyed on the LAST ACTION** (`resolveResult`), and **the job watched is the one
 *   the last action started** (`watchedActivation`): request state persists after settling.
 * - A window that finds a job already running (opened by Undo, Restore, or on an agent's job)
 *   watches THAT job, and its end is its result.
 * - **The target comes from the project**: its instance and its recorded website and store view,
 *   sent verbatim, never a picker. No instance: the no-instance result.
 *
 * @module features/data-installer/ui/hooks/useDatapackJob
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { ChangePreview } from '../../services/demoBuilderEngine/storeChanges';
import type { ImportJobRecord } from '../../types';
import { libraryField, STATUS_POLL_MS } from '../components/importModalJob';
import { watchedActivation } from '../components/importModalView';
import { resolveResult, type ResultContent } from '../components/importResult';
import { datapackJob, startJob, type JobKind, type JobState } from '../components/job/datapackJob';
import { installRows, type TypeRow } from '../components/job/installRows';
import { type DataInstallerRequest, useDataInstallerRequest } from './useDataInstallerRequest';
import { useImportRetry } from './useImportRetry';
import { useJobPickup } from './useJobPickup';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import type { DatapackRecordsResult } from '@/types/webviewRequests';

/** What `get-datapack-import-target` says of the open project. */
interface JobTarget {
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
    review: () => void;
    back: () => void;
    dryRun: () => void;
    install: () => void;
    retry: () => void;
    fixWithAi: () => void;
}

const COMPARE = { timeout: TIMEOUTS.DATAPACK_IMPORT_COMPARE };
const NO_ROWS: TypeRow[] = [];

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

export function useDatapackJob(args: DatapackJobArgs): DatapackJob {
    const { id, displayName, source, types, readingTypes, kind } = args;
    const [state, dispatch] = useReducer(datapackJob, kind, startJob);
    const target = useDataInstallerRequest<JobTarget>('get-datapack-import-target');
    const preview = useDataInstallerRequest<ChangePreview>('preview-datapack-changes', COMPARE);
    const dry = useDataInstallerRequest<{ valid: boolean; reason?: string }>(
        'validate-datapack-import',
    );
    const start = useDataInstallerRequest<{ activationId: string }>('start-datapack-import');
    const records = useDataInstallerRequest<DatapackRecordsResult>('get-datapack-records');
    const { status, record, running, found } = useJobStatus(state);

    const pack = useMemo(
        () => ({ datapackName: id.name, version: id.version, ...libraryField(source) }),
        [id, source],
    );
    const loadTarget = target.load;
    const loadPreview = preview.load;
    useEffect(() => {
        loadTarget({});
        if (kind === 'install') loadPreview(pack);
    }, [loadTarget, loadPreview, kind, pack]);

    const instance = target.value?.instance ?? '';
    const scope = target.value?.scope;
    const body = useCallback(
        () => ({
            ...pack,
            commerceInstance: instance,
            dataTypes: types,
            ...(scope ? { websiteCode: scope.websiteCode, storeCode: scope.storeCode } : {}),
        }),
        [pack, instance, types, scope],
    );
    const loadStart = start.load;
    const runStart = useCallback((): void => {
        dispatch({ type: 'start' });
        loadStart(body());
    }, [loadStart, body]);
    const runs = useImportRetry(runStart);

    const started = state.lastAction
        ? watchedActivation(state.lastAction, start.value?.activationId, undefined)
        : found;
    const pickingUp = useJobPickup(
        state.lastAction === 'start' ? start.value?.activationId : undefined,
        record,
        status.loading,
        status.load,
    );
    const busy = dry.loading || start.loading || pickingUp;
    const action = state.lastAction ?? (found ? 'start' : null);
    const result = busy
        ? null
        : resolveResult(action, {
              name: displayName,
              retries: runs.retries,
              dryRun: dry,
              start,
              reset: NO_RESET,
              record,
              startedActivation: started,
          });

    const { phase } = state;
    useEffect(() => {
        if (phase !== 'check') return;
        if (running) dispatch({ type: 'running' });
        else if (target.settled && !instance) dispatch({ type: 'no-instance' });
        else if (target.settled && status.settled && preview.settled && !readingTypes)
            dispatch({ type: 'checked' });
    }, [phase, running, target.settled, instance, status.settled, preview.settled, readingTypes]);
    useEffect(() => {
        if (phase === 'dry-wait' && result) dispatch({ type: 'dry-answered' });
        if (phase === 'run' && result)
            dispatch({ type: 'ended', clean: result.finished === true && !result.run });
    }, [phase, result]);

    const kinds = preview.value?.kinds;
    const rows = useMemo(() => (kinds ? installRows(kinds) : NO_ROWS), [kinds]);
    const loadRecords = records.load;
    const loadDry = dry.load;
    return {
        state,
        rows,
        checkFailed: preview.failure !== null,
        records: records.value?.records ?? null,
        recordsReading: !records.settled,
        result,
        record,
        starting: start.loading || pickingUp,
        running,
        retries: runs.retries,
        review: () => {
            dispatch({ type: 'review' });
            if (!records.settled && !records.loading) loadRecords(pack);
        },
        back: () => dispatch({ type: 'back' }),
        dryRun: () => {
            dispatch({ type: 'dry-run' });
            loadDry(body());
        },
        install: runs.startImport,
        retry: runs.retry,
        fixWithAi: runs.fixWithAi,
    };
}
