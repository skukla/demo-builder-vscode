/**
 * A datapack job's status (step 03, S4, S6 and S7): read on open, polled while it runs, and the running
 * job it found. Split out of `useDatapackJob`.
 *
 * @module features/data-installer/ui/hooks/useJobStatus
 */

import { useEffect, useState } from 'react';
import type { ImportJobRecord } from '../../types';
import { STATUS_POLL_MS } from '../components/importModalJob';
import type { JobState } from '../components/job/datapackJob';
import { useDataInstallerRequest } from './useDataInstallerRequest';

/** The job's status: read on open, again while it runs, and the running job it found, if any. */
export function useJobStatus(state: JobState) {
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
