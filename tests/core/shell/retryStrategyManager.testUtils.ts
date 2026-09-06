/**
 * Shared fixtures for the RetryStrategyManager suites.
 *
 * Both suites build the same two shapes over and over: a RetryStrategy whose only
 * interesting field is the one the spec is about, and a successful CommandResult.
 * Typed to the real interfaces, so a field that moves fails `typecheck:tests`
 * rather than at runtime.
 *
 * No jest.mock preamble here on purpose: `retryStrategyManager-decisions` mocks
 * `@/core/utils/sleep` and the original suite deliberately does not — a mock only
 * hoists above the imports of the file it appears in, so it has to stay there.
 */
import type { CommandResult, RetryStrategy } from '@/core/shell/types';

/** A strategy that retries fast, so a spec only states what it actually varies. */
export function makeStrategy(overrides: Partial<RetryStrategy> = {}): RetryStrategy {
    return {
        maxAttempts: 3,
        initialDelay: 10,
        maxDelay: 100,
        backoffFactor: 2,
        ...overrides,
    };
}

export function makeResult(overrides: Partial<CommandResult> = {}): CommandResult {
    return {
        code: 0,
        stdout: 'success',
        stderr: '',
        duration: 100,
        ...overrides,
    };
}
