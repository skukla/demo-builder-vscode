/**
 * The running or last datapack job, as every reader should see it (walk F163, 2026-11-16).
 *
 * A job runs inside the extension host that started it, and dies with it. A window reload ended
 * an install half way, and its record still said `watching`: the Datapacks screen reopened it as a
 * running install that could never end, and an Uninstall pressed after it showed that window
 * instead ("Installing Frescopa", "10 of 10", forever). The record lives in global state, which
 * every window shares, so it cannot simply be cleared at start-up: another window may be running
 * a job now. Each record names its host's process, and a `watching` record whose process is gone
 * is ended here, with the reason.
 *
 * @module features/data-installer/handlers/jobRecordRead
 */

import type { ImportJobRecord } from '../types';
import { JOB_KEY } from './importJobWatch';
import { processExists } from '@/core/shell/processCleanup';
import type { TransientStateManager } from '@/core/state/transientStateManager';

/** Why a job left running by a host that is gone ended: what the window and an agent read. */
export const STOPPED_BY_RELOAD = 'It stopped when the VS Code window reloaded, before it finished.';

/**
 * The job's record; a `watching` one whose host is gone is ended (`unwatchable`) and saved so.
 * A record with no host named was written before records named one, so its host is gone too.
 *
 * @param alive - whether a process runs (tests hand one in)
 */
export async function readJobRecord(
    transient: TransientStateManager,
    alive: (pid: number) => boolean = processExists,
): Promise<ImportJobRecord | null> {
    const record = await transient.get<ImportJobRecord | null>(JOB_KEY, null);
    if (record?.outcome !== 'watching') return record;
    if (record.hostPid !== undefined && alive(record.hostPid)) return record;
    const ended: ImportJobRecord = { ...record, outcome: 'unwatchable', reason: STOPPED_BY_RELOAD };
    await transient.set(JOB_KEY, ended);
    return ended;
}
