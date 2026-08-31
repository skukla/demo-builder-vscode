/**
 * Import job runner — the state machine over two status endpoints that fail in
 * OPPOSITE directions.
 *
 * Neither endpoint is sufficient alone, which is the whole reason this is a
 * runner and not a poll loop:
 *
 *   `datapack-process-status` (Mongo, durable) is correct for a finished job but
 *   returns `200` with an EMPTY map for one that never started — indistinguishable
 *   from one that is still starting.
 *
 *   `async-process-status` (OpenWhisk activation echo) correctly reports the
 *   validation error for a job that never started, but reports `in_progress` for
 *   jobs that finished hours ago, because the activation record ages out.
 *
 * So: the durable one decides terminal success or failure; the echo is consulted
 * ONCE, only to explain an empty map that outlived the grace window. Never polled.
 *
 * The rule most easily got wrong is the COVERING SET: terminal means the map
 * covers every REQUESTED type and all of them are terminal. "All present are
 * terminal" declares victory the moment the first type finishes.
 *
 * `jest.mock('@/core/utils/sleep')` so the backoff resolves instantly — the node
 * project runs on real timers.
 *
 * Strict TDD: written BEFORE the runner exists.
 */

jest.mock('@/core/utils/sleep');

// `PollingService` reaches for the global logger at construction
// (`private logger = getLogger()`), which throws in a bare node test. Same stub
// shape `fileWatcher`'s suite uses.

import { watchImportJob, IMPORT_POLL } from '@/features/data-installer/services/importJobRunner';
import type { JobStatusSnapshot } from '@/features/data-installer/types';
import { PollingService } from '@/core/shell/pollingService';

/** A status snapshot with the given per-type map. */
function snap(perType: Record<string, string>, extra: Partial<JobStatusSnapshot> = {}): JobStatusSnapshot {
    return {
        activationId: 'act-1',
        perType: perType as JobStatusSnapshot['perType'],
        hasRecord: Object.keys(perType).length > 0,
        ...extra,
    };
}

/** Runner with a scripted sequence of status responses. */
function runWith(
    sequence: JobStatusSnapshot[],
    opts: {
        requestedTypes?: string[];
        failureReason?: { error: string };
        graceMs?: number;
        abortSignal?: AbortSignal;
        onProgress?: (perType: JobStatusSnapshot['perType']) => void;
    } = {},
) {
    let call = 0;
    const getJobStatus = jest.fn(async () => sequence[Math.min(call++, sequence.length - 1)]);
    const getJobFailureReason = jest.fn(async () => opts.failureReason);
    const clock = { now: 0 };

    const promise = watchImportJob({
        client: { getJobStatus, getJobFailureReason } as never,
        activationId: 'act-1',
        requestedTypes: opts.requestedTypes ?? ['categories', 'products'],
        polling: new PollingService(),
        // Each poll advances the clock past the grace window after two ticks, so
        // the grace test does not depend on wall time.
        now: () => (clock.now += 40_000),
        ...(opts.graceMs !== undefined ? { graceMs: opts.graceMs } : {}),
        ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
        ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
    });

    return { promise, getJobStatus, getJobFailureReason };
}

// The poll task label reaches the Debug Logs on every poll error, so it must
// name the OPERATION: a reset's polls logged as "data-installer import", live.
describe('the poll task name', () => {
    it('names a reset a reset', async () => {
        const polling = { pollUntilCondition: jest.fn().mockResolvedValue(undefined) };
        const client = {
            getJobStatus: jest.fn().mockResolvedValue({
                hasRecord: true,
                perType: { categories: 'success' },
            }),
            getJobFailureReason: jest.fn(),
        };

        await watchImportJob({
            client: client as never,
            polling: polling as never,
            activationId: 'act-1',
            requestedTypes: ['categories'],
            operation: 'reset',
        });

        expect(polling.pollUntilCondition).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ name: 'data-installer reset act-1' }),
        );
    });

    it('defaults to import for records that predate the field', async () => {
        const polling = { pollUntilCondition: jest.fn().mockResolvedValue(undefined) };
        const client = {
            getJobStatus: jest.fn().mockResolvedValue({
                hasRecord: true,
                perType: { categories: 'success' },
            }),
            getJobFailureReason: jest.fn(),
        };

        await watchImportJob({
            client: client as never,
            polling: polling as never,
            activationId: 'act-1',
            requestedTypes: ['categories'],
        });

        expect(polling.pollUntilCondition).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ name: 'data-installer import act-1' }),
        );
    });
});

describe('watchImportJob', () => {
    beforeEach(() => jest.clearAllMocks());

    /**
     * The runner already had the data the modal needed and kept it to itself.
     *
     * It builds a partial per-type map on EVERY poll — `classify` depends on
     * that, since the map must cover the requested types before the job counts
     * as terminal — but it returned once, at the end. So the modal showed a bare
     * "Importing…" for the whole run, sometimes minutes. This callback is the
     * only new thing needed: the push and the render hang off it.
     */
    describe('progress reporting', () => {
        it('reports each poll as it happens, not once at the end', async () => {
            const seen: Array<Record<string, string>> = [];
            const { promise } = runWith(
                [
                    snap({ categories: 'processing' }),
                    snap({ categories: 'success', products: 'processing' }),
                    snap({ categories: 'success', products: 'success' }),
                ],
                { onProgress: (perType) => seen.push({ ...perType }) },
            );

            await promise;

            expect(seen.length).toBeGreaterThan(1);
            expect(seen[0]).toEqual({ categories: 'processing' });
        });

        it('reports the terminal map too, so the last frame is not stale', async () => {
            const seen: Array<Record<string, string>> = [];
            const { promise } = runWith(
                [
                    snap({ categories: 'processing' }),
                    snap({ categories: 'success', products: 'success' }),
                ],
                { onProgress: (perType) => seen.push({ ...perType }) },
            );

            await promise;

            expect(seen[seen.length - 1]).toEqual({
                categories: 'success',
                products: 'success',
            });
        });

        /** An empty map is "not started", not progress. Reporting it would blank the line. */
        it('stays quiet while the job has no record yet', async () => {
            const onProgress = jest.fn();
            const { promise } = runWith([snap({}), snap({ categories: 'success', products: 'success' })], {
                onProgress,
            });

            await promise;

            for (const call of onProgress.mock.calls) {
                expect(Object.keys(call[0]).length).toBeGreaterThan(0);
            }
        });

        /** Watching must survive a bad listener — a render error cannot fail an import. */
        it('finishes the job even when the callback throws', async () => {
            const { promise } = runWith(
                [snap({ categories: 'success', products: 'success' })],
                {
                    onProgress: () => {
                        throw new Error('render blew up');
                    },
                },
            );

            await expect(promise).resolves.toMatchObject({ outcome: 'success' });
        });

        it('needs no callback at all', async () => {
            const { promise } = runWith([snap({ categories: 'success', products: 'success' })]);

            await expect(promise).resolves.toMatchObject({ outcome: 'success' });
        });
    });

    describe('the covering-set rule', () => {
        it('does NOT finish when only some requested types have reported', async () => {
            // categories is done; products has not appeared at all. "All present
            // are terminal" would call this a success here — it is not.
            const { promise, getJobStatus } = runWith([
                snap({ categories: 'success' }),
                snap({ categories: 'success', products: 'success' }),
            ]);

            const result = await promise;

            expect(result.outcome).toBe('success');
            expect(getJobStatus.mock.calls.length).toBeGreaterThan(1);
        });

        it('does NOT finish while a covered type is still processing', async () => {
            const { promise, getJobStatus } = runWith([
                snap({ categories: 'success', products: 'processing' }),
                snap({ categories: 'success', products: 'success' }),
            ]);

            await promise;

            expect(getJobStatus.mock.calls.length).toBeGreaterThan(1);
        });

        it('ignores extra types the service reports that nobody requested', async () => {
            const { promise } = runWith([snap({ categories: 'success', products: 'success', extra: 'processing' })], {
                requestedTypes: ['categories', 'products'],
            });

            expect((await promise).outcome).toBe('success');
        });
    });

    describe('outcomes', () => {
        it('all success → success', async () => {
            const { promise } = runWith([snap({ categories: 'success', products: 'success' })]);

            expect((await promise).outcome).toBe('success');
        });

        // A first-class outcome, not a failure: re-runs legitimately skip items
        // that already exist.
        it('mixed → partial', async () => {
            const { promise } = runWith([snap({ categories: 'success', products: 'error' })]);

            const result = await promise;

            expect(result.outcome).toBe('partial');
            expect(result.perType).toEqual({ categories: 'success', products: 'error' });
        });

        it('all error → error', async () => {
            const { promise } = runWith([snap({ categories: 'error', products: 'error' })]);

            expect((await promise).outcome).toBe('error');
        });

        it('carries the processing time through when the service reports one', async () => {
            const { promise } = runWith([
                snap({ categories: 'success', products: 'success' }, { processingTimeMs: 175496 }),
            ]);

            expect((await promise).processingTimeMs).toBe(175496);
        });
    });

    describe('the empty map and its grace window', () => {
        it('keeps waiting while the map is empty and the grace window is open', async () => {
            const { promise, getJobStatus } = runWith(
                [snap({}), snap({}), snap({ categories: 'success', products: 'success' })],
                { graceMs: 120_000 },
            );

            expect((await promise).outcome).toBe('success');
            expect(getJobStatus.mock.calls.length).toBeGreaterThan(2);
        });

        it('gives up as never-registered once the window closes', async () => {
            const { promise } = runWith([snap({})], { graceMs: 60_000 });

            expect((await promise).outcome).toBe('never-registered');
        });

        // The echo explains why nothing happened. It is NOT polled: it lies about
        // finished jobs, so one call at one moment is all it is good for.
        it('asks the activation echo exactly ONCE for the reason', async () => {
            const { promise, getJobFailureReason } = runWith([snap({})], {
                graceMs: 60_000,
                failureReason: { error: 'Invalid input. Must provide one of: (datapack_name), …' },
            });

            const result = await promise;

            expect(getJobFailureReason).toHaveBeenCalledTimes(1);
            expect(result.reason).toMatch(/Must provide one of/);
        });

        it('still reports never-registered when the echo says nothing', async () => {
            const { promise } = runWith([snap({})], { graceMs: 60_000 });

            const result = await promise;

            expect(result.outcome).toBe('never-registered');
            expect(result.reason).toBeUndefined();
        });

        // Keyed on the EMPTY MAP, not on the documented error body — the service
        // returns 200 with an empty map, never the error shape the docs describe.
        it('keys on the empty map, not on any error field', async () => {
            const { promise } = runWith([snap({}), snap({ categories: 'success', products: 'success' })], {
                graceMs: 120_000,
            });

            expect((await promise).outcome).toBe('success');
        });
    });

    describe('stop watching', () => {
        // There is NO cancel endpoint. Aborting stops the watch; the job keeps
        // running server-side, and the outcome name has to say so.
        it('reports stopped when aborted, not error', async () => {
            const controller = new AbortController();
            const { promise } = runWith([snap({ categories: 'processing' })], {
                abortSignal: controller.signal,
            });
            controller.abort();

            expect((await promise).outcome).toBe('stopped');
        });

        it('does not consult the echo when stopped', async () => {
            const controller = new AbortController();
            const { promise, getJobFailureReason } = runWith([snap({})], {
                abortSignal: controller.signal,
            });
            controller.abort();

            await promise;

            expect(getJobFailureReason).not.toHaveBeenCalled();
        });
    });

    describe('exhaustion', () => {
        it('reports still-running rather than failing when the horizon is reached', async () => {
            const { promise } = runWith([snap({ categories: 'processing', products: 'processing' })]);

            const result = await promise;

            // The job is not broken — we simply stopped watching it. Calling this
            // an error would tell the user their import failed when it may not have.
            expect(result.outcome).toBe('still-running');
        });
    });
});

describe('IMPORT_POLL', () => {
    // Real installs run 12s–366s. The defaults (60 attempts) top out at 280s, so
    // a long-but-healthy import would be abandoned mid-flight and reported as
    // still-running. Both knobs have to move: raising `timeout` alone leaves
    // maxAttempts binding first.
    it('covers the longest observed install with headroom', () => {
        let total = 0;
        let delay = 500;
        for (let i = 0; i < IMPORT_POLL.maxAttempts; i++) {
            total += delay;
            delay = Math.min(delay * 1.5, 5000);
        }

        expect(total).toBeGreaterThan(366_000);
        expect(IMPORT_POLL.timeout).toBeGreaterThan(366_000);
    });

    it('raises BOTH knobs above the library defaults', () => {
        expect(IMPORT_POLL.maxAttempts).toBeGreaterThan(60);
        expect(IMPORT_POLL.timeout).toBeGreaterThan(180_000);
    });
});
