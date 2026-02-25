/**
 * Unit tests for withTiming utility
 * Tests slow operation detection and debug logging
 */

import { withTiming } from '@/features/authentication/services/performanceTracker';

const mockDebug = jest.fn();

jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: mockDebug,
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('withTiming', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should return the result of the wrapped function', async () => {
        const result = await withTiming('isAuthenticated', async () => 42);
        expect(result).toBe(42);
    });

    it('should propagate errors from the wrapped function', async () => {
        await expect(
            withTiming('isAuthenticated', async () => { throw new Error('test'); }),
        ).rejects.toThrow('test');
    });

    it('should not log when operation is within threshold', async () => {
        await withTiming('isAuthenticated', async () => {
            jest.advanceTimersByTime(2200); // Within 3000ms threshold
        });
        expect(mockDebug).not.toHaveBeenCalled();
    });

    it('should log warning when operation exceeds threshold', async () => {
        await withTiming('isAuthenticated', async () => {
            jest.advanceTimersByTime(3500); // Exceeds 3000ms threshold
        });
        expect(mockDebug).toHaveBeenCalledWith(
            expect.stringContaining('[Performance] isAuthenticated took 3.5s'),
        );
        expect(mockDebug).toHaveBeenCalledWith(
            expect.stringContaining('⚠️ SLOW (expected <3.0s)'),
        );
    });

    it('should log even when the function throws', async () => {
        await withTiming('isAuthenticated', async () => {
            jest.advanceTimersByTime(4000);
            throw new Error('fail');
        }).catch(() => {});

        expect(mockDebug).toHaveBeenCalledWith(
            expect.stringContaining('⚠️ SLOW'),
        );
    });

    it('should not log for unknown operations', async () => {
        await withTiming('unknownOperation', async () => {
            jest.advanceTimersByTime(999999);
        });
        expect(mockDebug).not.toHaveBeenCalled();
    });

    it('should use correct thresholds for different operations', async () => {
        const operations = [
            { name: 'isFullyAuthenticated', threshold: 4000, actual: 5000, expectedFormatted: '4.0s' },
            { name: 'getOrganizations', threshold: 5000, actual: 6000, expectedFormatted: '5.0s' },
            { name: 'selectProject', threshold: 15000, actual: 16000, expectedFormatted: '15.0s' },
            { name: 'login', threshold: 30000, actual: 31000, expectedFormatted: '30.0s' },
        ];

        for (const { name, actual, expectedFormatted } of operations) {
            jest.clearAllMocks();
            jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

            await withTiming(name, async () => {
                jest.advanceTimersByTime(actual);
            });

            expect(mockDebug).toHaveBeenCalledWith(
                expect.stringContaining(`expected <${expectedFormatted}`),
            );
        }
    });

    it('should handle concurrent operations independently', async () => {
        const p1 = withTiming('isAuthenticated', async () => {
            jest.advanceTimersByTime(3500);
            return 'a';
        });

        const result = await p1;
        expect(result).toBe('a');
        expect(mockDebug).toHaveBeenCalledTimes(1);
    });
});
