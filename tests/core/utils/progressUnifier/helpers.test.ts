/**
 * Unit Tests for ProgressUnifier Helper Functions
 *
 * Tests the helper functions for elapsed time formatting and display.
 */

import { formatElapsedTime, ElapsedTimeTracker } from '@/core/utils/progressUnifier';
import { IDateProvider, ITimerProvider } from '@/core/utils/progressUnifier';

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

    describe('ElapsedTimeTracker', () => {
        let mockDate: IDateProvider;
        let mockTimers: ITimerProvider;
        let currentTime: number;

        beforeEach(() => {
            currentTime = 1000000;
            mockDate = { now: () => currentTime };
            mockTimers = {
                setInterval: jest.fn(),
                clearInterval: jest.fn(),
                setTimeout: jest.fn(),
                clearTimeout: jest.fn(),
            };
        });

        it('should track elapsed time after start', () => {
            const tracker = new ElapsedTimeTracker(mockDate, mockTimers);

            tracker.start();
            currentTime += 5000;

            expect(tracker.getElapsed()).toBe(5000);
        });

        it('should return 0 when not tracking', () => {
            const tracker = new ElapsedTimeTracker(mockDate, mockTimers);
            expect(tracker.getElapsed()).toBe(0);
        });

        it('should reset after stop', () => {
            const tracker = new ElapsedTimeTracker(mockDate, mockTimers);

            tracker.start();
            currentTime += 5000;
            tracker.stop();

            expect(tracker.isTracking()).toBe(false);
        });

        describe('enhanceDetailWithElapsedTime', () => {
            it('should not add elapsed time below threshold (30s)', () => {
                const tracker = new ElapsedTimeTracker(mockDate, mockTimers);

                tracker.start();
                currentTime += 25000; // 25 seconds

                expect(tracker.enhanceDetailWithElapsedTime('Installing...')).toBe('Installing...');
            });

            it('should add elapsed time above threshold (30s)', () => {
                const tracker = new ElapsedTimeTracker(mockDate, mockTimers);

                tracker.start();
                currentTime += 35000; // 35 seconds

                expect(tracker.enhanceDetailWithElapsedTime('Installing...')).toBe('Installing... (35s)');
            });

            it('should format minutes correctly', () => {
                const tracker = new ElapsedTimeTracker(mockDate, mockTimers);

                tracker.start();
                currentTime += 75000; // 1m 15s

                expect(tracker.enhanceDetailWithElapsedTime('Installing...')).toBe('Installing... (1m 15s)');
            });

            it('should return unmodified detail when not tracking', () => {
                const tracker = new ElapsedTimeTracker(mockDate, mockTimers);
                expect(tracker.enhanceDetailWithElapsedTime('Installing...')).toBe('Installing...');
            });
        });
    });
});
