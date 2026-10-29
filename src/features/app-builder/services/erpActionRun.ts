/**
 * Following an integration action that outlives its answer (AB-61, and prices since
 * 2026-10-09).
 *
 * A web action's HTTP answer is cut off at 60 seconds with a 504 while the action itself
 * runs on (its limit is 300 seconds). Measured 2026-10-02: a detach that took about 65
 * seconds finished in the background after the reset had already stopped on the 504; a
 * price publish of 72 contract prices did the same twice on 2026-10-01. So every such POST
 * is named with a run id, the integration records the run under it, and a cut-off answer is
 * followed by reading that record until the run ends. `erp/detach` and `erp/prices` record
 * runs the same way (one lib in the integration), so one follower serves both.
 *
 * Only an integration that says it records that action's runs (`detachRuns`, `priceRuns`
 * on `erp/status`) is ever read: one deployed before it would RUN the action on the GET.
 *
 * The client decides nothing here; it hands over the POST it sent, the two reads
 * (`ActionRunSource`) and the words for its action (`ActionRunWords`). This module knows
 * how to wait, and nothing about URLs or sign-in.
 *
 * @module features/app-builder/services/erpActionRun
 */

import { randomUUID } from 'crypto';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** The gateway's status for a web action still running at 60 s ("Response not yet ready"). */
const ANSWER_CUT_OFF = 504;
/** The integration's status for a run it has no record of. */
const NO_RECORD = 404;
/** How often to re-read a run's record. */
const POLL_INTERVAL_MS = 5000;
/** The action's own 300-second limit, and a little more for its last write to land. */
const FOLLOW_BUDGET_MS = TIMEOUTS.VERY_LONG + TIMEOUTS.NORMAL;
/** Reads that may answer "no record" before the run counts as never recorded. */
const UNRECORDED_READS = 3;

/**
 * One run as the integration records it (`GET erp/<action>?run=<id>`); `R` is the report
 * the POST would have answered, present once `done`.
 */
export interface ErpActionRun<R> {
    run: string;
    status: 'running' | 'done' | 'failed';
    startedAt: string;
    finishedAt?: string;
    result?: R;
    /** Why it stopped; present once `failed`. */
    error?: string;
}

/** What following a run reads of the integration (the client; a test seam). */
export interface ActionRunSource<R> {
    /** Whether the integration records this action's runs; false when its status cannot be read. */
    recordsRuns(): Promise<boolean>;
    /** The run's record; throws with `status` 404 when the integration has none. */
    readRun(run: string): Promise<ErpActionRun<R>>;
    /** The report for a run recorded `done` with no `result`; may throw in the action's words. */
    emptyResult(): R;
}

/** The action's words: the one progress line while it waits, and how it names a failure. */
export interface ActionRunWords {
    /** Said once, through `onProgress`, when the follow starts. */
    stillRunning: string;
    /** The error when the run is still running at the end of the budget. */
    stillRunningAtEnd: string;
    /** What a failed run's error is prefixed with: "ERP detach failed". */
    failed: string;
}

/** Pacing and the one progress line, both the caller's. */
interface ActionRunDeps {
    wait?: (ms: number) => Promise<void>;
    onProgress?: (message: string) => void;
}

/** The run was followed to the end of the budget and had not ended. */
export class ErpActionStillRunningError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ErpActionStillRunningError';
    }
}

/** A fresh run id; a UUID fits the integration's `^[A-Za-z0-9_-]{8,64}$`. */
export function newRunId(): string {
    return randomUUID();
}

/** The HTTP status a failed call carries (`ErpIntegrationApiError.status`), when it has one. */
function httpStatusOf(error: unknown): number | undefined {
    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
        return error.status;
    }
    return undefined;
}

/**
 * The action's report: the POST's own answer, or, when that answer was cut off and the
 * integration records runs, the run's recorded result.
 *
 * @param post - the POST already sent, carrying `run`
 * @param source - whether the integration records runs, and the run's record
 * @param run - the id the POST carried
 * @param words - the action's words
 * @param deps - pacing and progress
 * @returns the report
 * @throws the POST's own error when it was not cut off, or the run cannot be followed;
 *   the run's error when it failed; `ErpActionStillRunningError` when it is still running
 *   at the end
 */
export async function reportOf<R>(
    post: Promise<R>,
    source: ActionRunSource<R>,
    run: string,
    words: ActionRunWords,
    deps: ActionRunDeps,
): Promise<R> {
    try {
        return await post;
    } catch (cutOff) {
        if (httpStatusOf(cutOff) !== ANSWER_CUT_OFF) throw cutOff;
        // A status that cannot be read is no proof the GET is safe: the 504 stands.
        if (!(await source.recordsRuns())) throw cutOff;
        deps.onProgress?.(words.stillRunning);
        return followRun(source, run, cutOff, words, deps.wait ?? sleep);
    }
}

async function followRun<R>(
    source: ActionRunSource<R>,
    run: string,
    cutOff: unknown,
    words: ActionRunWords,
    wait: (ms: number) => Promise<void>,
): Promise<R> {
    const reads = Math.ceil(FOLLOW_BUDGET_MS / POLL_INTERVAL_MS);
    for (let read = 1; read <= reads; read++) {
        await wait(POLL_INTERVAL_MS);
        const record = await readRun(source, run);
        if (!record) {
            if (read > UNRECORDED_READS) throw cutOff;
        } else if (record.status === 'done') {
            return record.result ?? source.emptyResult();
        } else if (record.status === 'failed') {
            throw new Error(`${words.failed}: ${record.error ?? 'no reason given'}`);
        }
    }
    throw new ErpActionStillRunningError(words.stillRunningAtEnd);
}

/** The run's record, or undefined when the integration has none (yet). */
async function readRun<R>(
    source: ActionRunSource<R>,
    run: string,
): Promise<ErpActionRun<R> | undefined> {
    try {
        return await source.readRun(run);
    } catch (error) {
        if (httpStatusOf(error) === NO_RECORD) return undefined;
        throw error;
    }
}
