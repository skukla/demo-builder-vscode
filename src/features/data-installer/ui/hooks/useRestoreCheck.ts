/**
 * Restore's check (step 03, S8; decisions J4-2, J4-3): on open, `restore-datapack` without
 * `confirm`, which writes nothing unless nothing of the SC's would be lost. It answers up to date,
 * accepted (a newer save alone), or that the SC has unsaved edits (`CHANGES_NEED_ANSWER`), which
 * moves the window to its question. Restore there sends it again confirmed, as the job's start
 * (`useJobStart`). Split out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useRestoreCheck
 */

import { type Dispatch, useEffect } from 'react';
import type { JobEvent, JobState } from '../components/job/datapackJob';
import type { useJobStart } from './useJobStart';
import type { DatapackId } from '@/types/datapack';
import { ErrorCode } from '@/types/errorCodes';
import type { RestoreDatapackRequest } from '@/types/webviewRequests';

/**
 * Send Restore's check once, on open, and ask its question when it found unsaved edits.
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
    const { load, loading, failure } = start;
    useEffect(() => {
        if (!name) return;
        const check: RestoreDatapackRequest = { datapackName: name };
        load(check);
    }, [name, load]);
    const edits = failure?.code === ErrorCode.CHANGES_NEED_ANSWER;
    const asks = restores && state.phase === 'check' && !loading && edits;
    useEffect(() => {
        if (asks) dispatch({ type: 'asks' });
    }, [asks, dispatch]);
}
