/**
 * What a datapack job's result reads (step 03, S4, S6 and S7): keyed on the LAST ACTION
 * (`resolveResult`), and the job watched is the one the last action started, else the one found
 * running. Split out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useJobResult
 */

import { resolveResult } from '../components/importResult';
import type { JobState } from '../components/job/datapackJob';
import type { DataInstallerRequest } from './useDataInstallerRequest';
import { useJobPickup } from './useJobPickup';
import type { JobReadsArgs } from './useJobReads';
import type { useJobStart } from './useJobStart';
import type { useJobStatus } from './useJobStatus';

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
        state.kind === 'switch' && heldName
            ? { replacing: { name: heldName, dataTypes: args.types } }
            : {};
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
