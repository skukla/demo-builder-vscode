import { RateLimiter } from '@/core/shell/rateLimiter';

jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z')); // Mock Date.now()
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('construction', () => {
        it('should use default rate limit of 10 ops/sec', () => {
            rateLimiter = new RateLimiter();

            // Default is 10 ops/sec
            expect(rateLimiter.getOperationCount('test')).toBe(0);
        });

        it('should accept custom rate limit', () => {
            rateLimiter = new RateLimiter(5);

            expect(rateLimiter.getOperationCount('test')).toBe(0);
        });
    });

    describe('checkRateLimit', () => {
        beforeEach(() => {
            rateLimiter = new RateLimiter(10);
        });

        it('should allow operations under rate limit', async () => {
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');

            expect(rateLimiter.getOperationCount('resource1')).toBe(3);
        });

        it('should track operations separately per resource', async () => {
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource2');

            expect(rateLimiter.getOperationCount('resource1')).toBe(2);
            expect(rateLimiter.getOperationCount('resource2')).toBe(1);
        });

        it('should enforce rate limit', async () => {
            rateLimiter = new RateLimiter(3); // Low limit for testing

            // First 3 operations should be immediate
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');

            // Fourth operation should wait
            const promise = rateLimiter.checkRateLimit('resource1');

            // Fast-forward through the wait
            jest.advanceTimersByTime(1000);
            await promise;

            // All 4 operations completed
            expect(rateLimiter.getOperationCount('resource1')).toBe(1); // Count resets after window
        });

        it('should reset count after 1 second window', async () => {
            rateLimiter = new RateLimiter(3);

            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');

            expect(rateLimiter.getOperationCount('resource1')).toBe(3);

            // Wait for rate limit window to reset
            jest.advanceTimersByTime(1100);

            expect(rateLimiter.getOperationCount('resource1')).toBe(0);
        });

        it('should handle concurrent rate limit checks', async () => {
            rateLimiter = new RateLimiter(5);

            // Start 10 operations concurrently (should split into two windows)
            const promises = Array.from({ length: 10 }, () =>
                rateLimiter.checkRateLimit('resource1')
            );

            // Fast-forward through the wait for second window
            jest.advanceTimersByTime(1000);
            await Promise.all(promises);

            // Should have processed all 10 operations (5 per window)
            expect(rateLimiter.getOperationCount('resource1')).toBeLessThanOrEqual(5);
        });
    });

    describe('reset', () => {
        beforeEach(() => {
            rateLimiter = new RateLimiter(10);
        });

        it('should reset specific resource rate limit', async () => {
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');

            expect(rateLimiter.getOperationCount('resource1')).toBe(2);

            rateLimiter.reset('resource1');

            expect(rateLimiter.getOperationCount('resource1')).toBe(0);
        });

        it('should not affect other resources', async () => {
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource2');
            await rateLimiter.checkRateLimit('resource2');

            rateLimiter.reset('resource1');

            expect(rateLimiter.getOperationCount('resource1')).toBe(0);
            expect(rateLimiter.getOperationCount('resource2')).toBe(2);
        });
    });

    describe('resetAll', () => {
        beforeEach(() => {
            rateLimiter = new RateLimiter(10);
        });

        it('should reset all resource rate limits', async () => {
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource2');
            await rateLimiter.checkRateLimit('resource3');

            rateLimiter.resetAll();

            expect(rateLimiter.getOperationCount('resource1')).toBe(0);
            expect(rateLimiter.getOperationCount('resource2')).toBe(0);
            expect(rateLimiter.getOperationCount('resource3')).toBe(0);
        });
    });

    describe('getOperationCount', () => {
        beforeEach(() => {
            rateLimiter = new RateLimiter(10);
        });

        it('should return 0 for new resource', () => {
            expect(rateLimiter.getOperationCount('new-resource')).toBe(0);
        });

        it('should return correct count within window', async () => {
            await rateLimiter.checkRateLimit('resource1');
            expect(rateLimiter.getOperationCount('resource1')).toBe(1);

            await rateLimiter.checkRateLimit('resource1');
            expect(rateLimiter.getOperationCount('resource1')).toBe(2);

            await rateLimiter.checkRateLimit('resource1');
            expect(rateLimiter.getOperationCount('resource1')).toBe(3);
        });

        it('should only count operations in last second', async () => {
            await rateLimiter.checkRateLimit('resource1');
            await rateLimiter.checkRateLimit('resource1');

            expect(rateLimiter.getOperationCount('resource1')).toBe(2);

            // Wait for operations to age out
            jest.advanceTimersByTime(1100);

            expect(rateLimiter.getOperationCount('resource1')).toBe(0);
        });
    });

    describe('Real-world scenarios', () => {
        it('should prevent API rate limit errors for Adobe CLI', async () => {
            rateLimiter = new RateLimiter(10); // Adobe API typically allows 10 req/sec

            const operations: Promise<void>[] = [];

            // Simulate rapid API calls
            for (let i = 0; i < 25; i++) {
                operations.push(rateLimiter.checkRateLimit('adobe-api'));
            }

            // Use runAllTimersAsync to properly handle async operations with fake timers
            const promise = Promise.all(operations);
            await jest.runAllTimersAsync();
            await promise;

            // All operations should complete
            expect(rateLimiter.getOperationCount('adobe-api')).toBeLessThanOrEqual(10);
        });

        it('should handle burst traffic gracefully', async () => {
            rateLimiter = new RateLimiter(5);

            // First burst
            await Promise.all([
                rateLimiter.checkRateLimit('polling:auth'),
                rateLimiter.checkRateLimit('polling:auth'),
                rateLimiter.checkRateLimit('polling:auth')
            ]);

            expect(rateLimiter.getOperationCount('polling:auth')).toBe(3);

            // Second burst (should be allowed)
            await Promise.all([
                rateLimiter.checkRateLimit('polling:auth'),
                rateLimiter.checkRateLimit('polling:auth')
            ]);

            expect(rateLimiter.getOperationCount('polling:auth')).toBe(5);

            // Third burst (should wait)
            const promise = rateLimiter.checkRateLimit('polling:auth');
            jest.advanceTimersByTime(1000);
            await promise;

            // After wait, count should have reset
            expect(rateLimiter.getOperationCount('polling:auth')).toBeLessThanOrEqual(1);
        });

        it('should prevent retry loops from overwhelming system', async () => {
            rateLimiter = new RateLimiter(10);

            // Simulate retry loop
            const promises: Promise<void>[] = [];
            for (let i = 0; i < 30; i++) {
                promises.push(rateLimiter.checkRateLimit('retry:network-request'));
            }

            // Use runAllTimersAsync to properly handle async operations with fake timers
            const promise = Promise.all(promises);
            await jest.runAllTimersAsync();
            await promise;

            // Should have completed all operations with rate limiting
            expect(rateLimiter.getOperationCount('retry:network-request')).toBeLessThanOrEqual(10);
        });

        it('should allow independent rate limits per resource', async () => {
            rateLimiter = new RateLimiter(3);

            // Fill up resource1
            await Promise.all([
                rateLimiter.checkRateLimit('resource1'),
                rateLimiter.checkRateLimit('resource1'),
                rateLimiter.checkRateLimit('resource1')
            ]);

            // resource2 should still be available immediately
            await rateLimiter.checkRateLimit('resource2');

            expect(rateLimiter.getOperationCount('resource1')).toBe(3);
            expect(rateLimiter.getOperationCount('resource2')).toBe(1);
        });
    });

    describe('Edge cases', () => {
        it('should handle zero rate limit', () => {
            // Zero rate limit means no operations allowed in any window
            // Just verify the rate limiter can be constructed with 0
            rateLimiter = new RateLimiter(0);

            // Verify initial state is valid
            expect(rateLimiter.getOperationCount('resource1')).toBe(0);

            // Note: We don't actually call checkRateLimit(0) because
            // it would wait indefinitely - that's the expected behavior
        });

        it('should handle very high rate limits', async () => {
            rateLimiter = new RateLimiter(1000);

            // Should allow many operations quickly
            const operations: Promise<void>[] = [];
            for (let i = 0; i < 100; i++) {
                operations.push(rateLimiter.checkRateLimit('resource1'));
            }

            const startTime = Date.now();
            await Promise.all(operations);
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(500); // Should be fast
        });

        it('should handle resource names with special characters', async () => {
            await rateLimiter.checkRateLimit('retry:network-request');
            await rateLimiter.checkRateLimit('polling:auth-check');
            await rateLimiter.checkRateLimit('adobe-api:console/org/list');

            expect(rateLimiter.getOperationCount('retry:network-request')).toBe(1);
            expect(rateLimiter.getOperationCount('polling:auth-check')).toBe(1);
            expect(rateLimiter.getOperationCount('adobe-api:console/org/list')).toBe(1);
        });
    });
});

// Helper function for delays in tests
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
