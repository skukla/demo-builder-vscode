/**
 * RetryStrategyManager — the decisions, not the shapes
 *
 * The existing suite reads the strategy objects back and counts attempts. These
 * drive the predicates themselves — a message that must NOT be retried, an attempt
 * number that must not — and the two collaborators the loop reaches for: the rate
 * limiter, which only guards a retry, and `sleep`, whose argument IS the backoff.
 */

jest.mock('@/core/utils/sleep');

import type { CommandResult } from '@/core/shell/types';
import { RetryStrategyManager } from '@/core/shell/retryStrategyManager';
import { sleep } from '@/core/utils/sleep';
import { makeResult, makeStrategy } from './retryStrategyManager.testUtils';

const mockedSleep = sleep as jest.MockedFunction<typeof sleep>;

const OK: CommandResult = makeResult();

/** Ask a named strategy's predicate directly; every one of them is pure. */
function asks(manager: RetryStrategyManager, name: string, error: Error, attempt = 1): boolean {
    const strategy = manager.getStrategy(name);
    return strategy?.shouldRetry?.(error, attempt) ?? false;
}

/** The delays handed to sleep, in order. */
const delays = (): number[] => mockedSleep.mock.calls.map((c) => c[0]);

/** Watch the rate limiter the manager built for itself. */
function watchRateLimiter(manager: RetryStrategyManager): jest.SpyInstance {
    const limiter = (manager as unknown as { rateLimiter: { checkRateLimit: () => Promise<void> } })
        .rateLimiter;
    return jest.spyOn(limiter, 'checkRateLimit').mockResolvedValue(undefined);
}

describe('RetryStrategyManager — decisions', () => {
    let retryManager: RetryStrategyManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedSleep.mockResolvedValue(undefined);
        retryManager = new RetryStrategyManager();
    });

    describe('the network strategy', () => {
        it('retries a network failure', () => {
            expect(asks(retryManager, 'network', new Error('ECONNREFUSED on api'))).toBe(true);
        });

        it('retries a timeout', () => {
            expect(asks(retryManager, 'network', new Error('Request timed out'))).toBe(true);
        });

        it('does not retry an ordinary failure', () => {
            expect(asks(retryManager, 'network', new Error('exit code 2'))).toBe(false);
        });
    });

    describe('the filesystem strategy', () => {
        it.each(['EBUSY: resource busy', 'EACCES: permission denied', 'file is locked'])(
            'retries %s',
            (message) => {
                expect(asks(retryManager, 'filesystem', new Error(message))).toBe(true);
            },
        );

        it('does not retry an ordinary failure', () => {
            expect(asks(retryManager, 'filesystem', new Error('ENOENT: no such file'))).toBe(
                false,
            );
        });
    });

    describe('the adobe-cli strategy', () => {
        it('retries a first-attempt token failure', () => {
            expect(asks(retryManager, 'adobe-cli', new Error('invalid token'))).toBe(true);
        });

        it.each(['unauthorized', 'session expired'])('retries a first-attempt %s', (message) => {
            expect(asks(retryManager, 'adobe-cli', new Error(message))).toBe(true);
        });

        it('retries a first-attempt timeout', () => {
            expect(asks(retryManager, 'adobe-cli', new Error('timed out waiting'))).toBe(true);
        });

        it('does not retry the same token failure on a later attempt', () => {
            expect(asks(retryManager, 'adobe-cli', new Error('invalid token'), 2)).toBe(false);
        });

        it('does not retry a failure that is none of those things', () => {
            expect(asks(retryManager, 'adobe-cli', new Error('exit code 2'))).toBe(false);
        });

        // Shell redirection in the message means the command was built wrong, not that
        // anything transient happened. Each carries a token the strategy would
        // otherwise retry, so only the syntax check can be deciding the answer.
        it.each([
            ['a redirect to /dev/null', 'invalid token > /dev/null'],
            ['a stderr redirect', 'invalid token 2>&1'],
            ['a --log-level flag', 'invalid token --log-level debug'],
        ])('does not retry %s', (_label, message) => {
            expect(asks(retryManager, 'adobe-cli', new Error(message))).toBe(false);
        });
    });

    describe('rate limiting a retry', () => {
        const twoAttempts = makeStrategy({ maxAttempts: 2 });

        it('does not rate-limit a command that succeeds first time', async () => {
            const limiter = watchRateLimiter(retryManager);

            await retryManager.executeWithRetry(async () => OK, twoAttempts, 'aio app deploy');

            expect(limiter).not.toHaveBeenCalled();
        });

        it('rate-limits the retry, keyed by the command it is retrying', async () => {
            const limiter = watchRateLimiter(retryManager);
            const executeFn = jest
                .fn<Promise<CommandResult>, []>()
                .mockRejectedValueOnce(new Error('flaky'))
                .mockResolvedValueOnce(OK);

            await retryManager.executeWithRetry(executeFn, twoAttempts, 'aio app deploy');

            expect(limiter.mock.calls).toEqual([['retry:aio app deploy']]);
        });
    });

    describe('backing off between attempts', () => {
        it('multiplies the initial delay by the factor, once per attempt made', async () => {
            const executeFn = jest.fn(async () => {
                throw new Error('flaky');
            });

            await expect(
                retryManager.executeWithRetry(
                    executeFn,
                    makeStrategy({ maxAttempts: 4, initialDelay: 100, maxDelay: 10_000, backoffFactor: 3 }),
                    'aio app deploy',
                ),
            ).rejects.toThrow('flaky');

            expect(delays()).toEqual([100, 300, 900]);
        });

        it('never waits longer than the strategy allows', async () => {
            const executeFn = jest.fn(async () => {
                throw new Error('flaky');
            });

            await expect(
                retryManager.executeWithRetry(
                    executeFn,
                    makeStrategy({ maxAttempts: 4, initialDelay: 100, maxDelay: 250, backoffFactor: 10 }),
                    'aio app deploy',
                ),
            ).rejects.toThrow('flaky');

            expect(delays()).toEqual([100, 250, 250]);
        });

        it('does not wait after the last attempt fails', async () => {
            const executeFn = jest.fn(async () => {
                throw new Error('flaky');
            });

            await expect(
                retryManager.executeWithRetry(
                    executeFn,
                    makeStrategy({ maxAttempts: 1, initialDelay: 100, maxDelay: 250 }),
                    'aio app deploy',
                ),
            ).rejects.toThrow('flaky');

            expect(delays()).toEqual([]);
        });
    });

    describe('asking whether to retry at all', () => {
        it('asks once per gap between attempts, never after the last one', async () => {
            const shouldRetry = jest.fn(() => true);
            const failure = new Error('flaky');
            const executeFn = jest.fn(async () => {
                throw failure;
            });

            await expect(
                retryManager.executeWithRetry(
                    executeFn,
                    makeStrategy({ maxAttempts: 2, shouldRetry }),
                    'aio app deploy',
                ),
            ).rejects.toThrow('flaky');

            expect(shouldRetry.mock.calls).toEqual([[failure, 1]]);
            expect(executeFn).toHaveBeenCalledTimes(2);
        });

        it('stops at once, without waiting, when the strategy says no', async () => {
            const executeFn = jest.fn(async () => {
                throw new Error('nope');
            });

            await expect(
                retryManager.executeWithRetry(
                    executeFn,
                    makeStrategy({ shouldRetry: () => false }),
                    'aio app deploy',
                ),
            ).rejects.toThrow('nope');

            expect(executeFn).toHaveBeenCalledTimes(1);
            expect(delays()).toEqual([]);
        });
    });

    describe('a strategy that permits no attempts', () => {
        it('rejects with a stated reason rather than resolving nothing', async () => {
            const executeFn = jest.fn(async () => OK);

            await expect(
                retryManager.executeWithRetry(
                    executeFn,
                    makeStrategy({ maxAttempts: 0 }),
                    'aio app deploy',
                ),
            ).rejects.toThrow('Command failed after retries');

            expect(executeFn).not.toHaveBeenCalled();
        });
    });
});
