/**
 * Unit Tests for ProgressUnifier Helper Functions
 *
 * Tests the helper functions for elapsed time formatting and display.
 *
 * Note: ElapsedTimeTracker tests were removed in Step 8 cleanup.
 * The class was deleted and its functionality inlined into ProgressUnifier.
 * See ProgressUnifier.test.ts for elapsed time tracking tests.
 */

import { formatElapsedTime } from '@/core/utils/progressUnifier';

describe('ProgressUnifier Helper Functions', () => {
    describe('formatElapsedTime', () => {
        it('should format seconds under 60 as Xs', () => {
            expect(formatElapsedTime(35000)).toBe('35s');
            expect(formatElapsedTime(5000)).toBe('5s');
            expect(formatElapsedTime(59000)).toBe('59s');
        });

        it('should format 60+ seconds as Xm Xs', () => {
            expect(formatElapsedTime(60000)).toBe('1m 0s');
            expect(formatElapsedTime(75000)).toBe('1m 15s');
            expect(formatElapsedTime(125000)).toBe('2m 5s');
        });

        it('should handle zero milliseconds', () => {
            expect(formatElapsedTime(0)).toBe('0s');
        });

        it('should truncate partial seconds', () => {
            expect(formatElapsedTime(35500)).toBe('35s');
            expect(formatElapsedTime(35999)).toBe('35s');
        });
    });
});
