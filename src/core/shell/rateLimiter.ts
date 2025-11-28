import { getLogger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Rate limiter for controlling operation frequency
 *
 * SECURITY: Prevents resource exhaustion attacks by limiting the rate of
 * retry attempts and polling operations per resource.
 *
 * RATE LIMITING CONFIGURATION:
 *
 * Current limits:
 * - Default: 10 operations/second per resource
 * - Adobe CLI operations: Uses default (10 ops/sec) to prevent API throttling
 * - Polling operations: Uses default (10 ops/sec) for auth checks, status checks
 * - Retry operations: Uses default (10 ops/sec) with exponential backoff
 *
 * These limits protect against:
 * - API rate limit errors from Adobe services (429 Too Many Requests)
 * - Resource exhaustion on user's machine (CPU/memory)
 * - Accidental denial of service from rapid retry loops
 * - Network flooding from excessive polling
 *
 * Usage: Automatically applied by CommandExecutor, RetryStrategyManager, and PollingService
 *
 * @see RetryStrategyManager for retry-specific rate limiting
 * @see PollingService for polling-specific rate limiting
 */
export class RateLimiter {
    private logger = getLogger();
    private operations = new Map<string, number[]>();
    private maxOpsPerSecond: number;

    /**
     * Create a new rate limiter
     *
     * @param maxOpsPerSecond - Maximum operations allowed per second per resource (default: 10)
     */
    constructor(maxOpsPerSecond = 10) {
        this.maxOpsPerSecond = maxOpsPerSecond;
    }

    /**
     * Check if operation is within rate limit
     *
     * @param resource - Resource identifier (e.g., 'polling:auth-check', 'retry:network-request')
     * @throws Error if rate limit exceeded
     *
     * @example
     * await rateLimiter.checkRateLimit('polling:auth-check');
     * // Proceed with operation
     */
    async checkRateLimit(resource: string): Promise<void> {
        const now = Date.now();
        const ops = this.operations.get(resource) || [];

        // Remove operations older than rate limit window
        // SOP §1: Using TIMEOUTS.RATE_LIMIT_WINDOW instead of magic number
        const recentOps = ops.filter(timestamp => now - timestamp < TIMEOUTS.RATE_LIMIT_WINDOW);

        if (recentOps.length >= this.maxOpsPerSecond) {
            const waitTime = TIMEOUTS.RATE_LIMIT_WINDOW - (now - recentOps[0]);
            this.logger.debug(
                `[Rate Limiter] Rate limit exceeded for ${resource} ` +
                `(${recentOps.length}/${this.maxOpsPerSecond} ops/sec). ` +
                `Waiting ${waitTime}ms...`,
            );

            // Wait until rate limit resets
            await this.delay(waitTime);

            // Recursively check again after waiting
            return this.checkRateLimit(resource);
        }

        // Record this operation
        recentOps.push(now);
        this.operations.set(resource, recentOps);
    }

    /**
     * Reset rate limit for a specific resource
     *
     * @param resource - Resource identifier
     */
    reset(resource: string): void {
        this.operations.delete(resource);
        this.logger.debug(`[Rate Limiter] Reset rate limit for ${resource}`);
    }

    /**
     * Reset all rate limits
     */
    resetAll(): void {
        this.operations.clear();
        this.logger.debug('[Rate Limiter] Reset all rate limits');
    }

    /**
     * Get current operation count for a resource
     *
     * @param resource - Resource identifier
     * @returns Number of operations in the last second
     */
    getOperationCount(resource: string): number {
        const now = Date.now();
        const ops = this.operations.get(resource) || [];
        // SOP §1: Using TIMEOUTS.RATE_LIMIT_WINDOW
        const recentOps = ops.filter(timestamp => now - timestamp < TIMEOUTS.RATE_LIMIT_WINDOW);
        return recentOps.length;
    }

    /**
     * Delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
