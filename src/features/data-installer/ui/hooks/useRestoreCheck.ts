/**
 * Restore's check (step 03, S8; step-07 U1, J9-5 to J9-7): on open, `restore-datapack` without
 * `confirm`, which starts nothing. It answers up to date (the small result), or the question
 * (`RestoreQuestion`), which moves the window to it. Restore there sends it again confirmed, with the
 * point chosen, as the job's start (`useJobStart`). Split out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useRestoreCheck
 */

import { type Dispatch, useEffect } from 'react';
import type { JobEvent, JobState } from '../components/job/datapackJob';
import type { StartAnswer, useJobStart } from './useJobStart';
import type { DatapackId } from '@/types/datapack';
import type { RestoreDatapackRequest, RestoreQuestion } from '@/types/webviewRequests';

/** The question the check answered, once it answered one: the one start answer that asks. */
export function restoreQuestionOf(value: StartAnswer | null): RestoreQuestion | null {
    return value !== null && 'asks' in value ? value : null;
}

/**
 * Send Restore's check once, on open, and ask its question when it answered one.
 *
 * @param id - the datapack the window opened on
 * @param state - the job's phase; only a restore's check sends or asks
 * @param start - the restore's request
 * @param dispatch - moves the job to its question
 */
export function useRestoreCheck(
    id: DatapackId,
    state: JobState,
    start: ReturnType<typeof useJobStart>['start'],
    dispatch: Dispatch<JobEvent>,
): void {
    const restores = state.kind === 'restore';
    const name = restores ? id.name : undefined;
    const { load, loading, value } = start;
    useEffect(() => {
        if (!name) return;
        const check: RestoreDatapackRequest = { datapackName: name };
        load(check);
    }, [name, load]);
    const asks = restores && state.phase === 'check' && !loading && restoreQuestionOf(value) !== null;
    useEffect(() => {
        if (asks) dispatch({ type: 'asks' });
    }, [asks, dispatch]);
}
