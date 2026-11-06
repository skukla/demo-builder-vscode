/**
 * An agent's call that waits on a datapack job, rather than polling it blind (owner, 2026-11-05).
 *
 * The start, the removal and the status read each take `waitSeconds`, at most 45. While it
 * runs, the call reads the job's record (`importJobWatch.ts` keeps it current every poll) and says
 * each change into the agent's chat as a phase line ("Installing the datapack: 450 of 2,046
 * products", `reportPhase`). It answers the moment the job ends, or when the time is up with the
 * job still running. Without `waitSeconds` it answers at once, as before.
 *
 * 45 seconds, not the whole job: each agent client has its own limit on how long one call may run.
 * The MCP client library's default is 60 s, and a 60 s wait timed out against it (2026-11-06). The MCP "tasks" feature, where the client does the waiting,
 * is the fuller answer; it waits on client support (backlog).
 *
 * @module features/data-installer/handlers/importJobWait
 */

import type { ImportJobRecord } from '../types';
import { datapackProgressLine } from './importJobWatch';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** How a wait passes time: injected so a test does not wait. */
export interface JobWaitClock {
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    intervalMs: number;
}

const REAL_CLOCK: JobWaitClock = {
    sleep,
    now: () => Date.now(),
    intervalMs: TIMEOUTS.DATAPACK_JOB_WAIT_POLL,
};

/** The wait asked for, in ms: none when absent or not a positive number, and never past the ceiling. */
export function waitMsOf(waitSeconds: unknown): number {
    if (typeof waitSeconds !== 'number' || !Number.isFinite(waitSeconds) || waitSeconds <= 0)
        return 0;
    return Math.min(waitSeconds * 1000, TIMEOUTS.DATAPACK_JOB_WAIT_MAX);
}

/**
 * Read the job's record until it ends or `waitMs` passes, saying each new progress line.
 *
 * @param read - the job's record as it stands (`JOB_KEY`)
 * @returns the last record read: ended, or still `watching` when the time ran out
 */
export async function waitForJob(
    read: () => Promise<ImportJobRecord | null>,
    waitMs: number,
    clock: JobWaitClock = REAL_CLOCK,
): Promise<ImportJobRecord | null> {
    const started = clock.now();
    let said: string | undefined;
    for (;;) {
        const record = await read();
        if (!record || record.outcome !== 'watching' || clock.now() - started >= waitMs)
            return record;
        const line = datapackProgressLine(record);
        if (line !== said) reportPhase(line);
        said = line;
        await clock.sleep(clock.intervalMs);
    }
}

/** Rows of the skipped list per answer: Luma once skipped 533, too many for one answer. */
const SKIPPED_PAGE = 50;

/** The record with one page of its skipped rows, the total, and where the next page starts. */
export function skippedPage(record: ImportJobRecord, from = 0): ImportJobRecord & { skippedTotal?: number; skippedNext?: number } {
    if (!record.skipped || record.skipped.length === 0) return record;
    const start = Math.max(0, Math.floor(from));
    const next = start + SKIPPED_PAGE;
    return {
        ...record,
        skipped: record.skipped.slice(start, next),
        skippedTotal: record.skipped.length,
        ...(next < record.skipped.length ? { skippedNext: next } : {}),
    };
}
