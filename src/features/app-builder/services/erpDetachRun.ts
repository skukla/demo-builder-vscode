/**
 * Following an `erp/detach` that outlives its answer (AB-61).
 *
 * A web action's HTTP answer is cut off at 60 seconds with a 504 while the action itself
 * runs on (its limit is 300 seconds). Measured 2026-10-02: a detach that took about 65
 * seconds finished in the background after the reset had already stopped on the 504. So
 * every detach is named with a run id, the integration records the run under it, and a
 * cut-off answer is followed by reading that record until the run ends.
 *
 * Only an integration that says it records runs (`detachRuns` on `erp/status`) is ever
 * read: one deployed before it would RUN a detach on the GET.
 *
 * The client decides nothing here; it hands over the POST it sent and the two reads
 * (`DetachRunSource`). This module knows how to wait, and nothing about URLs or sign-in.
 *
 * @module features/app-builder/services/erpDetachRun
 */

import { randomUUID } from 'crypto';
import type { ErpDetachReport, ErpIntegrationStatus } from './erpIntegrationClient';
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

const STILL_RUNNING_LINE = "Still undoing the ERP's changes in Commerce";
const STILL_RUNNING_ERROR =
    "The integration is still undoing the ERP's changes in Commerce. Try again in a few minutes.";

/** One detach run as the integration records it (`GET erp/detach?run=<id>`). */
export interface ErpDetachRun {
    run: string;
    status: 'running' | 'done' | 'failed';
    startedAt: string;
    finishedAt?: string;
    /** The report the POST would have answered; present once `done`. */
    result?: ErpDetachReport;
    /** Why it stopped; present once `failed`. */
    error?: string;
}

/** What following a run reads of the integration (the client; a test seam). */
export interface DetachRunSource {
    status(): Promise<ErpIntegrationStatus>;
    /** The run's record; throws with `status` 404 when the integration has none. */
    detachRun(run: string): Promise<ErpDetachRun>;
}

/** Pacing and the one progress line, both the caller's. */
export interface DetachRunDeps {
    wait?: (ms: number) => Promise<void>;
    onProgress?: (message: string) => void;
}

/** A fresh run id; a UUID fits the integration's `^[A-Za-z0-9_-]{8,64}$`. */
export function newDetachRunId(): string {
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
 * The detach's report: the POST's own answer, or, when that answer was cut off and the
 * integration records runs, the run's recorded result.
 *
 * @param post - the POST already sent, carrying `run`
 * @param source - the integration's status and run record
 * @param run - the id the POST carried
 * @returns the report
 * @throws the POST's own error when it was not cut off, or the run cannot be followed;
 *   the run's error when it failed; a plain-words error when it is still running at the end
 */
export async function detachReportOf(
    post: Promise<ErpDetachReport>,
    source: DetachRunSource,
    run: string,
    deps: DetachRunDeps,
): Promise<ErpDetachReport> {
    try {
        return await post;
    } catch (cutOff) {
        if (httpStatusOf(cutOff) !== ANSWER_CUT_OFF) throw cutOff;
        // A status that cannot be read is no proof the GET is safe: the 504 stands.
        const recordsRuns = await source.status().then(
            (status) => status.detachRuns === true,
            () => false,
        );
        if (!recordsRuns) throw cutOff;
        deps.onProgress?.(STILL_RUNNING_LINE);
        return followRun(source, run, cutOff, deps.wait ?? sleep);
    }
}

async function followRun(
    source: DetachRunSource,
    run: string,
    cutOff: unknown,
    wait: (ms: number) => Promise<void>,
): Promise<ErpDetachReport> {
    const reads = Math.ceil(FOLLOW_BUDGET_MS / POLL_INTERVAL_MS);
    for (let read = 1; read <= reads; read++) {
        await wait(POLL_INTERVAL_MS);
        const record = await readRun(source, run);
        if (!record) {
            if (read > UNRECORDED_READS) throw cutOff;
        } else if (record.status === 'done') {
            return record.result ?? {};
        } else if (record.status === 'failed') {
            throw new Error(`ERP detach failed: ${record.error ?? 'no reason given'}`);
        }
    }
    throw new Error(STILL_RUNNING_ERROR);
}

/** The run's record, or undefined when the integration has none (yet). */
async function readRun(source: DetachRunSource, run: string): Promise<ErpDetachRun | undefined> {
    try {
        return await source.detachRun(run);
    } catch (error) {
        if (httpStatusOf(error) === NO_RECORD) return undefined;
        throw error;
    }
}
