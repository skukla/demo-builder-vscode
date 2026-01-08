import { RateLimiter } from './rateLimiter';
import type { PollOptions } from './types';
import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Service for polling operations with exponential backoff
 * Provides smart waiting logic with configurable retry strategies
 *
 * SECURITY: Rate limiting prevents resource exhaustion attacks
 */
export class PollingService {
    private logger = getLogger();
    private rateLimiter = new RateLimiter(10); // 10 ops/sec default

    /**
     * Poll until a condition is met with exponential backoff
     */
    async pollUntilCondition(
        checkFn: () => Promise<boolean>,
        options: PollOptions = {},
    ): Promise<void> {
        const {
            maxAttempts = 60,
            initialDelay = TIMEOUTS.POLL.INITIAL,
            maxDelay = TIMEOUTS.POLL.MAX,
            backoffFactor = 1.5,
            timeout = TIMEOUTS.LONG,
            name = 'condition',
            abortSignal,
        } = options;

        const startTime = Date.now();
        let attempt = 0;
        let delay = initialDelay;

        while (attempt < maxAttempts) {
            attempt++;

            // Check if operation was aborted
            if (abortSignal?.aborted) {
                throw new Error(`Polling aborted for: ${name}`);
            }

            // Check timeout
            if (Date.now() - startTime > timeout) {
                throw new Error(`Polling timeout for: ${name}`);
            }

            // SECURITY: Rate limit check to prevent resource exhaustion
            await this.rateLimiter.checkRateLimit(`polling:${name}`);

            try {
                const result = await checkFn();
                if (result) {
                    this.logger.debug(`[Polling Service] Poll succeeded for: ${name} (attempt ${attempt})`);
                    return;
                }
            } catch (error) {
                this.logger.debug(`[Polling Service] Poll check error for ${name}: ${error}`);
            }

            // Wait before next attempt
            await this.delay(delay);

            // Calculate next delay with exponential backoff
            delay = Math.min(delay * backoffFactor, maxDelay);
        }

        throw new Error(`Maximum polling attempts reached for: ${name}`);
    }

    /**
     * Delay for specified milliseconds
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
