/**
 * Helix bulk-job protocol — the 202-and-poll half of bulk preview/publish.
 *
 * Bulk operations against the Helix Admin API answer 202 with job info; the
 * job then runs server-side and its outcome lives at the job-status endpoint.
 * This module owns that protocol: parsing the 202 (nested and flat formats),
 * polling the status endpoint until the job stops, and judging the finished
 * job — including the two failure shapes the API reports as success (a
 * `finished` job whose `data.resources[]` carry 4xx/5xx per-path statuses,
 * and a `finished` job that processed nothing at all).
 *
 * It knows nothing about tokens. Auth arrives through {@link BulkJobDeps}'
 * `getJobStatusHeaders` — `helixService.ts` injects the DA.live admin Bearer
 * plus the GitHub `x-auth-token` there, the same identity that created the
 * job (a different identity gets 404 for a job that plainly exists). That
 * injection seam is what let this leave the service class: the old private
 * `pollJobCompletion` bound to `this.tryAdminBearer()` / `this.getGitHubToken()`.
 *
 * Extracted from `helixService.ts` (god-file cut 2, 2026-08-23). The dead
 * `apiKey` parameter — "for unpublish jobs", which never poll — was dropped
 * with the move: zero callers ever passed it.
 *
 * @module features/eds/services/helix/helixBulkJobs
 */

import { HELIX_ADMIN_URL } from './helixApiClient';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** Response from a bulk operation's 202 (job accepted) */
interface BulkJobResponse {
    /** Job information for async operations (nested format) */
    job?: {
        /** Job name for status tracking */
        name: string;
        /** Topic (preview or live) */
        topic: string;
        /** Current job state */
        state: 'created' | 'running' | 'stopped';
    };
    /** Message ID for the bulk operation */
    messageId?: string;
    /** Job name (flat format - alternative to job.name) */
    name?: string;
    /** Topic (flat format - alternative to job.topic) */
    topic?: string;
}

/**
 * Response from job status endpoint
 */
interface JobStatusResponse {
    /** Current job state */
    state: 'created' | 'running' | 'stopped' | 'finished';
    /** Alternative status field (some API versions use 'status' instead of 'state') */
    status?: string;
    /** Progress information (nested format) */
    progress?: {
        /** Number of items processed */
        processed: number;
        /** Total number of items */
        total: number;
    };
    /** Number of items processed (flat format) */
    processed?: number;
    /** Total number of items (flat format) */
    total?: number;
    /** Error information if job failed */
    error?: string;
    /** Result data when job completes */
    data?: {
        resources?: Array<{
            path: string;
            status: number;
        }>;
    };
}

/** Progress callback for bulk operations */
export type BulkProgressCallback = (processed: number, total: number) => void;

/** What the protocol needs from its host: a logger and the job-status auth. */
export interface BulkJobDeps {
    logger: Logger;
    /**
     * Headers for job-status GETs — the identity that created the job. The
     * service injects the optional DA.live admin Bearer plus the GitHub
     * `x-auth-token`; this module never sees the tokens themselves.
     */
    getJobStatusHeaders(): Promise<Record<string, string>>;
}

/** Identifies one bulk job at the status endpoint. */
export interface BulkJobRef {
    org: string;
    site: string;
    branch: string;
    jobName: string;
    topic: string;
}

/** Maximum time to wait for a bulk job to complete (5 minutes) */
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

/** Polling interval for job status checks (2 seconds) */
const JOB_POLL_INTERVAL_MS = 2000;

/** Job name from a bulk-job response (nested `job.name` preferred, flat `name` fallback). */
function getJobName(jobInfo?: BulkJobResponse): string | undefined {
    return jobInfo?.job?.name || jobInfo?.name;
}

/** Job topic from a bulk-job response, falling back to a caller default. */
function getJobTopic(jobInfo: BulkJobResponse | undefined, defaultTopic: string): string {
    return jobInfo?.job?.topic || jobInfo?.topic || defaultTopic;
}

/** Parse a 202 bulk-job response into the job name + topic to poll on. */
export async function parseBulkJobResponse(
    response: Response,
    defaultTopic: string,
    logger: Logger,
): Promise<{ jobName?: string; jobTopic: string }> {
    let jobInfo: BulkJobResponse | undefined;
    try {
        jobInfo = await response.json();
    } catch {
        logger.warn('[Helix] Could not parse job info from 202 response');
    }
    return {
        jobName: getJobName(jobInfo),
        jobTopic: getJobTopic(jobInfo, defaultTopic),
    };
}

/**
 * Walk `status.data.resources` after a bulk job completes and surface any
 * per-path failures. The Helix bulk API marks the job `finished` even when
 * every path inside it failed with 4xx/5xx — those statuses live only in
 * `data.resources[]`. Without this check the storefront-setup pipeline
 * silently claims success while the live site 404s.
 *
 * Backward-compatible: completes cleanly when `data.resources` is absent or
 * empty (older API responses that don't include the array).
 */
function assertBulkResourcesSucceeded(
    logger: Logger,
    status: JobStatusResponse,
    topic: string,
): void {
    const resources = status.data?.resources ?? [];
    const failed = resources.filter((r) => r.status >= 400);
    if (failed.length > 0) {
        const sample = failed
            .slice(0, 10)
            .map((r) => `${r.path} → ${r.status}`)
            .join(', ');
        const truncated = failed.length > 10 ? ', ...' : '';
        logger.error(
            `[Helix] Bulk ${topic} job finished but ${failed.length}/${resources.length} paths failed: ${sample}${truncated}`,
        );
        throw new Error(
            `Bulk ${topic}: ${failed.length}/${resources.length} paths failed (first: ${failed[0].path} → ${failed[0].status})`,
        );
    }
    // Helix's preview/publish bulk endpoints don't always populate
    // `data.resources` even on successful jobs — for those, the only
    // truth is `progress.processed`. Report the count Helix actually
    // returned: prefer `resources.length`, fall back to processed.
    const processed = status.progress?.processed ?? status.processed ?? 0;
    const count = resources.length > 0 ? resources.length : processed;

    // A job that finished having touched NOTHING is not a success, and it
    // read as one: no resource carried a failing status because no resource
    // came back at all. That is exactly how the block library published
    // "fine" while none of it previewed — measured 2026-08-18 on a live site,
    // two runs of ~78 paths each, zero previewed and zero complaints. Print
    // the whole payload: the caller cannot ask Helix a follow-up question
    // after the job is gone, and this is a user-pasteable log.
    if (count === 0) {
        logger.warn(
            `[Helix] Bulk ${topic} job finished having processed NOTHING. ` +
                'The paths were accepted and none was acted on. Raw job status: ' +
                JSON.stringify(status),
        );
        return;
    }

    logger.debug(`[Helix] Bulk ${topic} job completed: ${count} paths processed`);
}

/**
 * Poll a bulk job until it completes.
 *
 * Bulk operations (preview/publish) return 202 with job info; this polls the
 * status endpoint until the job stops, reporting progress along the way, and
 * throws when the job fails, reports failed paths, or outlives the deadline.
 *
 * @param deps - Logger + the job-status auth provider (see {@link BulkJobDeps})
 * @param job - Which job to poll (org/site/branch/topic/name)
 * @param onProgress - Optional callback for progress updates
 * @throws Error if the job fails or times out
 */
export async function pollJobCompletion(
    deps: BulkJobDeps,
    job: BulkJobRef,
    onProgress?: BulkProgressCallback,
): Promise<void> {
    const { logger } = deps;
    const authHeaders = await deps.getJobStatusHeaders();
    // Job status URL format: GET /job/{org}/{site}/{ref}/{topic}/{jobId}
    const url = `${HELIX_ADMIN_URL}/job/${job.org}/${job.site}/${job.branch}/${job.topic}/${job.jobName}`;
    const startTime = Date.now();

    logger.debug(`[Helix] Polling job status: ${url}`);

    while (true) {
        // Check timeout
        if (Date.now() - startTime > JOB_TIMEOUT_MS) {
            throw new Error(
                `Bulk ${job.topic} job timed out after ${JOB_TIMEOUT_MS / 1000} seconds`,
            );
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: authHeaders,
                signal: AbortSignal.timeout(TIMEOUTS.QUICK),
            });

            if (!response.ok) {
                // Job endpoint may not exist immediately, retry
                if (response.status === 404) {
                    logger.debug(`[Helix] Job not found yet, retrying...`);
                    await sleep(JOB_POLL_INTERVAL_MS);
                    continue;
                }
                throw new Error(
                    `Job status check failed: ${response.status} ${response.statusText}`,
                );
            }

            const status: JobStatusResponse = await response.json();

            // Report progress if available
            if (status.progress && onProgress) {
                onProgress(status.progress.processed, status.progress.total);
            }

            // Check job state - handle both 'stopped' and 'finished' states
            if (
                status.state === 'stopped' ||
                status.state === 'finished' ||
                status.status === 'finished'
            ) {
                // Job-level failure (e.g. job machinery never dispatched)
                if (status.error) {
                    throw new Error(`Bulk ${job.topic} job failed: ${status.error}`);
                }
                assertBulkResourcesSucceeded(logger, status, job.topic);
                return;
            }

            // Job still running, wait and poll again
            logger.debug(
                `[Helix] Job state: ${status.state || status.status}, progress: ${status.progress?.processed ?? status.processed ?? '?'}/${status.progress?.total ?? status.total ?? '?'}`,
            );
            await sleep(JOB_POLL_INTERVAL_MS);
        } catch (error) {
            const errorMessage = (error as Error).message;
            // Timeout errors should be retried
            if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
                logger.debug(`[Helix] Job status request timed out, retrying...`);
                await sleep(JOB_POLL_INTERVAL_MS);
                continue;
            }
            throw error;
        }
    }
}
