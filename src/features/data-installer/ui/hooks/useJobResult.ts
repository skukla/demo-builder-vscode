/**
 * What a datapack job's result reads (step 03, S4, S6 and S7): keyed on the LAST ACTION
 * (`resolveResult`), and the job watched is the one the last action started, else the one found
 * running. Split out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useJobResult
 */

import { jobWords } from '../../datapackWords';
import { type ResultContent, resolveResult, upToDateResult } from '../components/importResult';
import type { JobState } from '../components/job/datapackJob';
import type { DataInstallerRequest } from './useDataInstallerRequest';
import { useJobPickup } from './useJobPickup';
import type { JobReadsArgs, UpdateCheck } from './useJobReads';
import { acceptedActivation, type useJobStart } from './useJobStart';
import type { useJobStatus } from './useJobStatus';
import { ErrorCode } from '@/types/errorCodes';

/**
 * What Restore's check answered, when it answered without a job (S8): up to date, a result of its own; refused, its own words. The question is no result (J9-5 to J9-7); `undefined`
 * when it accepted a job, whose end is read as any start's.
 */
function restoreAnswer(
    starts: ReturnType<typeof useJobStart>,
    name: string,
): ResultContent | null | undefined {
    const { failure, value } = starts.start;
    if (failure?.code === ErrorCode.CHANGES_NEED_ANSWER) return null;
    if (failure) {
        return { variant: 'error', title: jobWords('restore', name).failed, thing: name, message: failure.message };
    }
    if (value && 'upToDate' in value) return upToDateResult(name);
    if (value && 'asks' in value) return null;
    return undefined;
}

/** What Update's check answered without a summary (J9-4): up to date, or why it could not check. */
function updateAnswer(state: JobState, update: UpdateCheck | undefined, name: string): ResultContent | undefined {
    // Before Update is pressed: the check's answer stays the result once the window has moved to it.
    if (state.kind !== 'update' || state.lastAction !== null || !update) return undefined;
    if (update.failure) return { variant: 'error', title: jobWords('update', name).failed, thing: name, message: update.failure };
    return update.upToDate ? upToDateResult(name) : undefined;
}

/** An install's check that found the store already matches (owner walk Q8): before Install is pressed. */
function installAnswer(state: JobState, matches: boolean | undefined, name: string): ResultContent | undefined {
    return state.kind === 'install' && state.lastAction === null && matches ? upToDateResult(name) : undefined;
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
        /** Update's check (step-07 U1): nothing left to apply, or why it could not tell. */
        update?: UpdateCheck;
        /** An install's check found the store already matches the datapack. */
        matches?: boolean;
    },
) {
    const { dry, starts, watch, heldName, update, matches } = reqs;
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
    const answered = restoring
        ? restoreAnswer(starts, args.displayName)
        : (updateAnswer(state, update, args.displayName) ?? installAnswer(state, matches, args.displayName));
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
