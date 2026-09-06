/**
 * The three decisions inside the polling loop that its main suite runs past.
 *
 * `pollingService.test.ts` drives the loop with real delays, which is right for
 * "does it retry, does it give up" and wrong for the arithmetic: with a real
 * clock the backoff is only observable as elapsed time, and the abort and
 * timeout boundaries are whatever the machine happened to do. Here `sleep` is
 * mocked, so the delay handed to it IS the assertion, and `Date.now` is driven
 * by hand so "elapsed equals the budget" is an exact case rather than a race.
 */

import { PollingService } from '@/core/shell/pollingService';
import { sleep } from '@/core/utils/sleep';

jest.mock('@/core/utils/sleep');

const sleptFor = () => (sleep as jest.Mock).mock.calls.map((call) => call[0]);

describe('PollingService decisions', () => {
    let pollingService: PollingService;

    beforeEach(() => {
        jest.clearAllMocks();
        pollingService = new PollingService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('abort', () => {
        it('throws before calling the condition when the signal is already aborted', async () => {
            const controller = new AbortController();
            controller.abort();
            const checkFn = jest.fn().mockResolvedValue(true);

            await expect(
                pollingService.pollUntilCondition(checkFn, {
                    abortSignal: controller.signal,
                    name: 'deploy status',
                })
            ).rejects.toThrow('Polling aborted for: deploy status');

            expect(checkFn).not.toHaveBeenCalled();
        });

        it('stops at the next attempt when the signal aborts mid-poll', async () => {
            const controller = new AbortController();
            const checkFn = jest.fn().mockImplementation(async () => {
                controller.abort();
                return false;
            });

            await expect(
                pollingService.pollUntilCondition(checkFn, {
                    abortSignal: controller.signal,
                    name: 'deploy status',
                })
            ).rejects.toThrow('Polling aborted for: deploy status');

            // The abort is checked at the TOP of the next attempt, so the
            // condition runs exactly once more than the abort.
            expect(checkFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('the timeout budget', () => {
        /** Freeze the clock and hand back whatever `now` currently holds. */
        function freezeClock(start: number): { advance: (ms: number) => void } {
            let now = start;
            jest.spyOn(Date, 'now').mockImplementation(() => now);
            return {
                advance: (ms: number) => {
                    now += ms;
                },
            };
        }

        it('spends the whole budget: elapsed exactly equal to the timeout still polls', async () => {
            const clock = freezeClock(1_000);
            const checkFn = jest
                .fn()
                .mockImplementationOnce(async () => {
                    clock.advance(100);
                    return false;
                })
                .mockResolvedValueOnce(true);

            await expect(
                pollingService.pollUntilCondition(checkFn, { timeout: 100, name: 'budget' })
            ).resolves.toBeUndefined();

            expect(checkFn).toHaveBeenCalledTimes(2);
        });

        it('gives up once elapsed passes the timeout', async () => {
            const clock = freezeClock(1_000);
            const checkFn = jest.fn().mockImplementation(async () => {
                clock.advance(101);
                return false;
            });

            await expect(
                pollingService.pollUntilCondition(checkFn, { timeout: 100, name: 'budget' })
            ).rejects.toThrow('Polling timeout for: budget');

            expect(checkFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('exponential backoff', () => {
        it('multiplies the delay by the backoff factor and clamps it at maxDelay', async () => {
            const checkFn = jest
                .fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await pollingService.pollUntilCondition(checkFn, {
                initialDelay: 100,
                backoffFactor: 2,
                maxDelay: 300,
                name: 'backoff',
            });

            // 100 → 200 → min(400, 300). The clamp is the third value: without
            // it the wait grows unbounded, and dividing instead of multiplying
            // makes the loop hammer the service harder the longer it waits.
            expect(sleptFor()).toEqual([100, 200, 300]);
        });

        it('waits the initial delay before the first retry', async () => {
            const checkFn = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

            await pollingService.pollUntilCondition(checkFn, { initialDelay: 250, name: 'first' });

            expect(sleptFor()).toEqual([250]);
        });
    });
});
