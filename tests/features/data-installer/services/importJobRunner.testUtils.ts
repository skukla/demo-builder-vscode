/**
 * Shared fakes for the importJobRunner suites.
 *
 * Extracted when the interruption cases (abort, exhaustion, the default clock)
 * were split into `importJobRunner-interrupted.test.ts`, so both files build the
 * same status snapshot and the same poller rather than each growing its own.
 */

import type { JobStatusSnapshot } from '@/features/data-installer/types';
import type { PollingService } from '@/core/shell/pollingService';

/** A status snapshot with the given per-type map. */
export function snap(
    perType: Record<string, string>,
    extra: Partial<JobStatusSnapshot> = {}
): JobStatusSnapshot {
    return {
        activationId: 'act-1',
        perType: perType as JobStatusSnapshot['perType'],
        hasRecord: Object.keys(perType).length > 0,
        ...extra,
    };
}

/** A poller stub — the real class holds a logger and a rate limiter no literal can supply. */
export function pollingStub(pollUntilCondition: jest.Mock): PollingService {
    return { pollUntilCondition } as unknown as PollingService;
}

/** The condition the runner hands the poller. */
export type PollCheck = () => Promise<boolean>;

/**
 * A poller that runs the check until it says yes, then resolves — the healthy
 * path, without the real service's backoff.
 */
export function pollingThatRuns(rounds: number): jest.Mock {
    return jest.fn(async (check: PollCheck) => {
        for (let i = 0; i < rounds; i += 1) {
            if (await check()) return;
        }
        throw new Error('poll horizon reached');
    });
}

/**
 * A poller that gives up after `rounds` checks, the way `pollUntilCondition`
 * throws on abort, timeout and attempt exhaustion alike. Zero rounds is the case
 * where it never got a status at all.
 */
export function pollingThatGivesUp(rounds: number): jest.Mock {
    return jest.fn(async (check: PollCheck) => {
        for (let i = 0; i < rounds; i += 1) await check();
        throw new Error('poll horizon reached');
    });
}
