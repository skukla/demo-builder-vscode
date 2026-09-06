/**
 * What the runner REPORTS when the watch ends without a verdict.
 *
 * `pollUntilCondition` throws the same way on abort, on timeout and on attempt
 * exhaustion, and none of those means "the import failed" — so the runner
 * classifies rather than propagates. What it hands back matters as much as the
 * name it gives the outcome: the modal renders the per-type map, so an
 * interrupted watch that returns an empty one blanks a screen that was showing
 * real progress a moment earlier.
 *
 * Split from importJobRunner.test.ts, which owns the outcomes reached by
 * polling to a terminal map.
 *
 * These drive the poller directly rather than the real `PollingService`: the
 * cases here are about the moment it gives up, and scripting that is the whole
 * point — the real service's backoff is its own suite's subject.
 */

import {
    pollingStub,
    pollingThatGivesUp,
    pollingThatRuns,
    snap,
} from './importJobRunner.testUtils';
import { watchImportJob } from '@/features/data-installer/services/importJobRunner';

const REQUESTED = ['categories', 'products'];

/** Run the watcher against a scripted poller and a scripted status sequence. */
function runWith(opts: {
    poller: jest.Mock;
    sequence?: ReturnType<typeof snap>[];
    getJobFailureReason?: jest.Mock;
}) {
    let call = 0;
    const sequence = opts.sequence ?? [];
    const getJobStatus = jest.fn(async () => sequence[Math.min(call++, sequence.length - 1)]);
    const getJobFailureReason = opts.getJobFailureReason ?? jest.fn(async () => undefined);

    const promise = watchImportJob({
        client: { getJobStatus, getJobFailureReason },
        activationId: 'act-1',
        requestedTypes: REQUESTED,
        polling: pollingStub(opts.poller),
    });

    return { promise, getJobStatus, getJobFailureReason };
}

describe('stopping the watch', () => {
    // There is no cancel endpoint: aborting stops the WATCH, and the job carries
    // on server-side. The map it had reached is the last true thing anyone knows
    // about it, so it goes back with the outcome.
    it('hands back the last map it saw', async () => {
        const controller = new AbortController();
        controller.abort();
        const getJobStatus = jest.fn(async () => snap({ categories: 'processing' }));

        const result = await watchImportJob({
            client: { getJobStatus, getJobFailureReason: jest.fn() },
            activationId: 'act-1',
            requestedTypes: REQUESTED,
            polling: pollingStub(pollingThatGivesUp(1)),
            abortSignal: controller.signal,
        });

        expect(result.outcome).toBe('stopped');
        expect(result.perType).toStrictEqual({ categories: 'processing' });
    });

    // Aborting before the first status came back is the common case — the user
    // closes the modal while the very first request is in flight. There is no
    // map to report, and reaching for one must not turn a stop into a crash.
    it('reports an empty map when it was stopped before any status arrived', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await watchImportJob({
            client: { getJobStatus: jest.fn(), getJobFailureReason: jest.fn() },
            activationId: 'act-1',
            requestedTypes: REQUESTED,
            polling: pollingStub(pollingThatGivesUp(0)),
            abortSignal: controller.signal,
        });

        expect(result.outcome).toBe('stopped');
        expect(result.perType).toStrictEqual({});
    });
});

describe('running out of poll horizon', () => {
    // Not a failure: we stopped watching, the import did not stop importing.
    it('carries the last map and the reported processing time', async () => {
        const { promise } = runWith({
            poller: pollingThatGivesUp(1),
            sequence: [snap({ categories: 'processing' }, { processingTimeMs: 175496 })],
        });

        const result = await promise;

        expect(result.outcome).toBe('still-running');
        expect(result.perType).toStrictEqual({ categories: 'processing' });
        expect(result.processingTimeMs).toBe(175496);
    });

    // The field is OMITTED, not set to undefined: the modal renders "took N
    // seconds" whenever the key is present, so an undefined one prints a blank
    // duration for a job that never reported one.
    it('omits the processing time entirely when the service reported none', async () => {
        const { promise } = runWith({
            poller: pollingThatGivesUp(1),
            sequence: [snap({ categories: 'processing' })],
        });

        const result = await promise;

        expect(result.outcome).toBe('still-running');
        expect('processingTimeMs' in result).toBe(false);
    });

    it('reports an empty map when no status ever came back', async () => {
        const { promise } = runWith({ poller: pollingThatGivesUp(0) });

        const result = await promise;

        expect(result.outcome).toBe('still-running');
        expect(result.perType).toStrictEqual({});
        expect('processingTimeMs' in result).toBe(false);
    });
});

describe('the grace window without an injected clock', () => {
    // Every other test hands in a clock. Production does not, and the fallback
    // has to be a REAL one: with a clock that answers nothing, the first empty
    // map lands outside the window and a job that is merely slow to register is
    // written off as never registered.
    it('treats a first empty map as still starting, not as never registered', async () => {
        const { promise, getJobFailureReason } = runWith({
            poller: pollingThatRuns(4),
            sequence: [snap({}), snap({ categories: 'success', products: 'success' })],
        });

        const result = await promise;

        expect(result.outcome).toBe('success');
        expect(getJobFailureReason).not.toHaveBeenCalled();
    });
});

describe('the activation echo', () => {
    // The echo is the only thing that can say WHY nothing happened, and it is
    // consulted once. An echo that is itself down leaves the outcome unchanged —
    // "never registered" is already known; the reason is what is missing.
    it('still reports never-registered when the echo request fails', async () => {
        const getJobFailureReason = jest.fn(async () => {
            throw new Error('activation echo unavailable');
        });

        const result = await watchImportJob({
            client: { getJobStatus: jest.fn(async () => snap({})), getJobFailureReason },
            activationId: 'act-1',
            requestedTypes: REQUESTED,
            polling: pollingStub(pollingThatRuns(3)),
            graceMs: 0,
            now: () => 0,
        });

        expect(result.outcome).toBe('never-registered');
        expect(result.reason).toBeUndefined();
        expect(getJobFailureReason).toHaveBeenCalledTimes(1);
    });
});
