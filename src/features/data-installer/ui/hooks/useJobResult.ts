/**
 * What a datapack job's result reads (step 03, S4, S6 and S7): keyed on the LAST ACTION
 * (`resolveResult`), and the job watched is the one the last action started, else the one found
 * running. Split out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useJobResult
 */

import { jobWords } from '../../datapackWords';
import { type ResultContent, resolveResult } from '../components/importResult';
import type { JobState } from '../components/job/datapackJob';
import type { DataInstallerRequest } from './useDataInstallerRequest';
import { useJobPickup } from './useJobPickup';
import type { JobReadsArgs } from './useJobReads';
import { acceptedActivation, type useJobStart } from './useJobStart';
import type { useJobStatus } from './useJobStatus';
import { ErrorCode } from '@/types/errorCodes';

/**
 * What Restore's check answered, when it answered without a job (S8): up to date, the small result
 * that closes itself; refused, its own words. Unsaved edits are its question, no result; `undefined`
 * when it accepted a job, whose end is read as any start's.
 */
function restoreAnswer(
    starts: ReturnType<typeof useJobStart>,
    name: string,
): ResultContent | null | undefined {
    const { failure, value } = starts.start;
    if (failure?.code === ErrorCode.CHANGES_NEED_ANSWER) return null;
    if (failure) {
        return { variant: 'error', title: jobWords('restore', name).failed, message: failure.message };
    }
    if (value && 'upToDate' in value) {
        return { variant: 'success', title: `${name} Is Up to Date`, finished: true };
    }
    return undefined;
}

/** What the result reads: the last action's request, the job watched, a switch's failed save. */
export function useJobResult(
    args: JobReadsArgs,
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
    const accepted = acceptedActivation(start.value);
    const started = state.lastAction ? accepted : watch.found;
    const pickingUp = useJobPickup(
        wrote ? accepted : undefined,
        watch.record,
        watch.status.loading,
        watch.status.load,
    );
    const busy = dry.loading || start.loading || pickingUp;
    const action = state.lastAction ?? (watch.found ? 'start' : null);
    const replacing =
        state.kind === 'switch' && heldName
            ? { replacing: { name: heldName, dataTypes: args.types } }
            : {};
    const restoring = state.kind === 'restore' && !busy;
    const answered = restoring ? restoreAnswer(starts, args.displayName) : undefined;
    if (answered !== undefined) return { result: answered, starting: false };
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
