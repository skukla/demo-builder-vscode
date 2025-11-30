/**
 * Unit tests for PerformanceTracker
 * Tests performance metric tracking, timing measurements, and statistics aggregation
 */

import { PerformanceTracker } from '@/features/authentication/services/performanceTracker';

// Mock logger - create single instance that all tests share
const mockDebug = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();

jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: mockDebug,
        info: mockInfo,
        warn: mockWarn,
        error: mockError,
    }),
}));

describe('PerformanceTracker', () => {
    let tracker: PerformanceTracker;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers({ doNotFake: [] });  // Use modern fake timers
        jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

        tracker = new PerformanceTracker();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('startTiming', () => {
        it('should start timing an operation', () => {
            const now = Date.now();

            tracker.startTiming('testOperation');

            const metrics = tracker.getMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].operation).toBe('testOperation');
            expect(metrics[0].timestamp).toBe(now);
        });

        it('should handle multiple operations', () => {
            tracker.startTiming('operation1');
            tracker.startTiming('operation2');
            tracker.startTiming('operation3');

            const metrics = tracker.getMetrics();
            expect(metrics).toHaveLength(3);
            expect(metrics.map(m => m.operation)).toEqual([
                'operation1',
                'operation2',
                'operation3',
            ]);
        });

        it('should override previous timing for same operation', () => {
            const time1 = Date.now();
            tracker.startTiming('operation');

            jest.advanceTimersByTime(1000);
            const time2 = Date.now();
            tracker.startTiming('operation');

            const metrics = tracker.getMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].timestamp).toBe(time2);
        });
    });

    describe('endTiming', () => {
        it('should calculate duration and log', () => {
            // Use an operation that exceeds expected time to trigger logging
            tracker.startTiming('isAuthenticated');

            jest.advanceTimersByTime(3500); // Exceeds 3000ms threshold
            const duration = tracker.endTiming('isAuthenticated');

            expect(duration).toBe(3500);
            expect(mockDebug).toHaveBeenCalledWith(
                expect.stringContaining('[Performance] isAuthenticated took 3.5s'),
            );
        });

        it('should return 0 if operation was never started', () => {
            const duration = tracker.endTiming('nonexistentOperation');

            expect(duration).toBe(0);
            expect(mockDebug).not.toHaveBeenCalled();
        });

        it('should remove timing after ending', () => {
            tracker.startTiming('operation');
            tracker.endTiming('operation');

            const metrics = tracker.getMetrics();
            expect(metrics).toHaveLength(0);
        });

        it('should log warning for slow operations', () => {
            tracker.startTiming('isFullyAuthenticated');
            jest.advanceTimersByTime(5000);
            const duration = tracker.endTiming('isFullyAuthenticated');

            expect(duration).toBe(5000);
            expect(mockDebug).toHaveBeenCalledWith(
                expect.stringContaining('⚠️ SLOW (expected <4.0s)'),
            );
        });

        it('should not log anything for fast operations within threshold', () => {
            tracker.startTiming('isAuthenticated');
            jest.advanceTimersByTime(2200);
            tracker.endTiming('isAuthenticated');

            // Fast operations (within threshold) should not log at all
            expect(mockDebug).not.toHaveBeenCalled();
        });

        it('should use correct expected times for different operations', () => {
            // Operations with actual durations that exceed expected thresholds
            // formatDuration converts: 5000ms → "5.0s", 4000ms → "4.0s", etc.
            // Thresholds updated 2025-11 based on observed production performance
            const operations = [
                { name: 'isFullyAuthenticated', expectedFormatted: '4.0s', actualFormatted: '5.0s', actual: 5000 },
                { name: 'isAuthenticated', expectedFormatted: '3.0s', actualFormatted: '4.0s', actual: 4000 },
                { name: 'getOrganizations', expectedFormatted: '5.0s', actualFormatted: '6.0s', actual: 6000 },
                { name: 'login', expectedFormatted: '30.0s', actualFormatted: '31.0s', actual: 31000 },
            ];

            operations.forEach(({ name, actual }) => {
                tracker.startTiming(name);
                jest.advanceTimersByTime(actual);
                tracker.endTiming(name);
            });

            expect(mockDebug).toHaveBeenCalledTimes(4);
            operations.forEach(({ name, actualFormatted, expectedFormatted }) => {
                expect(mockDebug).toHaveBeenCalledWith(
                    expect.stringContaining(`${name} took ${actualFormatted} ⚠️ SLOW (expected <${expectedFormatted})`),
                );
            });
        });

        it('should NOT log when isAuthenticated() takes 2200ms (within 3000ms threshold)', () => {
            tracker.startTiming('isAuthenticated');
            jest.advanceTimersByTime(2200);
            const duration = tracker.endTiming('isAuthenticated');

            expect(duration).toBe(2200);
            // Fast operations (within threshold) should not log at all
            expect(mockDebug).not.toHaveBeenCalled();
        });

        it('should warn when isAuthenticated() exceeds 3000ms threshold', () => {
            tracker.startTiming('isAuthenticated');
            jest.advanceTimersByTime(3500);
            const duration = tracker.endTiming('isAuthenticated');

            expect(duration).toBe(3500);
            expect(mockDebug).toHaveBeenCalledWith(
                expect.stringContaining('⚠️ SLOW (expected <3.0s)'),
            );
        });
    });

    describe('getMetrics', () => {
        it('should return empty array when no operations tracked', () => {
            const metrics = tracker.getMetrics();
            expect(metrics).toEqual([]);
        });

        it('should return metrics for ongoing operations', () => {
            const startTime = Date.now();

            tracker.startTiming('operation1');
            tracker.startTiming('operation2');

            jest.advanceTimersByTime(500);

            const metrics = tracker.getMetrics();
            expect(metrics).toHaveLength(2);
            expect(metrics[0].duration).toBe(500);
            expect(metrics[1].duration).toBe(500);
        });

        it('should calculate duration from start to now', () => {
            const startTime = Date.now();
            tracker.startTiming('operation');

            jest.advanceTimersByTime(1500);
            const metrics = tracker.getMetrics();

            expect(metrics[0].duration).toBe(1500);
        });

        it('should include operation name and timestamp', () => {
            const startTime = Date.now();

            tracker.startTiming('testOp');

            const metrics = tracker.getMetrics();
            expect(metrics[0]).toEqual({
                operation: 'testOp',
                duration: 0,
                timestamp: startTime,
            });
        });

        it('should not include ended operations', () => {
            tracker.startTiming('operation1');
            tracker.startTiming('operation2');
            tracker.endTiming('operation1');

            const metrics = tracker.getMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].operation).toBe('operation2');
        });
    });

    describe('clear', () => {
        it('should remove all timing data', () => {
            tracker.startTiming('operation1');
            tracker.startTiming('operation2');
            tracker.startTiming('operation3');

            tracker.clear();

            const metrics = tracker.getMetrics();
            expect(metrics).toEqual([]);
        });

        it('should allow starting new operations after clear', () => {
            tracker.startTiming('operation1');
            tracker.clear();
            tracker.startTiming('operation2');

            const metrics = tracker.getMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].operation).toBe('operation2');
        });

        it('should handle clear with no operations', () => {
            tracker.clear();
            const metrics = tracker.getMetrics();
            expect(metrics).toEqual([]);
        });
    });

    describe('integration scenarios', () => {
        it('should track complete operation lifecycle', () => {
            tracker.startTiming('getOrganizations');
            jest.advanceTimersByTime(1000);
            const duration = tracker.endTiming('getOrganizations');

            expect(duration).toBe(1000);
            expect(tracker.getMetrics()).toEqual([]);
        });

        it('should handle concurrent operations', () => {
            tracker.startTiming('operation1');
            jest.advanceTimersByTime(100);
            tracker.startTiming('operation2');
            jest.advanceTimersByTime(400);  // Now at 500ms total

            const metrics = tracker.getMetrics();
            expect(metrics).toHaveLength(2);

            jest.advanceTimersByTime(300);  // Now at 800ms
            const duration1 = tracker.endTiming('operation1');
            jest.advanceTimersByTime(200);  // Now at 1000ms
            const duration2 = tracker.endTiming('operation2');

            expect(duration1).toBe(800);
            expect(duration2).toBe(900);
        });

        it('should handle multiple start-end cycles', () => {
            for (let i = 0; i < 5; i++) {
                tracker.startTiming(`operation${i}`);
                jest.advanceTimersByTime(500);
                const duration = tracker.endTiming(`operation${i}`);
                expect(duration).toBe(500);
            }

            expect(tracker.getMetrics()).toEqual([]);
        });
    });
});
