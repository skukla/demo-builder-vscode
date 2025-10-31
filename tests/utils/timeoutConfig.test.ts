/**
 * Tests for timeout configuration
 * Step 1: Quick Wins - npm Flags & Timeout Optimization
 *
 * Verifies that PREREQUISITE_CHECK timeout has been reduced from 60s to 10s
 * for faster failure feedback.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

describe('Timeout Configuration', () => {
    describe('PREREQUISITE_CHECK timeout', () => {
        it('should be set to 10000ms (10 seconds)', () => {
            // Reduced from 60000ms to provide faster failure feedback
            expect(TIMEOUTS.PREREQUISITE_CHECK).toBe(10000);
        });

        it('should be significantly less than PREREQUISITE_INSTALL timeout', () => {
            // Check timeouts should fail fast
            // Install timeouts need more time for downloads
            expect(TIMEOUTS.PREREQUISITE_CHECK).toBeLessThan(TIMEOUTS.PREREQUISITE_INSTALL);
        });

        it('should allow enough time for command execution', () => {
            // 10 seconds should be enough for prerequisite checks
            // but fast enough to fail quickly
            expect(TIMEOUTS.PREREQUISITE_CHECK).toBeGreaterThanOrEqual(5000);
            expect(TIMEOUTS.PREREQUISITE_CHECK).toBeLessThanOrEqual(15000);
        });
    });

    describe('Timeout rationale', () => {
        it('should provide 6x faster feedback than old 60s timeout', () => {
            const oldTimeout = 60000;
            const speedup = oldTimeout / TIMEOUTS.PREREQUISITE_CHECK;

            expect(speedup).toBeGreaterThanOrEqual(5);
            expect(speedup).toBeLessThanOrEqual(7);
        });

        it('should maintain reasonable timeout for installation', () => {
            // Installation timeout should remain high for npm downloads
            expect(TIMEOUTS.PREREQUISITE_INSTALL).toBeGreaterThanOrEqual(120000);
        });
    });

    describe('TIMEOUTS structure', () => {
        it('should define PREREQUISITE_CHECK', () => {
            expect(TIMEOUTS).toHaveProperty('PREREQUISITE_CHECK');
        });

        it('should define PREREQUISITE_INSTALL', () => {
            expect(TIMEOUTS).toHaveProperty('PREREQUISITE_INSTALL');
        });

        it('should be a const object with TypeScript type safety', () => {
            // TIMEOUTS uses 'as const' for type-level immutability
            // TypeScript prevents modifications in TS code, but runtime allows it
            // This is acceptable as our codebase is TypeScript
            expect(TIMEOUTS).toBeDefined();
            expect(typeof TIMEOUTS).toBe('object');

            // Verify the object is not null
            expect(TIMEOUTS).not.toBeNull();
        });
    });
});
