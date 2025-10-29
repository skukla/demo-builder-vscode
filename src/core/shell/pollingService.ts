import { getLogger } from '@/core/logging';
import { RateLimiter } from './rateLimiter';
import type { PollOptions } from './types';

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
            initialDelay = 500,
            maxDelay = 5000,
            backoffFactor = 1.5,
            timeout = 120000,
            name = 'condition',
        } = options;

        this.logger.debug(`[Polling Service] Starting poll for: ${name}`);

        const startTime = Date.now();
        let attempt = 0;
        let delay = initialDelay;

        while (attempt < maxAttempts) {
            attempt++;

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
            this.logger.debug(`[Polling Service] Poll attempt ${attempt} for ${name} - waiting ${delay}ms`);
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
