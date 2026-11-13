/**
 * The phase each answer moves a datapack job to (step 03, S4, S6, S7 and S8): the check's end, a Dry
 * Run's answer, the run's end, and Restore's check answered without a job (`datapackJob.ts`). Split
 * out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useJobPhases
 */

import { type Dispatch, useEffect } from 'react';
import type { ResultContent } from '../components/importResult';
import type { JobEvent, JobState } from '../components/job/datapackJob';

/** The phase each answer moves the job to: the check's end, a Dry Run's answer, the run's end. */
export function useJobPhases(
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
        // A check ends on a result only for Restore, whose check is its start (`datapackJob.ts`).
        if ((phase === 'run' || phase === 'check') && result)
            dispatch({ type: 'ended', clean: result.finished === true && !result.run });
    }, [phase, result, dispatch]);
}
